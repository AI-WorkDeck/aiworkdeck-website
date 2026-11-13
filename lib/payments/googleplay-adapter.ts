// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import crypto from 'crypto';
import fs from 'fs';
import {
  findOrderByProviderRef,
  findOrderByTransactionId,
  getOrder,
  updateOrder,
  type Order,
} from '../orders';
import { siteConfig } from '../site-config';
import { googleplayFaceValue } from './googleplay-catalog';
import { describeSettleFailure, settleFromChannel } from './settle';
import {
  CurrencyCode,
  PaymentChannelAdapter,
  WebhookVerificationError,
} from './types';

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export interface GooglePlayProductPurchase {
  orderId?: string;
  purchaseState?: number; // 0: Purchased, 1: Canceled, 2: Pending
  consumptionState?: number; // 0: Yet to be consumed, 1: Consumed
  acknowledgementState?: number;
  obfuscatedExternalAccountId?: string;
  obfuscatedExternalProfileId?: string;
  purchaseTimeMillis?: string;
  regionCode?: string;
}

export interface GooglePlayVoidedPurchase {
  purchaseToken?: string;
  orderId?: string;
  purchaseTimeMillis?: string;
  voidedTimeMillis?: string;
  voidedSource?: number;
  voidedReason?: number;
}

export type GooglePlayVerificationCode =
  | 'not_configured'
  | 'invalid_purchase'
  | 'not_purchased'
  | 'upstream_error';

export class GooglePlayVerificationError extends Error {
  readonly code: GooglePlayVerificationCode;
  constructor(code: GooglePlayVerificationCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'GooglePlayVerificationError';
  }
}

type FetchLike = typeof fetch;

let fetchOverride: FetchLike | null = null;
let cachedKeyRaw: string | null = null;
let cachedKey: ServiceAccountKey | null = null;
let cachedAccessToken: { token: string; expiresAtMs: number; clientEmail: string } | null = null;

export function setGooglePlayFetchForTests(fn: FetchLike | null): void {
  fetchOverride = fn;
}

export function resetGooglePlayCacheForTests(): void {
  cachedKeyRaw = null;
  cachedKey = null;
  cachedAccessToken = null;
}

function activeFetch(): FetchLike {
  return fetchOverride ?? fetch;
}

export function googleplayPackageName(): string {
  return (process.env.GOOGLEPLAY_PACKAGE_NAME || '').trim();
}

