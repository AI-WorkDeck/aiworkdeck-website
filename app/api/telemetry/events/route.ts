import { NextRequest, NextResponse } from 'next/server';
import {
  allowTelemetryRequest,
  EVENT_WHITELIST,
  EventWrite,
  insertEvents,
  isUuid,
} from '@/lib/telemetry-store';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_EVENTS = 5000;

function clientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

/**
 * 匿名遥测：批量事件上报（无账户鉴权）。
 * eventName 必须在白名单内；白名单外或结构不完整的单条静默丢弃，不整包报错。
 */
export async function POST(request: NextRequest) {
  if (!allowTelemetryRequest(clientIp(request))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'payload_too_large' }, { status: 400 });
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  if (!isUuid(body.installId) || !Array.isArray(body.events)) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  if (body.events.length > MAX_EVENTS) {
    return NextResponse.json({ error: 'too_many_events' }, { status: 400 });
  }
  const appVersion = typeof body.appVersion === 'string' ? body.appVersion.slice(0, 64) : null;

  const accepted: EventWrite[] = [];
  for (const e of body.events) {
    if (typeof e !== 'object' || e === null) continue;
    const ev = e as Record<string, unknown>;
    if (typeof ev.ts !== 'string' || typeof ev.eventName !== 'string') continue;
    if (!EVENT_WHITELIST.has(ev.eventName)) continue;
    let attrs: string | null = null;
    if (ev.attrs !== undefined && ev.attrs !== null) {
      try {
        attrs = JSON.stringify(ev.attrs);
      } catch {
        attrs = null;
      }
    }
    accepted.push({
      ts: ev.ts.slice(0, 40),
      eventName: ev.eventName,
      convKey: typeof ev.convKey === 'string' ? ev.convKey.slice(0, 128) : null,
      attrs,
    });
  }
  insertEvents(body.installId, appVersion, accepted);
  return NextResponse.json({ ok: true, accepted: accepted.length });
}
