import { NextRequest, NextResponse } from 'next/server';
import { normalizeInput, submitFeatureRequest } from '@/lib/feature-request';

export const dynamic = 'force-dynamic';

/**
 * 官网「提交需求」表单入口。公开无登录（最该被听见的正是还没注册的人），
 * 闸门：蜜罐字段 + 本进程按 IP 限流 + 云端收件箱自身的每日配额。
 */

/** 每 IP 每小时最多 5 次（单进程内存即可，PM2 单实例，口径同 skill-draft 的限流） */
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = 5;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (list.length >= RATE_MAX) return true;
  list.push(now);
  hits.set(ip, list);
  return false;
}

function clientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 });
  }

  // 蜜罐：真人看不见这个字段，填了就是机器人。装作成功，别给爬虫反馈信号。
  if (typeof body.hp === 'string' && body.hp.length > 0) {
    return NextResponse.json({ ok: true });
  }

  const input = normalizeInput(body);
  if (!input) return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 });

  const ip = clientIp(request);
  if (rateLimited(ip)) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  const lang = typeof body.lang === 'string' && body.lang.length <= 8 ? body.lang : 'zh';
  const outcome = await submitFeatureRequest({ ...input, lang, ip });
  if (outcome.ok) return NextResponse.json({ ok: true });
  return NextResponse.json(
    { ok: false, error: outcome.error },
    { status: outcome.error === 'quota' ? 429 : 400 },
  );
}
