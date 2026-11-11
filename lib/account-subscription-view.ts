// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { subscriptionSnapshot } from './subscription';
import { sandboxAllowed, sandboxSubscriptionSnapshot } from './appstore-sandbox-subscription';

/** Display only. Funding and entitlement checks must keep using the production ledger. */
export function accountSubscriptionView(userId: string) {
  const actual = subscriptionSnapshot(userId);
  if (!sandboxAllowed(userId)) return actual;
  const sandbox = sandboxSubscriptionSnapshot(userId);
  return { ...actual, sandbox: true, sandboxSubscription: sandbox,
    autoRenew: sandbox.autoRenew ?? actual.autoRenew };
}
