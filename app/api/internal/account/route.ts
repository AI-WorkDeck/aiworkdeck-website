import { egressQuote,reserveEgress,settleEgress,type EgressRequest } from '@/lib/postpaid-egress';
import { cloudState, acceptPostpaid, acknowledgeNotification, claimCleanup, completeCleanup, finishCleanup, resumeCloud, beginPaymentReview, endPaymentReview, reconcileCleanup, acknowledgeCleanupReconciled } from '@/lib/postpaid';
import { recordStorage, storageBaseline, type StorageEvent } from '@/lib/postpaid-meter';
import { recordShadowStorage, recordShadowEgress, recordShadowUnmapped, type ShadowStorageInput, type ShadowEgressInput } from '@/lib/postpaid-shadow';
import { SandboxSubscriptionRejected, sandboxMappedUserId, sandboxAllowed, prepareSandboxSubscription, applySandboxSubscription } from '@/lib/appstore-sandbox-subscription';
import { accountSubscriptionView } from '@/lib/account-subscription-view';
import { verifySubscriptionTransaction, appstoreEnv } from '@/lib/payments/appstore-adapter';
import { prepareAppstoreSubscription, appstoreAccountToken, applyAppstoreSubscription, appstoreSubscriptionCapability, SubscriptionRejected } from '@/lib/appstore-subscription';
import { subscriptionSnapshot } from '@/lib/subscription';
import { accountBillingFields, refreshBqtSnapshot } from '@/lib/bqt-account';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  findOrCreateByEmail,
  findOrCreateByPhone,
  findUserByAccount,
  findUserById,
  findUserByPhone,
  isDeletedUser,
} from '@/lib/users';
import { grantSignupBonus } from '@/lib/signup-grant';
import { getBalance, getPlan } from '@/lib/wallet';
import {
  ORDER_MAX_CENTS,
  createOrder,
  findOrderByIdempotencyKey,
  findOrderByProviderRef,
  findOrderByTransactionId,
  generateOrderNo,
  getOrder,
  updateOrder,
  type Order,
} from '@/lib/orders';
import {
  AppstoreVerificationError,
  appstoreAdapter,
  appstoreFaceValue,
  confirmGooglePlayPurchase,
  describeSettleFailure,
  getAdapterForChannel,
  getPaymentAdapter,
  googleplayAdapter,
  googleplayFaceValue,
  settleFromChannel,
  settlementFromTransaction,
  verifyTransaction,
  wxpayAppAdapter,
  wxvpAdapter,
} from '@/lib/payments';
import { deleteAccount } from '@/lib/account-deletion';
import { siteConfig } from '@/lib/site-config';
import { phoneIsAccount } from '@/lib/phone-policy';
import { emailIsAccount } from '@/lib/mail-policy';
import { normalizePhone, SmsError } from '@/lib/sms-auth';
import { normalizeEmail, MailError } from '@/lib/mail-auth';
import { wxGetPhoneNumber, wxMiniConfigured, WxError } from '@/lib/wx-mini';

export const dynamic = 'force-dynamic';

/**
 * 手机端统一账户的窄权限内部记账口（dev-board#425，设计见手机端仓
 * `docs/specs/2026-09-04-mobile-recharge-design.md` §3.2）。
 *
 * **形状照抄 `app/api/internal/transfer/route.ts`**，理由与它逐条相同：
 *
 * - **这不是桌面契约端点**：不出现在 doc/desktop-contract.md，不走 Bearer awdk_。
 *   调用方是同机部署的 Java 云后端（`addin.*` 那台机的 mobile 服务），走
 *   `127.0.0.1:<next端口>` 直连；公网侧由 nginx 对 `location ^~ /api/internal/`
 *   直接 `return 404` 兜底。**那条规则的仓库源本**：国际站在
 *   `doc/nginx-workdeck-ai.conf`，国内站（宝塔 vhost 不在仓库里）在
 *   `deploy/nginx/internal-deny.conf`；核对命令见 DEPLOY.md §7.5。
 *   **「仅本机」这条不是在代码里判 IP 的**：Next 拿到的 remote addr 在反代后面
 *   恒是 nginx 自己，判它等于没判；真正的边界是 nginx 那条 404 + 共享密钥，
 *   与 transfer 口同一套判定，不另发明。
 *
 * - **鉴权**：header `X-Internal-Secret` 恒定时间比较 env `AWD_MOBILE_BILLING_SECRET`。
 *   **另起一把，不复用 `AWD_TRANSFER_BILLING_SECRET`**：两条口子的能力面不同
 *   （那条只会按现算价扣/退，这条会建单收钱、会建账号），一把密钥泄漏不该同时
 *   把两件事都交出去。env 未配置或 header 缺失/不符——**一律空体 404**，不是
 *   401/403：功能在没配置的部署上必须表现成「路由不存在」，探测不出这条口子的存在。
 *
 * - **窄权限**：既有动作（`resolve` / `wx-phone` / `balance` / `create-recharge` /
 *   `confirm-appstore` / `query` / `delete-account`）及月订阅 capability/prepare/confirm；
 *   订阅协议见 doc/appstore-subscriptions.md，不向客户端暴露内部鉴权凭据。
 *   `confirm-appstore`（dev-board#426）是 `create-recharge(channel='appstore')` 的对偶：
 *   内购的钱是 iOS 端付给苹果的，服务端无从回查，只能靠客户端回传的苹果签名收据入账。
 *   `resolve` 只回 accountId（就是 `/api/account/me` 的那个字段、users.json 的
 *   uuid 主键），拿它换不到 awdk_ Key，也读不到流水。
 *   `wx-phone` 只把微信换号的 code 换成手机号回给云后端（dev-board#534），
 *   **不建账户、不发赠额、不签任何会话**——它只是借用本站的 AppSecret 做一次
 *   换号，账号与会话仍然由云后端自己按短信登录那套口径去建。
 *   `delete-account`（dev-board#434）是 `create=true` 的对偶：能在这里建号，
 *   就必须能在这里销号，否则 App 内建出来的账户在 App 内没有任何路径删得掉。
 *
 * ## 红线一：`resolve` 默认**不建号**（`create` 缺省 false）
 *
 * 第一版把建号做成了 resolve 的固有行为，于是「手机端用户打开一次设置页」这个纯读
 * 动作就在官网建出一行含明文手机号的真账户——用户全程无感知、未同意，而手机端的
 * 注销流程只删 Java 侧的绑定、**从不通知官网**，App 自己建出来的账号在 App 内没有
 * 任何路径能删掉。这直接踩 App Store 5.1.1(v) 与个人信息保护法的删除权。
 *
 * 所以 `create` 必须由调用方**显式**传 `true`，且只允许挂在「用户显式发起充值」
 * 这一个动作上；读余额那条路必须 `create=false`。默认值站在「不建」这边：
 * 调用方漏传、传了个字符串 `"true"`、传了别的真值，一律当没传。
 *
 * ## 红线二：`create=true` 建号**要发注册赠额**（与官网 sms-login 同款）
 *
 * 与第一版的判断相反，理由是幂等口径：`lib/signup-grant.ts` 的幂等靠
 * `credit_lots.refOrderId` 上的固定串，但官网四条登录路径全部只在 `created` 为真时
 * 才调它。于是「先由这条内部口静默建号、用户此后在官网正常登录」的用户，官网那侧
 * 拿到的是 `created=false`，**永久领不到注册赠额**——不发不是省钱，是把一笔本该
 * 属于用户的钱静默吞掉。
 *
 * 而「刷赠额」这条担心不成立：这里的手机号/邮箱是 Java 后端**已经用短信/邮件
 * 验证码验过**的身份（与官网自己 sms-login / mail-login 的凭证同等），要刷得先过
 * 同一道验证码。所以建号即发，口径与 sms-login 逐字一致：
 * 只在 `created` 时调、异常吞掉不让建号失败。
 *
 * ## 红线三：404 分两种形态，含义不同
 *
 * - **空体 404**：env 未配置 / secret 不符。对外部探测者与「路由不存在」不可区分，
 *   这一点不变。调用方（只有我们自己的云后端）见到它必须归为「上游不可用/配置
 *   错误」并打日志，**不许译成「这个用户没有账户」**——密钥配错一个字符就会让
 *   全量用户被告知「还没关联统一账户」，而运维在日志里一条痕迹都没有。
 * - **带 JSON body 的 404**（`{ "error": "account_not_found" | "order_not_found" }`）：
 *   真正的业务未命中。持有正确 secret 的调用方才拿得到，不构成对外探测面。
 *
 * 因此本文件里 `authGate404()` **只许用在鉴权/配置失败上**，业务未命中一律走
 * `fail(404, ...)`。
 *
 * ## `resolve` 的另一条纪律（在调用方那侧）
 *
 * 手机号/邮箱**只能取自 Java 后端会话对应的 User 实体**，不接受手机端请求体传入——
 * 否则这里就是一个手机号枚举 + 任意建号的口子。官网这侧无从校验这一点，只能靠
 * 共享密钥把调用方限定成我们自己的服务；纪律写在设计 §3.2，Java 侧
 * `MobileTransferService.requireAccountId()` 已有同款做法。
 */

function timingSafeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * 与「这条路由压根不存在」在观感上不可区分：空响应体、404。
 *
 * **只用于鉴权与配置失败**（见文件头红线三）。业务未命中走 `fail(404, ...)`，
 * 带 JSON body——否则调用方无从区分「密钥配错」与「这个用户没有账户」。
 */
function authGate404(): NextResponse {
  return new NextResponse(null, { status: 404 });
}

/** 业务错误一律 `{ error: <机器可读串> }`，不带面向用户的文案——调用方是服务端。 */
function fail(status: number, error: string, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error, ...extra }, { status });
}

/**
 * 充值订单描述。**服务端生成，不采信调用方传入**：这段文字会出现在微信收银台/
 * Stripe Checkout 上，是用户判断「我在给谁付钱」的依据，不能由请求体控制。
 */
const RECHARGE_DESCRIPTION = siteConfig.id === 'intl' ? 'Wallet top-up' : '钱包充值';

/**
 * 出站回查限频。与 `app/api/payment/query/route.ts` 同口径、各自一份 Map：
 * 限的是「对同一订单多久出站问一次通道」，两条路由各自计数最多让频率翻倍，
 * 而共享状态要么把限频提到 lib 里（动到正在收钱的那条路由），要么让内部口去
 * import 一个路由模块。这里选前者的反面：复制 20 行，不动 payment/query。
 */
const CHANNEL_QUERY_MIN_INTERVAL_MS = 2000;
const lastChannelQueryAt = new Map<string, number>();

function shouldQueryChannel(outTradeNo: string): boolean {
  const now = Date.now();
  const last = lastChannelQueryAt.get(outTradeNo) ?? 0;
  if (now - last < CHANNEL_QUERY_MIN_INTERVAL_MS) return false;
  lastChannelQueryAt.set(outTradeNo, now);
  // 防 Map 无界增长：超过 1000 条时清掉过期项
  if (lastChannelQueryAt.size > 1000) {
    for (const [key, ts] of lastChannelQueryAt) {
      if (now - ts >= CHANNEL_QUERY_MIN_INTERVAL_MS) lastChannelQueryAt.delete(key);
    }
  }
  return true;
}

/** query 的响应形状：只回状态与金额，不泄露 userId / idempotencyKey / payerOpenid。 */
function queryBody(order: Order) {
  return {
    status: order.status,
    paid: order.status === 'paid',
    amountCents: order.amount,
  };
}

// ---------------------------------------------------------------------------
// action: resolve
// ---------------------------------------------------------------------------

/**
 * 建号即发注册赠额，口径与 `app/api/auth/sms-login/verify` 逐字一致：
 * 只在 `created` 时调、异常吞掉。账号此刻已经建出来了，把赠额的失败变成 4xx
 * 只会让调用方以为建号没成功、换条路再来一遍。
 */
function grantSignupBonusQuietly(userId: string): void {
  try {
    grantSignupBonus(userId);
  } catch (e) {
    console.error('[internal account] 注册赠额发放失败（账号已建出，不影响本次响应）:', e);
  }
}

