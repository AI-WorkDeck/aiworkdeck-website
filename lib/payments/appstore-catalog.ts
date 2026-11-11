import type { CurrencyCode } from './types';

/**
 * Apple 内购的**权威价格表**（dev-board#426，设计
 * `2026-09-04-mobile-recharge-design.md` §4.2）。
 *
 * ## 为什么必须有这张表，而不是用苹果 JWS 里的金额
 *
 * `JWSTransactionDecodedPayload` 里的 `price` / `currency` 是**买家 storefront 的
 * 本地币种**：同一个 `credits.cny.50`，大陆买家是 CNY 5000，日本买家可能是
 * JPY 1100。把它直接塞进 `ChannelSettlement` 会被 `settle.ts` 的
 * `currency_mismatch` 全部打回——用户付了钱拿不到 Credits，而日志里只有一行
 * 「币种不符」。所以结算取的是**这张表里的站点币种面值**，苹果实收的
 * price/currency/storefront 只作为对账字段写进 order，不参与三重校验。
 *
 * 这与 `wxpay-adapter` 硬编码 `'CNY'`、`stripe-adapter` 强制 `'usd'` 是同一个模式：
 * 通道的币种是通道的性质，不是请求里的变量。
 *
 * ## 三份拷贝里这一份说了算
 *
 * 另外两份是 ASC 上建好的消耗型商品（大陆版 App 6803309103）与手机端仓的
 * `contract/products.json`。钱在官网这边记账，iOS 传来的 `amountCents` 只有跟
 * 这里对上才建单，对不上回 400 `product_mismatch`（Java 侧译成 REJECTED）。
 * 不从 contract 生成物读：那是手机端仓的产物，官网不依赖它的构建。
 *
 * ## 只有大陆版三档
 *
 * 国际版 App 6802233845 的 `credits.usd.10/20/50` **刻意不在这里**：它的净收只有
 * 70%（未进小企业计划前每笔都在亏钱，设计 §1 结论 1），本轮不开。将来要开时
 * 在这里加三行、并把 `APPSTORE_CURRENCY` 改成按站点取——不要在别处再造一张表。
 */
export const APPSTORE_PRODUCTS: Readonly<Record<string, number>> = {
  'credits.cny.50': 5000,
  'credits.cny.100': 10000,
  'credits.cny.300': 30000,
};

/** 本目录的面值币种。见文件头：苹果 JWS 里的 currency 不参与结算。 */
export const APPSTORE_CURRENCY: CurrencyCode = 'CNY';

/**
 * 查档位面值（分）。查不到返回 undefined。
 *
 * 用 `hasOwnProperty` 而不是直接索引：后者对 `constructor` / `toString`
 * 这类原型键会取到函数，绕开档位表。
 */
export function appstoreFaceValue(productId: string): number | undefined {
  return Object.prototype.hasOwnProperty.call(APPSTORE_PRODUCTS, productId)
    ? APPSTORE_PRODUCTS[productId]
    : undefined;
}
