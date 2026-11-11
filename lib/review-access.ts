import { platformProvider, bailianConfigured } from '@/lib/platform-ai/config';
import { platformModels } from '@/lib/platform-ai/catalog';
import { domesticQuota, retireOpenRouter } from '@/lib/platform-ai/billing';
// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
/** Operator-only complimentary review access. No HTTP route, paid order or signup reward. */
import { randomUUID } from 'node:crypto';
import { getDb, withTransaction } from '@/lib/db';
import { findOrCreateByEmail, findUserByAccount, findUserById, updateProfile } from '@/lib/users';
import { SUBSCRIPTION_LIMITS, subscriptionSnapshot } from '@/lib/subscription';
import { generateApiKey, revokeApiKey } from '@/lib/api-keys';
import { getActiveKeyRow } from '@/lib/openrouter-keys';
import { syncAiQuota } from '@/lib/ai-quota';
import { getKey } from '@/lib/openrouter-mgmt';
import { SITE_ID } from '@/lib/site-config';

export const REVIEW_IDENTITY = 'app@aiworkdeck.com';
const DAY = 86400000;
const GRANTED = 'complimentary_review_granted';
const REVOKING = 'complimentary_review_revoking';
const REVOKED = 'complimentary_review_revoked';
const BOOTSTRAPPED = 'complimentary_review_connected';
const CREDENTIALS_PENDING = 'complimentary_review_credentials_pending';
const CREDENTIALS_CLEANED = 'complimentary_review_credentials_cleaned';

export class ReviewAccessError extends Error {
    constructor(public readonly code: string) { super(code); }
}
function requireValue(ok: unknown, code: string): asserts ok {
    if (!ok) throw new ReviewAccessError(code);
}

/** Produced only after the original cloud configuration, database identity and login all agree. */
export interface ReviewProof {
    identity: string;
    cloudUserId: number;
    externalAccountId: string | null;
}
export interface ReviewGrant {
    grantId: string;
    userId: string;
    identity: string;
    cloudUserId: number;
    reason: string;
    startsAt: string;
    expiresAt: string;
    monthlyCents: number;
    weeklyCents: number;
}
function checkProof(proof: ReviewProof) {
    requireValue(SITE_ID === 'cn' && proof.identity === REVIEW_IDENTITY
        && Number.isSafeInteger(proof.cloudUserId) && proof.cloudUserId > 0, 'review_identity_mismatch');
}
function grantRef(id: string) {
    requireValue(/^[a-z0-9][a-z0-9-]{2,79}$/.test(id), 'invalid_grant_id');
    return `complimentary-review:${id}`;
}
function audit(action: string, grant: object, at: string) {
    getDb().prepare('INSERT INTO admin_audit(ts,action,detail) VALUES(?,?,?)')
        .run(at, action, JSON.stringify(grant));
}
function hasAudit(action: string, id: string) {
    return !!getDb().prepare("SELECT 1 FROM admin_audit WHERE action=? AND json_extract(detail,'$.grantId')=? LIMIT 1")
        .get(action, id);
}
export function readReviewGrant(proof: ReviewProof, id: string): ReviewGrant | null {
    checkProof(proof); grantRef(id);
    const row = getDb().prepare("SELECT detail FROM admin_audit WHERE action=? AND json_extract(detail,'$.grantId')=? ORDER BY id LIMIT 1")
        .get(GRANTED, id) as { detail: string } | undefined;
    if (!row) return null;
    const grant = JSON.parse(row.detail) as ReviewGrant;
    requireValue(grant.identity === proof.identity && grant.cloudUserId === proof.cloudUserId, 'grant_owner_mismatch');
    const user = findUserById(grant.userId);
    requireValue(user && !user.deletedAt && user.email === proof.identity && user.emailVerifiedAt
        && (!proof.externalAccountId || proof.externalAccountId === user.id), 'review_account_mismatch');
    return grant;
}
export function reviewGrantState(grant: ReviewGrant, now = new Date().toISOString()) {
    const revoking = hasAudit(REVOKING, grant.grantId);
    const revoked = hasAudit(REVOKED, grant.grantId);
    return { active: !revoking && !revoked && grant.startsAt <= now && now < grant.expiresAt,
        revoked, revocationPending: revoking && !revoked,
        connected: hasAudit(BOOTSTRAPPED, grant.grantId), expired: now >= grant.expiresAt };
}

