import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  Environment,
  SignedDataVerifier,
  VerificationException,
  VerificationStatus,
  type JWSTransactionDecodedPayload,
  type JWSRenewalInfoDecodedPayload,
  type ResponseBodyV2DecodedPayload,
} from '@apple/app-store-server-library';
import { siteConfig } from '../site-config';
import { APPSTORE_CURRENCY } from './appstore-catalog';
import {
  ChannelSettlement,
  CreateChargeInput,
  CreateChargeResult,
  PaymentChannelAdapter,
  WebhookVerificationError,
} from './types';

/**
 * Apple App Store 内购（StoreKit 2）适配器（dev-board#426，设计
 * `2026-09-04-mobile-recharge-design.md` §4.2）。
 *
 * 与其它三条通道最大的不同：**这条通道不由服务端发起收款，也无从回查**。
 * 钱是 iOS 端在 StoreKit 里付给苹果的，服务端能做的只有两件事：
 * 建单时发一个 UUID（`appAccountToken`）让购买能对回订单，以及事后验签一张
 * 苹果签发的 JWS 收据。
 *
 * ## 订单挂钩只能靠 appAccountToken
 *
 * StoreKit 2 里只有 `Product.PurchaseOption.appAccountToken(_:)`（必须是 UUID）
 * 能原样回传到 `JWSTransactionDecodedPayload.appAccountToken`。建单时把它落进
 * 已有的 `orders.providerRef`（`idx_orders_provider` 索引已存在），确认时既可以
 * 按 outTradeNo 找单、也可以在客户端丢了单号时用 appAccountToken 反查。
 *
 * ## queryCharge 只能返回 null
 *
 * App Store Server API 的所有查询端点都要 transactionId / originalTransactionId，
 * 而建单时还没有交易；**没有任何端点支持用 appAccountToken 反查**。契约本来就
 * 允许「本通道无从回查返回 null」（`stripe-adapter` 已有先例）。到账确认只有
 * 两条路：客户端回传 JWS（`confirm-appstore`）与 Server Notifications V2。
 *
 * ## 苹果根证书为什么要进仓
 *
 * `@apple/app-store-server-library` 的 `SignedDataVerifier` 做的是「x5c 三级链
 * 校验 + Apple 私有扩展 OID 检查 + bundleId/environment 比对」，但它**不内置
 * 根证书**，构造时必须传 DER。所以三张根证书随代码走（`lib/payments/apple-roots/`，
 * 下载地址与 sha256 见该目录同名说明与 PR 正文）。苹果轮换根证书时要人工同步——
 * 这是这条通道唯一的人工维护项。
 *
 * ## 沙盒与生产
 *
 * `APPSTORE_ENV` 是**部署级常量**（与 `WXVP_ENV` 同口径）：
 * - `verifyTransaction()` 只认这个环境的交易。生产部署收到沙盒交易一律拒——
 *   否则任何人都能用 Xcode 里的沙盒购买免费换 Credits。
 * - 月订阅审核另走 verifySubscriptionTransaction：仅明确允许的审核账号、且首次
 *   验签失败原因为环境不匹配时重验 Sandbox。通过后由独立测试账本处理，不能发真实额度。
 * - `verifyNotification()` 则按 **payload 自称的 environment 分流**：ASC 上沙盒与
 *   生产各填一个通知 URL，但两个 URL 可以指向同一条路由，且沙盒退款通知在联调期
 *   必须能收。退款通知只会**追回** Credits，不会发币，按 payload 分流不构成套利面。
 */

// ---------------------------------------------------------------------------
// env
// ---------------------------------------------------------------------------

/** com.aiworkdeck.mobile.cn（大陆版）。验签时逐字比对 JWS 里的 bundleId。 */
export function appstoreBundleId(): string {
  return process.env.APPSTORE_BUNDLE_ID || '';
}

