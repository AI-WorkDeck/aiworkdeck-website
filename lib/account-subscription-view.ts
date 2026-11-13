// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { getDb } from './db';
import { getProIntroQuote } from './pro-products';
import { subscriptionSnapshot } from './subscription';
import { sandboxAllowed, sandboxSubscriptionSnapshot } from './appstore-sandbox-subscription';

/** Display only. Funding and entitlement checks must keep using the production ledger. */
export function accountSubscriptionView(userId: string) {
  const actual = subscriptionSnapshot(userId);
  const introOffer = getProIntroQuote(getDb(), userId);
  if (!sandboxAllowed(userId)) return { ...actual, introOffer };
  const sandbox = sandboxSubscriptionSnapshot(userId);
  return { ...actual, introOffer, sandbox: true, sandboxSubscription: sandbox,
    autoRenew: sandbox.autoRenew ?? actual.autoRenew };
}
