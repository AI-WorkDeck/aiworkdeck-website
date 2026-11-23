// SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * 贴牌（white-label）部署的站点覆盖项。
 *
 * `lib/brand-profile.json` 在本仓库里恒为 `{}`（AI WorkDeck 自己的两个站不受影响）；
 * 贴牌方的私有仓库在构建前用自己的文件覆盖它（见 `scripts/brand/README.md`）。
 * 贴牌站点的业务逻辑沿用国际站（`NEXT_PUBLIC_AWD_SITE=intl`：邮箱账户、Stripe），
 * 这里只换「是谁、在哪、收什么币、说什么语言」。
 */
import raw from './brand-profile.json';
import type { SiteLegalEntity } from './site-config';
import type { PluginSubscriptionPlanDef } from './plugin-subscriptions';

export interface BrandProfile {
  /** 贴牌 id（与桌面端 brands/<id> 一致）。 */
  id: string;
  /** 产品名，页面标题与邮件用。 */
  name: string;
  host: string;
  origin: string;
  /** 同站别名（apex 等），进同站 Origin 白名单。 */
  aliases?: string[];
  addinOrigin: string;
  /** 默认语言；`forceDefaultLocale` 为真时首访不看 Geo-IP 与浏览器语言。 */
  defaultLocale: 'zh' | 'en' | 'zh-hant';
  forceDefaultLocale?: boolean;
  currency: 'USD' | 'TWD';
  currencySymbol: string;
  /** Credits → 美元折算（本币 1 单位 = 多少美元）。 */
  usdExchangeRate: number;
  legalEntity: SiteLegalEntity;
  /** 法律文本生效日期（ISO）。 */
  legalEffectiveDate: string;
  /** 贴牌站点额外出售的插件订阅方案（追加到 PLUGIN_SUBSCRIPTION_PLANS）。 */
  pluginPlans?: PluginSubscriptionPlanDef[];
}

const profile = raw as Partial<BrandProfile>;

/** 当前部署的贴牌覆盖；不是贴牌部署时为 null。 */
export const BRAND_PROFILE: BrandProfile | null = profile && profile.id ? (profile as BrandProfile) : null;
