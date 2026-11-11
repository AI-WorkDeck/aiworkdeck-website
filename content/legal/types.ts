/**
 * 法律文本的结构化表示。
 *
 * 不用 Markdown 字符串：这两份文本要求「以显著方式提示」若干条款（《民法典》第四百九十六条），
 * 提示到不到位是可诉的，所以强调必须是结构里的一等公民（callout / **加粗**），
 * 不能指望渲染管线碰巧把它加粗了。
 *
 * 行内只支持 `**加粗**` 一种标记，由 LegalDoc 自行解析，不走 HTML 注入。
 */

export type LegalBlock =
    | { type: 'p'; text: string }
    | { type: 'ul'; items: string[] }
    /** 需要「显著方式」提示的条款，渲染为品牌色左边线的提示框 */
    | { type: 'callout'; text: string }
    | { type: 'table'; head: string[]; rows: string[][] };

export interface LegalSection {
    /** 锚点与目录用，跨语种保持一致 */
    id: string;
    title: string;
    blocks: LegalBlock[];
}

export interface LegalDocument {
    title: string;
    /** 页面眉标 */
    eyebrow: string;
    /** 标题下的一段导语 */
    intro: string;
    /** 页头副题：把要点说完整的一句。给了就替代正文里的 `intro` 铺垫段（intro 仍用于 meta description） */
    summaryLead?: string;
    /** 顶部「重点提示」区，满足格式条款的提示义务 */
    highlightsTitle: string;
    highlights: string[];
    tocTitle: string;
    effectiveLabel: string;
    sections: LegalSection[];
}
