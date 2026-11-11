import { findUserById, isDeletedUser } from '@/lib/users';
import { Environment } from '@apple/app-store-server-library';
import { SandboxSubscriptionRejected, sandboxMappedUserId, applySandboxSubscription } from '@/lib/appstore-sandbox-subscription';
import { APPSTORE_PRO_MONTHLY, applyAppstoreSubscription, SubscriptionRejected } from '@/lib/appstore-subscription';
import { appstoreEnv, verifyTransaction, verifySubscriptionRenewal } from '@/lib/payments/appstore-adapter';
import { NextRequest, NextResponse } from 'next/server';
import {
  AppstoreVerificationError,
  verifyNotification,
  verifyTransactionInEnvironment,
} from '@/lib/payments';
import { findOrderByTransactionId } from '@/lib/orders';
import { clawbackOrderCredits } from '@/lib/wallet';
import type { JWSTransactionDecodedPayload } from '@apple/app-store-server-library';

/**
 * App Store Server Notifications V2. Consumable refunds retain the original environment-aware
 * clawback path. Pro monthly transactions additionally synchronize signed calendar periods,
 * renewal status and revocations, strictly in the configured subscription environment.
 * No notification mints wallet credit. Unknown consumable notification types are logged;
 * subscription updates remain transaction-idempotent and reject cross-account reassignment.
 * Signature failures return non-2xx so Apple can retry; paid renewals are processed even when
 * the new-purchase switch is off. CONSUMPTION_REQUEST does not send user data without consent.
 */

export const dynamic = 'force-dynamic';

/** JWS 长度上限，与内部口的 `confirm-appstore` 同口径。 */
const MAX_SIGNED_PAYLOAD_LEN = 64 * 1024;

/** 退款类通知：这两种都意味着「这笔钱苹果已经退了」。 */
const REFUND_TYPES = new Set(['REFUND', 'REVOKE']);

