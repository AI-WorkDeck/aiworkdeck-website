// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Google Play Billing 消耗型商品目录与站点面值权威表。
 *
 * 与 App Store 同口径（见 appstore-catalog.ts）：
 * Google Play 返回的商品价格随买家地区货币变化，结算与发放 Credits 一律按本目录的
 * 站点币种面值（USD 分 / CNY 分）入账，绝不拿买家付款货币当站内面值。
 */

export const GOOGLEPLAY_CATALOG: Record<string, Readonly<Record<string, number>>> = {
  USD: {
    'credits.usd.10': 1000,
    'credits.usd.20': 2000,
    'credits.usd.50': 5000,
  },
  CNY: {
    'credits.cny.50': 5000,
    'credits.cny.100': 10000,
    'credits.cny.300': 30000,
  },
};

/**
 * 查询商品在指定站点币种下的面值（整数分）；非法的原型键（constructor 等）
 * 或未收录档位返回 null。
 */
export function googleplayFaceValue(currency: string, productId: string): number | null {
  if (!Object.prototype.hasOwnProperty.call(GOOGLEPLAY_CATALOG, currency)) return null;
  const table = GOOGLEPLAY_CATALOG[currency];
  if (!Object.prototype.hasOwnProperty.call(table, productId)) return null;
  return table[productId];
}