export function grantReviewAccess(proof: ReviewProof, id: string, reason: string,
    now = new Date().toISOString()): ReviewGrant {
    checkProof(proof);
    const ref = grantRef(id);
    requireValue(reason.trim().length > 0 && reason.length <= 200, 'invalid_reason');
    requireValue(new Date(now).toISOString() === now, 'invalid_start_time');
    return withTransaction(d => {
        const previous = readReviewGrant(proof, id);
        if (previous) {
            requireValue(previous.reason === reason, 'grant_payload_conflict');
            requireValue(reviewGrantState(previous, now).active, 'grant_not_active');
            return previous; // Never reset dates, replenish usage or append more periods on retry.
        }
        const existing = findUserByAccount(proof.identity);
        requireValue(!proof.externalAccountId || existing?.id === proof.externalAccountId, 'review_binding_mismatch');
        if (existing) {
            requireValue(existing.displayName === 'App Review' && existing.emailVerifiedAt
                && !existing.phone && !existing.passwordHash, 'existing_account_not_dedicated');
            const history = d.prepare(`SELECT
                EXISTS(SELECT 1 FROM orders WHERE userId=@id)
                OR EXISTS(SELECT 1 FROM wallet_ledger WHERE userId=@id)
                OR EXISTS(SELECT 1 FROM entitlements WHERE userId=@id)
                OR EXISTS(SELECT 1 FROM subscription_period WHERE userId=@id)
                OR EXISTS(SELECT 1 FROM pro_payment WHERE userId=@id) AS present`).get({ id: existing.id }) as { present: number };
            requireValue(!history.present, 'existing_account_has_history');
        }
        // Identity was verified by the cloud's dedicated review login; this does not enable CN email signup.
        const { user } = findOrCreateByEmail(proof.identity);
        requireValue(!updateProfile(user.id, { displayName: 'App Review' }).error, 'review_profile_failed');
        const grant: ReviewGrant = { grantId: id, userId: user.id, identity: proof.identity,
            cloudUserId: proof.cloudUserId, reason, startsAt: now,
            expiresAt: new Date(Date.parse(now) + 90 * DAY).toISOString(),
            monthlyCents: SUBSCRIPTION_LIMITS.monthlyCents, weeklyCents: SUBSCRIPTION_LIMITS.weeklyCents };
        d.prepare('INSERT INTO entitlements(userId,feature,orderId,createdAt,expiresAt) VALUES(?,?,?,?,?)')
            .run(user.id, 'pro', ref, now, grant.expiresAt);
        for (let cycle = 0; cycle < 3; cycle++) {
            d.prepare(`INSERT INTO subscription_period(userId,outTradeNo,cycle,startsAt,endsAt,monthlyCents,weeklyCents)
                VALUES(?,?,?,?,?,?,?)`).run(user.id, ref, cycle,
                new Date(Date.parse(now) + cycle * 30 * DAY).toISOString(),
                new Date(Date.parse(now) + (cycle + 1) * 30 * DAY).toISOString(), grant.monthlyCents, grant.weeklyCents);
        }
        d.prepare('INSERT INTO subscription_preferences(userId,walletFallbackEnabled) VALUES(?,0)').run(user.id);
        audit(GRANTED, grant, now);
        return grant;
    });
}

export type CloudRequest = (method: string, path: string, body?: unknown, token?: string) => Promise<Record<string, any>>;

