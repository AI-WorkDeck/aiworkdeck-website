// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { AGENT_LIMITS } from '../../web-workbench/src/agent-contract.js';
import { siteConfig } from '@/lib/site-config';
import { createHash } from 'crypto';
import { getDb, withTransaction } from '@/lib/db';
import { spendCredits, refundSpend, InsufficientCreditsError } from '@/lib/credits';
import { captureServiceFunding, type ServiceFunding } from '@/lib/subscription';
import { WebError, WEB_MODEL, reserveUsdFor, type WebInput } from './contract';
export interface WebRequestRow {
  userId: string; requestId: string; payloadHash: string; state: 'reserved' | 'submitted' | 'usage_pending' | 'settled' | 'released' | 'refunded_pending';
  model: string; reserveCents: number; reserveLedgerId: number; fundingJson: string; exchangeRate: number; margin: number;
  createdAt: string; updatedAt: string; generationId: string | null; costUsd: number | null; chargedCents: number | null; chargeLedgerId: number | null; errorCode: string | null;
}

interface AgentRunRow {
  runId: string; userId: string; fileId: string; scopeHash: string; currency: string;
  perGenerationMaxChargeCents: number; totalReservedCents: number; nextStep: number;
  lastRequestId: string | null; stopped: number; createdAt: string; expiresAt: string;
}
/** Called only inside reserveRequest's IMMEDIATE transaction: a failed spend rolls this back too. */
function reserveAgentStep(db: ReturnType<typeof getDb>, userId: string, input: WebInput, reserveCents: number, now: string) {
  if (input.mode !== 'agent') return;
  const runId = input.agentContext?.runId, step = input.agentStep, quote = input.agentBudget;
  if (typeof runId !== 'string' || !runId || runId.length > 128 || !Number.isInteger(step) || step! < 0 || step! >= AGENT_LIMITS.maxGenerations || !quote) throw new WebError('invalid_request');
  const scopeHash = createHash('sha256').update(JSON.stringify({ message: input.message, language: input.language, history: input.history })).digest('hex');
  const previous = db.prepare('SELECT * FROM web_ai_agent_run WHERE runId=?').get(runId) as AgentRunRow | undefined;
  if (!previous) {
    if (step !== 0) throw new WebError('run_conflict', 409);
    db.prepare('INSERT INTO web_ai_agent_run(runId,userId,fileId,scopeHash,currency,perGenerationMaxChargeCents,createdAt,expiresAt) VALUES (?,?,?,?,?,?,?,?)')
      .run(runId,userId,input.document.id,scopeHash,quote.currency,quote.perGenerationMaxChargeCents,now,new Date(Date.parse(now)+AGENT_LIMITS.runTimeoutMs).toISOString());
  } else {
    if (previous.userId !== userId || previous.fileId !== input.document.id || previous.scopeHash !== scopeHash || previous.currency !== quote.currency || previous.perGenerationMaxChargeCents !== quote.perGenerationMaxChargeCents || previous.nextStep !== step) throw new WebError('run_conflict',409);
    if (previous.stopped || Date.parse(now) >= Date.parse(previous.expiresAt) || !previous.lastRequestId || getRequest(userId,previous.lastRequestId)?.state !== 'settled') throw new WebError('run_closed',409);
    if (previous.totalReservedCents + reserveCents > previous.perGenerationMaxChargeCents * AGENT_LIMITS.maxGenerations) throw new WebError('run_closed',409);
  }
  // Count attempts at reservation commit; rejection, disconnect and unknown usage never restore a step.
  db.prepare('UPDATE web_ai_agent_run SET nextStep=nextStep+1,totalReservedCents=totalReservedCents+?,lastRequestId=? WHERE runId=?')
    .run(reserveCents,input.requestId,runId);
}
function stopAgentRun(userId: string, requestId: string) {
  getDb().prepare('UPDATE web_ai_agent_run SET stopped=1 WHERE userId=? AND lastRequestId=?').run(userId,requestId);
}
export const payloadHash = (input: WebInput) => createHash('sha256').update(JSON.stringify(input)).digest('hex');
export function getRequest(userId: string, requestId: string) { return getDb().prepare('SELECT * FROM web_ai_request WHERE userId=? AND requestId=?').get(userId, requestId) as WebRequestRow | undefined; }
export const webReserveCents = (input: WebInput, exchangeRate: number, margin: number) => Math.ceil(reserveUsdFor(input) * exchangeRate * margin * 100);
export function reserveRequest(userId: string, input: WebInput, exchangeRate: number, margin: number, now = new Date().toISOString()): WebRequestRow {
  if (![exchangeRate, margin].every(n => Number.isFinite(n) && n > 0)) throw new WebError('ai_unavailable', 503);
  const reserveCents = webReserveCents(input, exchangeRate, margin), hash = payloadHash(input);
  if (!Number.isSafeInteger(reserveCents) || reserveCents < 1 || reserveCents > 10000) throw new WebError('ai_unavailable', 503);
  if (input.mode === 'agent' && (!input.agentBudget || input.agentBudget.currency !== siteConfig.currency || reserveCents > input.agentBudget.perGenerationMaxChargeCents || (input.agentStep === 0 && reserveCents !== input.agentBudget.perGenerationMaxChargeCents))) throw new WebError('price_changed', 409);
  return withTransaction(db => {
    const prior = getRequest(userId, input.requestId);
    if (prior) throw new WebError(prior.payloadHash === hash ? 'request_exists' : 'request_conflict', 409);
    if (db.prepare("SELECT 1 FROM web_ai_request WHERE state='refunded_pending' OR errorCode='cost_cap_exceeded' LIMIT 1").get()) throw new WebError('reconciliation_paused',503);
    const globalActive = db.prepare("SELECT COUNT(*) n FROM web_ai_request WHERE state IN ('reserved','submitted','usage_pending')").get() as { n:number };
    if (globalActive.n >= 8) throw new WebError('busy',429);
    if (db.prepare("SELECT 1 FROM web_ai_request WHERE userId=? AND state IN ('reserved','submitted','usage_pending')").get(userId)) throw new WebError('busy', 409);
    const minute = new Date(Date.parse(now) - 60_000).toISOString(), day = now.slice(0, 10);
    const counts = db.prepare('SELECT SUM(createdAt >= ?) minute, COUNT(*) day FROM web_ai_request WHERE userId=? AND createdAt>=?').get(minute, userId, day) as { minute: number; day: number };
    const minuteLimit = input.mode === 'agent' ? 24 : 6, dayLimit = input.mode === 'agent' ? 160 : 80;
    if (counts.minute >= minuteLimit || counts.day >= dayLimit) throw new WebError('rate_limited', 429);
    reserveAgentStep(db,userId,input,reserveCents,now);
    const funding = captureServiceFunding(userId, now);
    let ledger;
    try { ledger = spendCredits(db, { userId, amountCents: reserveCents, funding, ledgerKind: 'service_spend', nowIso: now, meta: { service: 'web_ai', phase: 'reserve', requestId: input.requestId, model: WEB_MODEL, ...(input.mode === 'agent' ? { runId: input.agentContext!.runId, agentStep: input.agentStep } : {}) } }); }
    catch (e) { if (e instanceof InsufficientCreditsError) throw new WebError('no_credits', 402); throw e; }
    db.prepare(`INSERT INTO web_ai_request(userId,requestId,payloadHash,state,model,reserveCents,reserveLedgerId,fundingJson,exchangeRate,margin,createdAt,updatedAt) VALUES (?,?,?,'reserved',?,?,?,?,?,?,?,?)`).run(userId,input.requestId,hash,WEB_MODEL,reserveCents,ledger.id,JSON.stringify(funding),exchangeRate,margin,now,now);
    return getRequest(userId,input.requestId)!;
  });
}
/** Persist submitted BEFORE issuing any network request. A crash here is uncertain, never retried. */
export function markSubmitted(userId: string, requestId: string) {
  const result = getDb().prepare("UPDATE web_ai_request SET state='submitted',updatedAt=? WHERE userId=? AND requestId=? AND state='reserved'").run(new Date().toISOString(),userId,requestId);
  if (result.changes !== 1) throw new WebError('request_exists',409);
}
export function rememberGeneration(userId: string, requestId: string, generationId: string) {
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(generationId)) throw new WebError('upstream_failed',502);
  getDb().prepare("UPDATE web_ai_request SET generationId=COALESCE(generationId,?),updatedAt=? WHERE userId=? AND requestId=? AND state IN ('submitted','usage_pending')").run(generationId,new Date().toISOString(),userId,requestId);
}
export function markPending(userId: string, requestId: string, code = 'usage_pending') {
  stopAgentRun(userId,requestId);
  getDb().prepare("UPDATE web_ai_request SET state='usage_pending',errorCode=?,updatedAt=? WHERE userId=? AND requestId=? AND state IN ('submitted','usage_pending')").run(code,new Date().toISOString(),userId,requestId);
}
/** Only pre-submission failures or explicit provider rejection can release a reservation. */
export function releaseRequest(userId: string, requestId: string, code: string, providerRejected = false) {
  return withTransaction(db => {
    const row = getRequest(userId,requestId)!;
    if (row.state === 'released' || row.state === 'settled' || row.state === 'refunded_pending') return row;
    if (row.state !== 'reserved' && !providerRejected) throw new Error('Cannot release an uncertain upstream request');
    stopAgentRun(userId,requestId);
    refundSpend(db,row.reserveLedgerId,{ meta: { service: 'web_ai',phase: 'release',requestId,reason: code } });
    db.prepare("UPDATE web_ai_request SET state='released',chargedCents=0,errorCode=?,updatedAt=? WHERE userId=? AND requestId=?").run(code,new Date().toISOString(),userId,requestId);
    return getRequest(userId,requestId)!;
  });
}
/** `waive` records the supplier cost but charges nothing: the generation delivered no usable output. */
export function settleRequest(userId: string, requestId: string, costUsd: number, waive = false) {
  if (!Number.isFinite(costUsd) || costUsd < 0) throw new WebError('usage_pending',503);
  return withTransaction(db => {
    const row = getRequest(userId,requestId)!;
    if (row.state === 'settled') return row;
    if (!['submitted','usage_pending'].includes(row.state)) throw new Error('Request has not been submitted');
    const cents = Math.ceil(costUsd * row.exchangeRate * row.margin * 100);
    // Provider price/token cap violation is NOT permission to bill above the displayed ceiling.
    if (cents > row.reserveCents) {
      db.prepare('UPDATE web_ai_request SET costUsd=? WHERE userId=? AND requestId=?').run(costUsd,userId,requestId);
      markPending(userId,requestId,'cost_cap_exceeded'); return getRequest(userId,requestId)!;
    }
    const settledAt = new Date().toISOString();
    refundSpend(db,row.reserveLedgerId,{ meta: { service: 'web_ai',phase: 'unreserve',requestId } });
    const charge = waive ? 0 : cents;
    const ledger = charge > 0 ? spendCredits(db,{ userId,amountCents:charge,funding:JSON.parse(row.fundingJson) as ServiceFunding,ledgerKind:'service_spend',
      // Re-debit at original authorization time, including lots that expired during generation.
      // Transaction contains both operations; other spends never see the released funds.
      nowIso:row.createdAt,meta:{service:'web_ai',phase:'settle',requestId,model:row.model,costUsd,exchangeRate:row.exchangeRate,margin:row.margin,settledAt} }) : null;
    db.prepare("UPDATE web_ai_request SET state='settled',costUsd=?,chargedCents=?,chargeLedgerId=?,errorCode=NULL,updatedAt=? WHERE userId=? AND requestId=?").run(costUsd,charge,ledger?.id ?? null,settledAt,userId,requestId);
    return getRequest(userId,requestId)!;
  });
}
export function receipt(row: WebRequestRow) {
  return { requestId:row.requestId,state:row.state,model:row.model,reservedCents:row.reserveCents,
    ...(row.costUsd!==null ? {costUsd:row.costUsd} : {}),
    ...(row.state==='settled' ? {chargedCents:row.chargedCents,ledgerId:row.chargeLedgerId} : {}),
    ...(['released','refunded_pending'].includes(row.state) ? {chargedCents:0} : {}), ...(row.errorCode ? {errorCode:row.errorCode} : {}),updatedAt:row.updatedAt };
}

/** Finite recovery: after 15 minutes without a trustworthy receipt, return user funds,
 * retain an incident, and stop ALL new Web AI requests until operators reconcile it.
 * At most eight requests can be in flight globally; this is a failure circuit, no free tier.
 * This intentionally does not retry upstream or retrospectively charge refunded funds.
 */
export const RECONCILIATION_DEADLINE_MS=15*60_000;
export function refundUnverified(userId:string,requestId:string,now=new Date().toISOString()) {
  return withTransaction(db=>{
    const row=getRequest(userId,requestId)!;
    if(!['submitted','usage_pending'].includes(row.state) || Date.parse(now)-Date.parse(row.createdAt)<RECONCILIATION_DEADLINE_MS)return row;
    refundSpend(db,row.reserveLedgerId,{meta:{service:'web_ai',phase:'incident_refund',requestId,reason:'unverified_usage'}});
    db.prepare("UPDATE web_ai_request SET state='refunded_pending',chargedCents=0,errorCode='refunded_unverified',updatedAt=? WHERE userId=? AND requestId=?").run(now,userId,requestId);
    return getRequest(userId,requestId)!;
  });
}
