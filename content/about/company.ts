import { toBaseLocale, type BaseLocale, type Locale } from '@/i18n-config';

/**
 * 公司页（`/{lang}/about`）的文案。
 *
 * 只登载**可公开查证**的事实：登记机关档案上的名称、编号、成立日期、注册办事处，
 * 以及记录在案的人员身份。写在这里的每一条都要能在对应的登记机关对上——这页存在的
 * 意义就是给支付、平台、供应商的合规核验当作「公开来源」引用，写一条对不上的等于
 * 把整页作废。
 *
 * **两份文案、两个登记机关**：
 * - `ABOUT_COPY`（香港）→ 公司注册处网上查册中心（ICRIS），www.workdeck.ai 上渲染
 * - `ABOUT_COPY_US`（美国）→ 特拉华州州务卿公司司的公司查询，www.aiworkdeck.us 上渲染
 * 选哪一份由请求的 Host 决定（见 `lib/request-entity.ts`），页面本身是同一个。
 * 两边的措辞刻意不同：香港那边有董事登记可依，美国这边公开档案上只有发起人
 * （incorporator），所以**只写发起人，不写董事、不写高管**——公开记录里没有的头衔，
 * 这页一个字都不能给。
 *
 * 主体字段（名称/编号/地址/成立日期）不在这里重复，一律从 `lib/site-config.ts` 取；
 * 这里只放**标签**与叙述性文字。
 */

export interface AboutPerson {
    /** 拉丁字母姓名，与登记记录一致（HAN Zewei → Zewei Han） */
    name: string;
    /**
     * 另一种写法的姓名（英文页放中文名，中文页放拉丁字母名）。
     * 香港那份照抄证书上的繁体（韓澤偉）；特拉华州的档案没有中文名，
     * 那份用简体（韩泽伟），只作辨识用，不声称是登记名称。
     */
    nameAlt: string;
    role: string;
    paragraphs: string[];
}

export interface AboutCopy {
    eyebrow: string;
    title: string;
    intro: string;

    peopleTitle: string;
    people: AboutPerson[];
    contactLabel: string;

    companyTitle: string;
    labels: {
        nameEn: string;
        nameZh: string;
        incorporated: string;
        registeredOffice: string;
        website: string;
        contact: string;
    };
    /** 成立日期后缀：成立地与所依据的条例 */
    incorporationPlace: string;

    registryTitle: string;
    registryText: string;
    registryLinkLabel: string;
}

/** 香港公司注册处网上查册中心 */
export const HK_REGISTRY_URL = 'https://www.icris.cr.gov.hk/';

const EN: AboutCopy = {
    eyebrow: 'About',
    title: 'The company behind AI WorkDeck',
    intro:
        'AI WorkDeck is a desktop AI workspace built for lawyers and in-house legal teams. It is a product and trading name of Zhen Shan Mei Grace Legacy Limited, a private company limited by shares incorporated in Hong Kong, which owns and operates this website.',

    peopleTitle: 'Founder and authorised representative',
    people: [
        {
            name: 'Zewei Han',
            nameAlt: '韓澤偉',
            role: 'Founder and Director, Zhen Shan Mei Grace Legacy Limited',
            paragraphs: [
                'Zewei Han founded AI WorkDeck. He is a director of Zhen Shan Mei Grace Legacy Limited, the Hong Kong company that owns and operates www.workdeck.ai, and is recorded as a founder member and director of that company with the Companies Registry of Hong Kong.',
                'He is authorised to represent the company in its business relationships, including accounts opened in the company’s name with payment, distribution and cloud service providers.',
                'A lawyer by background, he leads product and engineering for AI WorkDeck.',
            ],
        },
    ],
    contactLabel: 'Contact',

    companyTitle: 'Company details',
    labels: {
        nameEn: 'Registered name (English)',
        nameZh: 'Registered name (Chinese)',
        incorporated: 'Incorporated',
        registeredOffice: 'Registered office',
        website: 'Website',
        contact: 'Contact',
    },
    incorporationPlace: 'in Hong Kong under the Companies Ordinance (Cap. 622)',

    registryTitle: 'Verifying these details',
    registryText:
        'The particulars above are a matter of public record. They can be confirmed through the Companies Registry of Hong Kong, by searching the Cyber Search Centre (ICRIS) for the registered name or the company registration number shown above. For any further evidence of the association between the company and the representative named on this page, write to us at the address below.',
    registryLinkLabel: 'Companies Registry of Hong Kong (ICRIS)',
};

