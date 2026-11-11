import { NextRequest, NextResponse } from 'next/server';
import { getUserByToken, SESSION_COOKIE } from '@/lib/sessions';
import { verifyCode, SmsError, SCENE_BIND, maskPhone } from '@/lib/sms-auth';
import { bindPhone } from '@/lib/users';
import { phoneIsAccount } from '@/lib/phone-policy';
import { resolveRequestLocale } from '@/lib/api-locale';

/** 校验验证码并完成绑定（也用于更换手机号：直接绑新号覆盖）。需已登录。 */
export async function POST(request: NextRequest) {
  if (!phoneIsAccount()) {
    return NextResponse.json({ error: 'sms_not_supported_on_site' }, { status: 400 });
  }
  const user = getUserByToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let phone: string;
  let code: string;
  let lang = resolveRequestLocale(request);
  try {
    const body = await request.json();
    phone = typeof body?.phone === 'string' ? body.phone : '';
    code = typeof body?.code === 'string' ? body.code : '';
    lang = resolveRequestLocale(request, body?.lang);
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  let normalized: string;
  try {
    normalized = verifyCode(SCENE_BIND, phone, code, lang);
  } catch (e) {
    if (e instanceof SmsError) {
      return NextResponse.json({ error: 'invalid_code', message: e.message }, { status: 401 });
    }
    console.error('[sms/bind] 未预期错误:', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }

  // 再查一次占用：发码到核销之间可能有别人抢先绑了同一个号
  const { error } = bindPhone(user.id, normalized);
  if (error) {
    return NextResponse.json({ error }, { status: error === 'phone_taken' ? 409 : 400 });
  }
  return NextResponse.json({ ok: true, phone: maskPhone(normalized) });
}
