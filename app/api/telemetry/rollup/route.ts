import { NextRequest, NextResponse } from 'next/server';
import { allowTelemetryRequest, isDateStr, isUuid, upsertRollup } from '@/lib/telemetry-store';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 64 * 1024;

/** by 系列与 counters：值必须全为有限数值，否则整包拒收。 */
function isNumericRecord(v: unknown): v is Record<string, number> {
  if (v === undefined) return true;
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  return Object.values(v).every(x => typeof x === 'number' && Number.isFinite(x));
}

function clientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

/**
 * 匿名遥测：每日汇总上报（与 /api/registry 同级，无账户鉴权）。
 * (installId, date) 幂等 upsert，payload 整包存 JSON 文本。
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
  if (!isUuid(body.installId) || !isDateStr(body.date)) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  if (
    !isNumericRecord(body.counters) ||
    !isNumericRecord(body.byProvider) ||
    !isNumericRecord(body.byModel) ||
    !isNumericRecord(body.byTool) ||
    !isNumericRecord(body.bySkill) ||
    !isNumericRecord(body.byMatterCategory) ||
    !isNumericRecord(body.tokens)
  ) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  upsertRollup({
    installId: body.installId,
    date: body.date,
    appVersion: typeof body.appVersion === 'string' ? body.appVersion.slice(0, 64) : null,
    platform: typeof body.platform === 'string' ? body.platform.slice(0, 64) : null,
    payload: raw,
  });
  return NextResponse.json({ ok: true });
}