function handleResolve(body: Record<string, unknown>): NextResponse {
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  // **只认布尔 true**（见文件头红线一）。漏传、传字符串 "true"、传 1，
  // 一律当没传——这个默认值站在「不建号」那边是本口子最重要的一条约束。
  const create = body.create === true;

  // 恰好给一个。两个都给意味着调用方自己都没想清楚这个用户是谁——
  // 静默挑一个会让「同一个人建出两个账号」这类事故只在事后才浮现。
  if ((phone && email) || (!phone && !email)) {
    return fail(400, 'phone_or_email_required');
  }

  if (phone) {
    // 站点闸与 `/api/auth/exchange-key` 同口径：手机号只在大陆站是账号本体，
    // 在国际站建一个只有手机号的账号，等于建一个再也登不进来的孤儿账户。
    if (!phoneIsAccount()) return fail(400, 'phone_not_supported_on_site');
    let normalized: string;
    try {
      normalized = normalizePhone(phone);
    } catch (e) {
      if (e instanceof SmsError) return fail(400, 'invalid_phone');
      throw e;
    }

    if (!create) {
      // 纯读：查不到就是查不到，**一个字节都不写**。带 body 的 404 让调用方
      // 能把它与「密钥配错」的空体 404 区分开。
      const found = findUserByPhone(normalized);
      if (!found) return fail(404, 'account_not_found');
      return NextResponse.json({ accountId: found.id });
    }

    const { user, created } = findOrCreateByPhone(normalized);
    if (created) grantSignupBonusQuietly(user.id);
    return NextResponse.json({ accountId: user.id });
  }

  if (!emailIsAccount()) return fail(400, 'email_not_supported_on_site');
  let normalizedEmail: string;
  try {
    normalizedEmail = normalizeEmail(email);
  } catch (e) {
    if (e instanceof MailError) return fail(400, 'invalid_email');
    throw e;
  }

  if (!create) {
    // `findUserByAccount` 匹配 username 或 email，而 `USERNAME_RE` 不含 `@`，
    // 一个规范化过的邮箱不可能撞上任何合法用户名——所以这里等价于按邮箱查，
    // 且它已经排掉了墓碑行。刻意不用 `findOrCreateByEmail`：那条会顺手给命中的
    // 存量账号盖 `emailVerifiedAt`，而这是一条纯读路径，不该有任何写。
    const found = findUserByAccount(normalizedEmail);
    if (!found) return fail(404, 'account_not_found');
    return NextResponse.json({ accountId: found.id });
  }

  const { user, created } = findOrCreateByEmail(normalizedEmail);
  if (created) grantSignupBonusQuietly(user.id);
  return NextResponse.json({ accountId: user.id });
}

// ---------------------------------------------------------------------------
// action: wx-phone
// ---------------------------------------------------------------------------

/**
 * 微信手机号一键登录的换号口（dev-board#534，规格
 * `2026-09-09-miniprogram-entry-and-wx-login.md` §2）。
 *
 * 小程序的 `button open-type="getPhoneNumber"` 拿到的 code 只能由持 AppSecret 的
 * 服务端去换，而 AppSecret 在**官网这台**（`WX_MINI_APP_SECRET`，dev-board#305
 * 起就在这里），云后端没有也不该有第二份。所以云后端把 code 转到这条 action，
 * 换出手机号后由它自己走 `findOrCreateByPhone` + 签会话——与短信验证码登录
 * 同一落点。
 *
 * **与公开路由 `/api/auth/wx-phone` 的区别**：那条是官网自己的建号入口，会
 * `findOrCreateByPhone`、发注册赠额、发一次性票据、记 `wx-phone.jsonl` 漏斗；
 * 这条**一个字节都不写**——不建官网账户、不发赠额、不记流水。手机端用户此刻
 * 只是在登录云后端，官网这侧还没有任何理由建出一行含明文手机号的账户
 * （同文件头红线一：官网账号只在「用户显式发起充值」时才建）。
 *
 * 响应里是手机号明文，这与本口子其它 action 的口径一致：调用方是持共享密钥的
 * 我们自己的服务端，而它本来就要拿这个号去建自己的账户。
 */
async function handleWxPhone(body: Record<string, unknown>): Promise<NextResponse> {
  // 国际站没有小程序主体、或本站没配 AppSecret：**503 而不是 404/400**——
  // 这是「本部署没开通这个能力」，云后端要据此提示用户改走短信验证码，
  // 而不是把它当成「这次授权失败了，再点一次」。
  if (!wxMiniConfigured()) return fail(503, 'wx_not_configured');

  const code = typeof body.code === 'string' ? body.code.trim() : '';
  // 上限与 create-recharge 的 wxCode 同口径：微信的 code 是短串，
  // 长过 128 的一定不是它，不必为此白打一趟微信接口。
  if (!code || code.length > 128) return fail(400, 'bad_request');

  try {
    const info = await wxGetPhoneNumber(code);
    // 微信号可绑境外手机号，而本站与云后端的账号本体都只收大陆 11 位
    if (info.countryCode !== '86') return fail(400, 'unsupported_region');
    return NextResponse.json({ phone: normalizePhone(info.purePhoneNumber) });
  } catch (e) {
    if (e instanceof WxError) {
      // code 无效/过期/被重放都归到这一类：云后端提示用户重点一次授权
      console.warn('[internal account] wx-phone 换号失败:', e.message);
      return fail(401, 'invalid_wx_code');
    }
    // countryCode 说是 86、号码本身却不合法：与境外号同一个出口，
    // 云后端只有「仅支持中国大陆手机号」这一句话要说。
    if (e instanceof SmsError) return fail(400, 'unsupported_region');
    throw e;
  }
}

// ---------------------------------------------------------------------------
// action: create-recharge
// ---------------------------------------------------------------------------

/**
 * 微信虚拟支付的**权威价格表**（dev-board#427，规格 §1）。
 *
 * 手机端仓的 `contract/products.json` 与公众平台上已发布的道具是另外两份拷贝；
 * 三份必须一致，而**这一份说了算**：钱在官网这边记账，小程序传来的
 * `amountCents` 只有跟这里对上才建单，对不上回 400 `product_mismatch`
 * （Java 侧译成 REJECTED，提示用户更新小程序）。
 *
 * 不从 contract 生成物读：那是手机端仓的产物，官网不依赖它的构建；
 * 三档价格半年也不动一次，漂了会被 `product_mismatch` 当场抓住。
 * 微信单个道具上限 100 元，所以没有更高的档。
 */
const WXVP_PRODUCT_PRICES: Readonly<Record<string, number>> = {
  credits_cny_10: 1000,
  credits_cny_50: 5000,
  credits_cny_100: 10000,
};

