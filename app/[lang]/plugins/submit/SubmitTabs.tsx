'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Info } from 'lucide-react';
import { SubmitPluginForm } from './SubmitPluginForm';
import { SubmitPackForm } from './SubmitPackForm';

/**
 * 提交页的两种形态：JAR 插件与原生资源包。
 *
 * 同页同视觉而不是两个入口：对提交者来说这是同一件事的两种载荷
 * （代码 / 资源），分成两个页面只会让人先猜自己该去哪个页面。
 * 标题与说明随页签走——两者的受理规则差得远，共用一段介绍会误导。
 */
export function SubmitTabs({ lang, pluginT, packT, developerApproved }: { lang: string; pluginT: any; packT: any; developerApproved: boolean }) {
    const [tab, setTab] = useState<'plugin' | 'pack'>('plugin');
    const t = tab === 'plugin' ? pluginT : packT;

    return (
        <>
            <div className="mb-8 flex items-center gap-6 border-b border-neutral-gray-light">
                {(['plugin', 'pack'] as const).map(key => (
                    <button
                        key={key}
                        onClick={() => setTab(key)}
                        className={`-mb-px border-b-2 pb-3 text-sm transition-colors ${
                            tab === key
                                ? 'border-king-forest font-medium text-king-forest'
                                : 'border-transparent text-neutral-gray-medium hover:text-neutral-gray-dark'
                        }`}
                    >
                        {key === 'plugin' ? packT.tabPlugin : packT.tabPack}
                    </button>
                ))}
            </div>

            {/* 页级 h1 已上移到 PageHero；这里是随页签切换的分叉标题 */}
            <h2 className="mb-2 font-display text-2xl font-semibold text-neutral-dark-bg">{t.title}</h2>
            <p className="mb-5 text-neutral-gray-medium">{t.intro}</p>

            {/* 受理机制：等多久、结果去哪看。不写清楚，提交完就是无限期的沉默。
                文案随页签走——插件与资源包的审核口径不同。 */}
            <div className="mb-8 flex items-start gap-2.5 rounded-lg border border-neutral-gray-light bg-white px-4 py-3 text-sm leading-relaxed text-neutral-gray-dark">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-king-forest/70" strokeWidth={1.75} />
                <p>{t.reviewNotice}</p>
            </div>

            {tab === 'plugin' ? (
                developerApproved ? <SubmitPluginForm lang={lang} t={pluginT} /> : <div className="rounded-xl border border-neutral-gray-light bg-white p-5"><p>{pluginT.developerNoticeBody}</p><Link className="mt-3 inline-block text-king-forest underline" href={`/${lang}/plugins/developer`}>{pluginT.developerNoticeLink}</Link></div>
            ) : (
                <SubmitPackForm lang={lang} t={packT} />
            )}
        </>
    );
}
