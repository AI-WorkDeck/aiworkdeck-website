import { acceptsPostpaid } from '../postpaid';
// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHash } from 'crypto';
import { getDb, withTransaction } from '../db';
import { spendCredits, refundSpend, getSpendableBalance } from '../credits';
import { captureAiFunding, settleUsage, usdFromCents } from '../ai-quota';
import { getAiConfig, getExchangeRateInfo } from '../ai-config';
import type { ServiceFunding } from '../subscription';
import type { OrKeyRow } from '../openrouter-keys';
import * as mgmt from '../openrouter-mgmt';
import { bailianConfigured, deepseekConfigured, isDeepSeekModelId } from './config';
import { usageCostCny, type PlatformModel } from './catalog';
import { CIRCLE_DEEPSEEK_SOURCE_KIND, getUserMarginMultiplier } from '../circle-firms';
import { bqtLinkedLawyer, bqtMarginMultiplier, enqueueConsume } from '../bqt-member';
import { isBqtEligibleModel, bqtAiCreditsCents, bqtAuthorize, bqtFunding, bqtFundingJson, bqtHasActiveRequest, bqtReserveLedgerId, bqtTakeApproval, dispatchBqtConsume } from '../bqt-ai';
export interface PlatformRequest {
  userId:string; requestId:string; payloadHash:string; state:string; model:string;
  reserveCents:number; reserveLedgerId:number; fundingJson:string; priceJson:string; thinking:number;
  exchangeRate:number; margin:number; createdAt:string; updatedAt:string; costCny:number|null; costUsd:number|null;
  chargedCents:number|null; usageJson:string|null; errorCode:string|null;
}
export const requestRow=(userId:string,id:string)=>getDb().prepare('SELECT * FROM platform_ai_request WHERE userId=? AND requestId=?').get(userId,id) as PlatformRequest|undefined;
const retirement = new Map<string,Promise<void>>();
/** Stop the old credential first; keep rereading retired receipts so late OR usage is not lost. */
export function retireOpenRouter(userId:string,includeRetired=false):Promise<void> {
  const prior=retirement.get(userId);
  const next=(prior?prior.catch(()=>undefined):Promise.resolve()).then(async()=>{
    const rows=getDb().prepare(`SELECT k.* FROM openrouter_keys k WHERE k.userId=? AND
      (k.disabledAt IS NULL OR EXISTS(SELECT 1 FROM bailian_retired_key r WHERE r.keyId=k.id AND (r.lastCheckedAt IS NULL OR ?=1)))`).all(userId,includeRetired?1:0) as OrKeyRow[];
    for(const row of rows) {
      if(!row.disabledAt) {
        await mgmt.disableKey(row.orKeyHash);
        withTransaction(db=>{
          db.prepare('INSERT OR IGNORE INTO bailian_retired_key(keyId) VALUES (?)').run(row.id);
          db.prepare('UPDATE openrouter_keys SET disabledAt=? WHERE id=?').run(new Date().toISOString(),row.id);
        });
      }
      const remote=await mgmt.getKey(row.orKeyHash);
      settleUsage(row,remote.usageUsd,getExchangeRateInfo().rate,getUserMarginMultiplier(userId));
      getDb().prepare('UPDATE bailian_retired_key SET lastCheckedAt=? WHERE keyId=?').run(new Date().toISOString(),row.id);
    }
  });
  retirement.set(userId,next);void next.finally(()=>{if(retirement.get(userId)===next)retirement.delete(userId);}).catch(()=>undefined);return next;
}
/** Unknown accepted calls are never assumed free. After 15 minutes an incident refund trips a global circuit. */
export function recoverPending(now=new Date().toISOString()) {
  return withTransaction(db=>{
    const rows=db.prepare("SELECT * FROM platform_ai_request WHERE state IN ('reserved','submitted','usage_pending') AND createdAt<?")
      .all(new Date(Date.parse(now)-15*60_000).toISOString()) as PlatformRequest[];
    for(const row of rows) {
      // BQT rows never debited the wallet; same state transitions (and global circuit), nothing to refund locally.
      if(!bqtFunding(row.fundingJson))refundSpend(db,row.reserveLedgerId,{meta:{service:'platform_ai',phase:'incident_refund',requestId:row.requestId,reason:'unverified_usage'}});
      db.prepare('UPDATE platform_ai_request SET state=?,chargedCents=0,errorCode=?,updatedAt=? WHERE userId=? AND requestId=?')
        .run(row.state==='reserved'?'released':'refunded_pending',row.state==='reserved'?'not_submitted':'refunded_unverified',now,row.userId,row.requestId);
    }
    return rows.length;
  });
}
function maxCostCnyFor(model:PlatformModel,inputTokens:number,outputTokens:number,thinking:boolean) {
  const prices=model.priceTiers;
  // Reserve the highest applicable tier, including the upper bound for image input. Actual receipt selects its exact tier.
  const relevant=prices.filter(t=>t.min<inputTokens);
  const input=Math.max(...relevant.map(t=>thinking?(t.thinkingInput??t.input):t.input));
  const output=Math.max(...relevant.map(t=>thinking?(t.thinkingOutput??t.output):t.output));
  return (inputTokens*input+outputTokens*output)/1e6;
}
export function reserve(userId:string,id:string,payload:unknown,model:PlatformModel,inputTokens:number,outputTokens:number,thinking:boolean) {
  return reserveCostCny(userId,id,payload,model.id,maxCostCnyFor(model,inputTokens,outputTokens,thinking),model,thinking);
}
/** Points-funded requests use the BQT margin; wallet-funded ones keep the user's (Circle/global) margin. */
function reserveTerms(userId:string,maxCostCny:number,bqtLine:boolean) {
  const margin=bqtLine?bqtMarginMultiplier():getUserMarginMultiplier(userId), exchangeRate=getExchangeRateInfo().rate;
  if(!Number.isFinite(maxCostCny)||maxCostCny<0)throw new Error('invalid_request');
  const cents=Math.max(1,Math.ceil(maxCostCny*margin*100));
  if(!Number.isSafeInteger(cents)||cents>100000||!(margin>0)||!(exchangeRate>0))throw new Error('invalid_request');
  return {margin,exchangeRate,cents};
}
/**
 * Await before reserveCostCny. For a linked BQT lawyer on a DeepSeek model this tries BQT points first;
 * any BQT problem just means this request is paid from the wallet. No-op for everyone else.
 */
