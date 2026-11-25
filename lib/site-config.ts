/**
 * 站点配置——双主站的唯一分叉点。
 *
 * 一套代码、两个部署、两份数据：
 * - `cn`   www.aiworkdeck.com   北京 ECS，ICP 备案，人民币 / 微信支付，中国法
 * - `intl` www.workdeck.ai      新加坡 ECS（.ai 不可备案，只能落境外），美元 / Stripe；两站均由公富运营
 *
 * 两站**账户体系完全独立**：各自一个 `data/` 目录、一个 SQLite 库、一份 users.json。
 * 这是接受的代价，不是待修的缺陷；用户面的说明见 `/start` 与账户页的站点提示。
 *
 * ## 分的是什么
 * 币种与定价、支付通道、发票与收据、适用法与争议解决、ICP 备案、默认语言、
 * telemetry 落点、registry 落点。
 *
 * ## 不分的是什么
 * `/api/` 契约（端点集合、字段名、类型、状态码语义**逐字相同**，`scripts/contract-check.mts`
 * 两站各跑一遍必须产出同样的形状）、插件签名公钥、试用码公钥、桌面端更新通道。
 * 平台 AI 按账户站点选择供应商：cn 经本站网关使用百炼，intl 保留 OpenRouter。
 * 模型目录来自对应供应商，不按用户 IP、系统国家或时区判断模型地区。
 *
 * ## 为什么是 NEXT_PUBLIC_ 而不是 AWD_SITE
 * `i18n-config.ts` 被一批 `'use client'` 组件 import，`middleware.ts` 跑在 Edge Runtime——
 * 这两处的 `process.env` 都是**构建期 inline** 的，非 NEXT_PUBLIC_ 变量在那里恒为 undefined，
 * 会静默回落到 cn 分支。两个站本来就各自 `npm run build`，构建期固化不是妥协。
 * **改了这个变量必须重新 build，`pm2 restart --update-env` 不够。**
 *
 * 设计文档：桌面仓 `docs/superpowers/specs/2026-08-08-dual-site-architecture.md`
 */

export type SiteId = 'cn' | 'intl';

export const SITE_ID: SiteId =
  process.env.NEXT_PUBLIC_AWD_SITE === 'intl' ? 'intl' : 'cn';

export interface SiteLegalEntity {
  /** 法定名称（中文）。 */
  nameZh: string;
  /** 用户确认的英文名称。 */
  nameEn: string;
  /** 统一社会信用代码。 */
  registrationNo: string;
  /** 注册号在法律文本里的称呼。 */
  registrationLabel: { zh: string; en: string };
  /**
   * 注册办事处地址。
   *
   * **不是可选项**：欧盟《消费者权利指令》第 6(1)(c) 条要求远程销售必须向消费者提供
   * 经营者的**地理地址**，只给邮箱不合规。国内站同理（《电子商务法》第十五条）。
   */
  registeredAddress: { zh: string; en: string };
  contactEmail: string;
  /**
   * 注册成立日期（ISO `YYYY-MM-DD`）。仅在公司页登载，用于对外核验，缺省不渲染。
   */
  incorporatedOn?: string;
  /** 登记机关与法定代表人，依据用户提供的公司登记资料。 */
  registrationAuthority: { zh: string; en: string };
  legalRepresentative: { zh: string; en: string };
  /** 争议解决机构与规则，法律文本正文引用。 */
  forum: { zh: string; en: string };
  /** 适用法。 */
  governingLaw: { zh: string; en: string };
}

