// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { getDb, withTransaction } from './db';
import { subscriptionSnapshot, type ServiceFunding } from './subscription';
import { siteConfig } from './site-config';
import { bqtBalanceView, bqtChargeTarget } from './bqt-member';

export const POSTPAID_VERSION = '2026-11-04';
export interface Policy { userId: string; version: string; acceptedAt: string; epoch: number; frozen: number }
interface Case { id: string; userId: string; openedAt: string; remindAt: string; cleanupAt: string; resolvedAt: string|null; notificationReceipt: string|null; firstAckAt:string|null; cleanupState: string;executorReconciled:number;manifestHash:string|null;itemCount:number|null }
export function postpaidPolicy(userId: string, db = getDb()): Policy | undefined {
    return db.prepare('SELECT * FROM postpaid_policy WHERE userId=?').get(userId) as Policy|undefined;
}
export function acceptsPostpaid(userId: string, funding?: ServiceFunding, db = getDb()): boolean {
    return funding?.postpaidVersion === POSTPAID_VERSION && postpaidPolicy(userId,db)?.version === POSTPAID_VERSION;
}
export function creditPosition(userId: string, now = new Date().toISOString(), db = getDb()) {
    const sub = subscriptionSnapshot(userId, now, db);
    const grant = db.prepare('SELECT COALESCE(SUM(amountCents),0) n FROM postpaid_grant WHERE userId=? AND startsAt<=? AND endsAt>?').get(userId,now,now) as {n:number};
    const sums = db.prepare('SELECT COALESCE(SUM(CASE WHEN reserved=0 THEN outstandingCents ELSE 0 END),0) debt, COALESCE(SUM(CASE WHEN reserved=1 THEN outstandingCents ELSE 0 END),0) reserved FROM postpaid_debt WHERE userId=? AND reversed=0').get(userId) as {debt:number;reserved:number};
    const limit = postpaidPolicy(userId,db)?.version === POSTPAID_VERSION ? sub.monthlyLimitCents + grant.n : 0;
    return {limit, debt:sums.debt, reserved:sums.reserved, available:Math.max(0,limit-sums.debt-sums.reserved)};
}
export function postpaidAvailable(userId:string, funding:ServiceFunding, now:string, db=getDb()):number {
    if (!acceptsPostpaid(userId,funding,db)) return 0;
    if (postpaidPolicy(userId,db)?.frozen) return 0;
    if (db.prepare('SELECT 1 FROM postpaid_case WHERE userId=? AND resolvedAt IS NULL').get(userId)) return 0;
    return creditPosition(userId,now,db).available;
}
/** Explicitly registered grants only. Existing rewards and creator revenue never acquire credit implicitly. */
export function registerCreditGrant(db:Database.Database,userId:string,ref:string,amountCents:number,startsAt:string,endsAt:string) {
    if (!db.inTransaction || !Number.isSafeInteger(amountCents) || amountCents<=0 || !Number.isFinite(Date.parse(startsAt)) || !Number.isFinite(Date.parse(endsAt)) || Date.parse(endsAt)<=Date.parse(startsAt)) throw new Error('invalid_credit_grant');
    startsAt=new Date(startsAt).toISOString();endsAt=new Date(endsAt).toISOString();
    const old=db.prepare('SELECT * FROM postpaid_grant WHERE userId=? AND ref=?').get(userId,ref) as {amountCents:number;startsAt:string;endsAt:string}|undefined;
    if(old && (old.amountCents!==amountCents||old.startsAt!==startsAt||old.endsAt!==endsAt))throw new Error('credit_grant_conflict');
    db.prepare('INSERT OR IGNORE INTO postpaid_grant VALUES(?,?,?,?,?)').run(userId,ref,amountCents,startsAt,endsAt);
}
export function reconcileCreditCase(userId:string,now=new Date().toISOString(),db=getDb()):Case|undefined {
    const position=creditPosition(userId,now,db);
    let row=db.prepare('SELECT * FROM postpaid_case WHERE userId=? AND resolvedAt IS NULL').get(userId) as Case|undefined;
    if(row && position.debt===0) {
        db.prepare('UPDATE postpaid_case SET resolvedAt=? WHERE id=?').run(now,row.id);
        // Frozen copies never restart automatically after repayment.
        return undefined;
    }
    if(!row && position.debt>position.limit) {
        const latestDebt=db.prepare('SELECT MAX(l.ts) at FROM postpaid_debt d JOIN wallet_ledger l ON l.id=d.ledgerId WHERE d.userId=? AND d.reserved=0 AND d.reversed=0 AND d.outstandingCents>0').get(userId) as {at:string|null};
        const since=latestDebt.at??postpaidPolicy(userId,db)!.acceptedAt;
        const boundaries=db.prepare('SELECT endsAt at FROM subscription_period WHERE userId=? AND endsAt>? AND endsAt<=? UNION SELECT endsAt at FROM postpaid_grant WHERE userId=? AND endsAt>? AND endsAt<=? ORDER BY at').all(userId,since,now,userId,since,now) as {at:string}[];
        const opened=boundaries.find(b=>creditPosition(userId,b.at,db).limit<position.debt)?.at??now;
        const id=randomUUID(),t=Date.parse(opened);
        db.prepare('INSERT INTO postpaid_case(id,userId,openedAt,remindAt,cleanupAt) VALUES(?,?,?,?,?)').run(id,userId,opened,new Date(t+72*3600000).toISOString(),new Date(t+120*3600000).toISOString());
        row=db.prepare('SELECT * FROM postpaid_case WHERE id=?').get(id) as Case;
    }
    return row;
}
export function cloudState(userId:string,now=new Date().toISOString()) {
    return withTransaction(db=>{
        const policy=postpaidPolicy(userId,db), p=creditPosition(userId,now,db), c=reconcileCreditCase(userId,now,db);
        const sub=subscriptionSnapshot(userId,now,db);
        const meter=db.prepare("SELECT throughAt FROM postpaid_meter WHERE userId=? AND kind='storage'").get(userId) as {throughAt:string}|undefined;
        const wallet=db.prepare('SELECT COALESCE(SUM(remainingCents),0) n FROM credit_lots WHERE userId=? AND (expiresAt IS NULL OR expiresAt>?)').get(userId,now) as {n:number};
        const accepted=policy?.version===POSTPAID_VERSION;
        const recentCase=c??db.prepare('SELECT * FROM postpaid_case WHERE userId=? ORDER BY openedAt DESC LIMIT 1').get(userId) as Case|undefined;
        const paymentReview=!!db.prepare('SELECT 1 FROM postpaid_payment_review WHERE userId=?').get(userId);
        // 包晴天线：云空间/流量扣的是包晴天积分，可用额 = 快照积分折分 − 未扣成（会员失效/有失败扣减为 0）。
        const bqt=bqtChargeTarget(userId,db),bqtView=bqt?bqtBalanceView(userId,bqt.lawyerId):null;
        const bqtCents=bqt?(bqtView&&bqtView.status==='ACTIVE'&&bqtView.aiWorkbench&&bqtView.failedCount===0?bqtView.cents:0):null;
        const available=bqtCents??(sub.availableCents+(accepted||sub.walletFallbackEnabled||!sub.active?wallet.n:0)+p.available);
        // Not accepting keeps the pre-postpaid subscription rules; accepting only adds the postpaid capability.
        const legacy=sub.active&&sub.cloudStorageBytes>0;
        const canUse=accepted?!c&&!policy?.frozen&&available>0:legacy;
        return {
            billing:{policyVersion:POSTPAID_VERSION,accepted,acceptEnabled:process.env.AWD_POSTPAID_ENABLED==='true',acceptedAt:policy?.acceptedAt??null,unit:'credit_cent',cashCurrency:siteConfig.currency,paymentReview,
                balanceCents:bqt?(bqtView?.cents??0):wallet.n,giftAvailableCents:sub.availableCents,creditLimitCents:p.limit,debtCents:p.debt,reservedCreditCents:p.reserved,availableCreditCents:p.available,
                overLimitAt:c?.openedAt??null,remindAt:c?.remindAt??null,cleanupAt:c?.cleanupAt??null,storageMeteredThrough:meter?.throughAt??policy?.acceptedAt??null,
                storagePrice:{cashCentsPerGiBMonth:siteConfig.id==='intl'?3:20,cashCurrency:siteConfig.currency,periodSeconds:2592000,gibBytes:1073741824},
                egressPrice:{cashCentsPerGiB:siteConfig.id==='intl'?15:60,cashCurrency:siteConfig.currency,gibBytes:1073741824}},
            cloudAccess:{canUse,canWrite:canUse,canRead:accepted?!policy?.frozen:legacy,reason:!accepted?(legacy?'subscription':'policy_required'):policy?.frozen?'cloud_frozen':c?'over_limit':available<=0?'no_funds':'ready',epoch:policy?.epoch??0,includedStorageBytes:sub.cloudStorageBytes,
                caseId:c?.id??null,cleanupEligible:!!(c&&c.notificationReceipt&&c.firstAckAt&&c.firstAckAt<c.cleanupAt&&c.cleanupState!=='review'&&!paymentReview&&now>=c.cleanupAt&&process.env.AWD_POSTPAID_CLEANUP_ENABLED==='true'),notificationStatus:c?(c.notificationReceipt?'delivered':'pending'):'none',frozen:!!policy?.frozen,cleanupState:recentCase?.cleanupState??'none'},
        };
    });
}
export function acceptPostpaid(userId:string,version:string,now=new Date().toISOString()) {
    if(version!==POSTPAID_VERSION)throw new Error('policy_version_required');
    return withTransaction(db=>{
        if(!postpaidPolicy(userId,db)) {
            if(process.env.AWD_POSTPAID_ENABLED!=='true')throw new Error('postpaid_disabled');
            db.prepare('INSERT INTO postpaid_policy(userId,version,acceptedAt) VALUES(?,?,?)').run(userId,version,now);
        }
        return cloudState(userId,now);
    });
}
export function acknowledgeNotification(userId:string,caseId:string,receiptId:string,now=new Date().toISOString()) {
    return withTransaction(db=>{
        const c=reconcileCreditCase(userId,now,db);
        if(!c||c.id!==caseId||now<c.remindAt||!receiptId||receiptId.length>200)throw new Error('invalid_notification_receipt');
        if(!c.notificationReceipt) {
            // A late ACK is insufficient evidence of timely notice, not proof that delivery was late.
            db.prepare("UPDATE postpaid_case SET notificationReceipt=?,firstAckAt=?,cleanupState=CASE WHEN ? >= cleanupAt AND cleanupState='none' THEN 'review' ELSE cleanupState END WHERE id=?").run(receiptId,now,now,c.id);
        } else if(!c.firstAckAt) {
            // Pre-migration receipts cannot acquire a fabricated first-ACK time from a retry.
            db.prepare("UPDATE postpaid_case SET cleanupState='review' WHERE id=? AND cleanupState='none'").run(c.id);
        }
        return cloudState(userId,now);
    });
}
export function claimCleanup(userId:string,caseId:string,epoch:number,itemId:string,now=new Date().toISOString(),binding?:{manifestHash:string;itemCount:number;itemHash:string},receiptOnly=false) {
    return withTransaction(db=>{
        if(!binding||!/^([a-f0-9]{64})$/.test(binding.manifestHash)||!/^([a-f0-9]{64})$/.test(binding.itemHash)||!Number.isSafeInteger(binding.itemCount)||binding.itemCount<1)throw new Error('cleanup_manifest_required');
        const old=db.prepare('SELECT * FROM postpaid_cleanup_claim WHERE userId=? AND caseId=? AND itemId=?').get(userId,caseId,itemId) as {id:string;epoch:number;requestEpoch:number;itemHash:string;expiresAt:string;state:string}|undefined;
        const originalCase=db.prepare('SELECT * FROM postpaid_case WHERE id=? AND userId=?').get(caseId,userId) as Case|undefined;
        const currentPolicy=postpaidPolicy(userId,db);
        if(old) {
            if(old.itemHash!==binding.itemHash||originalCase?.manifestHash!==binding.manifestHash||originalCase?.itemCount!==binding.itemCount)throw new Error('cleanup_item_conflict');
            if(currentPolicy?.epoch!==old.epoch||(epoch!==old.requestEpoch&&epoch!==old.epoch))throw new Error('stale_cloud_epoch');
            if(old.state==='complete')return {allowed:false,issued:true,completed:true,claimId:old.id,epoch:old.epoch,caseId,expiresAt:old.expiresAt};
            if(old.state==='cancelled')return {allowed:false,issued:true,completed:false,cancelled:true,claimId:old.id,epoch:old.epoch,caseId};
            if(receiptOnly)return {allowed:false,issued:true,completed:false,epoch:old.epoch,caseId};
            if(now<old.expiresAt)return {allowed:true,completed:false,claimId:old.id,epoch:old.epoch,caseId,expiresAt:old.expiresAt};
        }
        if(receiptOnly) {
            if(currentPolicy?.epoch!==epoch)throw new Error('stale_cloud_epoch');
            if(originalCase?.manifestHash!==binding.manifestHash||originalCase?.itemCount!==binding.itemCount)throw new Error('cleanup_manifest_conflict');
            return {allowed:false,issued:false,completed:false,epoch,caseId};
        }
        const state=cloudState(userId,now),p=postpaidPolicy(userId,db);
        if(!p||!state.cloudAccess.cleanupEligible||state.cloudAccess.caseId!==caseId||p.epoch!==epoch)return {allowed:false,epoch:p?.epoch??0,caseId};
        const c=db.prepare('SELECT * FROM postpaid_case WHERE id=?').get(caseId) as Case;
        if(c.manifestHash&&(c.manifestHash!==binding.manifestHash||c.itemCount!==binding.itemCount))throw new Error('cleanup_manifest_conflict');
        const count=db.prepare('SELECT COUNT(*) n FROM postpaid_cleanup_claim WHERE caseId=?').get(caseId) as {n:number};
        if(!old&&count.n>=binding.itemCount)throw new Error('cleanup_manifest_exhausted');
        if(!itemId||itemId.length>500)throw new Error('invalid_cleanup_item');
        const next=p.frozen?p.epoch:p.epoch+1;
        db.prepare('UPDATE postpaid_policy SET frozen=1,epoch=? WHERE userId=?').run(next,userId);
        db.prepare("UPDATE postpaid_case SET cleanupState='deleting',manifestHash=?,itemCount=? WHERE id=?").run(binding.manifestHash,binding.itemCount,caseId);
        const id=old?.id??randomUUID(),expiresAt=new Date(Date.parse(now)+60000).toISOString();
        if(old)db.prepare('UPDATE postpaid_cleanup_claim SET expiresAt=? WHERE id=?').run(expiresAt,id);
        else db.prepare('INSERT INTO postpaid_cleanup_claim(id,userId,caseId,itemId,epoch,itemHash,expiresAt,requestEpoch) VALUES(?,?,?,?,?,?,?,?)').run(id,userId,caseId,itemId,next,binding.itemHash,expiresAt,epoch);
        return {allowed:true,claimId:id,epoch:next,caseId,expiresAt};
    });
}
export function completeCleanup(userId:string,claimId:string,success:boolean) {
    return withTransaction(db=>{
        const row=db.prepare('SELECT state FROM postpaid_cleanup_claim WHERE id=? AND userId=?').get(claimId,userId) as {state:string}|undefined;
        if(!row)throw new Error('cleanup_claim_not_found');
        if(row.state==='cancelled')throw new Error('cleanup_reconciliation_conflict');
        if(row.state!=='complete')db.prepare('UPDATE postpaid_cleanup_claim SET state=? WHERE id=?').run(success?'complete':'failed',claimId);
        return cloudState(userId);
    });
}
export function finishCleanup(userId:string,caseId:string,epoch:number,manifestHash:string,itemCount:number) {
    return withTransaction(db=>{
        const c=db.prepare('SELECT * FROM postpaid_case WHERE id=? AND userId=?').get(caseId,userId) as Case|undefined;
        const count=db.prepare('SELECT COUNT(*) n FROM postpaid_cleanup_claim WHERE caseId=? AND userId=?').get(caseId,userId) as {n:number};
        if(!c||c.manifestHash!==manifestHash||c.itemCount!==itemCount||count.n!==itemCount)throw new Error('cleanup_manifest_incomplete');
        if(postpaidPolicy(userId,db)?.epoch!==epoch)throw new Error('stale_cloud_epoch');
        if(db.prepare("SELECT 1 FROM postpaid_cleanup_claim WHERE userId=? AND caseId=? AND state<>'complete'").get(userId,caseId))throw new Error('cleanup_incomplete');
        db.prepare("UPDATE postpaid_case SET cleanupState='complete',executorReconciled=1 WHERE userId=? AND id=?").run(userId,caseId);
        return cloudState(userId);
    });
}

