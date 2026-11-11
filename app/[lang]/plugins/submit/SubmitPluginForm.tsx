'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Download, FileArchive, RefreshCw, Upload, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormNotice } from '@/components/ui/notice';
import { formatCrossCheckDetail } from '@/lib/plugin-scan';
import { siteConfig } from '@/lib/site-config';
import { isLocale, LOCALE_META } from '@/i18n-config';

/** 插件提交表单。契约见桌面端仓库 docs/PLUGIN_DISTRIBUTION.md §3。 */

interface SubmissionEntry {
    id: string;
    version: string;
    name: string;
    status: 'pending' | 'approved' | 'rejected' | 'revoked';
    reviewNote?: string;
    submittedAt: string;
    scan: { needsAttention: boolean; crossCheck: { kind: string; detail: string }[] };
}

const STATUS_META: Record<
    SubmissionEntry['status'],
    { labelKey: 'statusPending' | 'statusApproved' | 'statusRejected' | 'statusRevoked'; className: string; Icon: typeof Clock }
> = {
    pending: { labelKey: 'statusPending', className: 'text-amber-700 bg-amber-50 border-amber-200', Icon: Clock },
    approved: { labelKey: 'statusApproved', className: 'text-emerald-700 bg-emerald-50 border-emerald-200', Icon: CheckCircle2 },
    rejected: { labelKey: 'statusRejected', className: 'text-neutral-600 bg-neutral-100 border-neutral-200', Icon: XCircle },
    revoked: { labelKey: 'statusRevoked', className: 'text-red-700 bg-red-50 border-red-200', Icon: AlertTriangle },
};

