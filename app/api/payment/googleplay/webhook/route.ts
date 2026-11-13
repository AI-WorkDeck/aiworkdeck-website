// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  confirmGooglePlayPurchase,
  googleplayPackageName,
  googleplayTransactionIdFrom,
  listGooglePlayVoidedPurchases,
  type GooglePlayVoidedPurchase,
} from '@/lib/payments/googleplay-adapter';
import { findOrderByTransactionId as lookupOrderByTxn } from '@/lib/orders';
import { clawbackOrderCredits } from '@/lib/wallet';

/**
 * Google Play Real-time Developer Notifications (RTDN) Pub/Sub Push webhook.
 *
 * Security: verifies `?token=` against `AWD_GOOGLEPLAY_RTDN_TOKEN` with constant-time
 * equality; missing/mismatch returns empty 404 (matching internal auth gate).
 * Voided purchase notifications are cross-checked against `purchases.voidedpurchases`
 * before clawing back credits.
 */

interface PubSubPushEnvelope {
  message?: {
    data?: string;
    messageId?: string;
    publishTime?: string;
  };
  subscription?: string;
}

interface DeveloperNotification {
  version?: string;
  packageName?: string;
  eventTimeMillis?: string;
  oneTimeProductNotification?: {
    version?: string;
    notificationType?: number; // 1: PURCHASED, 2: CANCELED
    purchaseToken?: string;
    sku?: string;
  };
  voidedPurchaseNotification?: {
    purchaseToken?: string;
    orderId?: string;
    productType?: number;
    refundType?: number;
  };
  testNotification?: {
    version?: string;
  };
}

function verifyWebhookToken(provided: string | null, expected: string | undefined): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(provided, 'utf-8');
  const b = Buffer.from(expected, 'utf-8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const expectedToken = process.env.AWD_GOOGLEPLAY_RTDN_TOKEN;
  const providedToken = request.nextUrl.searchParams.get('token');
  if (!verifyWebhookToken(providedToken, expectedToken)) {
    return new NextResponse(null, { status: 404 });
  }

  let body: PubSubPushEnvelope;
  try {
    body = (await request.json()) as PubSubPushEnvelope;
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const encoded = body?.message?.data;
  if (typeof encoded !== 'string' || !encoded) {
    return NextResponse.json({ error: 'missing_message_data' }, { status: 400 });
  }

  let notification: DeveloperNotification;
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    notification = JSON.parse(decoded) as DeveloperNotification;
  } catch {
    return NextResponse.json({ error: 'invalid_message_data' }, { status: 400 });
  }

  const configuredPkg = googleplayPackageName();
  if (configuredPkg && notification.packageName && notification.packageName !== configuredPkg) {
    console.warn(`[googleplay rtdn] ignored notification for package ${notification.packageName}`);
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (notification.testNotification) {
    console.info(
      `[googleplay rtdn] received testNotification version=${notification.testNotification.version ?? 'unknown'}`
    );
    return NextResponse.json({ ok: true, kind: 'test' });
  }

  if (notification.oneTimeProductNotification) {
    const evt = notification.oneTimeProductNotification;
    if (evt.notificationType === 1 && evt.sku && evt.purchaseToken) {
      const res = await confirmGooglePlayPurchase({
        productId: evt.sku,
        purchaseToken: evt.purchaseToken,
      });
      if (!res.ok && (res.status === 502 || res.status === 503)) {
        return NextResponse.json({ error: res.error }, { status: res.status });
      }
      return NextResponse.json({ ok: true, kind: 'oneTimeProduct', settled: res.ok });
    }
    return NextResponse.json({ ok: true, kind: 'oneTimeProduct', ignored: true });
  }

  if (notification.voidedPurchaseNotification) {
    const evt = notification.voidedPurchaseNotification;
    const purchaseToken = typeof evt.purchaseToken === 'string' ? evt.purchaseToken.trim() : '';
    const orderId = typeof evt.orderId === 'string' ? evt.orderId.trim() : '';

    const order =
      (orderId ? lookupOrderByTxn('googleplay', orderId) : undefined) ??
      (purchaseToken
        ? lookupOrderByTxn('googleplay', googleplayTransactionIdFrom(undefined, purchaseToken))
        : undefined);

    if (!order) {
      console.warn(`[googleplay rtdn] voidedPurchase order not found (orderId=${orderId || 'none'})`);
      return NextResponse.json({ ok: true, matched: false });
    }

    // Verify voided status against Google Play voidedpurchases API so forged payloads cannot claw back valid orders.
    let voidedList: GooglePlayVoidedPurchase[];
    try {
      voidedList = await listGooglePlayVoidedPurchases();
    } catch (e) {
      console.error('[googleplay rtdn] voidedpurchases lookup failed:', e instanceof Error ? e.message : e);
      return NextResponse.json({ error: 'voided_lookup_failed' }, { status: 502 });
    }

    const verified = voidedList.find(
      (v) =>
        (purchaseToken && v.purchaseToken === purchaseToken) ||
        (orderId && v.orderId === orderId) ||
        (order.transactionId && v.orderId === order.transactionId)
    );
    if (!verified) {
      console.warn(`[googleplay rtdn] voidedPurchase not confirmed in API for ${order.outTradeNo}`);
      return NextResponse.json({ ok: true, matched: true, verifiedVoid: false });
    }

    const voidedMillis = Number(verified.voidedTimeMillis);
    const refundedAt =
      Number.isFinite(voidedMillis) && voidedMillis > 0
        ? new Date(voidedMillis).toISOString()
        : new Date().toISOString();

    const clawback = clawbackOrderCredits(order.outTradeNo, {
      refundedAt,
      reason: 'googleplay_voided',
    });
    if (!clawback) {
      return NextResponse.json({ ok: true, matched: false });
    }
    return NextResponse.json({
      ok: true,
      matched: true,
      alreadyRefunded: clawback.alreadyRefunded,
      clawedBackCents: clawback.clawback?.clawedBackCents ?? 0,
      shortfallCents: clawback.clawback?.shortfallCents ?? 0,
    });
  }

  return NextResponse.json({ ok: true, ignored: true });
}