/** Backend acknowledges only after exact-object metadata recovery has committed locally. */
export function acknowledgeCleanupReconciled(userId:string,caseId:string,epoch:number,manifestHash:string) {
    return withTransaction(db=>{
        const p=postpaidPolicy(userId,db);
        const c=db.prepare('SELECT * FROM postpaid_case WHERE userId=? AND id=?').get(userId,caseId) as Case|undefined;
        if(!p?.frozen||p.epoch!==epoch)throw new Error('stale_cloud_epoch');
        if(creditPosition(userId).debt>0)throw new Error('outstanding_debt');
        if(!c||!c.manifestHash||c.manifestHash!==manifestHash)throw new Error('cleanup_manifest_conflict');
        const claims=db.prepare('SELECT state,epoch FROM postpaid_cleanup_claim WHERE userId=? AND caseId=?').all(userId,caseId) as {state:string;epoch:number}[];
        if(!claims.length||claims.some(row=>row.epoch!==epoch||!['complete','cancelled'].includes(row.state)))throw new Error('cleanup_incomplete');
        db.prepare("UPDATE postpaid_case SET executorReconciled=1,cleanupState=CASE WHEN cleanupState='complete' THEN 'complete' ELSE 'partial' END WHERE userId=? AND id=?").run(userId,caseId);
        return cloudState(userId);
    });
}