async function handleCreateRecharge(
  userId: string,
  body: Record<string, unknown>
): Promise<NextResponse> {
  const amountCents = body.amountCents;
  // 金额校验与 `/api/payment/create` 逐条相同：正整数分 + 单笔上限。
  // **不接受档位 id**：档位是客户端概念，服务端只认金额，少一层可被伪造的映射。
  if (typeof amountCents !== 'number' || !Number.isInteger(amountCents) || amountCents <= 0) {
    return fail(400, 'invalid_amount');
  }
  if (amountCents > ORDER_MAX_CENTS) {
    return fail(400, 'amount_too_large');
  }

  // 幂等键由调用方生成并持久化（设计 §3.3：手机端必须先落盘再发起，扛得住 App 被杀）。
  // 这里只做形状校验，落到 orders 表已有的 UNIQUE(userId, idempotencyKey)。
  const idempotencyKey =
    typeof body.idempotencyKey === 'string' &&
    body.idempotencyKey.length > 0 &&
    body.idempotencyKey.length <= 128
      ? body.idempotencyKey
      : null;
  if (!idempotencyKey) return fail(400, 'idempotency_key_required');

  // ---- 通道分叉（dev-board#427）----
  //
  // `channel` 缺省 = 第一期行为（部署级默认通道：大陆站微信扫码 / 国际站 Stripe），
  // 不按请求来源判定。目前只多认一个 `wxvp`；**别的字符串一律 400**，不静默
  // 回落到默认通道——回落等于让调用方以为自己用的是虚拟支付、实际拿到一张扫码单。
  const rawChannel = body.channel;
  if (
    rawChannel !== undefined &&
    rawChannel !== null &&
    rawChannel !== 'wxvp' &&
    rawChannel !== 'appstore' &&
    rawChannel !== 'wxpay-app' &&
    rawChannel !== 'googleplay'
  ) {
    return fail(400, 'unsupported_channel');
  }
  const isWxvp = rawChannel === 'wxvp';
  const isAppstore = rawChannel === 'appstore';
  const isWxpayApp = rawChannel === 'wxpay-app';
  const isGooglePlay = rawChannel === 'googleplay';
  const isNativeIap = isAppstore || isGooglePlay;

  // 安卓微信支付 APP 支付（dev-board#428）。金额口径与默认通道（Native 扫码）完全相同：
  // 上面那道正整数分 + 单笔上限，不设档位表。**未配 WXPAY_APP_APPID（或不是人民币站）
  // = 本通道不存在**：在查幂等键、建单之前就回 503 channel_unavailable，库里一行都不写。
  if (isWxpayApp && !wxpayAppAdapter.isConfigured()) {
    return fail(503, 'channel_unavailable');
  }

  let productId = '';
  let wxCode = '';
  if (isAppstore) {
    // Apple 内购的档位表在 `lib/payments/appstore-catalog.ts`（官网是价格权威，
    // ASC 上的商品与手机端契约是另外两份拷贝）。校验口径与 wxvp 那支逐条相同：
    // 档位必须存在、金额必须严格相等，绝不按请求体给的金额建单。
    productId = typeof body.productId === 'string' ? body.productId : '';
    const expected = appstoreFaceValue(productId);
    if (expected === undefined || expected !== amountCents) {
      return fail(400, 'product_mismatch');
    }
  } else if (isGooglePlay) {
    productId = typeof body.productId === 'string' ? body.productId : '';
    const expected = googleplayFaceValue(siteConfig.currency, productId);
    if (expected === null || expected !== amountCents) {
      return fail(400, 'product_mismatch');
    }
  } else if (isWxvp) {
    productId = typeof body.productId === 'string' ? body.productId : '';
    // hasOwnProperty 而不是 `WXVP_PRODUCT_PRICES[productId]`：后者对
    // `constructor` / `toString` 这类原型键会取到函数，绕开档位表。
    const expected = Object.prototype.hasOwnProperty.call(WXVP_PRODUCT_PRICES, productId)
      ? WXVP_PRODUCT_PRICES[productId]
      : undefined;
    // 档位与金额必须严格相等。**官网是价格权威**：小程序旧版本上的过期档位、
    // 或被改过的请求，都在这里被拦下，绝不按请求体给的金额建单。
    if (expected === undefined || expected !== amountCents) {
      return fail(400, 'product_mismatch');
    }
    wxCode = typeof body.wxCode === 'string' ? body.wxCode.trim() : '';
    if (!wxCode || wxCode.length > 128) return fail(400, 'wx_code_required');
  }

  const adapter = isWxvp
    ? wxvpAdapter
    : isAppstore
      ? appstoreAdapter
      : isGooglePlay
        ? googleplayAdapter
        : isWxpayApp
          ? wxpayAppAdapter
          : getPaymentAdapter();

  const existing = findOrderByIdempotencyKey(userId, idempotencyKey);
  if (existing) {
    // 已付的单没有二维码可给了，回放一张过期的收款码只会让用户再付一次。
    // 带上 outTradeNo：App 被杀后重放时它可能没存下单号，靠这个才能转去 query。
    if (existing.status === 'paid') {
      return fail(409, 'order_already_paid', { outTradeNo: existing.outTradeNo });
    }
    // 同一把键换个金额 = 调用方的键复用错了，不能让它复用出一张金额不符的单。
    // 换个通道同理：订单上记的 channel 决定回调/回查走哪条路，中途改它等于
    // 让一张扫码单去认虚拟支付的结算（settleFromChannel 会拦，但那已经太晚）。
    if (
      existing.amount !== amountCents ||
      existing.kind !== 'recharge' ||
      existing.channel !== adapter.id ||
      // 内购单的档位也钉在幂等键上：同一把键换个 productId，回来确认时
      // `productId == order.skuId` 那条校验必然失败，与其让它在付完钱之后炸，
      // 不如在这里就说清楚是键复用错了。
      (isNativeIap && existing.skuId !== productId)
    ) {
      return fail(409, 'idempotency_conflict', { outTradeNo: existing.outTradeNo });
    }

    // **内购的重放必须回原来那个 appAccountToken**：客户端可能已经拿着它发起过
    // 购买（App 被杀、网络超时都会走到重放这条路）。换一个新 UUID 等于让那笔
    // 已经付掉的购买再也对不回这张单。
    if (isNativeIap && existing.providerRef) {
      return NextResponse.json({
        present: 'native',
        outTradeNo: existing.outTradeNo,
        amountCents,
        appAccountToken: existing.providerRef,
      });
    }
  }

  const outTradeNo = existing?.outTradeNo ?? generateOrderNo('RECHARGE');

  // 密钥齐备的判定放在幂等/冲突之后：已付单的 409、键复用的 409 都是**确定性的
  // 答复**，不该因为某把密钥没配就退化成「通道不可用，稍后再试」。
  if (!adapter.isConfigured()) {
    console.error(`[internal account] 支付通道 ${adapter.id} 密钥不全，无法建单`);
    return fail(503, 'payment_channel_unavailable');
  }

  if (!existing) {
    createOrder({
      id: outTradeNo,
      outTradeNo,
      description: RECHARGE_DESCRIPTION,
      amount: amountCents,
      status: 'pending',
      userId,
      kind: 'recharge',
      // 通道与币种在建单时定死：回调/回查一律按订单上记的这两项校验与结算
      channel: adapter.id,
      currency: adapter.currency,
      // 内购单把 productId 落进 skuId：确认时要拿它跟回执里的 productId 对。
      ...(isNativeIap ? { skuId: productId } : {}),
      idempotencyKey,
    });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || siteConfig.origin;
  const charge = await adapter.createCharge({
    outTradeNo,
    description: RECHARGE_DESCRIPTION,
    amountMinor: amountCents,
    baseUrl,
    ...(isWxvp ? { productId, wxCode } : {}),
    ...(isNativeIap ? { productId } : {}),
  });

  // 判别联合逼着三种形态各自显式展开，不用「哪个字段非空」反推
  if (charge.channel === 'wxvp') {
    // openid 落库：`/xpay/query_order` 必须带 openid，回查时只能从订单上取。
    updateOrder(outTradeNo, { providerRef: charge.providerRef });
    return NextResponse.json({
      present: 'virtual',
      outTradeNo,
      amountCents,
      // 三者原样透传给 `wx.requestVirtualPayment`；signData 一个字节都不能改，
      // 两个签名都是对它算的。**session_key 不在这里，也永远不出服务端。**
      signData: charge.signData,
      paySig: charge.paySig,
      signature: charge.signature,
    });
  }

  if (charge.channel === 'appstore' || charge.channel === 'googleplay') {
    // appAccountToken 落 providerRef：确认时既按它校验、也能在客户端丢了单号时反查。
    updateOrder(outTradeNo, { providerRef: charge.appAccountToken });
    return NextResponse.json({
      present: 'native',
      outTradeNo,
      amountCents,
      // iOS 传给 appAccountToken(_:)；Android Google Play 传给 setObfuscatedAccountId(_:)
      appAccountToken: charge.appAccountToken,
    });
  }

  if (charge.channel === 'wxpay-app') {
    // 七个字段原样填进安卓 OpenSDK 的 PayReq。SDK 回调的 errCode 不作数：
    // 端上收到回调后必须走 action=query（云后端 /recharge/status）确认到账。
    return NextResponse.json({
      present: 'app',
      outTradeNo,
      amountCents,
      ...charge.appPay,
    });
  }

  if (charge.channel === 'stripe') {
    // Session id 落库：Stripe 无法按 client_reference_id 反查 Session，
    // 回查（queryCharge）只能靠这个引用
    updateOrder(outTradeNo, { providerRef: charge.providerRef });
    return NextResponse.json({
      present: 'redirect',
      outTradeNo,
      amountCents,
      redirectUrl: charge.redirectUrl,
    });
  }

  return NextResponse.json({
    present: 'qrcode',
    outTradeNo,
    amountCents,
    codeUrl: charge.codeUrl,
    qrCode: charge.qrCode,
  });
}

// ---------------------------------------------------------------------------
// action: confirm-appstore
// ---------------------------------------------------------------------------

/**
 * StoreKit 2 的 JWS 大约 2~4 KB。给一个宽松但有限的上限：超过它的一定不是收据，
 * 不必把几 MB 的字符串送进验签器。
 */
const MAX_SIGNED_TRANSACTION_LEN = 32 * 1024;

/**
 * Apple 内购到账确认（dev-board#426，设计 §4.2）。
 *
 * 这是**内购唯一的入账口**：钱是 iOS 端付给苹果的，服务端既没发起过收款、
 * 也无从回查（`appstoreAdapter.queryCharge()` 恒 null），能验证的只有客户端
 * 回传的这张苹果签名收据。
 *
 * 五道校验，任何一道不过一分钱都不写：
 * 1. **验签**——x5c 三级链 + Apple 私有扩展 OID + bundleId + environment。
 * 2. **appAccountToken == order.providerRef**。建单时发的那个 UUID 是这笔购买
 *    与这张订单之间唯一的绑定；不比它，任何一张别人的合法收据都能结掉这张单。
 * 3. **productId == order.skuId**。防「买 50 的档、拿去结 300 的单」。
 * 4. **transactionId 没被用过**。苹果的收据可以无限次重放（客户端确认成功前
 *    不该 finish，所以重放本来就是正常流程），一张收据只许结一张单。
 * 5. **面值取目录表**，不取苹果 JWS 里的 price/currency（见 appstore-catalog.ts
 *    的币种坑）；苹果实收的那几个字段只落 `orders.providerMeta` 作对账。
 *
 * `outTradeNo` 可省：App 被杀、换设备重装后 `Transaction.unfinished` 里的交易
 * 可能配不上本地单号，此时用 appAccountToken 反查 `providerRef`。
 */
async function handleConfirmAppstore(
  userId: string,
  body: Record<string, unknown>
): Promise<NextResponse> {
  const signedTransaction =
    typeof body.signedTransaction === 'string' ? body.signedTransaction.trim() : '';
  if (!signedTransaction || signedTransaction.length > MAX_SIGNED_TRANSACTION_LEN) {
    return fail(400, 'transaction_invalid');
  }
  // 密钥/配置不全时是「本部署没开通内购」，不是「这张收据有问题」：
  // 503 让云后端提示稍后再试，而不是把用户的收据当废票丢掉。
  if (!appstoreAdapter.isConfigured()) {
    console.error('[internal account] APPSTORE_* 未配置，无法验签内购收据');
    return fail(503, 'payment_channel_unavailable');
  }

  let tx;
  try {
    tx = await verifyTransaction(signedTransaction);
  } catch (e) {
    // 验签失败是**确定性拒绝**（重试没用）：400，不是 5xx。
    console.error('[internal account] 内购收据验签失败:', e instanceof Error ? e.message : e);
    if (e instanceof AppstoreVerificationError) return fail(400, 'transaction_invalid');
    throw e;
  }

  const appAccountToken = typeof tx.appAccountToken === 'string' ? tx.appAccountToken : '';
  const transactionId = typeof tx.transactionId === 'string' ? tx.transactionId : '';
  const productId = typeof tx.productId === 'string' ? tx.productId : '';
  // 三者缺一这张收据就对不回任何订单。appAccountToken 缺失说明客户端购买时
  // 没带 PurchaseOption——那是客户端 bug，不能靠单号「猜」回来。
  if (!appAccountToken || !transactionId || !productId) {
    console.error('[internal account] 内购收据缺 appAccountToken / transactionId / productId');
    return fail(400, 'transaction_invalid');
  }

  const requestedNo = typeof body.outTradeNo === 'string' ? body.outTradeNo : '';
  const order = requestedNo
    ? getOrder(requestedNo)
    : findOrderByProviderRef('appstore', appAccountToken);
  // 归属校验与 `query` 同口径：不属于这个 accountId 就当它不存在。
  if (!order || order.userId !== userId) return fail(404, 'order_not_found');

  if (
    order.channel !== 'appstore' ||
    order.kind !== 'recharge' ||
    order.providerRef !== appAccountToken ||
    order.skuId !== productId
  ) {
    console.error(
      `[internal account] 内购收据与订单不符 ${order.outTradeNo}: ` +
        `channel=${order.channel} sku=${order.skuId} providerRef=${order.providerRef ? 'set' : 'null'} ` +
        `txProduct=${productId}`
    );
    return fail(400, 'transaction_invalid');
  }

  // 目录表面值必须与订单金额一致。建单时校过一次，这里再校一次是因为
  // 档位表可能在建单之后改过——那种情况下宁可人工处理，也不按新价结旧单。
  if (appstoreFaceValue(productId) !== order.amount) {
    console.error(`[internal account] 档位面值与订单金额不符 ${order.outTradeNo}: ${productId}`);
    return fail(400, 'transaction_invalid');
  }

  // 一张收据只许结一张单。已经挂在**别的**单上 → 409。
  const owner = findOrderByTransactionId('appstore', transactionId);
  if (owner && owner.outTradeNo !== order.outTradeNo) {
    console.error(
      `[internal account] 内购交易 ${transactionId} 已用于订单 ${owner.outTradeNo}，拒绝再结 ${order.outTradeNo}`
    );
    return fail(409, 'transaction_reused');
  }

  if (order.status === 'paid') {
    // 幂等：同一张收据重复确认（客户端确认成功前不 finish，所以必然会重复）
    // 直接回 paid。换了张收据来结同一张已付的单则是 409——那说明用户被扣了两次钱，
    // 要留给人工，不能静默当成功。
    if (order.transactionId && order.transactionId !== transactionId) {
      console.error(
        `[internal account] 已付单 ${order.outTradeNo} 收到另一张收据 ${transactionId}（原 ${order.transactionId}）`
      );
      return fail(409, 'transaction_reused');
    }
    return NextResponse.json(queryBody(order));
  }

  // 对账字段先落库：结算成功与否都要留下「苹果那边实际收了多少、哪个店面」。
  // 它们**不参与**结算的三重校验（币种坑见 appstore-catalog.ts 文件头）。
  updateOrder(order.outTradeNo, {
    providerMeta: JSON.stringify({
      transactionId,
      originalTransactionId: tx.originalTransactionId ?? null,
      productId,
      price: tx.price ?? null,
      currency: tx.currency ?? null,
      storefront: tx.storefront ?? null,
      environment: tx.environment ?? null,
      purchaseDate: tx.purchaseDate ?? null,
      quantity: tx.quantity ?? null,
    }),
  });

  const settlement = settlementFromTransaction(order.outTradeNo, tx, order.amount);
  let result;
  try {
    result = settleFromChannel(settlement);
  } catch (e) {
    // `idx_orders_appstore_txn` 的兜底：并发两次确认时两边的 SELECT 都说没用过，
    // 唯一索引会让后到的那次 INSERT/UPDATE 抛约束错。译成 409 与串行路径一致。
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('UNIQUE constraint failed')) {
      console.error(`[internal account] 内购交易 ${transactionId} 并发重用被唯一索引拦下`);
      return fail(409, 'transaction_reused');
    }
    throw e;
  }
  if (!result.ok) {
    console.error(
      `[internal account] 拒绝结算内购单 ${order.outTradeNo}: ${describeSettleFailure(result.reason)}`
    );
    return fail(409, 'settlement_mismatch');
  }

  const settled = getOrder(order.outTradeNo);
  return NextResponse.json(queryBody(settled ?? order));
}