export interface SiteConfig {
  id: SiteId;
  host: string;
  origin: string;
  /** 默认落地语言。**locales 数组两站都保持 ['en','zh'] 不变**，见 i18n-config.ts。 */
  defaultLocale: 'zh' | 'en';
  /** ISO 4217。`amountCents` 与 `priceCents` 一律是本币种的最小单位。 */
  currency: 'CNY' | 'USD';
  currencySymbol: string;
  /** 站内启用的支付通道。 */
  paymentChannel: 'wxpay' | 'stripe';
  /** 页脚是否渲染 ICP 备案信息。判据是**服务器与域名的备案主体**，不是页面语种。 */
  icpFiling: string;
  publicSecurityFiling: string;
  /** 是否在页脚渲染中文法定名称（境外主体没有）。 */
  showChineseEntityName: boolean;
  legalEntity: SiteLegalEntity;
  /** 另一个站，用于「你要找的可能是这里」的互指引导。 */
  otherSite: { id: SiteId; origin: string; host: string; labelZh: string; labelEn: string };
  /** Credits → 美元的折算汇率。本币已是美元时为 1。 */
  usdExchangeRate: number;
  /** 是否接受付费投稿（国际站首期只上免费与官方条目，见设计文档决策 3）。 */
  allowPaidSubmissions: boolean;
  /**
   * 本站对应的插件云后端 origin。**Office 插件安装器不是与站点无关的**：
   * 托管地址被焙进包内的 manifest，装哪个包就决定了任务窗格从哪个站加载、
   * 用哪个 office.js CDN（国内走世纪互联，国际走全球版）。国际站发国内包的话，
   * 国际用户整条链路都会绕回北京（2026-08-29 实测 office.js TTFB 相差约 38 倍）。
   */
  addinOrigin: string;
  /**
   * 是否提供 WPS 加载项。WPS 是国内市场的产品线，签名私钥与目录真源都在北京，
   * 国际站刻意不铺（新加坡没有 wps-addin 目录）——所以国际站不能渲染这个入口。
   */
  offersWpsAddin: boolean;
}

/** 保留原条款生效日期；2026-11-16 主体资料修订不倒造新的签署或生效日期。 */
export const LEGAL_EFFECTIVE_DATE: Record<SiteId, string> = {
  cn: '2026-08-08',
  intl: '2026-08-08',
};

/** 公司登记资料由用户于 2026-11-16 提供；英文名称采用用户指定写法。
 * 软件权属与运营主体统一为公富，不代表域名、备案或支付账号迁移手续已完成。
 */
const GONGFU_ENTITY = {
  nameZh: '北京公富信息技术有限公司',
  nameEn: 'BEIJING GONG FU INFORMATION TECHNOLOGY LIMITED',
  registrationNo: '911101053483482356',
  registrationLabel: { zh: '统一社会信用代码', en: 'Unified Social Credit Code' },
  registeredAddress: {
    zh: '北京市朝阳区东三环中路1号1幢1单元15层1501内15单元',
    en: 'Unit 15 within Room 1501, Floor 15, Unit 1, Building 1, No. 1 East Third Ring Middle Road, Chaoyang District, Beijing, China',
  },
  incorporatedOn: '2015-06-16',
  registrationAuthority: {
    zh: '北京市朝阳区市场监督管理局',
    en: 'Beijing Chaoyang District Administration for Market Regulation',
  },
  legalRepresentative: { zh: '李楠', en: 'Li Nan' },
};

const CN: SiteConfig = {
  id: 'cn',
  host: 'www.aiworkdeck.com',
  origin: 'https://www.aiworkdeck.com',
  defaultLocale: 'zh',
  currency: 'CNY',
  currencySymbol: '¥',
  paymentChannel: 'wxpay',
  // 《互联网信息服务管理办法》第十二条：境内服务器面向公众提供服务必须在首页底部标明
  // 现有备案登记待办理主体变更；不得将此备案号视为公富已经取得的登记。
  icpFiling: '京ICP备2024096997号-8',
  publicSecurityFiling: '',
  showChineseEntityName: true,
  legalEntity: {
    ...GONGFU_ENTITY,
    contactEmail: 'hi@aiworkdeck.com',
    forum: { zh: '北京仲裁委员会', en: 'Beijing Arbitration Commission' },
    governingLaw: { zh: '中华人民共和国内地法律', en: 'the laws of mainland China' },
  },
  otherSite: {
    id: 'intl',
    origin: 'https://www.workdeck.ai',
    host: 'www.workdeck.ai',
    labelZh: 'AI WorkDeck 国际站',
    labelEn: 'AI WorkDeck International',
  },
  // 与 lib/ai-quota.ts 的既有默认一致（管理后台可覆盖）
  usdExchangeRate: 7.3,
  allowPaidSubmissions: true,
  addinOrigin: 'https://addin.aiworkdeck.com',
  offersWpsAddin: true,
};

