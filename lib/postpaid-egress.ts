// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import {createHash} from 'crypto';
import {withTransaction} from './db';
import {cloudState,postpaidPolicy} from './postpaid';
import {spendCredits,refundSpend} from './credits';
import {captureServiceFunding,type ServiceFunding} from './subscription';
import {siteConfig} from './site-config';
const GIB=BigInt(1073741824);
const rate=()=>BigInt(siteConfig.id==='intl'?15:60);
function bytes(input:unknown):bigint {
    if(typeof input!=='string'||!/^\d{1,16}$/.test(input))throw new Error('invalid_egress_bytes');
    const n=BigInt(input);if(n>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('invalid_egress_bytes');return n;
}
export function egressQuote(amount:string,userId?:string,resourceHash?:string,exportCaseId?:string) {
    const n=bytes(amount),quote=Number((n*rate()+GIB-BigInt(1))/GIB);
    if(userId&&exportCaseId) return withTransaction(db=>{
        const state=cloudState(userId);
        if(state.cloudAccess.caseId!==exportCaseId||state.cloudAccess.frozen)throw new Error('export_case_unavailable');
        if(!resourceHash||!/^[a-f0-9]{64}$/.test(resourceHash))throw new Error('invalid_egress_request');
        const p=db.prepare('SELECT totalBytes,deliveredBytes,completed FROM postpaid_export WHERE userId=? AND caseId=? AND resourceHash=?').get(userId,exportCaseId,resourceHash) as {totalBytes:string;deliveredBytes:string;completed:number}|undefined;
        if(p&&(p.totalBytes!==n.toString()||p.completed||BigInt(p.deliveredBytes)+n>BigInt(3)*n))throw new Error('export_assistance_required');
        return {quoteCents:0,freeExport:true,unit:'credit_cent',cashCurrency:siteConfig.currency};
    });
    return {quoteCents:quote,freeExport:false,unit:'credit_cent',cashCurrency:siteConfig.currency};
}
export interface EgressRequest {eventId:string;epoch:number;resourceHash:string;bytes:string;exportCaseId?:string;offset?:string;totalBytes?:string}
interface EgressRow {userId:string;eventId:string;payloadHash:string;resourceHash:string;reservedBytes:string;deliveredBytes:string|null;holdLedgerId:number|null;chargedCents:number|null;rateCents:number;completed:number|null;freeExport:number;caseId:string|null;offsetBytes:string;totalBytes:string;fundingJson:string;createdAt:string}
export function reserveEgress(userId:string,input:EgressRequest) {
    const n=bytes(input.bytes),offset=bytes(input.offset??'0'),total=bytes(input.totalBytes??input.bytes);
    if(!input.eventId||input.eventId.length>200||!/^[a-f0-9]{64}$/.test(input.resourceHash)||n<=BigInt(0)||offset+n>total)throw new Error('invalid_egress_request');
    const hash=createHash('sha256').update(JSON.stringify([input.epoch,input.resourceHash,n.toString(),input.exportCaseId??null,offset.toString(),total.toString()])).digest('hex');
    return withTransaction(db=>{
        const old=db.prepare('SELECT * FROM postpaid_egress WHERE userId=? AND eventId=?').get(userId,input.eventId) as EgressRow|undefined;
        if(old){if(old.payloadHash!==hash)throw new Error('egress_event_conflict');if(old.deliveredBytes!==null)throw new Error('egress_already_settled');return {reservationId:old.eventId,freeExport:!!old.freeExport,reservedCents:old.holdLedgerId?egressQuote(old.reservedBytes).quoteCents:0,settled:old.deliveredBytes!==null};}
        const p=postpaidPolicy(userId,db),state=cloudState(userId);
        if(!p||!state.billing.accepted)throw new Error('policy_required');
        if(p.epoch!==input.epoch)throw new Error('stale_cloud_epoch');
        const free=!!input.exportCaseId;
        if(free) {
            if(input.exportCaseId!==state.cloudAccess.caseId||p.frozen)throw new Error('export_case_unavailable');
            const progress=db.prepare('SELECT totalBytes,deliveredBytes,completed FROM postpaid_export WHERE userId=? AND caseId=? AND resourceHash=?').get(userId,input.exportCaseId,input.resourceHash) as {totalBytes:string;deliveredBytes:string;completed:number}|undefined;
            if(offset!==BigInt(0)||n!==total)throw new Error('export_full_object_required');
            if(progress&&progress.totalBytes!==total.toString())throw new Error('export_resource_conflict');
            if(progress&&(progress.completed||BigInt(progress.deliveredBytes)+n>BigInt(3)*total))throw new Error('export_assistance_required');
            if(db.prepare('SELECT 1 FROM postpaid_egress WHERE userId=? AND caseId=? AND resourceHash=? AND deliveredBytes IS NULL').get(userId,input.exportCaseId,input.resourceHash))throw new Error('export_in_progress');
            db.prepare('INSERT OR IGNORE INTO postpaid_export(userId,caseId,resourceHash,totalBytes) VALUES(?,?,?,?)').run(userId,input.exportCaseId,input.resourceHash,total.toString());
        } else if(!state.cloudAccess.canUse)throw new Error('egress_not_authorized');
        const funding=captureServiceFunding(userId),quote=egressQuote(input.bytes).quoteCents;
        const hold=!free&&quote?spendCredits(db,{userId,amountCents:quote,ledgerKind:'service_spend',funding,meta:{service:'cloud_egress',phase:'hold',eventId:input.eventId}}):null;
        db.prepare('INSERT INTO postpaid_egress(userId,eventId,payloadHash,resourceHash,reservedBytes,holdLedgerId,freeExport,caseId,offsetBytes,totalBytes,fundingJson,createdAt,rateCents) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(userId,input.eventId,hash,input.resourceHash,n.toString(),hold?.id??null,free?1:0,input.exportCaseId??null,offset.toString(),total.toString(),JSON.stringify(funding),new Date().toISOString(),Number(rate()));
        return {reservationId:input.eventId,freeExport:free,reservedCents:free?0:quote,settled:false};
    });
}
export function settleEgress(userId:string,eventId:string,deliveredBytes:string,completed:boolean) {
    if(typeof completed!=='boolean')throw new Error('egress_completion_required');
    const actual=bytes(deliveredBytes);
    return withTransaction(db=>{
        const row=db.prepare('SELECT * FROM postpaid_egress WHERE userId=? AND eventId=?').get(userId,eventId) as EgressRow|undefined;
        if(!row)throw new Error('egress_reservation_not_found');
        if(actual>BigInt(row.reservedBytes)||(completed&&actual!==BigInt(row.reservedBytes)))throw new Error('egress_budget_exceeded');
        if(row.deliveredBytes!==null&&(row.deliveredBytes!==actual.toString()||row.completed!==(completed?1:0)))throw new Error('egress_receipt_conflict');
        const nextOffset=(BigInt(row.offsetBytes)+actual).toString();
        if(row.deliveredBytes!==null)return {chargedCents:row.chargedCents,freeExport:!!row.freeExport,deliveredBytes:row.deliveredBytes,nextOffset};
        if(row.holdLedgerId)refundSpend(db,row.holdLedgerId);
        let charged=0;
        if(row.freeExport) {
            const progress=db.prepare('SELECT deliveredBytes FROM postpaid_export WHERE userId=? AND caseId=? AND resourceHash=?').get(userId,row.caseId,row.resourceHash) as {deliveredBytes:string};
            db.prepare('UPDATE postpaid_export SET deliveredBytes=?,completed=? WHERE userId=? AND caseId=? AND resourceHash=?').run((BigInt(progress.deliveredBytes)+actual).toString(),completed?1:0,userId,row.caseId,row.resourceHash);
        }
        else {
            const meter=db.prepare("SELECT remainder,fundingJson FROM postpaid_meter WHERE userId=? AND kind='egress'").get(userId) as {remainder:string;fundingJson:string|null}|undefined;
            const residue=BigInt(meter?.remainder??'0'),funding=JSON.parse(row.fundingJson) as ServiceFunding;
            const previousFunding=meter?.fundingJson?JSON.parse(meter.fundingJson) as ServiceFunding:funding;
            const numerator=actual*BigInt(row.rateCents)+residue;charged=Number(numerator/GIB);
            const previousCharge=charged>0&&residue>BigInt(0)?1:0;
            for(const allocation of [{cents:previousCharge,funding:previousFunding},{cents:charged-previousCharge,funding}])if(allocation.cents>0)
                spendCredits(db,{userId,amountCents:allocation.cents,ledgerKind:'service_spend',funding:allocation.funding,delivered:true,nowIso:row.createdAt,meta:{service:'cloud_egress',phase:'settle',eventId,bytes:actual.toString(),rateCents:row.rateCents}});
            const origin=charged===0&&residue>BigInt(0)?previousFunding:funding;
            db.prepare("INSERT INTO postpaid_meter(userId,kind,remainder,fundingJson) VALUES(?,'egress',?,?) ON CONFLICT(userId,kind) DO UPDATE SET remainder=excluded.remainder,fundingJson=excluded.fundingJson").run(userId,(numerator%GIB).toString(),JSON.stringify(origin));
        }
        db.prepare('UPDATE postpaid_egress SET deliveredBytes=?,chargedCents=?,completed=? WHERE userId=? AND eventId=?').run(actual.toString(),charged,completed?1:0,userId,eventId);
        return {chargedCents:charged,freeExport:!!row.freeExport,deliveredBytes:actual.toString(),nextOffset};
    });
}