export async function authorizeCostCny(userId:string,id:string,maxCostCny:number,modelId:string) {
  if(!bqtLinkedLawyer(userId)||!isBqtEligibleModel(modelId))return;
  await bqtAuthorize(userId,`platform_ai:${id}`,reserveTerms(userId,maxCostCny,true).cents,modelId);
}
export function authorizeReserve(userId:string,id:string,model:PlatformModel,inputTokens:number,outputTokens:number,thinking:boolean) {
  return authorizeCostCny(userId,id,maxCostCnyFor(model,inputTokens,outputTokens,thinking),model.id);
}
export function reserveCostCny(userId:string,id:string,payload:unknown,modelId:string,maxCostCny:number,priceSnapshot:unknown,thinking=false) {
  const hash=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const linked=isBqtEligibleModel(modelId)?bqtLinkedLawyer(userId):null;
  const bqtTerms=linked?reserveTerms(userId,maxCostCny,true):null;
  const bqt=linked&&bqtTakeApproval(userId,`platform_ai:${id}`,bqtTerms!.cents)?linked:null;
  const walletTerms=reserveTerms(userId,maxCostCny,false);
  recoverPending();
  return withTransaction(db=>{
    const previous=requestRow(userId,id);
    if(previous)throw new Error(previous.payloadHash===hash?'request_already_submitted':'request_id_conflict');
    if(db.prepare("SELECT 1 FROM platform_ai_request WHERE state='refunded_pending' LIMIT 1").get())throw new Error('reconciliation_required');
    const active=db.prepare("SELECT COUNT(*) n FROM platform_ai_request WHERE state IN ('reserved','submitted','usage_pending')").get() as {n:number};
    const own=db.prepare("SELECT COUNT(*) n FROM platform_ai_request WHERE userId=? AND state IN ('reserved','submitted','usage_pending')").get(userId) as {n:number};
    if(active.n>=32||own.n>=4)throw new Error('busy');
    // Points first. A second concurrent points request (check-then-deduct race) goes to the wallet instead.
    if(bqt&&!bqtHasActiveRequest(db,userId)) {
      const {cents,margin,exchangeRate}=bqtTerms!, now=new Date().toISOString();
      db.prepare(`INSERT INTO platform_ai_request(userId,requestId,payloadHash,state,model,reserveCents,reserveLedgerId,fundingJson,priceJson,thinking,exchangeRate,margin,createdAt,updatedAt)
        VALUES (?,?,?,'reserved',?,?,?,?,?,?,?,?,?,?)`).run(userId,id,hash,modelId,cents,bqtReserveLedgerId(db),bqtFundingJson(bqt.lawyerId),JSON.stringify(priceSnapshot),thinking?1:0,exchangeRate,margin,now,now);
      return requestRow(userId,id)!;
    }
    const {cents,margin,exchangeRate}=walletTerms;
    const now=new Date().toISOString(), funding=captureAiFunding(userId);
    const excludeSourceKinds=isDeepSeekModelId(modelId)?undefined:[CIRCLE_DEEPSEEK_SOURCE_KIND];
    const ledger=spendCredits(db,{userId,amountCents:cents,funding,ledgerKind:'ai_alloc',nowIso:now,excludeSourceKinds,
      meta:{service:'platform_ai',provider:'bailian',phase:'reserve',requestId:id,model:modelId}});
    db.prepare(`INSERT INTO platform_ai_request(userId,requestId,payloadHash,state,model,reserveCents,reserveLedgerId,fundingJson,priceJson,thinking,exchangeRate,margin,createdAt,updatedAt)
      VALUES (?,?,?,'reserved',?,?,?,?,?,?,?,?,?,?)`).run(userId,id,hash,modelId,cents,ledger.id,JSON.stringify(funding),JSON.stringify(priceSnapshot),thinking?1:0,exchangeRate,margin,now,now);
    return requestRow(userId,id)!;
  });
}
export function submitted(userId:string,id:string) {
  if(!getDb().prepare("UPDATE platform_ai_request SET state='submitted',updatedAt=? WHERE userId=? AND requestId=? AND state='reserved'").run(new Date().toISOString(),userId,id).changes)throw new Error('request_already_submitted');
}
export function pending(userId:string,id:string,code='usage_pending') {
  getDb().prepare("UPDATE platform_ai_request SET state='usage_pending',errorCode=?,updatedAt=? WHERE userId=? AND requestId=? AND state='submitted'").run(code,new Date().toISOString(),userId,id);
}
export function release(userId:string,id:string,definitiveRejection=false) {
  withTransaction(db=>{
    const row=requestRow(userId,id)!;
    if(row.state==='released')return;
    if(row.state!=='reserved'&&!(definitiveRejection&&row.state==='submitted'))throw new Error('uncertain_request');
    if(!bqtFunding(row.fundingJson))refundSpend(db,row.reserveLedgerId,{meta:{service:'platform_ai',phase:'release',requestId:id}});
    db.prepare("UPDATE platform_ai_request SET state='released',chargedCents=0,updatedAt=? WHERE userId=? AND requestId=?").run(new Date().toISOString(),userId,id);
  });
}
export function settle(userId:string,id:string,usage:Record<string,unknown>) {
  const row=requestRow(userId,id)!;
  const cost=usageCostCny(JSON.parse(row.priceJson),usage,!!row.thinking,row.createdAt);
  return settleCostCny(userId,id,cost,usage);
}
export function settleCostCny(userId:string,id:string,cost:number,usage:Record<string,unknown>) {
  if(!Number.isFinite(cost)||cost<0)throw new Error('usage_pending');
  let requestNo:string|undefined;
  const settled=withTransaction(db=>{
    const row=requestRow(userId,id)!;
    if(row.state==='settled')return row;
    if(!['submitted','usage_pending'].includes(row.state))throw new Error('uncertain_request');
    const cents=Math.ceil(cost*row.margin*100);
    db.prepare('UPDATE platform_ai_request SET usageJson=?,costCny=?,costUsd=? WHERE userId=? AND requestId=?').run(JSON.stringify(usage),cost,cost/row.exchangeRate,userId,id);
    const bqt=bqtFunding(row.fundingJson);
    if(bqt) {
      // Never bill points beyond the preflighted ceiling; same incident path as wallet rows.
      if(cents>row.reserveCents){pending(userId,id,'cost_cap_exceeded');return requestRow(userId,id)!;}
      // requestId is client-chosen and only unique per user, so the BQT refId includes the user.
      if(cents>0)requestNo=enqueueConsume(db,{userId,lawyerId:bqt.lawyerId,cents,service:'platform_ai',refId:`${userId}:${id}`}).requestNo;
      db.prepare("UPDATE platform_ai_request SET state='settled',chargedCents=?,errorCode=NULL,updatedAt=? WHERE userId=? AND requestId=?").run(cents,new Date().toISOString(),userId,id);
      return requestRow(userId,id)!;
    }
    if(cents>row.reserveCents&&!acceptsPostpaid(userId,JSON.parse(row.fundingJson) as ServiceFunding)){pending(userId,id,'cost_cap_exceeded');return requestRow(userId,id)!;}
    refundSpend(db,row.reserveLedgerId,{meta:{service:'platform_ai',phase:'unreserve',requestId:id}});
    const excludeSourceKinds=isDeepSeekModelId(row.model)?undefined:[CIRCLE_DEEPSEEK_SOURCE_KIND];
    if(cents>0)spendCredits(db,{userId,amountCents:cents,funding:JSON.parse(row.fundingJson) as ServiceFunding,delivered:true,ledgerKind:'ai_alloc',nowIso:row.createdAt,excludeSourceKinds,
      meta:{service:'platform_ai',provider:'bailian',phase:'settle',requestId:id,model:row.model,costCny:cost,exchangeRate:row.exchangeRate,margin:row.margin}});
    db.prepare("UPDATE platform_ai_request SET state='settled',chargedCents=?,errorCode=NULL,updatedAt=? WHERE userId=? AND requestId=?").run(cents,new Date().toISOString(),userId,id);
    return requestRow(userId,id)!;
  });
  dispatchBqtConsume(requestNo);
  return settled;
}
/** Wallet credits plus, for a linked BQT lawyer, their BQT points (snapshot; refresh with refreshBqtSnapshot first). */
export function domesticQuota(userId:string) {
  recoverPending();
  const bqt=bqtLinkedLawyer(userId), rate=getExchangeRateInfo().rate;
  const walletCents=getSpendableBalance(userId,new Date().toISOString(),captureAiFunding(userId));
  const pointsCents=bqt?bqtAiCreditsCents(userId,bqt.lawyerId):0;
  const creditsCents=walletCents+pointsCents;
  const row=getDb().prepare("SELECT COALESCE(SUM(costUsd),0) total FROM platform_ai_request WHERE userId=? AND state='settled'").get(userId) as {total:number};
  const remainingUsd=usdFromCents(walletCents,rate,getUserMarginMultiplier(userId))+(pointsCents?usdFromCents(pointsCents,rate,bqtMarginMultiplier()):0);
  const configured=bailianConfigured()||deepseekConfigured();
  return {configured,provider:'bailian',hasKey:configured,creditsCents,usageUsd:row.total,remainingUsd,limitUsd:row.total+remainingUsd,disabled:false};
}