/** ASC 上的 App 数字 id（大陆版 6803309103）。生产环境的验签必须有它。 */
export function appstoreAppAppleId(): number | undefined {
  const raw = process.env.APPSTORE_APP_APPLE_ID;
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/** 部署级环境。缺省 production——默认值站在「不接受沙盒交易」那边。 */
export function appstoreEnv(): Environment.SANDBOX | Environment.PRODUCTION {
  return process.env.APPSTORE_ENV === 'sandbox' ? Environment.SANDBOX : Environment.PRODUCTION;
}

// ---------------------------------------------------------------------------
// 根证书与验签器
// ---------------------------------------------------------------------------

/**
 * 三张苹果根证书（DER）。文件名写死而不是扫目录：少一张时要当场炸，
 * 不能悄悄用两张根去验一条本该验不过的链。
 */
const ROOT_CERT_FILES = [
  'AppleRootCA-G3.cer',
  'AppleRootCA-G2.cer',
  'AppleIncRootCertificate.cer',
] as const;

let rootCache: Buffer[] | undefined;
/** 见下面的 `setAppleRootCertificates`：只有验证脚本会设它。 */
let rootOverride: Buffer[] | undefined;

function appleRootCertificates(): Buffer[] {
  if (rootOverride) return rootOverride;
  if (rootCache) return rootCache;
  const dir = path.join(process.cwd(), 'lib', 'payments', 'apple-roots');
  rootCache = ROOT_CERT_FILES.map((name) => fs.readFileSync(path.join(dir, name)));
  return rootCache;
}

/**
 * 用一组自备的根证书替掉仓库里那三张，并清空验签器缓存。
 *
 * **只给 `scripts/verify-appstore.mts` 用，生产代码里没有任何调用点**：
 * 验证脚本在一个隔离的空目录里跑（读不到 `process.cwd()/lib/payments/apple-roots`），
 * 而且它要用一条自签测试链把「验签通过」那条路真跑一遍——苹果不会给我们
 * 一张能重放的生产收据。
 *
 * 传 `undefined` 恢复成读仓库里那三张。
 */
export function setAppleRootCertificates(certs: Buffer[] | undefined): void {
  rootOverride = certs;
  rootCache = undefined;
  verifierCache.clear();
}

/**
 * 每个环境一个验签器（内部有公钥缓存，别每次新建）。
 *
 * `enableOnlineChecks=false`：开着它每验一次签就要出站打一次苹果的 OCSP
 * （30s 超时）。用户此刻**已经把钱付给苹果了**，把到账变成「依赖一次出站请求
 * 成功」是拿可用性换一个极窄的风险面（苹果签名证书被吊销）。关掉后证书有效期
 * 按 JWS 里的 `signedDate` 判——那是链校验过的字段，不是请求里的变量。
 */
const verifierCache = new Map<string, SignedDataVerifier>();

function verifierFor(environment: Environment): SignedDataVerifier {
  const bundleId = appstoreBundleId();
  const appAppleId = appstoreAppAppleId();
  const key = `${environment}|${bundleId}|${appAppleId ?? ''}`;
  const cached = verifierCache.get(key);
  if (cached) return cached;
  const verifier = new SignedDataVerifier(
    appleRootCertificates(),
    false,
    environment,
    bundleId,
    appAppleId
  );
  verifierCache.set(key, verifier);
  return verifier;
}

/** 验签失败（与 webhook 验签失败同义：确定性拒绝，重试没用）。 */
export class AppstoreVerificationError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'AppstoreVerificationError';
  }
}

function describeVerificationError(e: unknown): string {
  if (e instanceof VerificationException) return `VerificationException status=${e.status}`;
  return e instanceof Error ? e.message : String(e);
}

/**
 * 验一张 StoreKit 2 的 `Transaction.jwsRepresentation`。
 *
 * 一步完成：x5c 三级链校验（根锚在上面三张 DER）、Apple 私有扩展 OID 检查、
 * ES256 签名校验、`bundleId` 与 `environment` 比对。任何一条不过都抛
 * {@link AppstoreVerificationError}——**绝不返回 null 让调用方误以为「只是没解析出来」**。
 */
export async function verifyTransaction(
  signedTransaction: string
): Promise<JWSTransactionDecodedPayload> {
  if (!signedTransaction || typeof signedTransaction !== 'string') {
    throw new AppstoreVerificationError('signedTransaction 为空');
  }
  try {
    return await verifierFor(appstoreEnv()).verifyAndDecodeTransaction(signedTransaction);
  } catch (e) {
    throw new AppstoreVerificationError(
      `signedTransaction 验签失败: ${describeVerificationError(e)}`,
      e
    );
  }
}

/** Review accounts may retry only Apple's explicit environment mismatch, never signature failures. */
export async function verifySubscriptionTransaction(signed: string, allowSandbox: boolean) {
  try { return await verifyTransaction(signed); }
  catch (error) {
    if (!allowSandbox || appstoreEnv() !== Environment.PRODUCTION || !(error instanceof AppstoreVerificationError)
      || !(error.cause instanceof VerificationException) || error.cause.status !== VerificationStatus.INVALID_ENVIRONMENT) throw error;
    return verifyTransactionInEnvironment(signed, Environment.SANDBOX);
  }
}

/**
 * 按指定环境验一张交易 JWS。
 *
 * 只给退款通知用：`verifyAndDecodeNotification` 已经确认「这条通知是苹果发的、
 * 属于我们这个 bundleId」，内层 `signedTransactionInfo` 要按**同一条通知自称的
 * 环境**去验（外层说是 Sandbox、内层交易就一定是 Sandbox 的）。
 *
 * 到账那条路**不许**用它——面向用户的入账一律走 `verifyTransaction()`，
 * 环境由部署级的 `APPSTORE_ENV` 钉死。
 */
export async function verifyTransactionInEnvironment(
  signedTransaction: string,
  environment: string
): Promise<JWSTransactionDecodedPayload> {
  const env = environment === Environment.SANDBOX ? Environment.SANDBOX : Environment.PRODUCTION;
  try {
    return await verifierFor(env).verifyAndDecodeTransaction(signedTransaction);
  } catch (e) {
    throw new AppstoreVerificationError(
      `signedTransactionInfo 验签失败: ${describeVerificationError(e)}`,
      e
    );
  }
}