/** Explicit user action, separate from accepting terms. Old uploads stay fenced by the new epoch. */
export function resumeCloud(userId:string,version:string) {
    if(version!==POSTPAID_VERSION)throw new Error('policy_version_required');
    return withTransaction(db=>{
        const p=postpaidPolicy(userId,db);if(!p)throw new Error('policy_required');
        if(creditPosition(userId).debt>0)throw new Error('outstanding_debt');
        if(db.prepare("SELECT 1 FROM postpaid_cleanup_claim WHERE userId=? AND state NOT IN ('complete','cancelled')").get(userId))throw new Error('cleanup_incomplete');
        if(p.frozen) {
            const latest=db.prepare('SELECT MIN(c.executorReconciled) executorReconciled FROM postpaid_case c JOIN postpaid_cleanup_claim q ON q.caseId=c.id WHERE c.userId=? AND q.epoch=?').get(userId,p.epoch) as {executorReconciled:number}|undefined;
            if(!latest?.executorReconciled)throw new Error('cleanup_metadata_pending');
            db.prepare('UPDATE postpaid_policy SET frozen=0,epoch=epoch+1 WHERE userId=?').run(userId);
        }
        return cloudState(userId);
    });
}

/** Unknown provider outcomes block destructive cleanup until a verified outcome is recorded. */
export function beginPaymentReview(userId:string,reference:string) {
    if(!postpaidPolicy(userId))return;
    getDb().prepare('INSERT OR IGNORE INTO postpaid_payment_review VALUES(?,?,?)').run(userId,reference,new Date().toISOString());
}
export function endPaymentReview(userId:string,reference:string) {
    getDb().prepare('DELETE FROM postpaid_payment_review WHERE userId=? AND reference=?').run(userId,reference);
}