interface CredentialAttempt { grantId: string; userId: string; keyId: number; deviceName: string }
function pendingCredentials(grant: ReviewGrant): CredentialAttempt[] {
    const rows = getDb().prepare(`SELECT p.detail FROM admin_audit p WHERE p.action=?
        AND json_extract(p.detail,'$.grantId')=? AND NOT EXISTS(SELECT 1 FROM admin_audit c
        WHERE c.action=? AND json_extract(c.detail,'$.grantId')=json_extract(p.detail,'$.grantId')
        AND json_extract(c.detail,'$.keyId')=json_extract(p.detail,'$.keyId'))`).all(
            CREDENTIALS_PENDING, grant.grantId, CREDENTIALS_CLEANED) as { detail: string }[];
    return rows.map(row => JSON.parse(row.detail));
}
async function cleanupCredentials(attempt: CredentialAttempt, cloud: CloudRequest) {
    let failed = false;
    try {
        revokeApiKey(attempt.userId, attempt.keyId);
        requireValue(!getDb().prepare('SELECT 1 FROM api_keys WHERE userId=? AND id=? AND revokedAt IS NULL')
            .get(attempt.userId, attempt.keyId), 'account_key_cleanup_failed');
    } catch { failed = true; }
    // A DB failure must not prevent attempts to clean the independent cloud credential.
    try {
        const tokens = await cloud('GET', '/api/auth/device-tokens');
        requireValue(tokens.code === 0 && Array.isArray(tokens.data?.tokens), 'device_cleanup_unavailable');
        for (const item of tokens.data.tokens) {
            if (item.name !== attempt.deviceName) continue;
            requireValue(Number.isSafeInteger(item.id), 'device_cleanup_unavailable');
            const revoked = await cloud('POST', `/api/auth/device-token/${item.id}/revoke`);
            requireValue(revoked.code === 0, 'device_cleanup_unavailable');
        }
        const after = await cloud('GET', '/api/auth/device-tokens');
        requireValue(after.code === 0 && Array.isArray(after.data?.tokens)
            && !after.data.tokens.some((t: { name: string }) => t.name === attempt.deviceName), 'device_cleanup_unavailable');
    } catch { failed = true; }
    requireValue(!failed, 'temporary_credentials_cleanup_failed');
    audit(CREDENTIALS_CLEANED, attempt, new Date().toISOString());
}
async function cleanupPriorCredentials(grant: ReviewGrant, cloud: CloudRequest) {
    let failed = false;
    for (const attempt of pendingCredentials(grant)) {
        requireValue(attempt.userId === grant.userId, 'credential_owner_mismatch');
        try { await cleanupCredentials(attempt, cloud); } catch { failed = true; }
    }
    requireValue(!failed, 'temporary_credentials_cleanup_failed');
}

