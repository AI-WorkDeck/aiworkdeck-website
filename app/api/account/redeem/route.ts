import { NextRequest, NextResponse } from 'next/server';
import { toBaseLocale } from '@/i18n-config';
import { resolveKeyUser } from '@/lib/account-auth';
import { getSessionUser } from '@/lib/sessions';
import { redeemGiftCode, RedeemError } from '@/lib/gift-codes';
import { resolveRequestLocale } from '@/lib/api-locale';
import { bindCircleFirm, isCircleCodeCandidate, type CircleBindError } from '@/lib/circle-firms';
import { syncAiQuota } from '@/lib/ai-quota';

export const dynamic = 'force-dynamic';

/**
 * 兑换码核销（PR-W4）与 Circle 联盟所邀请码绑定（dev-board#1665）。契约见 doc/desktop-contract.md。
 * POST /api/account/redeem { code }
 * 鉴权二选一：桌面端 Bearer awdk_ Key，或官网登录 Cookie。
 *
 * 成功：{ ok: true, kind, amountCents?, balanceCents?, feature?, firmName?, suffix?, displayName? }
 * 失败：4xx { error, message }，重复兑换固定 409 +「该兑换码已被使用」。
 */
const ERRORS: Record<RedeemError, { status: number; message: string; messageEn: string }> = {
  invalid_code: { status: 400, message: '兑换码格式不正确，请核对后重试', messageEn: 'Invalid gift code format. Please check and try again.' },
  not_found: { status: 404, message: '兑换码不存在', messageEn: 'Gift code not found' },
  already_redeemed: { status: 409, message: '该兑换码已被使用', messageEn: 'This gift code has already been redeemed' },
  revoked: { status: 409, message: '该兑换码已作废', messageEn: 'This gift code has been revoked' },
  already_owned: { status: 409, message: '你已拥有该权益，兑换码未被消耗', messageEn: 'You already own this entitlement; the gift code was not consumed' },
};

const CIRCLE_ERRORS: Record<CircleBindError, { status: number; message: string; messageEn: string }> = {
  invalid_code: { status: 400, message: '邀请码无效，请核对后重试', messageEn: 'Invalid invitation code. Please check and try again.' },
  disabled: { status: 409, message: '该邀请码已停用', messageEn: 'This invitation code is disabled' },
  expired: { status: 409, message: '该邀请码已过期', messageEn: 'This invitation code has expired' },
  already_bound_same: { status: 409, message: '您已绑定过该律所邀请码', messageEn: 'You have already bound this firm invitation code' },
  already_bound_other: { status: 409, message: '每个账号仅可绑定一个联盟律所邀请码', messageEn: 'Each account can only bind one Circle firm invitation code' },
  user_not_found: { status: 404, message: '账户不存在', messageEn: 'Account not found' },
  bqt_member: { status: 409, message: '包晴天律师账户的计费走包晴天会员，不能绑定联盟律所邀请码', messageEn: 'Baoqingtian lawyer accounts are billed through Baoqingtian membership and cannot bind a Circle firm invitation code' },
};

export async function POST(request: NextRequest) {
  const user = resolveKeyUser(request) ?? (await getSessionUser());
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  let code: unknown = null;
  let explicitLang: unknown;
  try {
    const parsed = await request.json();
    code = parsed?.code;
    explicitLang = parsed?.lang;
  } catch {
    code = null;
  }
  const lang = resolveRequestLocale(request, explicitLang, 'zh');
  if (typeof code === 'string' && isCircleCodeCandidate(code)) {
    const circleRes = bindCircleFirm(user.id, code);
    if (!circleRes.ok) {
      const mapped = CIRCLE_ERRORS[circleRes.error] ?? CIRCLE_ERRORS.invalid_code;
      return NextResponse.json(
        { error: circleRes.error, message: toBaseLocale(lang) === 'en' ? mapped.messageEn : mapped.message },
        { status: mapped.status }
      );
    }
    void syncAiQuota(user.id).catch(() => undefined);
    return NextResponse.json(circleRes);
  }
  const result = redeemGiftCode(user.id, code);
  if ('error' in result) {
    const mapped = ERRORS[result.error];
    return NextResponse.json(
      { error: result.error, message: toBaseLocale(lang) === 'en' ? mapped.messageEn : mapped.message },
      { status: mapped.status }
    );
  }
  return NextResponse.json(result);
}
