import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, isAdminRequest } from './admin';
import { SITE_ID, siteConfigOf, siteOrigins, type SiteId } from './site-config';

// Explicit route/method allowlist: neither login nor another relay can be reached.
const ROUTES: Array<[RegExp, string[]]> = [
  [/^admin\/(overview|quiz|telemetry)$/, ['GET']],
  [/^admin\/ai$/, ['GET', 'PUT', 'POST']],
  [/^admin\/costs$/, ['GET', 'PUT']],
  [/^admin\/(commerce|pricing|community|developers)$/, ['GET', 'POST']],
  [/^admin\/gift-codes$/, ['GET', 'POST', 'PATCH']],
  [/^admin\/circle-firms$/, ['GET', 'POST', 'PATCH']],
  [/^admin\/circle-firms\/[\w.-]+\/users$/, ['GET']],
  [/^admin\/bqt$/, ['GET', 'PATCH']],
  [/^admin\/bqt\/(lawyers|consumes)$/, ['GET']],
  [/^admin\/bqt\/(lookup|consumes\/action)$/, ['POST']],
  [/^admin\/(plugins|packs)$/, ['GET']],
  [/^admin\/(plugins|packs)\/[\w.-]+$/, ['GET', 'POST']],
  [/^admin\/skills\/[\w.-]+$/, ['PATCH', 'DELETE']],
  [/^admin\/feedback(?:\/\d+(?:\/attachments\/\d+)?)?$/, ['GET']],
  [/^admin\/transparency$/, ['GET', 'PUT', 'PATCH', 'DELETE']],
  [/^admin\/transparency\/(auto|export)$/, ['GET']],
  [/^admin\/transparency\/receipts$/, ['POST', 'DELETE']],
  [/^admin\/(costs\/refresh|ai\/reconcile|credits\/expire|telemetry\/purge)$/, ['POST']],
  [/^community\/posts\/[\w-]+$/, ['PATCH', 'DELETE']],
  [/^community\/chat$/, ['DELETE']],
  [/^transparency\/receipt\/[\w-]+$/, ['GET']],
];

export function allowedRelayPath(parts: string[], method: string): boolean {
  if (parts.some(p => !/^[\w.-]+$/.test(p) || p === '.' || p === '..')) return false;
  return ROUTES.some(([pattern, methods]) => pattern.test(parts.join('/')) && methods.includes(method));
}

function failure(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function relayAdmin(request: NextRequest, site: string, parts: string[]) {
  if (!isAdminRequest(request)) return failure('unauthorized', 401);
  if ((site !== 'cn' && site !== 'intl') || site === SITE_ID || !allowedRelayPath(parts, request.method)) {
    return failure('invalid_target', 400);
  }
  const origin = request.headers.get('origin');
  const sameSite = origin !== null && (siteOrigins.includes(origin) ||
    (process.env.NODE_ENV !== 'production' && origin === request.nextUrl.origin));
  if (!['GET', 'HEAD'].includes(request.method) && !sameSite) {
    return failure('invalid_origin', 403);
  }
  const token = process.env.AWD_ADMIN_RELAY_TOKEN?.trim();
  if (!token || token.length < 16) return failure('relay_not_configured', 503);
  const target = new URL(`/api/${parts.join('/')}`, siteConfigOf(site as SiteId).origin);
  target.search = request.nextUrl.search;
  target.searchParams.set('site', site);
  const headers = new Headers({ Cookie: `${ADMIN_COOKIE}=${encodeURIComponent(token)}; awd_site=${site}` });
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('Content-Type', contentType);
  const range = request.headers.get('range');
  if (range) headers.set('Range', range);
  // The upstream origin is generated here, never taken from a browser-supplied header.
  headers.set('Origin', target.origin);
  const maxBytes = 12 * 1024 * 1024;
  let body: Uint8Array | undefined;
  if (request.body) {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maxBytes) { await reader.cancel(); return failure('too_large', 413); }
        chunks.push(value);
      }
      body = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
    } catch { return failure('bad_request', 400); }
  }
  try {
    const upstream = await fetch(target, {
      method: request.method, headers, body: body as BodyInit | undefined,
      redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(
        request.method === 'GET' && /^(admin\/(packs|plugins)\/|admin\/feedback\/\d+\/attachments\/|transparency\/receipt\/)/.test(parts.join('/')) ? 300_000 : 30_000
      ),
    });
    if (upstream.headers.get('x-awd-admin-site') !== site || (upstream.status >= 300 && upstream.status < 400) || [401, 403].includes(upstream.status) || upstream.status >= 500) {
      await upstream.body?.cancel();
      return failure('relay_unavailable', 502);
    }
    const responseHeaders = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    for (const name of ['content-type', 'content-disposition', 'content-range', 'accept-ranges']) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    if (!upstream.headers.has('content-encoding') && upstream.headers.has('content-length')) {
      responseHeaders.set('content-length', upstream.headers.get('content-length')!);
    }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch { return failure('relay_unavailable', 502); }
}
