// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import zh from '../dictionaries/zh.json';
import en from '../dictionaries/en.json';
const require = createRequire(import.meta.url);
const { SubscriptionSection } = require('../app/[lang]/account/SubscriptionSection') as typeof import('../app/[lang]/account/SubscriptionSection');
const { AppRouterContext } = require('next/dist/shared/lib/app-router-context.shared-runtime');
const entitlement = { feature: 'pro', expiresAt: '2099-01-15T12:00:00Z', createdAt: '2026-01-01T00:00:00Z', orderId: 'fixture' };
const render = (props = {}) => renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: {} },
    createElement(SubscriptionSection, { lang: 'zh', dict: zh, entitlement: null, paymentChannel: 'wxpay', purchaseEnabled: true, ...props })));
const fresh = render();
assert.match(fresh, /id="subscription"/);
assert.match(fresh, /尚未开通/);
assert.match(fresh, /<button[^>]*>开通个人 Pro<\/button>/);
assert.match(fresh, /¥149/);
assert.match(fresh, /3GB/);
assert.match(fresh, /微信扫码支付/);
assert.match(fresh, /30 天；不自动扣款/);
const active = render({ entitlement });
assert.match(active, /续订个人 Pro/);
assert.match(active, /有效期至 2099年1月15日/);
assert.match(render({ entitlement: { ...entitlement, expiresAt: null } }), /长期有效/);
const disabled = render({ purchaseEnabled: false });
assert.match(disabled, /disabled=""/);
assert.match(disabled, /Pro 购买暂未开放/);
assert.doesNotMatch(disabled, /微信扫码支付/);
const international = render({ paymentChannel: 'stripe' });
assert.match(international, /国际站暂未开放/);
assert.doesNotMatch(international, /<button|href="\/zh\/account"|¥149/);
assert.match(international, /href="\/zh\/pricing"/);
const english = render({ lang: 'en', dict: en, entitlement });
assert.match(english, /Renew Personal Pro/);
assert.match(english, /Valid until January 15, 2099/);
console.log('Account subscription: new, active, permanent, disabled, international and English states passed');
