import { NextRequest, NextResponse } from 'next/server';
import { wxStartEnabled, wxStartUrlLink } from '@/lib/wx-mini';

/**
 * 「微信一键开始」按钮的 URL Link（dev-board#305）。
 *
 * /start 微信内的未登录分支点按钮时到这里现取一条拉起小程序引流页的链接，
 * 再由前端跳转。按需生成而非随页面渲染：URL Link 生成有单日配额，
 * 页面曝光远大于点击（生成侧另有 6 小时缓存，见 lib/wx-mini.ts）。
 */
export const dynamic = 'force-dynamic';

/** ref 与 /start 落地统计同源（u-<username>），只放 URL Link query 允许的字符。 */
const REF_RE = /^[0-9A-Za-z._~-]{1,64}$/;

export async function POST(request: NextRequest) {
  if (!wxStartEnabled()) {
    return NextResponse.json({ error: 'wx_start_disabled' }, { status: 400 });
  }

  let ref = '';
  try {
    const body = await request.json();
    if (typeof body?.ref === 'string' && REF_RE.test(body.ref)) ref = body.ref;
  } catch {
    // 体可缺省：不带 ref 也要给链接
  }

  try {
    const url = await wxStartUrlLink(ref ? `ref=${ref}` : '');
    return NextResponse.json({ url });
  } catch (e) {
    console.error('[wx-link] URL Link 生成失败:', e);
    return NextResponse.json({ error: 'wx_link_failed' }, { status: 502 });
  }
}
