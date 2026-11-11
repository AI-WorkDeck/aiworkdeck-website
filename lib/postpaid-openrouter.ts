// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { randomUUID } from 'crypto';
import { getDb,withTransaction } from './db';
import { getSpendableBalance,spendCredits,refundSpend } from './credits';
import { captureServiceFunding,type ServiceFunding } from './subscription';
import { getExchangeRateInfo } from './ai-config';
import { getUserMarginMultiplier,CIRCLE_DEEPSEEK_SOURCE_KIND,getCircleDeepseekBalanceCents } from './circle-firms';
import { getActiveKeyRow,encryptKeyMaterial } from './openrouter-keys';
import * as mgmt from './openrouter-mgmt';
import { cloudState } from './postpaid';
import { settleUsage,type QuotaState } from './ai-quota';
interface Budget {userId:string;ledgerId:number|null;remainingCents:number;state:string;generation:string;expiresAt:string;keyHash:string|null;settledUsageUsd:number;usageBaseUsd:number;chargedCents:number;fundingJson:string;exchangeRate:number;margin:number}
const row=(userId:string)=>getDb().prepare('SELECT * FROM postpaid_external_budget WHERE userId=?').get(userId) as Budget|undefined;
/** A provider limit is an external reservation, never a second copy of available wallet funds. */
export async function syncPostpaidOpenRouter(userId:string):Promise<QuotaState> {
    if(!mgmt.isMgmtConfigured())throw new Error('not_configured');
    const generation=randomUUID(),now=new Date().toISOString();
    let budget=withTransaction(db=>{
        const old=row(userId);
        // A timed-out write can still be accepted remotely. Do not free or reissue its budget automatically.
        if(old&&old.state!=='active')throw new Error(old.state==='syncing'?'quota_sync_busy':'reconciliation_required');
        if(old){db.prepare("UPDATE postpaid_external_budget SET state='syncing',generation=?,expiresAt=? WHERE userId=?").run(generation,new Date(Date.now()+60000).toISOString(),userId);return {...old,generation};}
        const funding=captureServiceFunding(userId),rate=getExchangeRateInfo().rate,margin=getUserMarginMultiplier(userId);
        db.prepare("INSERT INTO postpaid_external_budget(userId,remainingCents,state,generation,expiresAt,fundingJson,exchangeRate,margin) VALUES(?,0,'syncing',?,?,?,?,?)").run(userId,generation,new Date(Date.now()+60000).toISOString(),JSON.stringify(funding),rate,margin);
        return row(userId)!;
    });
    let wroteProvider=false;
    try {
        let key=getActiveKeyRow(userId);
        if(key&&!budget.keyHash) {
            wroteProvider=true;await mgmt.disableKey(key.orKeyHash);
            const observed=await mgmt.getKey(key.orKeyHash);
            if(!observed.disabled)throw new Error('quota_disable_unconfirmed');
            // This is the last old authorization. Historical shortages stay platform shortfalls.
            const legacyFunding=key.fundingJson?JSON.parse(key.fundingJson):captureServiceFunding(userId);
            delete legacyFunding.postpaidVersion;
            settleUsage({...key,fundingJson:JSON.stringify(legacyFunding)},observed.usageUsd,budget.exchangeRate,budget.margin);
            getDb().prepare('UPDATE postpaid_external_budget SET keyHash=?,settledUsageUsd=?,usageBaseUsd=? WHERE userId=? AND generation=?').run(key.orKeyHash,observed.usageUsd,observed.usageUsd,userId,generation);
            budget=row(userId)!;
        }
        if(budget.keyHash) {
            const remote=await mgmt.getKey(budget.keyHash);
            if(!Number.isFinite(remote.usageUsd)||remote.usageUsd<0||!Number.isFinite(remote.limitUsd))throw new Error('invalid_provider_budget');
            if(remote.usageUsd<budget.settledUsageUsd)throw new Error('usage_watermark_regressed');
            const delta=remote.usageUsd-budget.settledUsageUsd;
            if(delta>0)withTransaction(db=>{
                const current=row(userId)!;if(current.generation!==generation)throw new Error('quota_generation_changed');
                const cumulative=Math.ceil((remote.usageUsd-current.usageBaseUsd)*current.exchangeRate*current.margin*100);
                const cents=Math.max(0,cumulative-current.chargedCents);
                if(current.ledgerId)refundSpend(db,current.ledgerId);
                const funding=JSON.parse(current.fundingJson) as ServiceFunding;
                if(cents)spendCredits(db,{userId,amountCents:cents,ledgerKind:'ai_alloc',funding,delivered:true,excludeSourceKinds:[CIRCLE_DEEPSEEK_SOURCE_KIND],meta:{service:'openrouter',phase:'settle',keyHash:current.keyHash,usageFrom:current.settledUsageUsd,usageTo:remote.usageUsd}});
                const left=Math.max(0,current.remainingCents-cents);
                // Still-open provider capacity retains its ORIGINAL funding authorization, even across expiry.
                const hold=left?spendCredits(db,{userId,amountCents:left,ledgerKind:'ai_alloc',funding,delivered:true,excludeSourceKinds:[CIRCLE_DEEPSEEK_SOURCE_KIND],meta:{service:'openrouter',phase:'external_reserve'}}):null;
                db.prepare('UPDATE postpaid_external_budget SET ledgerId=?,remainingCents=?,settledUsageUsd=?,chargedCents=? WHERE userId=?').run(hold?.id??null,left,remote.usageUsd,cumulative,userId);
                if(key)db.prepare('UPDATE openrouter_keys SET settledUsageUsd=? WHERE id=?').run(remote.usageUsd,key.id);
            });
            budget=row(userId)!;
        }
        const state=cloudState(userId);
        if(budget.remainingCents===0&&!state.billing.overLimitAt&&!state.cloudAccess.frozen) {
            budget=withTransaction(db=>{
                const funding=captureServiceFunding(userId),available=Math.max(0,getSpendableBalance(userId,new Date().toISOString(),funding)-getCircleDeepseekBalanceCents(userId));
                // Bounded slice keeps other cloud services usable instead of reserving the whole account.
                const rate=getExchangeRateInfo().rate,margin=getUserMarginMultiplier(userId);
                const amount=Math.min(1000,available,Math.max(Math.ceil(rate*margin),Math.floor(available/4)));
                const providerUsd=Math.floor(amount/(rate*margin))/100;
                const hold=providerUsd>0?spendCredits(db,{userId,amountCents:amount,ledgerKind:'ai_alloc',funding,excludeSourceKinds:[CIRCLE_DEEPSEEK_SOURCE_KIND],meta:{service:'openrouter',phase:'external_reserve'}}):null;
                db.prepare('UPDATE postpaid_external_budget SET ledgerId=?,remainingCents=?,fundingJson=?,exchangeRate=?,margin=?,usageBaseUsd=settledUsageUsd,chargedCents=0 WHERE userId=?').run(hold?.id??null,hold?amount:0,JSON.stringify(funding),rate,margin,userId);
                return row(userId)!;
            });
        }
        const remainingUsd=Math.floor(budget.remainingCents/(budget.exchangeRate*budget.margin))/100;
        const disable=!!state.billing.overLimitAt||state.cloudAccess.frozen||remainingUsd<=0;
        if(!budget.keyHash&&remainingUsd>0&&!disable) {
            wroteProvider=true;const created=await mgmt.createKey(`awd-user-${userId}`,remainingUsd);
            withTransaction(db=>{
                db.prepare('INSERT INTO openrouter_keys(userId,orKeyHash,limitUsd,createdAt,encKey,settledUsageUsd,fundingJson,mgmtAccount) VALUES(?,?,?,?,?,0,?,?)').run(userId,created.hash,created.limitUsd,now,encryptKeyMaterial(created.key),budget.fundingJson,mgmt.currentMgmtAccount());
                db.prepare('UPDATE postpaid_external_budget SET keyHash=? WHERE userId=? AND generation=?').run(created.hash,userId,generation);
            });
            budget=row(userId)!;key=getActiveKeyRow(userId);
        } else if(budget.keyHash) {
            wroteProvider=true;await mgmt.setPostpaidKeyBudget(budget.keyHash,budget.settledUsageUsd+remainingUsd,disable);
            if(key)getDb().prepare('UPDATE openrouter_keys SET limitUsd=?,fundingJson=? WHERE id=?').run(budget.settledUsageUsd+remainingUsd,budget.fundingJson,key.id);
        }
        getDb().prepare("UPDATE postpaid_external_budget SET state='active' WHERE userId=? AND generation=?").run(userId,generation);
        return {configured:true,hasKey:!!budget.keyHash,creditsCents:disable?0:budget.remainingCents+getSpendableBalance(userId),limitUsd:budget.settledUsageUsd+remainingUsd,usageUsd:budget.settledUsageUsd,remainingUsd:disable?0:remainingUsd,disabled:disable};
    } catch(error) {
        getDb().prepare("UPDATE postpaid_external_budget SET state=? WHERE userId=? AND generation=?").run(wroteProvider?'uncertain':'active',userId,generation);
        throw error;
    }
}
