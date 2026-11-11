import { NextResponse } from 'next/server';
import { bqtScanEnabled } from '@/lib/bqt-auth';
import { phoneIsAccount } from '@/lib/phone-policy';
import { captchaClientConfig } from '@/lib/captcha';

/**
 * 人机验证的公开配置。**匿名端点**——里面只有公开参数（site key / 场景 ID / 身份标），
 * 密钥一概不出现，所以不需要鉴权。
 *
 * ## 为什么要有这条
 * 官网自己的页面可以由服务端算好用 prop 传给表单，但**其它客户端拿不到**：
 * 桌面端（Electron 里的 uni-app 页）、将来的移动端，都是先打本机 Java、再由
 * `AccountService` 转发到官网。它们需要知道「本站启不启用、用哪家、公开参数是什么」
 * 才能把控件渲染出来、拿到 token 再发送。
 *
 * 未启用时回 `{ provider: null }` 而不是 404：客户端据此**跳过**验证码直接发码，
 * 与服务端此刻确实不校验是同一个判断（`captchaEnabled()` 一处出口）。
 * 回 404 会让客户端分不清「本站没开」和「路由写错了」。
 *
 * **不缓存**：密钥注入后要立刻生效，缓存会让客户端在一段时间里以为还没开、
 * 不带 token 发码，然后被 403 挡住。
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ ...(captchaClientConfig() ?? { provider: null }), bqtScanEnabled: phoneIsAccount() && bqtScanEnabled() }, { headers: { 'Cache-Control': 'no-store' } });
}