async function handleConfirmGooglePlay(
  userId: string,
  body: Record<string, unknown>
): Promise<NextResponse> {
  const productId = typeof body.productId === 'string' ? body.productId.trim() : '';
  const purchaseToken = typeof body.purchaseToken === 'string' ? body.purchaseToken.trim() : '';
  const requestedNo = typeof body.outTradeNo === 'string' ? body.outTradeNo.trim() : '';
  if (!productId || !purchaseToken) {
    return fail(400, 'transaction_invalid');
  }
  const outcome = await confirmGooglePlayPurchase({
    userId,
    productId,
    purchaseToken,
    ...(requestedNo ? { outTradeNo: requestedNo } : {}),
  });
  if (!outcome.ok) {
    return fail(outcome.status, outcome.error);
  }
  return NextResponse.json(queryBody(outcome.order));
}

// ---------------------------------------------------------------------------
// action: query
// ---------------------------------------------------------------------------

async function handleQuery(userId: string, body: Record<string, unknown>): Promise<NextResponse> {
  const outTradeNo = typeof body.outTradeNo === 'string' ? body.outTradeNo : '';
  if (!outTradeNo) return fail(400, 'out_trade_no_required');

  const localOrder = getOrder(outTradeNo);
  // **归属校验**：单号不属于这个 accountId 就当它不存在。少了这一条，调用方
  // （或任何能让调用方转发一次请求的人）拿到一个单号就能查到别人的订单金额与状态。
  // 与 `/api/payment/query` 同口径：越权与不存在回同一个响应，不透露单号是否有效。
  // 带 body（`order_not_found`）：调用方要能把它与「密钥配错」的空体 404 分开。
  if (!localOrder || localOrder.userId !== userId) return fail(404, 'order_not_found');

  if (localOrder.status === 'paid') {
    return NextResponse.json(queryBody(localOrder));
  }

  if (!shouldQueryChannel(outTradeNo)) {
    return NextResponse.json(queryBody(localOrder));
  }

  // 按**订单上记录的通道**取 adapter：订单已落库，认订单比认请求稳
  const adapter = getAdapterForChannel(localOrder.channel);
  if (!adapter) {
    console.error(`[internal account] 订单 ${outTradeNo} 的通道未知: ${localOrder.channel}`);
    return NextResponse.json(queryBody(localOrder));
  }

  // 官方回查（内部已对通道响应验签，验签失败会抛错）
  beginPaymentReview(userId,outTradeNo);
  const settlement = await adapter.queryCharge(outTradeNo);
  if(settlement&&!settlement.paid)endPaymentReview(userId,outTradeNo);

  // 只在通道确认支付成功后写状态；校验与入账统一走 settleFromChannel
  if (settlement?.paid) {
    const result = settleFromChannel(settlement);
    if (!result.ok) {
      // 与 webhook / payment query 同口径：对不上一律不结算，留人工核查
      console.error(
        `[internal account] 拒绝结算 ${outTradeNo}: ${describeSettleFailure(result.reason)}`,
        { channelAmount: settlement.amountMinor, channelCurrency: settlement.currency }
      );
      return fail(409, 'settlement_mismatch');
    }
    const settled = getOrder(outTradeNo);
    if (settled) return NextResponse.json(queryBody(settled));
  }

  return NextResponse.json(queryBody(localOrder));
}