/** Operator-only recovery after independently checking the exact object and stopping its executor. */
export function reconcileCleanup(userId:string,claimId:string,outcome:string,evidenceHash:string,now=new Date().toISOString()) {
    if(process.env.AWD_POSTPAID_RECONCILIATION_ENABLED!=='true')throw new Error('cleanup_manual_review_required');
    if(!['not_executed','deleted'].includes(outcome)||!/^[a-f0-9]{64}$/.test(evidenceHash))throw new Error('cleanup_reconciliation_evidence_required');
    return withTransaction(db=>{
        const row=db.prepare('SELECT * FROM postpaid_cleanup_claim WHERE userId=? AND id=?').get(userId,claimId) as {state:string;expiresAt:string;reconciliationEvidence:string|null}|undefined;
        if(!row||now<row.expiresAt)throw new Error('cleanup_claim_in_flight');
        const next=outcome==='deleted'?'complete':'cancelled';
        if(row.reconciliationEvidence&&(row.reconciliationEvidence!==evidenceHash||row.state!==next))throw new Error('cleanup_reconciliation_conflict');
        if(row.state==='complete'&&next!=='complete')throw new Error('cleanup_already_deleted');
        db.prepare('UPDATE postpaid_cleanup_claim SET state=?,reconciliationEvidence=? WHERE id=?').run(next,evidenceHash,claimId);
        return cloudState(userId,now);
    });
}