export async function POST(request: NextRequest) {
  let body: { signedPayload?: unknown };
  try {
    body = (await request.json()) as { signedPayload?: unknown };
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const signedPayload = typeof body.signedPayload === 'string' ? body.signedPayload : '';
  if (!signedPayload || signedPayload.length > MAX_SIGNED_PAYLOAD_LEN) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  let payload;
  try {
    payload = await verifyNotification(signedPayload);
  } catch (e) {
    console.error(
      '[appstore notify] signedPayload 验签失败:',
      e instanceof Error ? e.message : e
    );
    if (e instanceof AppstoreVerificationError) {
      return new NextResponse(null, { status: 401 });
    }
    throw e;
  }

  const type = String(payload.notificationType ?? '');
  const uuid = String(payload.notificationUUID ?? '');
  const environment = String(payload.data?.environment ?? '');

  // Review subscriptions use a separate ledger and cannot mint production funding.
  if (payload.data?.signedTransactionInfo && environment === 'Sandbox') {
    try {
      const tx = await verifyTransactionInEnvironment(payload.data.signedTransactionInfo, environment);
      if (tx.productId === APPSTORE_PRO_MONTHLY && (appstoreEnv() === 'Production' || sandboxMappedUserId(tx))) {
        if (REFUND_TYPES.has(type) && !tx.revocationDate) return NextResponse.json({ error: 'missing_revocation' }, { status: 400 });
        const renewal = payload.data.signedRenewalInfo
          ? await verifySubscriptionRenewal(payload.data.signedRenewalInfo, Environment.SANDBOX) : undefined;
        const sandboxUserId = sandboxMappedUserId(tx);
        const sandboxUser = sandboxUserId ? findUserById(sandboxUserId) : undefined;
        if (!sandboxUser || isDeletedUser(sandboxUser)) throw new SandboxSubscriptionRejected('account_not_found');
        applySandboxSubscription(tx, sandboxUser.id, renewal, type === 'REFUND_REVERSED');
        return NextResponse.json({ ok: true, sandbox: true });
      }
    } catch (error) {
      if (error instanceof SubscriptionRejected || error instanceof SandboxSubscriptionRejected) return NextResponse.json({ error: error.code }, { status: 409 });
      if (error instanceof AppstoreVerificationError) return new NextResponse(null, { status: 401 });
      throw error;
    }
  }

  // Auto-renewal uses the configured environment only: sandbox must never grant production access.
  if (payload.data?.signedTransactionInfo && environment === appstoreEnv()) {
    try {
      const tx = await verifyTransaction(payload.data.signedTransactionInfo);
      if (tx.productId === APPSTORE_PRO_MONTHLY) {
        if (REFUND_TYPES.has(type) && !tx.revocationDate) return NextResponse.json({ error: 'missing_revocation' }, { status: 400 });
        const renewal = payload.data.signedRenewalInfo
          ? await verifySubscriptionRenewal(payload.data.signedRenewalInfo) : undefined;
        applyAppstoreSubscription(tx, undefined, renewal, type === 'REFUND_REVERSED');
        return NextResponse.json({ ok: true });
      }
    } catch (error) {
      if (error instanceof SubscriptionRejected || error instanceof SandboxSubscriptionRejected) return NextResponse.json({ error: error.code }, { status: 409 });
      if (error instanceof AppstoreVerificationError) return new NextResponse(null, { status: 401 });
      throw error;
    }
  }

  if (!REFUND_TYPES.has(type)) {
    // 收妥即可，但一定要留日志：将来接哪一条（CONSUMPTION_REQUEST 尤其），
    // 先从这里看它到底来没来、来的是什么形状。
    console.log(`[appstore notify] 未处理的通知类型 ${type || '(空)'} uuid=${uuid} env=${environment}`);
    return NextResponse.json({ ok: true });
  }

  // 退款通知里的交易在 data.signedTransactionInfo 里，还要再验一次签
  // （外层 payload 的签名只证明「这条通知是苹果发的」，不证明里面那张收据没被换过）。
  const signedTransactionInfo = payload.data?.signedTransactionInfo;
  if (typeof signedTransactionInfo !== 'string' || !signedTransactionInfo) {
    console.error(`[appstore notify] ${type} 缺 signedTransactionInfo uuid=${uuid}`);
    return NextResponse.json({ error: 'missing_transaction' }, { status: 400 });
  }

  let tx: JWSTransactionDecodedPayload;
  try {
    // 复用同一条链校验；内层交易的 environment 与外层一致，用同一个 verifier 取法。
    tx = await verifyTransactionInEnvironment(signedTransactionInfo, environment);
  } catch (e) {
    console.error(
      `[appstore notify] ${type} 内层交易验签失败 uuid=${uuid}:`,
      e instanceof Error ? e.message : e
    );
    return new NextResponse(null, { status: 401 });
  }

  const transactionId = typeof tx.transactionId === 'string' ? tx.transactionId : '';
  if (!transactionId) {
    console.error(`[appstore notify] ${type} 内层交易缺 transactionId uuid=${uuid}`);
    return NextResponse.json({ error: 'missing_transaction' }, { status: 400 });
  }

  const order = findOrderByTransactionId('appstore', transactionId);
  if (!order) {
    // 查无此单：可能是还没确认到账就被退了（客户端没来得及调 confirm），
    // 也可能是另一个部署的交易。**回 200**：让苹果重推 5 次也不会有单出来，
    // 而日志里这一行才是运维要看的东西。
    console.error(
      `[appstore notify] ${type} 的交易 ${transactionId} 在本站查不到订单 uuid=${uuid} env=${environment}`
    );
    return NextResponse.json({ ok: true, matched: false });
  }

  const refundedAt = tx.revocationDate
    ? new Date(tx.revocationDate).toISOString()
    : new Date().toISOString();

  const result = clawbackOrderCredits(order.outTradeNo, { refundedAt, reason: type });
  if (!result) {
    console.error(`[appstore notify] 追回失败：订单 ${order.outTradeNo} 不存在`);
    return NextResponse.json({ ok: true, matched: false });
  }
  if (result.alreadyRefunded) {
    console.log(`[appstore notify] ${type} 重复到达，订单 ${order.outTradeNo} 已记过退款`);
    return NextResponse.json({ ok: true, matched: true, alreadyRefunded: true });
  }

  const clawback = result.clawback;
  if (clawback && clawback.shortfallCents > 0) {
    // **欠账本轮未实现**（wallet 不支持负余额）。用户已经把这部分 Credits 花掉了，
    // 苹果那边的钱也退了——这笔差额只能人工处理。日志用 error 级别，
    // 它是需要有人去看的，不是一条流水。
    console.error(
      `[appstore notify] 退款追回不足：订单 ${order.outTradeNo} 应追 ${order.amount} 分，` +
        `实追 ${clawback.clawedBackCents} 分，欠 ${clawback.shortfallCents} 分（无欠账能力，需人工处理）`
    );
  } else {
    console.log(
      `[appstore notify] ${type} 已追回订单 ${order.outTradeNo} 的 ${clawback?.clawedBackCents ?? 0} 分`
    );
  }

  return NextResponse.json({
    ok: true,
    matched: true,
    clawedBackCents: clawback?.clawedBackCents ?? 0,
    shortfallCents: clawback?.shortfallCents ?? 0,
  });
}