/** 国际站采用同一运营主体，保留原有币种、支付、联系邮箱及争议解决约定。
 * 账户实名、支付收款与域名登记的迁移须分别办理，不由展示信息替换完成。
 */
const INTL: SiteConfig = {
  id: 'intl',
  host: 'www.workdeck.ai',
  origin: 'https://www.workdeck.ai',
  defaultLocale: 'en',
  currency: 'USD',
  currencySymbol: '$',
  paymentChannel: 'stripe',
  // .ai 不在工信部可备案顶级域名单里，服务器也在境外——渲染备案号属虚假标注
  icpFiling: '',
  publicSecurityFiling: '',
  showChineseEntityName: false,
  legalEntity: {
    ...GONGFU_ENTITY,
    contactEmail: process.env.NEXT_PUBLIC_AWD_INTL_CONTACT_EMAIL ?? 'hi@workdeck.ai',
    forum: {
      zh: '香港国际仲裁中心（HKIAC）',
      en: 'the Hong Kong International Arbitration Centre (HKIAC)',
    },
    governingLaw: { zh: '中华人民共和国香港特别行政区法律', en: 'the laws of Hong Kong SAR' },
  },
  otherSite: {
    id: 'cn',
    origin: 'https://www.aiworkdeck.com',
    host: 'www.aiworkdeck.com',
    labelZh: 'AI WorkDeck 国内站',
    labelEn: 'AI WorkDeck China',
  },
  // 本币已是美元
  usdExchangeRate: 1,
  allowPaidSubmissions: false,
  addinOrigin: 'https://addin.workdeck.ai',
  offersWpsAddin: false,
};

const ALL: Record<SiteId, SiteConfig> = { cn: CN, intl: INTL };

/** 断言用：在 siteConfig 导出之前就要能取到配置。 */
function siteConfigOfInternal(id: SiteId): SiteConfig {
  return ALL[id];
}

/**
 * Private and staging deployments serve this site under their own origins instead of production's
 * (build-time NEXT_PUBLIC_* variables; unset = production, unchanged). Without this, a non-production
 * build advertises the production platform-AI baseUrl and the backend rejects it.
 */
const ORIGIN_OVERRIDE = parseOriginOverride('NEXT_PUBLIC_AWD_ORIGIN_OVERRIDE', process.env.NEXT_PUBLIC_AWD_ORIGIN_OVERRIDE);
const ADDIN_ORIGIN_OVERRIDE = parseOriginOverride('NEXT_PUBLIC_AWD_ADDIN_ORIGIN_OVERRIDE', process.env.NEXT_PUBLIC_AWD_ADDIN_ORIGIN_OVERRIDE);

function parseOriginOverride(name: string, raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error(`${name} must be an origin such as https://staging.example.com, got "${raw}"`); }
  if (!['https:', 'http:'].includes(url.protocol) || url.origin !== raw.replace(/\/$/, '')) {
    throw new Error(`${name} must be a bare origin (scheme + host [+ port], no path), got "${raw}"`);
  }
  return url.origin;
}

export const siteConfig: SiteConfig = {
  ...ALL[SITE_ID],
  ...(ORIGIN_OVERRIDE ? { origin: ORIGIN_OVERRIDE, host: new URL(ORIGIN_OVERRIDE).host } : {}),
  ...(ADDIN_ORIGIN_OVERRIDE ? { addinOrigin: ADDIN_ORIGIN_OVERRIDE } : {}),
};

/** Public same-site mutation origins; aliases share the existing Web AI CSRF policy. */
export const siteOrigins: readonly string[] = ORIGIN_OVERRIDE ? [ORIGIN_OVERRIDE] : SITE_ID === 'cn'
  ? ['https://www.aiworkdeck.com', 'https://aiworkdeck.com']
  : ['https://www.workdeck.ai', 'https://workdeck.ai', 'https://www.aiworkdeck.us', 'https://aiworkdeck.us'];

export function siteConfigOf(id: SiteId): SiteConfig {
  return id === SITE_ID ? siteConfig : ALL[id];
}

