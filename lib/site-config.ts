/**
 * 站点配置——双主站的唯一分叉点。
 *
 * 一套代码、两个部署、两份数据：
 * - `cn`   www.aiworkdeck.com   北京 ECS，ICP 备案，人民币 / 微信支付，中国法
 * - `intl` www.workdeck.ai      新加坡 ECS（.ai 不可备案，只能落境外），美元 / Stripe，香港主体
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
  /** 法定名称（中文）。境外主体没有中文法定名时为空串。 */
  nameZh: string;
  /** 法定名称（英文/拉丁字母）。 */
  nameEn: string;
  /** 注册号：内地是统一社会信用代码，香港是公司注册编号。 */
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
   * 内地主体没有填——公开页只在国际站，别为了填满字段去猜。
   */
  incorporatedOn?: string;
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

/** 两份法律文本的生效日期。分站维护——国际站的文本是新起草的，日期不同。 */
export const LEGAL_EFFECTIVE_DATE: Record<SiteId, string> = {
  cn: '2026-08-08',
  intl: '2026-08-08',
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
  icpFiling: '京ICP备2024096997号-8',
  publicSecurityFiling: '',
  showChineseEntityName: true,
  legalEntity: {
    nameZh: '北京京微资易科技有限公司',
    nameEn: 'Beijing Jingwei Ziyi Technology Co., Ltd.',
    registrationNo: '91110106MA003EM95R',
    registrationLabel: { zh: '统一社会信用代码', en: 'Unified Social Credit Code' },
    registeredAddress: {
      zh: '中国北京市',
      en: 'Beijing, China',
    },
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

/**
 * 国际站的缔约主体：香港实体，2026-01-05 依《公司條例》（第 622 章）在香港成立。
 * 名称与编号取自公司注册证明书与商业登记证，**逐字照抄，不得意译或简写**——
 * 法律文本里的缔约主体是用户据以起诉的对象，也是我方主张权利的名义。
 * 中文名用证书上的繁体写法（承澤，不是承泽）。
 *
 * 与国内站的主体一样硬编码在这里：公司登记资料是**公开记录**不是密钥，
 * 而放进环境变量会多出一个「忘配就构建失败」的部署步骤，收益为零。
 * 下方仍有一道非空断言，防止将来有人把字段改空而无人察觉。
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
    nameZh: '真善美承澤有限公司',
    nameEn: 'Zhen Shan Mei Grace Legacy Limited',
    // 公司注册证明书编号（Certificate of Incorporation No.）。
    // 商业登记号是 79530779-000-01-26-8，两者前八位相同但不是一回事，别混用。
    registrationNo: '79530779',
    registrationLabel: { zh: '公司注册编号', en: 'Company Registration No.' },
    registeredAddress: {
      zh: '香港九龍尖沙咀梳士巴利道 3 號星光行 7 樓 721A 室',
      en: 'Room 721A, 7/F, Star House, 3 Salisbury Road, Tsim Sha Tsui, Kowloon, Hong Kong',
    },
    contactEmail: process.env.NEXT_PUBLIC_AWD_INTL_CONTACT_EMAIL ?? 'hi@workdeck.ai',
    // 公司注册证明书上的发出日期，与注册编号同属公开记录
    incorporatedOn: '2026-01-05',
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

export const siteConfig: SiteConfig = ALL[SITE_ID];

/** Public same-site mutation origins; aliases share the existing Web AI CSRF policy. */
export const siteOrigins: readonly string[] = SITE_ID === 'cn'
  ? ['https://www.aiworkdeck.com', 'https://aiworkdeck.com']
  : ['https://www.workdeck.ai', 'https://workdeck.ai', 'https://www.aiworkdeck.us', 'https://aiworkdeck.us'];

export function siteConfigOf(id: SiteId): SiteConfig {
  return ALL[id];
}

/**
 * 只用于对外展示的主体字段（页脚 + 公司页），不含 `forum` / `governingLaw`。
 *
 * 少掉的这两个字段正是分界线：争议解决机构与适用法只出现在法律文本里，而法律文本的
 * 缔约主体**永远是站点自己的 `legalEntity`**。类型上就不给美国主体这两个字段，
 * 谁想把它插进条款正文都会直接类型报错。
 */
export type SitePublicEntity = Omit<SiteLegalEntity, 'forum' | 'governingLaw'>;

/** 美国主体名下的域名。与 workdeck.ai 是同一个国际站进程，不是第三个站点。 */
export const US_SITE_ORIGIN = 'https://www.aiworkdeck.us';

/**
 * aiworkdeck.us 的展示主体：美国特拉华州公司。
 *
 * ## 为什么不是第三个 SiteId
 * aiworkdeck.us 由**同一个国际站进程**承载（新加坡那台机上 nginx 多挂一个 vhost，
 * 反代到同一个 127.0.0.1:3000），美国 IP 访问 workdeck.ai 时由 nginx 301 到这里。
 * 所以 `SITE_ID` 仍是 `intl`，币种、支付通道、账户体系、API 契约一个都不分叉——
 * 分出第三个站点就得再来一套构建、一份数据、一遍契约矩阵，为了「页脚换个公司名」
 * 付这个代价没有道理。
 *
 * ## 分的只有两处
 * 页脚的主体行，和公司页 `/{lang}/about` 的主体资料——这两处的用途是给支付/平台
 * 做合规核验：核验方按**域名注册人**去找运营主体，.us 域名登记在美国公司名下，
 * 页上却只有香港公司，就对不上。
 *
 * ## 不分的是什么（改这里之前先读完）
 * - **法律文本的缔约主体仍是香港公司**：条款与隐私政策是既有用户已经接受过的合同，
 *   美国公司不是那份合同的当事人，换掉等于单方面替换缔约主体。`content/legal/*`
 *   一个字都不动，`SitePublicEntity` 的类型也保证它插不进去。
 * - **canonical / hreflang / sitemap / JSON-LD 的 url 仍指 workdeck.ai**：
 *   .us 是国际站的别名域，两边内容逐字相同，各自自指 canonical 就是重复内容。
 *
 * 字段照抄公开记录（特拉华州州务卿的公司注册档案），与香港主体同一条规矩：
 * 登记资料是公开记录不是密钥，硬编码在这里，别搬进环境变量。
 */
export const INTL_US_LEGAL_ENTITY: SitePublicEntity = {
  // 特拉华州的公司登记只有英文名，没有中文法定名——**留空串，不要填中文译名**：
  // 这页存在的意义是每一条都能在州务卿的查册里对上，译名对不上就是噪声。
  nameZh: '',
  nameEn: 'Zhen Shan Mei Grace Legacy US Limited',
  // Delaware File Number，法团成立证书（Certificate of Incorporation）上的档案编号
  registrationNo: '10745170',
  registrationLabel: { zh: '特拉华州公司档案编号', en: 'Delaware File Number' },
  registeredAddress: {
    zh: '美国特拉华州多佛市 The Green 8 号 STE A，邮编 19901',
    en: '8 The Green, STE A, Dover, DE 19901, United States',
  },
  contactEmail: 'legal@aiworkdeck.us',
  // 法团成立证书的提交日期
  incorporatedOn: '2026-08-24',
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
 * 配错的反代，展示一个与本站无关的美国公司比展示自己错得更厉害。
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
