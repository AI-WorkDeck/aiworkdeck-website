// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
/** Run from the LIVE website cwd, with its tsconfig/dependencies. Secrets never leave process memory. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const require = createRequire(path.join(process.cwd(), 'package.json'));
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const service = await import('../lib/review-access');
const { ReviewAccessError, REVIEW_IDENTITY } = service;
let loginSession: string | undefined;
let failed = false;
let grantRecorded = false;

async function cloud(method: string, route: string, body?: unknown, token = loginSession) {
    try {
        const response = await fetch(`http://127.0.0.1:9696${route}`, {
            method, redirect: 'error', signal: AbortSignal.timeout(60000),
            headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Session-Id': token } : {}) },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const data = await response.json();
        if (!response.ok) throw new ReviewAccessError('cloud_http_failed');
        return data as Record<string, any>;
    } catch (error) {
        if (error instanceof ReviewAccessError) throw error;
        throw new ReviewAccessError('cloud_request_failed');
    }
}
function check(value: unknown, code: string): asserts value {
    if (!value) throw new ReviewAccessError(code);
}

try {
    const [command, ...args] = process.argv.slice(2);
    check(['grant', 'status', 'revoke'].includes(command), 'command_required');
    const options = new Map<string, string>();
    check(args.length % 2 === 0, 'invalid_arguments');
    for (let i = 0; i < args.length; i += 2) {
        check(['--grant-id', '--cloud-user-id', '--reason'].includes(args[i]) && !options.has(args[i]), 'invalid_arguments');
        options.set(args[i], args[i + 1]);
    }
    const grantId = options.get('--grant-id') ?? '';
    const expectedUser = Number(options.get('--cloud-user-id'));
    check(/^[a-z0-9][a-z0-9-]{2,79}$/.test(grantId) && Number.isSafeInteger(expectedUser) && expectedUser > 0, 'identity_arguments_required');
    check(fs.existsSync(path.join(process.cwd(), 'data', 'awd.db')), 'live_database_missing');
    // Read the original file, never source it as shell code or copy it into the bundle.
    const env = require('node:util').parseEnv(fs.readFileSync('/opt/aiworkdeck/cloud/env', 'utf8')) as Record<string, string>;
    check((env.AUTH_REVIEW_ACCOUNT_IDENTITY ?? '').split(',').map(v => v.trim().toLowerCase()).includes(REVIEW_IDENTITY)
        && /^\d{6}$/.test(env.AUTH_REVIEW_ACCOUNT_CODE ?? ''), 'review_configuration_missing');
    // A login can create an unknown review identity. Verify the already-existing exact row BEFORE logging in.
    const sql = `BEGIN READ ONLY;
        SELECT json_build_object('id',u.id,'dedicated',u.display_name='App Review' AND u.role<>'ADMIN',
            'externalAccountId',(SELECT external_account_id FROM account_binding WHERE user_id=u.id))
        FROM app_users u WHERE u.id=${expectedUser} AND lower(u.verified_email)='${REVIEW_IDENTITY}';
        ROLLBACK;`;
    let records: Array<{ id: number; dedicated: boolean; externalAccountId: string | null }>;
    try {
        records = execFileSync('sudo', ['-u', 'postgres', 'psql', '-X', '-q', '-A', '-t', '-d', 'aiworkdeck_cloud'],
            { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
            .split('\n').filter(v => v.trim()).map(v => JSON.parse(v));
    } catch { throw new ReviewAccessError('readonly_identity_check_failed'); }
    check(records.length === 1 && records[0].id === expectedUser && records[0].dedicated, 'review_identity_mismatch');
    const login = await cloud('POST', '/api/auth/mail-login/verify', { email: REVIEW_IDENTITY, code: env.AUTH_REVIEW_ACCOUNT_CODE });
    if (login.code === 0 && typeof login.data?.sessionId === 'string') loginSession = login.data.sessionId;
    check(loginSession && login.data?.user?.id === expectedUser && login.data?.user?.displayName === 'App Review'
        && login.data?.user?.role !== 'ADMIN', 'review_login_failed');
    const me = await cloud('GET', '/api/auth/me');
    check(me.code === 0 && me.data?.id === expectedUser && me.data?.isAdmin === false, 'review_identity_mismatch');
    const proof = { identity: REVIEW_IDENTITY, cloudUserId: expectedUser, externalAccountId: records[0].externalAccountId };
    let grant = service.readReviewGrant(proof, grantId);
    grantRecorded = !!grant;
    if (command === 'grant') {
        grant = service.grantReviewAccess(proof, grantId, options.get('--reason') ?? '');
        grantRecorded = true;
        await service.connectReviewAccess(grant, cloud);
    } else if (command === 'revoke') {
        grant = await service.revokeReviewAccess(proof, grantId, cloud);
    }
    const assistant = await cloud('GET', '/api/mobile/assistant/status');
    const calendar = await cloud('GET', '/api/mobile/calendar/settings');
    check(assistant.code === 0 && calendar.code === 0, 'feature_status_failed');
    if (command === 'grant') check(assistant.data?.subscriptionAvailable === true && assistant.data?.subscriptionActive === true
        && calendar.data?.subscriptionAvailable === true && calendar.data?.subscriptionActive === true, 'feature_subscription_not_ready');
    console.log(JSON.stringify({ ok: true, grantId, expiresAt: grant?.expiresAt ?? null, grantRecorded,
        ...(grant ? service.reviewGrantState(grant) : {}),
        assistant: { code: assistant.code, enabled: assistant.data?.enabled === true,
            subscriptionActive: assistant.data?.subscriptionActive === true,
            subscriptionAvailable: assistant.data?.subscriptionAvailable === true,
            backupEnabled: assistant.data?.backupEnabled === true, consentEnabled: assistant.data?.consentEnabled === true },
        calendar: { code: calendar.code, enabled: calendar.data?.enabled === true,
            subscriptionActive: calendar.data?.subscriptionActive === true,
            subscriptionAvailable: calendar.data?.subscriptionAvailable === true } }));
} catch (error) {
    failed = true;
    console.error(JSON.stringify({ ok: false, grantRecorded,
        error: error instanceof ReviewAccessError ? error.code : 'operation_failed', retrySameGrantId: grantRecorded }));
} finally {
    if (loginSession) {
        try {
            const logout = await cloud('POST', '/api/auth/logout');
            const checkSession = await cloud('GET', '/api/auth/me');
            check(logout.code === 0 && checkSession.code !== 0, 'review_logout_failed');
            console.log(JSON.stringify({ reviewSessionClosed: true }));
        } catch {
            failed = true;
            console.error(JSON.stringify({ reviewSessionClosed: false }));
        }
    }
}
process.exitCode = failed ? 1 : 0;
