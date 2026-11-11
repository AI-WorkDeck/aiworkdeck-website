/**
 * 运营主体信息——法律文本、页脚备案信息的唯一来源。
 *
 * 值本身不再写在这里：双站架构下缔约主体随站点而变（境内是北京实体，
 * 国际站是香港实体），真正的单一来源是 `lib/site-config.ts`。本文件保留
 * 导出名与字段名不变，仅作派生层，这样 Footer 与四份境内法律文本无需改动。
 *
 * **不要在页面里散写公司名。** 要加字段先加在 SiteLegalEntity 上。
 */

import { siteConfig, SITE_LEGAL_EFFECTIVE_DATE } from '@/lib/site-config';

export const LEGAL_ENTITY = {
    /** 登记的中文法定名称；境外主体没有中文名时为空串（页脚按 showChineseEntityName 决定是否渲染） */
    nameZh: siteConfig.legalEntity.nameZh,
    /** 英文/拉丁字母名称。国际站的法律文本以这一个为准，中文文本里也用它 */
    nameEn: siteConfig.legalEntity.nameEn,
    /**
     * 注册号。境内是统一社会信用代码，香港是公司注册编号——字段名沿用 `uscc`
     * 是为了不打断四份境内文本的调用；文本里该称呼什么，用
     * `siteConfig.legalEntity.registrationLabel` 取。
     */
    uscc: siteConfig.legalEntity.registrationNo,
    contactEmail: siteConfig.legalEntity.contactEmail,
    /** 本站主域名 */
    site: siteConfig.host,

    /**
     * 工信部 ICP 备案号。境内服务器面向公众提供服务必须在首页底部标明
     * （《互联网信息服务管理办法》第十二条）；国际站为空串，页脚不渲染。
     */
    icpFiling: siteConfig.icpFiling,
    /** 公安机关联网备案号（可选）；留空则页脚不渲染该行 */
    publicSecurityFiling: siteConfig.publicSecurityFiling,
} as const;

/** 本站法律文本的生效日期，页面与正文共用 */
export const LEGAL_EFFECTIVE_DATE = SITE_LEGAL_EFFECTIVE_DATE;