function loadServiceAccountKey(): ServiceAccountKey | null {
  const rawSpec = (process.env.GOOGLEPLAY_SERVICE_ACCOUNT_JSON || '').trim();
  if (!rawSpec) return null;
  if (rawSpec === cachedKeyRaw && cachedKey) return cachedKey;

  try {
    const jsonText = rawSpec.startsWith('{') ? rawSpec : fs.readFileSync(rawSpec, 'utf-8');
    const parsed = JSON.parse(jsonText) as Partial<ServiceAccountKey>;
    if (
      typeof parsed.client_email !== 'string' ||
      !parsed.client_email ||
      typeof parsed.private_key !== 'string' ||
      !parsed.private_key
    ) {
      return null;
    }
    cachedKeyRaw = rawSpec;
    cachedKey = {
      client_email: parsed.client_email,
      private_key: parsed.private_key,
      token_uri:
        typeof parsed.token_uri === 'string' && parsed.token_uri
          ? parsed.token_uri
          : 'https://oauth2.googleapis.com/token',
    };
    return cachedKey;
  } catch {
    return null;
  }
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function getAccessToken(): Promise<string> {
  const key = loadServiceAccountKey();
  if (!key) {
    throw new GooglePlayVerificationError('not_configured', 'Google Play service account not configured');
  }

  const now = Date.now();
  if (
    cachedAccessToken &&
    cachedAccessToken.clientEmail === key.client_email &&
    cachedAccessToken.expiresAtMs - 60_000 > now
  ) {
    return cachedAccessToken.token;
  }

  const iat = Math.floor(now / 1000);
  const exp = iat + 3600;
  const tokenUri = key.token_uri || 'https://oauth2.googleapis.com/token';
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(
    JSON.stringify({
      iss: key.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: tokenUri,
      iat,
      exp,
    })
  );
  const signingInput = `${header}.${claim}`;
  const sig = base64url(crypto.createSign('RSA-SHA256').update(signingInput).sign(key.private_key));
  const assertion = `${signingInput}.${sig}`;

  let res: Response;
  try {
    res = await activeFetch()(tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
  } catch (e) {
    throw new GooglePlayVerificationError(
      'upstream_error',
      `Failed to fetch Google OAuth token: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new GooglePlayVerificationError(
      'upstream_error',
      `Google OAuth token request failed (${res.status}): ${text.slice(0, 200)}`
    );
  }

  const payload = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!payload.access_token) {
    throw new GooglePlayVerificationError('upstream_error', 'Google OAuth response missing access_token');
  }

  const ttlMs = Math.max(60, Number(payload.expires_in) || 3600) * 1000;
  cachedAccessToken = {
    token: payload.access_token,
    expiresAtMs: now + ttlMs,
    clientEmail: key.client_email,
  };
  return payload.access_token;
}

export function googleplayTransactionIdFrom(
  orderId: string | undefined,
  purchaseToken: string
): string {
  const trimmedOrderId = typeof orderId === 'string' ? orderId.trim() : '';
  if (trimmedOrderId) return trimmedOrderId;
  return `gp_tok_${crypto.createHash('sha256').update(purchaseToken, 'utf-8').digest('hex').slice(0, 32)}`;
}

export async function verifyGooglePlayProductPurchase(
  productId: string,
  purchaseToken: string
): Promise<GooglePlayProductPurchase> {
  const pkg = googleplayPackageName();
  if (!pkg || !loadServiceAccountKey()) {
    throw new GooglePlayVerificationError('not_configured', 'Google Play billing is not configured');
  }

  const token = await getAccessToken();
  const url =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(pkg)}` +
    `/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;

  let res: Response;
  try {
    res = await activeFetch()(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    throw new GooglePlayVerificationError(
      'upstream_error',
      `Google Play purchase verify network error: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  if (res.status === 400 || res.status === 404 || res.status === 410) {
    const bodyText = await res.text().catch(() => '');
    throw new GooglePlayVerificationError(
      'invalid_purchase',
      `Google Play purchase rejected (${res.status}): ${bodyText.slice(0, 200)}`
    );
  }
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new GooglePlayVerificationError(
      'upstream_error',
      `Google Play purchase verify error (${res.status}): ${bodyText.slice(0, 200)}`
    );
  }

  const data = (await res.json()) as GooglePlayProductPurchase;
  if (data.purchaseState !== 0) {
    throw new GooglePlayVerificationError(
      'not_purchased',
      `Google Play purchaseState=${String(data.purchaseState)}`
    );
  }
  return data;
}

/** Best-effort consumption after wallet settlement; never throws. */
export async function consumeGooglePlayProductPurchase(
  productId: string,
  purchaseToken: string
): Promise<boolean> {
  const pkg = googleplayPackageName();
  if (!pkg || !loadServiceAccountKey()) return false;

  try {
    const token = await getAccessToken();
    const url =
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(pkg)}` +
      `/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:consume`;
    const res = await activeFetch()(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (res.ok || res.status === 400) return true;
    console.warn(`[googleplay] consume failed (${res.status}) for ${productId}`);
    return false;
  } catch (e) {
    console.warn('[googleplay] consume error:', e instanceof Error ? e.message : e);
    return false;
  }
}

export async function listGooglePlayVoidedPurchases(
  startTimeMillis?: number
): Promise<GooglePlayVoidedPurchase[]> {
  const pkg = googleplayPackageName();
  if (!pkg || !loadServiceAccountKey()) {
    throw new GooglePlayVerificationError('not_configured', 'Google Play billing is not configured');
  }

  const token = await getAccessToken();
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(pkg)}/purchases/voidedpurchases`;
  const url =
    typeof startTimeMillis === 'number' && Number.isFinite(startTimeMillis)
      ? `${base}?startTime=${Math.floor(startTimeMillis)}`
      : base;

  let res: Response;
  try {
    res = await activeFetch()(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    throw new GooglePlayVerificationError(
      'upstream_error',
      `Google Play voidedpurchases network error: ${e instanceof Error ? e.message : String(e)}`
    );
  }
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new GooglePlayVerificationError(
      'upstream_error',
      `Google Play voidedpurchases error (${res.status}): ${bodyText.slice(0, 200)}`
    );
  }
  const data = (await res.json()) as { voidedPurchases?: GooglePlayVoidedPurchase[] };
  return Array.isArray(data.voidedPurchases) ? data.voidedPurchases : [];
}

export type ConfirmGooglePlayResult =
  | { ok: true; order: Order }
  | {
      ok: false;
      status: 400 | 404 | 409 | 502 | 503;
      error:
        | 'payment_channel_unavailable'
        | 'upstream_error'
        | 'transaction_invalid'
        | 'order_not_found'
        | 'transaction_reused'
        | 'settlement_mismatch';
    };

const PRODUCT_ID_RE = /^[a-z0-9_.]{1,64}$/;

/**
 * Google Play 消耗型内购核验 + 入账 + 消费（单点复用，供 `confirm-googleplay` 与 RTDN 共用）。
 *
 * 先调 Google Developer API `purchases.products.get` 验明 `purchaseState === 0`、
 * `obfuscatedExternalAccountId == order.providerRef`、`skuId == productId` 并防 `transactionId` 重用，
 * 落账成功（`settleFromChannel` 返回 ok）后再 best-effort `:consume`。
 */
export async function confirmGooglePlayPurchase(params: {
  productId: string;
  purchaseToken: string;
  userId?: string;
  outTradeNo?: string;
}): Promise<ConfirmGooglePlayResult> {
  const productId = params.productId.trim();
  const purchaseToken = params.purchaseToken.trim();
  if (!PRODUCT_ID_RE.test(productId) || !purchaseToken || purchaseToken.length > 4096) {
    return { ok: false, status: 400, error: 'transaction_invalid' };
  }
  if (!googleplayAdapter.isConfigured()) {
    return { ok: false, status: 503, error: 'payment_channel_unavailable' };
  }

  let purchase: GooglePlayProductPurchase;
  try {
    purchase = await verifyGooglePlayProductPurchase(productId, purchaseToken);
  } catch (e) {
    if (e instanceof GooglePlayVerificationError) {
      if (e.code === 'not_configured') {
        return { ok: false, status: 503, error: 'payment_channel_unavailable' };
      }
      if (e.code === 'upstream_error') {
        return { ok: false, status: 502, error: 'upstream_error' };
      }
      return { ok: false, status: 400, error: 'transaction_invalid' };
    }
    throw e;
  }

  const appAccountToken =
    typeof purchase.obfuscatedExternalAccountId === 'string'
      ? purchase.obfuscatedExternalAccountId.trim()
      : '';
  if (!appAccountToken) {
    console.error('[googleplay confirm] purchase missing obfuscatedExternalAccountId');
    return { ok: false, status: 400, error: 'transaction_invalid' };
  }

  const requestedNo = params.outTradeNo?.trim() || '';
  const order = requestedNo
    ? getOrder(requestedNo)
    : findOrderByProviderRef('googleplay', appAccountToken);
  if (!order || (params.userId !== undefined && order.userId !== params.userId)) {
    return { ok: false, status: 404, error: 'order_not_found' };
  }

  if (
    order.channel !== 'googleplay' ||
    order.kind !== 'recharge' ||
    order.providerRef !== appAccountToken ||
    order.skuId !== productId
  ) {
    console.error(
      `[googleplay confirm] order mismatch ${order.outTradeNo}: channel=${order.channel} sku=${order.skuId} reqSku=${productId}`
    );
    return { ok: false, status: 400, error: 'transaction_invalid' };
  }

  const settleCurrency: CurrencyCode | null =
    order.currency === 'USD' || order.currency === 'CNY' ? order.currency : null;
  if (!settleCurrency) {
    console.error(`[googleplay confirm] unsupported order currency ${order.outTradeNo}: ${order.currency}`);
    return { ok: false, status: 400, error: 'transaction_invalid' };
  }

  const faceValue = googleplayFaceValue(settleCurrency, productId);
  if (faceValue === null || faceValue !== order.amount) {
    console.error(`[googleplay confirm] catalog mismatch ${order.outTradeNo}: ${productId} (${settleCurrency})`);
    return { ok: false, status: 400, error: 'transaction_invalid' };
  }

  const transactionId = googleplayTransactionIdFrom(purchase.orderId, purchaseToken);
  const owner = findOrderByTransactionId('googleplay', transactionId);
  if (owner && owner.outTradeNo !== order.outTradeNo) {
    console.error(
      `[googleplay confirm] transactionId ${transactionId} already used by ${owner.outTradeNo}, rejecting ${order.outTradeNo}`
    );
    return { ok: false, status: 409, error: 'transaction_reused' };
  }

  if (order.status === 'paid') {
    if (order.transactionId && order.transactionId !== transactionId) {
      return { ok: false, status: 409, error: 'transaction_reused' };
    }
    await consumeGooglePlayProductPurchase(productId, purchaseToken);
    return { ok: true, order };
  }

  updateOrder(order.outTradeNo, {
    providerMeta: JSON.stringify({
      orderId: purchase.orderId ?? null,
      productId,
      regionCode: purchase.regionCode ?? null,
      purchaseTimeMillis: purchase.purchaseTimeMillis ?? null,
      purchaseState: purchase.purchaseState ?? null,
      consumptionState: purchase.consumptionState ?? null,
      acknowledgementState: purchase.acknowledgementState ?? null,
    }),
  });

  let settleResult;
  try {
    settleResult = settleFromChannel({
      channel: 'googleplay',
      outTradeNo: order.outTradeNo,
      paid: true,
      amountMinor: faceValue,
      currency: settleCurrency,
      transactionId,
      payerRef: appAccountToken,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('UNIQUE constraint failed')) {
      return { ok: false, status: 409, error: 'transaction_reused' };
    }
    throw e;
  }

  if (!settleResult.ok) {
    console.error(
      `[googleplay confirm] settlement rejected ${order.outTradeNo}: ${describeSettleFailure(settleResult.reason)}`
    );
    return { ok: false, status: 409, error: 'settlement_mismatch' };
  }

  await consumeGooglePlayProductPurchase(productId, purchaseToken);
  return { ok: true, order: getOrder(order.outTradeNo) ?? order };
}

export const googleplayAdapter: PaymentChannelAdapter = {
  id: 'googleplay',
  get currency(): CurrencyCode {
    return siteConfig.currency;
  },
  isConfigured(): boolean {
    return Boolean(googleplayPackageName() && loadServiceAccountKey());
  },
  async createCharge(input) {
    if (!input.productId) throw new Error('googleplay 建单缺 productId');
    const expected = googleplayFaceValue(siteConfig.currency, input.productId);
    if (expected === null || expected !== input.amountMinor) {
      throw new Error(`googleplay 档位面值不符: ${input.productId}`);
    }
    return {
      channel: 'googleplay',
      present: 'native',
      appAccountToken: crypto.randomUUID(),
    };
  },
  async parseWebhook() {
    throw new WebhookVerificationError(
      'googleplay 不走 parseWebhook：到账走 confirm-googleplay，RTDN 走 /api/payment/googleplay/webhook'
    );
  },
  async queryCharge() {
    return null;
  },
};