const ZH: AboutCopy = {
    eyebrow: '关于我们',
    title: 'AI WorkDeck 的运营主体',
    intro:
        'AI WorkDeck 是面向律师与法务团队的桌面 AI 工作台，是真善美承澤有限公司的产品与经营品牌。该公司为在香港注册成立的私人股份有限公司，拥有并运营本网站。',

    peopleTitle: '创始人与授权代表',
    people: [
        {
            name: '韓澤偉',
            nameAlt: 'Zewei Han',
            role: '真善美承澤有限公司 创始人、董事',
            paragraphs: [
                '韓澤偉创立 AI WorkDeck，并担任真善美承澤有限公司董事。该公司拥有并运营 www.workdeck.ai，其创办成员与董事登记均载于香港公司注册处的记录。',
                '他有权代表公司处理对外业务关系，包括以公司名义在支付、分发与云服务商处开立的账户。',
                '他是法律从业者出身，负责 AI WorkDeck 的产品与研发。',
            ],
        },
    ],
    contactLabel: '联系方式',

    companyTitle: '主体资料',
    labels: {
        nameEn: '注册英文名称',
        nameZh: '注册中文名称',
        incorporated: '成立日期',
        registeredOffice: '注册办事处',
        website: '网站',
        contact: '联系邮箱',
    },
    incorporationPlace: '于香港依《公司條例》（第 622 章）成立',

    registryTitle: '如何查证',
    registryText:
        '以上资料均为公开记录，可在香港公司注册处「网上查册中心（ICRIS）」按上述注册名称或公司注册编号查询核对。如需进一步的关联证明文件，请通过下方邮箱与我们联系。',
    registryLinkLabel: '香港公司注册处 网上查册中心（ICRIS）',
};

export const ABOUT_COPY: Record<BaseLocale, AboutCopy> & Partial<Record<Locale, AboutCopy>> = { en: EN, zh: ZH };

/**
 * 国内站（www.aiworkdeck.com）公司页：只登载站内法律文本已公开、可在
 * 国家企业信用信息公示系统核对的事实（名称、统一社会信用代码、住所、联系邮箱）。
 * 国内主体的人员登记文件不在手边，**不写人员与职务**（people 为空，页面不渲染该节）。
 */
export const CN_REGISTRY_URL = 'https://www.gsxt.gov.cn/';

const CN_ZH: AboutCopy = {
    eyebrow: '关于我们',
    title: 'AI WorkDeck 国内站的运营主体',
    intro: 'AI WorkDeck 是为律师与法务团队打造的开源 AI 工作台。国内站 www.aiworkdeck.com 由北京京微资易科技有限公司运营，下列主体信息可在国家企业信用信息公示系统核对。',
    peopleTitle: '',
    people: [],
    contactLabel: '联系',
    companyTitle: '主体信息',
    labels: { nameEn: '英文名称', nameZh: '公司名称', incorporated: '成立日期', registeredOffice: '住所', website: '网站', contact: '联系邮箱' },
    incorporationPlace: '',
    registryTitle: '如何核对',
    registryText: '在国家企业信用信息公示系统按公司名称或统一社会信用代码查询，即可看到登记机关的公开记录。',
    registryLinkLabel: '国家企业信用信息公示系统 →',
};

const CN_EN: AboutCopy = {
    eyebrow: 'About',
    title: 'The company operating AI WorkDeck in mainland China',
    intro: 'AI WorkDeck is an open-source AI workspace for lawyers and legal teams. The mainland China site, www.aiworkdeck.com, is operated by Beijing Jingwei Ziyi Technology Co., Ltd.; the details below can be checked in the National Enterprise Credit Information Publicity System.',
    peopleTitle: '',
    people: [],
    contactLabel: 'Contact',
    companyTitle: 'Company details',
    labels: { nameEn: 'English name', nameZh: 'Registered name', incorporated: 'Incorporated', registeredOffice: 'Registered address', website: 'Website', contact: 'Contact email' },
    incorporationPlace: '',
    registryTitle: 'How to verify',
    registryText: 'Search the National Enterprise Credit Information Publicity System by company name or Unified Social Credit Code to see the registry’s public record.',
    registryLinkLabel: 'National Enterprise Credit Information Publicity System →',
};

export const ABOUT_COPY_CN: Record<BaseLocale, AboutCopy> & Partial<Record<Locale, AboutCopy>> = { en: CN_EN, zh: CN_ZH };

/**
 * 特拉华州州务卿 公司司（Division of Corporations）的公司查询。
 * 按名称或档案编号都能查到——这页登载的两项正是为此。
 */
export const DE_REGISTRY_URL = 'https://icis.corp.delaware.gov/ecorp/entitysearch/namesearch.aspx';

/**
 * 美国主体的公司页文案，在 www.aiworkdeck.us 上渲染。
 *
 * 与香港那份的差别只在两处，其余结构逐字对齐：
 * 1. 人员身份写**发起人（incorporator）**——法团成立证书上载明的就是这一项。
 *    公开档案里没有董事或高管的同意书，所以不写「董事」「officer」。
 * 2. 没有中文法定名称，`labels.nameZh` 那一行由页面按 `entity.nameZh` 是否为空跳过，
 *    不在这里放空值凑行数。
 */