// ---------------------------------------------------------------------------
// action: delete-account
// ---------------------------------------------------------------------------

/**
 * 注销传导（dev-board#434）。
 *
 * 手机端一旦能在官网建号（`resolve` 的 `create=true`），就落进 App Store
 * 5.1.1(v)「App 内能建账号就必须能在 App 内删账号」与个人信息保护法的删除权：
 * 云后端删自己那侧的账户时**必须**把这条动作传导到官网，否则官网会留下一个
 * 用户在 App 内永远够不着的孤儿账户。
 *
 * 复用 `lib/account-deletion.ts` 的 `deleteAccount`，与网页自助注销
 * （`/api/auth/delete`）**同一套闸门、同一套墓碑口径**——注销这件事只许有一份
 * 实现，两处各写一遍必然漂出「网页删得干净、手机端删不干净」。
 *
 * 四种返回（云后端按这四种分支决定本地删不删，见规格 §4）：
 * - 200 `{ deleted: true, ... }`   已删，云后端继续删本地
 * - 200 `{ deleted: false, blocker, message }`  有闸门（余额可退 / 收益未结 / 分配对账中），
 *   官网**一个字节都没写**，云后端把 message 原样给用户看，本地也不许删
 * - 502 `{ error: 'key_disable_failed' }`  远端 AI 通道没作废成功，同样什么都没删，可重试
 * - 404 `{ error: 'account_not_found' }`（由 POST 里的统一分支给）查无账户或已是墓碑，
 *   云后端视为「官网这侧已经没有东西要删」，继续删本地
 *
 * 注意 404 这条**不在本函数里**：POST 的公共段已经把「账户不存在 / 是墓碑」
 * 拦在前面了，所以重复调用（云后端重试）第二次自然落到 404，是幂等的。
 */
