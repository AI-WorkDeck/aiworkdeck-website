// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHash } from 'crypto';
import { withTransaction } from './db';
import { cloudState, postpaidPolicy, POSTPAID_VERSION } from './postpaid';
import { spendCredits } from './credits';
import { captureServiceFunding,subscriptionSnapshot } from './subscription';
import { siteConfig } from './site-config';
import { bqtChargeTarget, bqtProRightsUntil } from './bqt-member';
import { enqueueBqtServiceCharge, dispatchBqtLater } from './bqt-account';

const GIB=BigInt(1073741824), MONTH_SECONDS=BigInt(2592000);
function integer(value:unknown):bigint {
    if(typeof value!=='string'||!/^\d{1,40}$/.test(value))throw new Error('invalid_meter_quantity');
    return BigInt(value);
}
export interface StorageEvent {eventId:string;epoch:number;from:string;to:string;storedBytes:string;totalByteSeconds?:string;includedByteSeconds?:string}
export function recordStorage(userId:string,input:StorageEvent,now=new Date().toISOString()) {
    const {eventId,epoch,from,to}=input;
    const stored=integer(input.storedBytes);
    if(!eventId||eventId.length>200||!Number.isSafeInteger(epoch)||!Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(to))||Date.parse(to)<=Date.parse(from)||Date.parse(to)>Date.parse(now))throw new Error('invalid_storage_event');
    const total=stored*BigInt(Date.parse(to)-Date.parse(from))/BigInt(1000);
    const canonical={eventId,epoch,from,to,storedBytes:stored.toString(),totalByteSeconds:total.toString()};
    const hash=createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
    let bqtRequestNo:string|null=null;
    const result=withTransaction(db=>{
        const old=db.prepare('SELECT payloadHash FROM postpaid_usage WHERE userId=? AND eventId=?').get(userId,eventId) as {payloadHash:string}|undefined;
        if(old){if(old.payloadHash!==hash)throw new Error('usage_event_conflict');return cloudState(userId,now);}
        const policy=postpaidPolicy(userId,db);
        if(!policy||policy.version!==POSTPAID_VERSION)throw new Error('policy_required');
        if(policy.epoch!==epoch)throw new Error('stale_cloud_epoch');
        const meter=db.prepare("SELECT throughAt,remainder FROM postpaid_meter WHERE userId=? AND kind='storage'").get(userId) as {throughAt:string;remainder:string}|undefined;
        if(from!==(meter?.throughAt??policy.acceptedAt))throw new Error('storage_watermark_conflict');
        const state=cloudState(userId,now);
        const cutoff=state.billing.cleanupAt?Math.min(Date.parse(to),Date.parse(state.billing.cleanupAt)):Date.parse(to);
        const periods=db.prepare('SELECT startsAt,endsAt FROM subscription_period WHERE userId=? AND startsAt<? AND endsAt>? ORDER BY startsAt').all(userId,to,from) as {startsAt:string;endsAt:string}[];
        const boundaries=new Set<number>([Date.parse(from),Date.parse(to)]);
        for(const p of periods) {
            boundaries.add(Date.parse(p.startsAt));boundaries.add(Date.parse(p.endsAt));
            for(let t=Date.parse(p.startsAt)+7*86400000;t<Date.parse(p.endsAt);t+=7*86400000)boundaries.add(t);
        }
        const entitlementEnds=db.prepare("SELECT createdAt,expiresAt FROM entitlements WHERE userId=? AND feature IN ('pro','pro.appstore')").all(userId) as {createdAt:string;expiresAt:string|null}[];
        for(const e of entitlementEnds){boundaries.add(Date.parse(e.createdAt));if(e.expiresAt)boundaries.add(Date.parse(e.expiresAt));}
        // 包晴天线：赠送的 3GB 随会员到期结束；扣费不进本站钱包，整笔事件攒成一笔待扣积分。
        const bqt=bqtChargeTarget(userId,db),bqtUntil=bqt?bqtProRightsUntil(userId,from):null;
        if(bqtUntil)boundaries.add(Date.parse(bqtUntil));
        let bqtCents=0;
        if(cutoff>Date.parse(from)&&cutoff<Date.parse(to))boundaries.add(cutoff);
        const sorted=[...boundaries].filter(t=>Number.isFinite(t)&&t>=Date.parse(from)&&t<=Date.parse(to)).sort((a,b)=>a-b);
        let amount=0,lastLedgerId:number|null=null,includedMilli=BigInt(0);
        const rate=siteConfig.id==='intl'?BigInt(3):BigInt(20),denominator=GIB*MONTH_SECONDS*BigInt(1000);
        for(let i=0;i<sorted.length-1;i++) {
            const start=sorted[i],end=sorted[i+1],startIso=new Date(start).toISOString();
            const sub=subscriptionSnapshot(userId,startIso,db);
            const capacity=BigInt(sub.cloudStorageBytes),free=stored<capacity?stored:capacity;
            includedMilli+=free*BigInt(end-start);
            if(start>=cutoff||policy.frozen)continue;
            const duration=BigInt(Math.min(end,cutoff)-start);
            const funding=captureServiceFunding(userId,startIso);
            // A fractional cent retains its original funding; the first completed cent belongs to that source.
            const kind='storage-rounding';
            const rounding=db.prepare('SELECT remainder,fundingJson FROM postpaid_meter WHERE userId=? AND kind=?').get(userId,kind) as {remainder:string;fundingJson:string|null}|undefined;
            const residue=BigInt(rounding?.remainder??'0');
            const numerator=(stored-free)*duration*rate+residue;
            const charge=Number(numerator/denominator);
            if(!Number.isSafeInteger(charge))throw new Error('invalid_meter_amount');
            const previousFunding=rounding?.fundingJson?JSON.parse(rounding.fundingJson):funding;
            const oldCharge=charge>0&&residue>BigInt(0)?1:0;
            if(bqt){amount+=charge;bqtCents+=charge;}
            else for(const allocation of [{cents:oldCharge,funding:previousFunding},{cents:charge-oldCharge,funding}])if(allocation.cents>0) {
                const ledger=spendCredits(db,{userId,amountCents:allocation.cents,ledgerKind:'service_spend',funding:allocation.funding,delivered:true,nowIso:new Date(Math.min(end,cutoff)).toISOString(),meta:{service:'cloud_storage',policyVersion:POSTPAID_VERSION,rateCents:Number(rate),segmentFrom:startIso,segmentTo:new Date(end).toISOString(),...canonical}});
                amount+=allocation.cents;lastLedgerId=ledger.id;
            }
            const origin=charge===0&&residue>BigInt(0)?previousFunding:funding;
            db.prepare('INSERT INTO postpaid_meter(userId,kind,remainder,fundingJson) VALUES(?,?,?,?) ON CONFLICT(userId,kind) DO UPDATE SET remainder=excluded.remainder,fundingJson=excluded.fundingJson').run(userId,kind,(numerator%denominator).toString(),JSON.stringify(origin));
        }
        if(input.totalByteSeconds!==undefined&&integer(input.totalByteSeconds)!==total)throw new Error('invalid_total_storage');
        if(input.includedByteSeconds!==undefined&&integer(input.includedByteSeconds)!==includedMilli/BigInt(1000))throw new Error('invalid_included_storage');
        if(bqt&&bqtCents>0)bqtRequestNo=enqueueBqtServiceCharge(db,{userId,lawyerId:bqt.lawyerId,cents:bqtCents,service:'cloud_storage',refId:eventId});
        db.prepare('INSERT INTO postpaid_usage VALUES(?,?,?,?,?)').run(userId,eventId,hash,lastLedgerId,amount);
        db.prepare("INSERT INTO postpaid_meter(userId,kind,throughAt,remainder) VALUES(?,'storage',?,?) ON CONFLICT(userId,kind) DO UPDATE SET throughAt=excluded.throughAt,remainder=excluded.remainder").run(userId,to,'0');
        return cloudState(userId,now);
    });
    dispatchBqtLater(bqtRequestNo);
    return result;
}

/** An unknown historical occupancy interval is borne by the platform, never reconstructed by guesswork. */
export function storageBaseline(userId:string,epoch:number,observedAt:string,now=new Date().toISOString()) {
    return withTransaction(db=>{
        const p=postpaidPolicy(userId,db);
        if(!p||p.epoch!==epoch)throw new Error('stale_cloud_epoch');
        if(!Number.isFinite(Date.parse(observedAt))||observedAt<p.acceptedAt||observedAt>now)throw new Error('invalid_storage_baseline');
        const existing=db.prepare("SELECT throughAt FROM postpaid_meter WHERE userId=? AND kind='storage'").get(userId) as {throughAt:string}|undefined;
        if(existing&&existing.throughAt!==observedAt)throw new Error('storage_baseline_already_set');
        db.prepare("INSERT OR IGNORE INTO postpaid_meter(userId,kind,throughAt,remainder) VALUES(?,'storage',?,'0')").run(userId,observedAt);
        return cloudState(userId,now);
    });
}
