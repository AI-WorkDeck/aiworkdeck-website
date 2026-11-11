import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { normalizePhone, SmsError } from '@/lib/sms-auth';
import { findOrCreateByPhone } from '@/lib/users';
import { grantSignupBonus } from '@/lib/signup-grant';
import { clientIp } from '@/lib/login-throttle';
import { wxMiniConfigured, wxGetPhoneNumber, issueWxTicket, WxError } from '@/lib/wx-mini';
import { pickLangText, resolveRequestLocale } from '@/lib/api-locale';

/**
 * 小程序一键手机号建号（dev-board#305）。
 *
 * 调用方是伴生仓小程序的引流页（pages/start/start）：用户点
 * button open-type="getPhoneNumber" 授权后，小程序把 code 原样传来，
 * 这里持 AppSecret 调微信接口换出真实手机号再走 findOrCreateByPhone——
 * 与短信验证码建号同一落点，同号必然归并到同一账号。
 *
 * code 本身就是凭据（微信侧单次有效、绑定本 appid），不需要额外的调用方口令。
 * 响应不含手机号明文，只回用户名与一次性登录票据（见 lib/wx-mini.ts）。
 *
 * 不是浏览器端点：wx.request 无同源限制，不设 CORS 头。
 */
export const dynamic = 'force-dynamic';

/** 换号转化流水（对照 /start 落地的 start-refs.jsonl 评估漏斗）。 */
function logWxPhone(ref: string, created: boolean, userId: string) {
  try {
    fs.appendFileSync(
      path.join(process.cwd(), 'data', 'wx-phone.jsonl'),
      JSON.stringify({ at: new Date().toISOString(), ref: ref.slice(0, 64), created, userId }) + '\n'
    );
  } catch { /* 统计尽力而为 */ }
}

/** 单 IP 每分钟限次：code 无效时每次都要打一趟微信接口，别让人白刷。 */
const RATE_LIMIT = 10;
const hits = new Map<string, { count: number; windowStart: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.windowStart > 60_000) {
    if (hits.size > 10_000) hits.clear();
    hits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

export async function POST(request: NextRequest) {
  if (!wxMiniConfigured()) {
    return NextResponse.json({ error: 'wx_not_supported_on_site' }, { status: 400 });
  }
  if (rateLimited(clientIp(request))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  let code: string;
  let ref: string;
  let lang = resolveRequestLocale(request, undefined, 'zh');
  try {
    const body = await request.json();
    code = typeof body?.code === 'string' ? body.code : '';
    ref = typeof body?.ref === 'string' ? body.ref : '';
    lang = resolveRequestLocale(request, body?.lang, 'zh');
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  if (!code || code.length > 128) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  let phone: string;
  try {
    const info = await wxGetPhoneNumber(code);
    // 微信号可绑境外手机号，而本站账号本体只收大陆 11 位（与短信通道同口径）
    if (info.countryCode !== '86') {
      return NextResponse.json(
        {
          error: 'unsupported_region',
          message: pickLangText(lang, '目前仅支持中国大陆手机号', 'Only mainland China mobile numbers are currently supported'),
        },
        { status: 400 }
      );
    }
    phone = normalizePhone(info.purePhoneNumber, lang);
  } catch (e) {
    if (e instanceof WxError) {
      // code 无效/过期/被重放都归到这一类，让小程序引导用户重点一次授权
      console.warn('[wx-phone] 换号失败:', e.message);
      return NextResponse.json({ error: 'invalid_wx_code' }, { status: 401 });
    }
    if (e instanceof SmsError) {
      return NextResponse.json({ error: 'unsupported_region', message: e.message }, { status: 400 });
    }
    console.error('[wx-phone] 未预期错误:', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }

  const { user, created } = findOrCreateByPhone(phone);

  if (created) {
    // 与 sms-login/verify 同口径：账号已建出来，赠额出问题不该让用户以为没注册成功
    try {
      grantSignupBonus(user.id);
    } catch {
      // 吞掉：注册本身已经成功
    }
  }
  logWxPhone(ref, created, user.id);

  return NextResponse.json({
    user: { username: user.username, displayName: user.displayName },
    isNewUser: created,
    ticket: issueWxTicket(user.id),
  });
}