async function handleDeleteAccount(userId: string): Promise<NextResponse> {
  const result = await deleteAccount(userId);

  if ('blocked' in result) {
    // **200 而不是 409**：这不是调用方的错，是这个账户当前的状态；
    // 云后端要把 message 转给用户，而不是当成一次失败的请求去重试。
    return NextResponse.json({ deleted: false, blocker: result.blocked, message: result.message });
  }
  if ('keyDisableFailed' in result) {
    // 上游（OpenRouter 管理面）不可用。502 让云后端归到「稍后再试」，
    // 本地也不许删——此时官网一分钱、一行数据都没动。
    return fail(502, 'key_disable_failed', { message: result.message });
  }

  return NextResponse.json({ deleted: true, deletedAt: result.deletedAt, notes: result.notes });
}

// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const secret = process.env.AWD_MOBILE_BILLING_SECRET;
  if (!secret) return authGate404();

  const provided = request.headers.get('x-internal-secret');
  if (!provided || !timingSafeEqualStr(provided, secret)) return authGate404();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail(400, 'bad_request');
  }

  const action = body.action;

  try {
    // resolve 与 wx-phone 是仅有的两个不带 accountId 的 action：前者用来换
    // accountId，后者压根不碰官网账户（只把微信 code 换成手机号）。两条都必须
    // 排在下面那道「按 accountId 查用户」之前。
    if (action === 'resolve') return handleResolve(body);
    if (action === 'wx-phone') return await handleWxPhone(body);
    // Shadow report about cloud users that have no account mapping; carries cloud ids only.
    if (action === 'shadow-unmapped') return NextResponse.json(recordShadowUnmapped(body as unknown as {observedAt:string;users:number;bytes:string;sample?:unknown}));
    if (action === 'appstore-subscription-capability') {
      const account = typeof body.accountId === 'string' ? findUserById(body.accountId) : undefined;
      if (account && !isDeletedUser(account) && siteConfig.currency === 'CNY' && sandboxAllowed(account.id) && appstoreAdapter.isConfigured()) {
        return NextResponse.json({ available: true, productId: 'pro.monthly.cny.149', environment: 'Sandbox' });
      }
      return NextResponse.json(appstoreSubscriptionCapability());
    }

    const accountId = typeof body.accountId === 'string' ? body.accountId : '';
    const user = accountId ? findUserById(accountId) : undefined;
    // 墓碑行（已注销）一律当不存在：`findUserById` 刻意会返回它们（广场要渲染
    // 「已注销用户」），但给一个已注销账户建收款单是明确的错误。
    // 带 body：绑定指向的官网账户被注销后，调用方要能凭 `account_not_found`
    // 清掉那行失效绑定去自愈，而不是把它当成「上游挂了」。
    if (!user || isDeletedUser(user)) return fail(404, 'account_not_found');

    // 绑定了包晴天的律师：读余额/云状态前刷新积分快照（展示用；充值、订阅照常）。
    if (action === 'balance' || action === 'cloud-state') await refreshBqtSnapshot(user.id);

    if (action === 'egress-quote') return NextResponse.json(egressQuote(String(body.bytes??''),user.id,typeof body.resourceHash==='string'?body.resourceHash:undefined,typeof body.exportCaseId==='string'?body.exportCaseId:undefined));
    if (action === 'egress-reserve') return NextResponse.json(reserveEgress(user.id,body as unknown as EgressRequest));
    if (action === 'egress-settle') return NextResponse.json(settleEgress(user.id,String(body.eventId??''),String(body.deliveredBytes??''),body.completed as boolean));
    if (action === 'cloud-state') return NextResponse.json({ ...cloudState(user.id), ...accountBillingFields(user.id) });
    if (action === 'postpaid-accept') return NextResponse.json(acceptPostpaid(user.id,String(body.policyVersion??'')));
    if (action === 'resume-cloud') return NextResponse.json(resumeCloud(user.id,String(body.policyVersion??'')));
    if (action === 'storage-baseline') return NextResponse.json(storageBaseline(user.id,Number(body.epoch),String(body.observedAt??'')));
    if (action === 'storage-usage') return NextResponse.json(recordStorage(user.id,body as unknown as StorageEvent));
    if (action === 'shadow-storage') return NextResponse.json(recordShadowStorage(user.id,body as unknown as ShadowStorageInput));
    if (action === 'shadow-egress') return NextResponse.json(recordShadowEgress(user.id,body as unknown as ShadowEgressInput));
    if (action === 'notification-ack') {
      if(body.channel!=='in_app')return fail(400,'invalid_notification_channel');
      return NextResponse.json(acknowledgeNotification(user.id,String(body.caseId??''),String(body.receiptId??'')));
    }
    if (action === 'cleanup-claim') return NextResponse.json(claimCleanup(user.id,String(body.caseId??''),Number(body.epoch),String(body.itemId??''),undefined,{manifestHash:String(body.manifestHash??''),itemCount:Number(body.itemCount),itemHash:String(body.itemHash??'')},body.receiptOnly===true));
    if (action === 'cleanup-reconciled') return NextResponse.json(acknowledgeCleanupReconciled(user.id,String(body.caseId??''),Number(body.epoch),String(body.manifestHash??'')));
    if (action === 'cleanup-reconcile') return NextResponse.json(reconcileCleanup(user.id,String(body.claimId??''),String(body.outcome??''),String(body.evidenceHash??'')));
    if (action === 'cleanup-complete') {
      if(typeof body.success!=='boolean')return fail(400,'invalid_cleanup_result');
      return NextResponse.json(completeCleanup(user.id,String(body.claimId??''),body.success));
    }
    if (action === 'cleanup-finish') return NextResponse.json(finishCleanup(user.id,String(body.caseId??''),Number(body.epoch),String(body.manifestHash??''),Number(body.itemCount)));
    if (action === 'balance') {
      return NextResponse.json({
        ...cloudState(user.id),
        subscription: accountSubscriptionView(user.id),
        // 币种由部署站点决定，不由请求决定
        currency: siteConfig.currency,
        plan: getPlan(user.id),
        // 余额 = 未过期批次 remainingCents 之和（lib/credits.ts），不是账本最后一行；包晴天积分另见 bqtMember
        balanceCents: getBalance(user.id),
        ...accountBillingFields(user.id),
      });
    }

    if (action === 'prepare-appstore-subscription') {
      if (siteConfig.currency !== 'CNY' || !appstoreAdapter.isConfigured()) return fail(409, 'not_available');
      // 审核白名单账号在正式包上也可能真买：同一 token 两本账都认，由验签后的交易环境决定记哪本。
      return NextResponse.json(sandboxAllowed(user.id)
        ? prepareSandboxSubscription(user.id, appstoreAccountToken(user.id)) : prepareAppstoreSubscription(user.id));
    }
    if (action === 'confirm-appstore-subscription') {
      const signed = body.signedTransaction;
      if (typeof signed !== 'string' || !signed || signed.length > MAX_SIGNED_TRANSACTION_LEN) return fail(400, 'bad_request');
      const tx = await verifySubscriptionTransaction(signed, sandboxAllowed(user.id));
      if (tx.environment === 'Sandbox' && (sandboxAllowed(user.id) || sandboxMappedUserId(tx))) applySandboxSubscription(tx, user.id);
      else applyAppstoreSubscription(tx, user.id);
      return NextResponse.json({ status: 'CONFIRMED', subscription: accountSubscriptionView(user.id) });
    }

    if (action === 'create-recharge') return await handleCreateRecharge(user.id, body);

    if (action === 'confirm-appstore') {
      beginPaymentReview(user.id,'appstore-confirm');
      const result=await handleConfirmAppstore(user.id,body);
      if(result.status<400||result.status===400)endPaymentReview(user.id,'appstore-confirm');
      return result;
    }

    if (action === 'confirm-googleplay') {
      beginPaymentReview(user.id, 'googleplay-confirm');
      const result = await handleConfirmGooglePlay(user.id, body);
      if (result.status !== 409) endPaymentReview(user.id, 'googleplay-confirm');
      return result;
    }

    if (action === 'query') return await handleQuery(user.id, body);

    if (action === 'delete-account') return await handleDeleteAccount(user.id);

    return fail(400, 'unknown_action');
  } catch (error) {
    if (error instanceof SubscriptionRejected || error instanceof SandboxSubscriptionRejected) return fail(409, error.code);
    if (error instanceof AppstoreVerificationError) return fail(400, 'invalid_transaction');
    if (typeof action === 'string' && ['egress-quote','egress-reserve','egress-settle','cloud-state','postpaid-accept','resume-cloud','storage-baseline','storage-usage','notification-ack','cleanup-claim','cleanup-complete','cleanup-finish','cleanup-reconcile','cleanup-reconciled','shadow-storage','shadow-egress','shadow-unmapped'].includes(action) && error instanceof Error) return fail(409,error.message);
    console.error('[internal account] 处理失败:', error);
    return fail(500, 'internal_error');
  }
}