export function SubmitPluginForm({ lang, t }: { lang: string; t: any }) {
    // 本站是否接受付费投稿。不接受时定价字段不渲染，priceYuan 恒为空串——
    // 也就是「不传 priceCents」，首次提交即免费，新版本沿用上一版标价（不做静默改价）。
    const paidAllowed = siteConfig.allowPaidSubmissions;
    const [file, setFile] = useState<File | null>(null);
    // 价格以元展示，提交时转分；0 = 免费
    // 默认留空：首次提交 = 免费；新版本 = 沿用上一版本标价（防止默认 0 把付费插件静默改免费）
    const [priceYuan, setPriceYuan] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [okMsg, setOkMsg] = useState('');
    const [mine, setMine] = useState<SubmissionEntry[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const loadMine = useCallback(async () => {
        const res = await fetch('/api/plugins');
        if (!res.ok) return;
        const d = await res.json();
        setMine(d.plugins || []);
    }, []);

    useEffect(() => {
        loadMine();
    }, [loadMine]);

    // 待审核期间自动跟进：审核是人工的，作者除了刷页面没有别的办法知道结果。
    // 全部提交都已终局就停掉——没有 pending 时轮询只是在白打接口。
    const hasPending = mine.some(p => p.status === 'pending');
    useEffect(() => {
        if (!hasPending) return;
        const timer = setInterval(() => { loadMine(); }, 30_000);
        return () => clearInterval(timer);
    }, [hasPending, loadMine]);

    const submit = async () => {
        if (!file) return;
        // 留空 = 不传价格：新版本沿用上一版本标价（服务端继承），显式填 0 才是改为免费
        const priceCents = priceYuan === '' ? undefined : Math.round(Number(priceYuan) * 100);
        if (priceCents !== undefined && (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 199900)) {
            setError(t.priceInvalid);
            return;
        }
        setBusy(true);
        setError('');
        setOkMsg('');
        try {
            const form = new FormData();
            form.append('file', file);
            if (priceCents !== undefined) form.append('priceCents', String(priceCents));
            const res = await fetch('/api/plugins', { method: 'POST', body: form });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(d.message || t.submitFailed);
                return;
            }
            setOkMsg(t.okMsg.replace('{id}', d.plugin.id).replace('{version}', d.plugin.version));
            setFile(null);
            if (inputRef.current) inputRef.current.value = '';
            await loadMine();
        } catch {
            setError(t.networkError);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-8">
            <section className="rounded-2xl border border-neutral-gray-light bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
                    <div>
                        <p className="font-medium">{t.warnTitle}</p>
                        <p className="mt-1 leading-relaxed">
                            {t.warnBodyA}<code className="font-mono">permissions</code>{t.warnBodyB}
                        </p>
                    </div>
                </div>

                <h2 className="mb-3 font-medium text-neutral-dark-bg">{t.formatTitle}</h2>
                <p className="mb-2 text-sm text-neutral-gray-medium">
                    {t.formatIntroA}<strong className="font-medium text-neutral-dark-bg">{t.formatIntroStrong}</strong>
                    {t.formatIntroB}
                </p>
                <pre className="mb-4 overflow-x-auto rounded-lg bg-neutral-50 p-4 font-mono text-xs leading-relaxed text-neutral-700">
{`${t.treeRoot}
├── manifest.json      ${t.treeManifest}
├── <your>.jar         ${t.treeJar}
├── web/               ${t.treeWeb}
└── <skill-dir>/       ${t.treeSkillDir}`}
                </pre>
                <ul className="mb-5 space-y-1 text-sm text-neutral-gray-medium">
                    <li>· {t.rule1}</li>
                    <li>· <code className="font-mono">id</code>{t.rule2}</li>
                    <li>· {t.rule3a}<code className="font-mono">version</code>{t.rule3b}</li>
                    <li>
                        · {t.rule4a}<code className="font-mono">backendJars</code>{t.rule4b}
                        <code className="font-mono">frontendEntry</code>{t.rule4c}
                    </li>
                </ul>

                {/* Web 插件：只在这里点到为止，方法表与开发流程在开发指南页，别把提交页写成第二份文档 */}
                <div className="mb-5 rounded-lg border border-neutral-gray-light bg-neutral-gray-pale/60 p-4">
                    <p className="mb-1.5 font-medium text-neutral-dark-bg">{t.webTitle}</p>
                    <p className="text-sm leading-relaxed text-neutral-gray-medium">
                        {t.webBody1a}<code className="font-mono">web/</code>{t.webBody1b}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-neutral-gray-medium">{t.webBody2}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                        <a
                            href="/api/plugins/template?type=web"
                            download
                            className="inline-flex items-center gap-1.5 font-medium text-king-forest underline underline-offset-4"
                        >
                            <Download className="h-4 w-4" strokeWidth={1.8} />
                            {t.webTemplateBtn}
                        </a>
                        <a
                            href={`/${lang}/plugins/develop`}
                            className="text-neutral-gray-medium underline underline-offset-4 hover:text-neutral-dark-bg"
                        >
                            {t.webDocLink}
                        </a>
                    </div>
                </div>

                <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-gray-light p-8 transition hover:border-king-forest/40 hover:bg-neutral-gray-pale/50">
                    <FileArchive className="h-8 w-8 text-king-forest/50" strokeWidth={1.5} />
                    <span className="text-sm text-neutral-gray-dark">
                        {file ? file.name : t.filePick}
                    </span>
                    {file && (
                        <span className="text-xs text-neutral-gray-medium">
                            {(file.size / 1024).toFixed(1)} KB
                        </span>
                    )}
                    <input
                        ref={inputRef}
                        type="file"
                        accept=".zip,application/zip"
                        className="hidden"
                        onChange={e => {
                            setFile(e.target.files?.[0] || null);
                            setError('');
                            setOkMsg('');
                        }}
                    />
                </label>

                {paidAllowed ? (
                    <div className="mt-4 flex max-w-xs flex-col gap-1.5">
                        <label htmlFor="plugin-price" className="text-sm font-medium text-neutral-gray-dark">
                            {t.priceLabel}
                        </label>
                        <input
                            id="plugin-price"
                            type="number"
                            min="0"
                            max="1999"
                            step="0.01"
                            value={priceYuan}
                            onChange={e => setPriceYuan(e.target.value)}
                            className="h-10 rounded-md border border-neutral-gray-light bg-white px-3 text-sm text-neutral-gray-dark focus:outline-none focus:ring-2 focus:ring-king-mint"
                        />
                        <p className="text-xs text-neutral-gray-medium">
                            {t.priceHint}
                        </p>
                    </div>
                ) : (
                    // 说明放在原本填价格的位置：别让人打完包上传了才发现不支持收费
                    <p className="mt-4 rounded-lg border border-neutral-gray-light bg-neutral-gray-pale px-4 py-3 text-sm leading-relaxed text-neutral-gray-dark">
                        {t.priceUnavailable}
                    </p>
                )}

                {error && (
                    <FormNotice variant="error" className="mt-3">{error}</FormNotice>
                )}
                {okMsg && (
                    <FormNotice variant="success" className="mt-3">{okMsg}</FormNotice>
                )}

                <Button className="mt-4 font-bold" disabled={!file || busy} onClick={submit}>
                    <Upload className="mr-1.5 h-4 w-4" />
                    {busy ? t.uploading : t.submitBtn}
                </Button>
            </section>

            <section>
                <div className="mb-3 flex items-center gap-3">
                    <h2 className="font-display text-xl font-semibold text-neutral-dark-bg">{t.mineTitle}</h2>
                    <button
                        type="button"
                        disabled={refreshing}
                        onClick={async () => {
                            setRefreshing(true);
                            try {
                                await loadMine();
                            } finally {
                                setRefreshing(false);
                            }
                        }}
                        className="ml-auto inline-flex items-center gap-1.5 text-sm text-neutral-gray-medium transition-colors hover:text-king-forest disabled:opacity-50"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} strokeWidth={1.75} />
                        {t.refreshBtn}
                    </button>
                </div>
                {hasPending && <p className="mb-3 text-xs text-neutral-gray-medium">{t.autoRefreshHint}</p>}
                {mine.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-neutral-gray-light p-8 text-center text-sm text-neutral-gray-medium">
                        {t.mineEmpty}
                    </p>
                ) : (
                    <ul className="space-y-3">
                        {mine.map(p => {
                            const meta = STATUS_META[p.status];
                            const undeclared = p.scan?.crossCheck?.filter(c => c.kind === 'undeclared') || [];
                            return (
                                <li
                                    key={`${p.id}@${p.version}`}
                                    className="rounded-xl border border-neutral-gray-light bg-white p-4 shadow-sm"
                                >
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-medium text-neutral-dark-bg">{p.name}</span>
                                        <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-600">
                                            {p.id}@{p.version}
                                        </code>
                                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${meta.className}`}>
                                            <meta.Icon className="h-3 w-3" />
                                            {t[meta.labelKey]}
                                        </span>
                                        <span className="ml-auto text-xs text-neutral-gray-medium">
                                            {new Date(p.submittedAt).toLocaleString(isLocale(lang) ? LOCALE_META[lang].bcp47 : 'en-US')}
                                        </span>
                                    </div>
                                    {p.reviewNote && (
                                        <p className="mt-2 rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-gray-dark">
                                            {t.reviewNotePrefix}{p.reviewNote}
                                        </p>
                                    )}
                                    {p.status === 'pending' && undeclared.length > 0 && (
                                        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                                            <p className="font-medium">{t.scanWarnTitle}</p>
                                            <ul className="mt-1 space-y-0.5">
                                                {undeclared.map((c, i) => (
                                                    <li key={i}>· {formatCrossCheckDetail(c, lang)}</li>
                                                ))}
                                            </ul>
                                            <p className="mt-1 text-xs opacity-80">
                                                {t.scanWarnHint}
                                            </p>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            <p className="text-center text-sm text-neutral-gray-medium">
                {t.footA}<a href={`/${lang}/skills/submit`} className="underline underline-offset-2">{t.footLink}</a>{t.footB}
            </p>
        </div>
    );
}
