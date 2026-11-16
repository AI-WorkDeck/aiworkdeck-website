/**
 * 运营主体信息——法律文本、页脚备案信息的唯一来源。
 *
 * 值本身不再写在这里：各站点由同一公司运营，分站联系资料仍各自保留，
 * 真正的单一来源是 `lib/site-config.ts`。本文件保留
 * 导出名与字段名不变，仅作派生层，这样 Footer 与四份境内法律文本无需改动。
 *
 * **不要在页面里散写公司名。** 要加字段先加在 SiteLegalEntity 上。
 */

import { siteConfig, SITE_LEGAL_EFFECTIVE_DATE } from '@/lib/site-config';

export const LEGAL_ENTITY = {
    /** 登记的中文法定名称 */
    nameZh: siteConfig.legalEntity.nameZh,
    /** 英文/拉丁字母名称。采用用户指定的英文名称 */
    nameEn: siteConfig.legalEntity.nameEn,
    /**
     * 统一社会信用代码。法律文本通过 siteConfig.legalEntity.registrationLabel 取字段称呼。
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