/** Provision through the existing bridge, then discard both temporary credentials separately. */
export async function connectReviewAccess(grant: ReviewGrant, cloud: CloudRequest) {
    requireValue(reviewGrantState(grant).active, 'grant_not_active');
    await cleanupPriorCredentials(grant, cloud);
    const deviceName = `App Review setup ${randomUUID()}`;
    const issued = withTransaction(() => {
        const result = generateApiKey(grant.userId);
        requireValue(result.key, 'temporary_key_limit'); // Never evict another device's key.
        audit(CREDENTIALS_PENDING, { grantId: grant.grantId, userId: grant.userId,
            keyId: result.key.info.id, deviceName }, new Date().toISOString());
        return result.key;
    });
    const attempt = { grantId: grant.grantId, userId: grant.userId, keyId: issued.info.id, deviceName };
    let bridge: { token: string; tokenId: number } | undefined;
    let cleanupFailed = false;
    try {
        const result = await cloud('POST', '/api/auth/awdk-login', { key: issued.plaintextKey, deviceName });
        if (result.code === 0 && typeof result.data?.token === 'string' && Number.isSafeInteger(result.data?.tokenId)) {
            bridge = result.data;
        }
        requireValue(bridge && result.data?.userId === grant.cloudUserId, 'bridge_identity_failed');
        // tryProvision inside awdk-login deliberately tolerates failure; verify both local and provider state.
        const local = await cloud('GET', '/api/platform-ai/key/status', undefined, bridge.token);
        requireValue(local.code === 0 && local.data?.bound === true && local.data?.available === true
            && local.data?.usageAvailable === true && local.data?.remainingUsd > 0, 'cloud_ai_not_ready');
        if(platformProvider()==='bailian') {
            requireValue(bailianConfigured() && domesticQuota(grant.userId).creditsCents>0,'provider_ai_not_ready');
            let usable=false;
            try{usable=(await platformModels()).some(m=>m.supportsTools);}catch{/* unavailable */}
            requireValue(usable,'provider_ai_not_ready');
        } else {
        const row = getActiveKeyRow(grant.userId);
        requireValue(row, 'runtime_key_missing');
        const provider = await getKey(row.orKeyHash);
        requireValue(!provider.disabled && provider.limitUsd > provider.usageUsd, 'provider_ai_not_ready');
        }
        const balance = await cloud('GET', '/api/mobile/billing/balance', undefined, bridge.token);
        requireValue(balance.subscription?.active === true && balance.subscription?.cloudStorageBytes > 0, 'cloud_subscription_not_ready');
    } finally {
        if (bridge) {
            try {
                const revoked = await cloud('POST', `/api/auth/device-token/${bridge.tokenId}/revoke`, undefined, bridge.token);
                const check = await cloud('GET', '/api/auth/me', undefined, bridge.token);
                if (revoked.code !== 0 || check.code === 0) cleanupFailed = true;
            } catch { cleanupFailed = true; }
        }
        try {
            // Durable non-secret journal also recovers a lost response / interrupted previous run.
            await cleanupCredentials(attempt, cloud);
        } catch { cleanupFailed = true; }
        requireValue(!cleanupFailed, 'temporary_credentials_cleanup_failed');
    }
    if (!hasAudit(BOOTSTRAPPED, grant.grantId)) audit(BOOTSTRAPPED, grant, new Date().toISOString());
}

/** End only this grant. Retain usage/provenance; never remove a later paid period or entitlement. */
export async function revokeReviewAccess(proof: ReviewProof, id: string, cloud: CloudRequest, now = new Date().toISOString()) {
    const grant = readReviewGrant(proof, id);
    requireValue(grant, 'grant_not_found');
    const ref = grantRef(id);
    withTransaction(d => {
        if (!hasAudit(REVOKING, id)) audit(REVOKING, grant, now);
        d.prepare('UPDATE subscription_period SET endsAt=MIN(endsAt,?) WHERE userId=? AND outTradeNo=?')
            .run(now, grant.userId, ref);
        d.prepare("UPDATE entitlements SET expiresAt=MIN(expiresAt,?) WHERE userId=? AND feature='pro' AND orderId=?")
            .run(now, grant.userId, ref);
    });
    let cleanupFailed = false;
    try { await cleanupPriorCredentials(grant, cloud); } catch { cleanupFailed = true; }
    if(platformProvider()==='bailian') {
        try { await retireOpenRouter(grant.userId); } catch { throw new ReviewAccessError('provider_revoke_pending'); }
        if(!subscriptionSnapshot(grant.userId).active)requireValue(domesticQuota(grant.userId).creditsCents===0,'provider_revoke_pending');
    } else if (getActiveKeyRow(grant.userId)) {
        const state = await syncAiQuota(grant.userId);
        requireValue(state.configured && state.hasKey, 'provider_revoke_pending');
        const row = getActiveKeyRow(grant.userId)!;
        const remote = await getKey(row.orKeyHash);
        requireValue(remote.disabled || Math.abs(remote.limitUsd - state.limitUsd) < 0.011, 'provider_revoke_pending');
        // A later genuine subscription retains its own budget. The reviewer grant does not own that budget.
        if (!subscriptionSnapshot(grant.userId).active) {
            requireValue(remote.disabled || remote.limitUsd <= remote.usageUsd + 0.011, 'provider_revoke_pending');
        }
    }
    requireValue(!cleanupFailed, 'temporary_credentials_cleanup_failed');
    if (!hasAudit(REVOKED, id)) audit(REVOKED, grant, now);
    return grant;
}
