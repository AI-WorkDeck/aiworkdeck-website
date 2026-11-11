import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/sessions';
import { listApiKeys } from '@/lib/api-keys';

/**
 * 账户页「已连接的设备」列表（awd_session Cookie 鉴权，浏览器用；桌面端走 Bearer 路由）。
 *
 * **手工生成 Key 的 POST 已删除**：桌面端与 Office 插件现在直接用手机号/邮箱登录，
 * Key 由 `issueLoginKey` 在登录时自动签发，用户不再需要看到它，账户页上也没有入口了。
 * 留着一个没有入口却能签发凭据的端点只是多一处攻击面。
 * 吊销仍在 `DELETE /api/account/keys/[id]`——那是「断开某台设备」。
 *
 * 注意 `lib/api-keys.ts` 的 `generateApiKey` **不要跟着删**：
 * contract-check 等六个契约脚本拿它当测试夹具，`verify-w1` 还钉着它的上限行为。
 */

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ keys: listApiKeys(user.id) });
}