/** 页脚与公司页的资料不包含分站适用法和争议解决机构。 */
export type SitePublicEntity = Omit<SiteLegalEntity, 'forum' | 'governingLaw'>;

/** 美国域名仍由国际站进程承载；域名登记手续另行办理。 */
export const US_SITE_ORIGIN = 'https://www.aiworkdeck.us';

/** 保留美国域名联系邮箱；主体与其他站点一致。兼容现有 Host 路由导出名。 */
export const INTL_US_LEGAL_ENTITY: SitePublicEntity = {
  ...GONGFU_ENTITY,
  contactEmail: 'legal@aiworkdeck.us',
};

/** 归一化 Host 头：小写、去端口、去末尾点。IPv6 字面量（`[::1]:3000`）也能正确剥端口。 */
function normalizeHost(host: string | null | undefined): string {
  if (!host) return '';
  const h = host.trim().toLowerCase();
  const bracket = h.startsWith('[') ? h.indexOf(']') : -1;
  const colon = h.indexOf(':', bracket >= 0 ? bracket : 0);
  return (colon >= 0 ? h.slice(0, colon) : h).replace(/\.$/, '');
}

/**
 * 该 Host 是不是 aiworkdeck.us（含任意子域）。**只看域名，不看站点**——
 * 站点这一层的判断在 `publicEntityForHost` 里，别在这里提前拦，否则调用方
 * 想单独测「域名匹配」都没得测。
 */
export function isUsHost(host: string | null | undefined): boolean {
  const h = normalizeHost(host);
  return h === 'aiworkdeck.us' || h.endsWith('.aiworkdeck.us');
}

/**
 * 本次请求对外展示的主体。纯函数，Host 进、主体出，没有 IO——
 * 读 Host 头的那一层在 `lib/request-entity.ts`。
 *
 * 国内站构建即使收到 aiworkdeck.us 的 Host 也返回本站主体：那种情况只可能是
 * 配错的反代，应保留当前站点的联系邮箱。
 */
export function publicEntityForHost(host: string | null | undefined): SitePublicEntity {
  if (SITE_ID === 'intl' && isUsHost(host)) return INTL_US_LEGAL_ENTITY;
  return siteConfig.legalEntity;
}

/**
 * 缔约主体的非空断言。
 *
 * 放在模块顶层而不是某个页面里：法律文本、页脚、注册页的条款链接都依赖它，
 * 任何一处渲染出空的公司名或空地址都是对外的实质性错误，而且极难在灰度里被发现
 * （页面不报错、类型也不报错，只有用户看得见一个空括号）。
 * 地址同样必填——远程销售必须提供地理地址，只给邮箱不合规。
 */
{
  const e = siteConfigOfInternal(SITE_ID).legalEntity;
  const missing = [
    !e.nameEn && 'nameEn',
    !e.registrationNo && 'registrationNo',
    !e.registeredAddress.en && 'registeredAddress.en',
    !e.contactEmail && 'contactEmail',
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(
      `站点 ${SITE_ID} 的缔约主体信息不完整：缺 ${missing.join('、')}。` +
        '法律文本的缔约主体是用户据以起诉的对象，不允许留空或使用占位值。'
    );
  }
}

/** 本站生效日期。 */
export const SITE_LEGAL_EFFECTIVE_DATE = LEGAL_EFFECTIVE_DATE[SITE_ID];

/** 金额格式化的唯一出口：`cents` 是**本站币种**的最小单位。 */
export function formatSiteAmount(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}${siteConfig.currencySymbol}${(Math.abs(cents) / 100).toFixed(2)}`;
}

/**
 * 跨站链接的唯一出口。
 *
 * 必须带 `?site=<目标站>`：国际站的 nginx 对境内访客默认 301 回国内站，
 * 不带这个参数的话，境内用户点「去国际站」会被原地弹回来，链接变成死循环。
 * 参数由 nginx 放行一次、由 middleware 固化成 cookie，之后就不再需要它。
 */
export function crossSiteUrl(target: SiteId = siteConfig.otherSite.id, path = '/'): string {
  const base = siteConfigOf(target).origin;
  const sep = path.includes('?') ? '&' : '?';
  return `${base}${path}${sep}site=${target}`;
}
