// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import { pickLangText, resolveRequestLocale } from '@/lib/api-locale';
import { phoneIsAccount } from '@/lib/phone-policy';
import { NextRequest, NextResponse } from 'next/server';
import { bqtScanEnabled, completeBqtScanCallback, verifyBqtJinduSign } from '@/lib/bqt-auth';

const callbackMessages: Record<string, [string, string]> = {
  invalid_signature: ['签名校验失败', 'Signature verification failed'],
  invalid_request: ['请求格式不正确', 'Invalid request'],
  bqt_qr_expired: ['二维码已失效，请刷新后重试', 'QR code expired. Refresh and try again'],
  bqt_not_lawyer: ['仅支持已认证律师扫码登录', 'Only verified lawyers can sign in'],
  bqt_identity_conflict: ['身份已关联其他账户，请核实', 'Identity is already linked to another account'],
  bqt_identity_unavailable: ['关联账户不可用', 'Linked account is unavailable'],
  service_unavailable: ['扫码登录暂未开放', 'QR sign-in is not available'],
};
function reply(request: NextRequest, result: { code: number; msg: string; userId?: string }, status = 200) {
  const copy = callbackMessages[result.msg];
  return NextResponse.json({ code: result.code, msg: copy ? pickLangText(resolveRequestLocale(request), ...copy) : result.msg }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export const dynamic = 'force-dynamic';

/** Accept only the full-parameter HMAC callback; timestamp-only MD5 cannot bind identity. */
export async function GET(request: NextRequest) {
  if (!bqtScanEnabled()) return reply(request, { code: 1, msg: 'service_unavailable' }, 503);
  if (!phoneIsAccount()) return NextResponse.json({ error: 'sms_not_supported_on_site' }, { status: 400 });
  const { searchParams } = new URL(request.url);
  const params: Record<string, string | undefined> = {};
  searchParams.forEach((v, k) => {
    params[k] = v;
  });

  if (!verifyBqtJinduSign(params)) {
    return reply(request, { code: 1, msg: 'invalid_signature' }, 401);
  }

  const result = completeBqtScanCallback({
    qrid: params.qrid ?? '',
    timestamp: params.timestamp,
    bqtUserId: params.userId ?? '',
    userType: params.userType ?? '',
    userName: params.userName,
    mobile: params.mobile,
  });
  return reply(request, result);
}

export async function POST(request: NextRequest) {
  if (!bqtScanEnabled()) return reply(request, { code: 1, msg: 'service_unavailable' }, 503);
  if (!phoneIsAccount()) return NextResponse.json({ error: 'sms_not_supported_on_site' }, { status: 400 });
  let body: Record<string, any> = {};
  try {
    body = (await request.json()) ?? {};
  } catch {
    return reply(request, { code: 1, msg: 'invalid_request' }, 400);
  }

  // 模式 1：JSON 中带 ak + sign（Jindu HMAC-SHA256 协议）
  if (typeof body.ak === 'string' && typeof body.sign === 'string') {
    const strParams: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined && v !== null) strParams[k] = String(v);
    }
    if (!verifyBqtJinduSign(strParams)) {
      return reply(request, { code: 1, msg: 'invalid_signature' }, 401);
    }
    const result = completeBqtScanCallback({
      qrid: String(body.qrid ?? ''),
      timestamp: body.timestamp ? String(body.timestamp) : undefined,
      bqtUserId: String(body.userId ?? ''),
      userType: String(body.userType ?? ''),
      userName: body.userName ? String(body.userName) : undefined,
      mobile: body.mobile ? String(body.mobile) : undefined,
    });
    return reply(request, result);
  }

  // Timestamp-only MD5 does not authenticate the callback identity/body.
  // Only the existing full-parameter HMAC protocol is accepted.
  return reply(request, { code: 1, msg: 'invalid_signature' }, 401);
}
