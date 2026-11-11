import { Fragment, type ReactNode } from 'react';
import type { LegalBlock, LegalDocument } from '@/content/legal/types';
import { PageHero } from '@/components/layout/PageHero';

/**
 * 法律文本渲染件。服务端组件，无交互——这两页不需要任何 JS。
 *
 * 行内只认 `**加粗**`，自己切分后渲染成 <strong>，不用 dangerouslySetInnerHTML：
 * 法律文本正是最不该给 XSS 留口子的地方。
 */

function Inline({ text }: { text: string }) {
    // 按 ** 切分，奇数段即为强调段
    const parts = text.split('**');
    return (
        <>
            {parts.map((part, i) =>
                i % 2 === 1 ? (
                    <strong key={i} className="font-bold text-neutral-dark-bg">
                        {part}
                    </strong>
                ) : (
                    <Fragment key={i}>{part}</Fragment>
                )
            )}
        </>
    );
}

function Block({ block }: { block: LegalBlock }) {
    if (block.type === 'p') {
        return (
            <p className="text-[15px] leading-[1.95] text-neutral-gray-dark">
                <Inline text={block.text} />
            </p>
        );
    }

    if (block.type === 'ul') {
        return (
            <ul className="flex flex-col gap-2.5">
                {block.items.map((item, i) => (
                    <li key={i} className="relative ps-5 text-[15px] leading-[1.95] text-neutral-gray-dark">
                        <span className="absolute start-0 top-[0.85em] h-px w-2.5 bg-king-forest/40" />
                        <Inline text={item} />
                    </li>
                ))}
            </ul>
        );
    }

    if (block.type === 'callout') {
        return (
            <div className="border-s-2 border-king-forest bg-king-forest-lightest/40 py-4 ps-5 pe-4">
                <p className="text-[15px] leading-[1.95] text-neutral-gray-dark">
                    <Inline text={block.text} />
                </p>
            </div>
        );
    }

    return (
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[34rem] border-collapse text-start text-[13px]">
                <thead>
                    <tr className="border-b-2 border-neutral-gray-light">
                        {block.head.map(h => (
                            <th key={h} className="py-2.5 pe-5 font-medium text-neutral-gray-medium last:pe-0">
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {block.rows.map((row, i) => (
                        <tr key={i} className="border-b border-neutral-gray-light/70 align-top">
                            {row.map((cell, j) => (
                                <td
                                    key={j}
                                    className="py-3 pe-5 leading-[1.75] text-neutral-gray-dark last:pe-0"
                                >
                                    {cell}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function LegalDoc({ doc, referenceNotice, relatedResources }: { doc: LegalDocument; referenceNotice?: string; relatedResources?: ReactNode }) {
    return (
        <div className="min-h-screen bg-neutral-gray-pale pb-24">
            <PageHero size="compact" width="6xl" eyebrow={doc.eyebrow} title={doc.title} subtitle={doc.summaryLead ? `${doc.summaryLead} ${doc.effectiveLabel}` : doc.effectiveLabel}>{relatedResources}</PageHero>
            {/* 与 PageHero 同一根轴：container + max-w-6xl 同写在一层，内边距一致 */}
            <div className="container mx-auto max-w-6xl px-4 pt-10 md:px-8 md:pt-12">
                {referenceNotice && (
                    <aside
                        role="note"
                        className="mb-8 max-w-3xl rounded-xl border border-king-forest/20 bg-king-mint-lightest/60 px-5 py-3.5 text-[13.5px] leading-relaxed text-neutral-gray-dark"
                    >
                        {referenceNotice}
                    </aside>
                )}
                {!doc.summaryLead && <p className="max-w-3xl text-[15px] leading-[1.95] text-neutral-gray-dark">{doc.intro}</p>}

                {/* 重点提示：格式条款的提示义务落在这里，位置必须在正文之前 */}
                <section className="mt-10 max-w-3xl rounded-xl border border-king-forest/25 bg-white p-6 md:p-8">
                    <h2 className="font-display mb-5 text-lg font-semibold text-neutral-dark-bg">
                        {doc.highlightsTitle}
                    </h2>
                    <ul className="flex flex-col gap-4">
                        {doc.highlights.map((item, i) => (
                            <li key={i} className="flex gap-3.5">
                                <span className="font-display mt-[0.15em] flex-shrink-0 text-[13px] font-bold tabular-nums text-king-forest">
                                    {String(i + 1).padStart(2, '0')}
                                </span>
                                <p className="text-[15px] leading-[1.9] text-neutral-gray-dark">
                                    <Inline text={item} />
                                </p>
                            </li>
                        ))}
                    </ul>
                </section>

                <div className="mt-12 flex flex-col gap-10 lg:flex-row lg:gap-14">
                    {/* 目录：宽屏常驻左栏，窄屏折到正文之上 */}
                    <nav className="lg:sticky lg:top-28 lg:h-fit lg:w-60 lg:flex-shrink-0">
                        <p className="mb-4 text-[11px] uppercase tracking-[0.2em] text-neutral-gray-medium">
                            {doc.tocTitle}
                        </p>
                        <ol className="flex flex-col gap-2.5 border-s border-neutral-gray-light ps-4">
                            {doc.sections.map(s => (
                                <li key={s.id}>
                                    <a
                                        href={`#${s.id}`}
                                        className="block text-[13px] leading-snug text-neutral-gray-medium transition-colors hover:text-king-forest"
                                    >
                                        {s.title}
                                    </a>
                                </li>
                            ))}
                        </ol>
                    </nav>

                    <article className="min-w-0 max-w-3xl flex-1">
                        {doc.sections.map(section => (
                            <section
                                key={section.id}
                                id={section.id}
                                className="mb-12 scroll-mt-28 border-t border-neutral-gray-light pt-8 first:border-t-0 first:pt-0"
                            >
                                <h2 className="font-display mb-5 text-2xl font-semibold tracking-tight text-neutral-dark-bg">
                                    {section.title}
                                </h2>
                                <div className="flex flex-col gap-5">
                                    {section.blocks.map((block, i) => (
                                        <Block key={i} block={block} />
                                    ))}
                                </div>
                            </section>
                        ))}
                    </article>
                </div>
            </div>
        </div>
    );
}