/** Renewal metadata is independently signed; use only the configured settlement environment. */
export async function verifySubscriptionRenewal(signedRenewal: string, environment: Environment = appstoreEnv()): Promise<JWSRenewalInfoDecodedPayload> {
  try {
    return await verifierFor(environment).verifyAndDecodeRenewalInfo(signedRenewal);
  } catch (e) {
    throw new AppstoreVerificationError('renewal_verification_failed', e);
  }
}

/**
 * 从**未验签**的 notification payload 里读出它自称的 environment，用来挑验签器。
 *
 * 这一步读的是不可信数据，所以它只决定「用哪个环境的验签器」，不决定任何入账：
 * 挑错了验签当场失败，挑对了后续仍然要过完整的链校验 + bundleId/appAppleId 比对。
 */
function claimedEnvironment(signedPayload: string): Environment {
  try {
    const seg = signedPayload.split('.')[1];
    const json = JSON.parse(Buffer.from(seg, 'base64url').toString('utf8')) as {
      data?: { environment?: string };
      summary?: { environment?: string };
      appData?: { environment?: string };
    };
    const env = json.data?.environment ?? json.summary?.environment ?? json.appData?.environment;
    return env === Environment.SANDBOX ? Environment.SANDBOX : Environment.PRODUCTION;
  } catch {
    return appstoreEnv();
  }
}

/**
 * 验一条 App Store Server Notifications V2 的 `signedPayload`。
 *
 * 环境按 payload 自称的值分流（见文件头「沙盒与生产」）；bundleId / appAppleId
 * 的比对仍由库按我们配的 env 值做，伪造不出来。
 */
export async function verifyNotification(
  signedPayload: string
): Promise<ResponseBodyV2DecodedPayload> {
  if (!signedPayload || typeof signedPayload !== 'string') {
    throw new AppstoreVerificationError('signedPayload 为空');
  }
  try {
    return await verifierFor(claimedEnvironment(signedPayload)).verifyAndDecodeNotification(
      signedPayload
    );
  } catch (e) {
    throw new AppstoreVerificationError(
      `signedPayload 验签失败: ${describeVerificationError(e)}`,
      e
    );
  }
}

/**
 * 把验过签的交易折成 `ChannelSettlement`。
 *
 * **面值取自订单，不取自苹果**（见 appstore-catalog.ts 文件头的币种坑）：
 * 这里只带 channel / outTradeNo / paid / transactionId，金额与币种由调用方
 * 按目录表填。苹果实收的 price / currency / storefront 另行写进 order 作对账。
 */
export function settlementFromTransaction(
  outTradeNo: string,
  tx: JWSTransactionDecodedPayload,
  amountMinor: number
): ChannelSettlement {
  return {
    channel: 'appstore',
    outTradeNo,
    paid: true,
    amountMinor,
    currency: APPSTORE_CURRENCY,
    transactionId: tx.transactionId,
    payerRef: tx.originalTransactionId,
  };
}

// ---------------------------------------------------------------------------
// adapter
// ---------------------------------------------------------------------------

export const appstoreAdapter: PaymentChannelAdapter = {
  id: 'appstore',
  currency: APPSTORE_CURRENCY,

  isConfigured() {
    // 站点币种闸：目录表目前只有大陆版三档（CNY 面值）。站点币种不是 CNY 说明
    // 这个部署没有与之匹配的档位表——真在国际站配上 `APPSTORE_*`，就会按
    // `credits.cny.50 = 5000` 发 5000 **美分**的 Credits。国际版 `credits.usd.*`
    // 要开时，先把 `appstore-catalog.ts` 做成按站点取，再放开这里。
    if (siteConfig.currency !== APPSTORE_CURRENCY) return false;
    // 其余按调用读，不在模块加载时快照（与其它三条通道同口径）。
    // appAppleId 也算必需：生产环境的 SignedDataVerifier 没有它构造都构造不出来。
    return Boolean(appstoreBundleId() && appstoreAppAppleId());
  },

  async createCharge(input: CreateChargeInput): Promise<CreateChargeResult> {
    // 这条本该被路由层挡在门外（`product_mismatch`），落到这里说明有新的调用点
    // 漏了校验——直接抛，不要建一张没有档位的内购单。
    if (!input.productId) throw new Error('appstore 建单缺 productId');
    return {
      channel: 'appstore',
      present: 'native',
      // UUID 而不是 outTradeNo：StoreKit 的 appAccountToken 类型就是 UUID，
      // 传别的形状 StoreKit 会直接拒绝购买。
      appAccountToken: crypto.randomUUID(),
    };
  },

  async parseWebhook(): Promise<ChannelSettlement | null> {
    // Server Notifications V2 不是「收到钱了」的通知（消耗型内购的到账事实由
    // 客户端回传的 JWS 确认），它管的是退款/撤销这类事后事件，由
    // `app/api/appstore/notifications` 单独处理。这条路上不该有人来调它。
    throw new WebhookVerificationError(
      'appstore 不走 parseWebhook：到账走 confirm-appstore，退款走 /api/appstore/notifications'
    );
  },

  async queryCharge(): Promise<ChannelSettlement | null> {
    // 见文件头：苹果没有任何端点能用 appAccountToken 反查交易。
    return null;
  },
};