const US_EN: AboutCopy = {
    eyebrow: 'About',
    title: 'The company behind AI WorkDeck',
    intro:
        'AI WorkDeck is a desktop AI workspace built for lawyers and in-house legal teams. It is a product and trading name of Zhen Shan Mei Grace Legacy US Limited, a stock corporation incorporated in the State of Delaware, United States, which owns and operates this website.',

    peopleTitle: 'Founder and representative',
    people: [
        {
            name: 'Zewei Han',
            nameAlt: '韩泽伟',
            role: 'Founder and Incorporator, Zhen Shan Mei Grace Legacy US Limited',
            paragraphs: [
                'Zewei Han founded AI WorkDeck. He is named as the incorporator of Zhen Shan Mei Grace Legacy US Limited in the Certificate of Incorporation filed with the Delaware Division of Corporations on 24 August 2026. That company owns and operates www.aiworkdeck.us.',
                'He represents the company in its business relationships, including accounts opened in the company’s name with cloud, domain, email and code-signing service providers such as Alibaba Cloud US, Zoho and Microsoft Azure.',
                'A lawyer by background, he leads product and engineering for AI WorkDeck.',
            ],
        },
    ],
    contactLabel: 'Contact',

    companyTitle: 'Company details',
    labels: {
        nameEn: 'Registered name (English)',
        nameZh: 'Registered name (Chinese)',
        incorporated: 'Incorporated',
        registeredOffice: 'Registered office',
        website: 'Website',
        contact: 'Contact',
    },
    incorporationPlace: 'in the State of Delaware, United States, under the Delaware General Corporation Law',

    registryTitle: 'Verifying these details',
    registryText:
        'The particulars above are a matter of public record. They can be confirmed through the Delaware Division of Corporations, by searching its entity search for the registered name or the Delaware file number shown above. For any further evidence of the association between the company and the representative named on this page, write to us at the address below.',
    registryLinkLabel: 'Delaware Division of Corporations — entity search',
};

const US_ZH: AboutCopy = {
    eyebrow: '关于我们',
    title: 'AI WorkDeck 的运营主体',
    intro:
        'AI WorkDeck 是面向律师与法务团队的桌面 AI 工作台，是 Zhen Shan Mei Grace Legacy US Limited 的产品与经营品牌。该公司为在美国特拉华州注册成立的股份公司（stock corporation），拥有并运营本网站。',

    peopleTitle: '创始人与代表人',
    people: [
        {
            name: '韩泽伟',
            nameAlt: 'Zewei Han',
            role: 'Zhen Shan Mei Grace Legacy US Limited 创始人、公司发起人（Incorporator）',
            paragraphs: [
                '韩泽伟创立 AI WorkDeck。2026 年 8 月 24 日向美国特拉华州州务卿公司司提交的法团成立证书（Certificate of Incorporation）载明他为该公司的发起人（incorporator）。该公司拥有并运营 www.aiworkdeck.us。',
                '他代表公司处理对外业务关系，包括以公司名义在云服务、域名、邮箱与代码签名服务商处开立的账户（如 Alibaba Cloud US、Zoho、Microsoft Azure）。',
                '他是法律从业者出身，负责 AI WorkDeck 的产品与研发。',
            ],
        },
    ],
    contactLabel: '联系方式',

    companyTitle: '主体资料',
    labels: {
        nameEn: '注册英文名称',
        nameZh: '注册中文名称',
        incorporated: '成立日期',
        registeredOffice: '注册办事处',
        website: '网站',
        contact: '联系邮箱',
    },
    incorporationPlace: '于美国特拉华州依《特拉华州普通公司法》（DGCL）成立',

    registryTitle: '如何查证',
    registryText:
        '以上资料均为公开记录，可在美国特拉华州州务卿公司司的公司查询中，按上述注册名称或特拉华州公司档案编号查询核对。如需进一步的关联证明文件，请通过下方邮箱与我们联系。',
    registryLinkLabel: '美国特拉华州州务卿 公司司 公司查询',
};

export const ABOUT_COPY_US: Record<BaseLocale, AboutCopy> & Partial<Record<Locale, AboutCopy>> = { en: US_EN, zh: US_ZH };

const MONTHS_EN = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * 成立日期的显示形式。自己按字段拼，不走 `toLocaleDateString`：
 * `new Date('2026-01-05')` 按 UTC 解析、再按运行时时区格式化，服务器时区一变就差一天，
 * 而这是要被拿去和登记证书逐字比对的字段。
 */
export function formatIncorporationDate(iso: string, lang: Locale): string {
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return iso;
    return toBaseLocale(lang) === 'en' ? `${d} ${MONTHS_EN[m - 1]} ${y}` : `${y} 年 ${m} 月 ${d} 日`;
}
