'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, FileArchive, RefreshCw, Upload, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormNotice } from '@/components/ui/notice';
import { isLocale, LOCALE_META, toBaseLocale } from '@/i18n-config';

/**
 * 原生资源包（native pack）提交表单。
 * 契约见桌面端仓库 docs/NATIVE_PACK_DISTRIBUTION.md §8.1。
 *
 * 三步走，不是一次 multipart：
 *   1. POST /api/packs/submit    收 manifest 草案，拿 uploadToken
 *   2. PUT  /api/packs/upload    逐个归档以 octet-stream 流式上传
 *   3. POST /api/packs/finalize  触发受理检查
 *
 * 上传用 XHR 而不是 fetch：几百 MB 的包必须有逐字节进度，
 * 而 fetch 至今没有上传进度事件——没有进度条的十分钟等待等于故障。
 */

interface PackSubmission {
    id: string;
    version: string;
    status: 'pending' | 'approved' | 'rejected' | 'revoked';
    reviewNote?: string;
    totalSize: number;
    submittedAt: string;
}

interface DraftFile {
    name: string;
    size: number;
}

const STATUS_META: Record<
    PackSubmission['status'],
    { labelKey: 'statusPending' | 'statusApproved' | 'statusRejected' | 'statusRevoked'; className: string; Icon: typeof Clock }
> = {
    pending: { labelKey: 'statusPending', className: 'text-amber-700 bg-amber-50 border-amber-200', Icon: Clock },
    approved: { labelKey: 'statusApproved', className: 'text-emerald-700 bg-emerald-50 border-emerald-200', Icon: CheckCircle2 },
    rejected: { labelKey: 'statusRejected', className: 'text-neutral-600 bg-neutral-100 border-neutral-200', Icon: XCircle },
    revoked: { labelKey: 'statusRevoked', className: 'text-red-700 bg-red-50 border-red-200', Icon: AlertTriangle },
};

function formatSize(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function putFile(
    url: string,
    file: File,
    onProgress: (ratio: number) => void
): Promise<{ ok: boolean; message?: string }> {
    return new Promise(resolve => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', url);
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        xhr.upload.onprogress = e => {
            if (e.lengthComputable) onProgress(e.loaded / e.total);
        };
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                onProgress(1);
                resolve({ ok: true });
                return;
            }
            let message = '';
            try {
                message = JSON.parse(xhr.responseText)?.message || '';
            } catch {
                message = '';
            }
            resolve({ ok: false, message });
        };
        xhr.onerror = () => resolve({ ok: false });
        xhr.send(file);
    });
}

export function SubmitPackForm({ lang, t }: { lang: string; t: any }) {
    const [manifestText, setManifestText] = useState('');
    const [note, setNote] = useState('');
    const [files, setFiles] = useState<File[]>([]);
    const [busy, setBusy] = useState(false);
    const [phase, setPhase] = useState('');
    const [progress, setProgress] = useState<Record<string, number>>({});
    const [error, setError] = useState('');
    const [okMsg, setOkMsg] = useState('');
    const [mine, setMine] = useState<PackSubmission[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const loadMine = useCallback(async () => {
        const res = await fetch('/api/packs');
        if (!res.ok) return;
        const d = await res.json();
        setMine(d.packs || []);
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
        setBusy(true);
        setError('');
        setOkMsg('');
        setProgress({});
        try {
            setPhase(t.phaseSubmit);
            const res = await fetch('/api/packs/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ manifest: manifestText, note }),
            });
            const draft = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(draft.message || t.submitFailed);
                return;
            }

            // 组件归档必须一个不少：缺了也要等 finalize 才报错的话，
            // 用户会先白传几百兆再被告知选漏了文件
            const declared: DraftFile[] = draft.files || [];
            const missing = declared.filter(d => !files.some(f => f.name === d.name));
            if (missing.length) {
                setError(t.missingFiles.replace('{files}', missing.map(m => m.name).join(toBaseLocale(lang) === 'zh' ? '、' : ', ')));
                return;
            }

            for (const item of declared) {
                const file = files.find(f => f.name === item.name)!;
                setPhase(t.phaseUpload.replace('{file}', item.name));
                const url = `/api/packs/upload?token=${encodeURIComponent(draft.token)}&file=${encodeURIComponent(item.name)}`;
                const result = await putFile(url, file, ratio =>
                    setProgress(prev => ({ ...prev, [item.name]: ratio }))
                );
                if (!result.ok) {
                    setError(result.message || t.networkError);
                    return;
                }
            }

            setPhase(t.phaseFinalize);
            const finalizeRes = await fetch(`/api/packs/finalize?token=${encodeURIComponent(draft.token)}`, {
                method: 'POST',
            });
            const finalized = await finalizeRes.json().catch(() => ({}));
            if (!finalizeRes.ok) {
                setError(finalized.message || t.submitFailed);
                return;
            }
            setOkMsg(t.okMsg.replace('{id}', finalized.pack.id).replace('{version}', finalized.pack.version));
            setManifestText('');
            setNote('');
            setFiles([]);
            if (inputRef.current) inputRef.current.value = '';
            await loadMine();
        } catch {
            setError(t.networkError);
        } finally {
            setBusy(false);
            setPhase('');
        }
    };

    return (
        <div className="space-y-8">
            <section className="rounded-2xl border border-neutral-gray-light bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
                    <div>
                        <p className="font-medium">{t.warnTitle}</p>
                        <p className="mt-1 leading-relaxed">{t.warnBody}</p>
                    </div>
                </div>

                <h2 className="mb-3 font-medium text-neutral-dark-bg">{t.formatTitle}</h2>
                <p className="mb-2 text-sm text-neutral-gray-medium">{t.formatIntro}</p>
                <ul className="mb-5 space-y-1 text-sm text-neutral-gray-medium">
                    <li>· {t.rule1}</li>
                    <li>· {t.rule2}</li>
                    <li>· {t.rule3}</li>
                    <li>· {t.rule4}</li>
                    <li>· {t.rule5}</li>
                </ul>

                <label htmlFor="pack-manifest" className="text-sm font-medium text-neutral-gray-dark">
                    {t.manifestLabel}
                </label>
                <textarea
                    id="pack-manifest"
                    rows={12}
                    spellCheck={false}
                    value={manifestText}
                    onChange={e => setManifestText(e.target.value)}
                    placeholder={t.manifestPlaceholder}
                    className="mt-2 w-full rounded-lg border border-neutral-gray-light bg-white p-3 font-mono text-xs leading-relaxed text-neutral-gray-dark focus:outline-none focus:ring-2 focus:ring-king-mint"
                />
                <p className="mt-1.5 text-xs text-neutral-gray-medium">{t.manifestHint}</p>

                <label htmlFor="pack-note" className="mt-5 block text-sm font-medium text-neutral-gray-dark">
                    {t.noteLabel}
                </label>
                <textarea
                    id="pack-note"
                    rows={4}
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-neutral-gray-light bg-white p-3 text-sm leading-relaxed text-neutral-gray-dark focus:outline-none focus:ring-2 focus:ring-king-mint"
                />
                <p className="mt-1.5 text-xs text-neutral-gray-medium">{t.noteHint}</p>

                <label className="mt-5 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-gray-light p-8 transition hover:border-king-forest/40 hover:bg-neutral-gray-pale/50">
                    <FileArchive className="h-8 w-8 text-king-forest/50" strokeWidth={1.5} />
                    <span className="text-sm text-neutral-gray-dark">
                        {files.length ? t.filesPicked.replace('{n}', String(files.length)) : t.filePick}
                    </span>
                    <input
                        ref={inputRef}
                        type="file"
                        multiple
                        accept=".gz,.tgz,application/gzip"
                        className="hidden"
                        onChange={e => {
                            setFiles(Array.from(e.target.files || []));
                            setError('');
                            setOkMsg('');
                        }}
                    />
                </label>

                {files.length > 0 && (
                    <ul className="mt-3 space-y-2">
                        {files.map(f => {
                            const ratio = progress[f.name];
                            return (
                                <li key={f.name} className="text-xs text-neutral-gray-dark">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="truncate font-mono">{f.name}</span>
                                        <span className="shrink-0 tabular-nums text-neutral-gray-medium">
                                            {ratio === undefined
                                                ? formatSize(f.size)
                                                : `${Math.round(ratio * 100)}%`}
                                        </span>
                                    </div>
                                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-neutral-gray-light">
                                        <div
                                            className="h-full bg-king-forest transition-[width] duration-200"
                                            style={{ width: `${Math.round((ratio || 0) * 100)}%` }}
                                        />
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}

                {phase && <p className="mt-3 text-sm text-neutral-gray-medium">{phase}</p>}
                {error && (
                    <FormNotice variant="error" className="mt-3">{error}</FormNotice>
                )}
                {okMsg && (
                    <FormNotice variant="success" className="mt-3">{okMsg}</FormNotice>
                )}

                <Button
                    className="mt-4 font-bold"
                    disabled={busy || !manifestText.trim() || files.length === 0}
                    onClick={submit}
                >
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
                            return (
                                <li
                                    key={`${p.id}@${p.version}`}
                                    className="rounded-xl border border-neutral-gray-light bg-white p-4 shadow-sm"
                                >
                                    <div className="flex flex-wrap items-center gap-2">
                                        <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-600">
                                            {p.id}@{p.version}
                                        </code>
                                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${meta.className}`}>
                                            <meta.Icon className="h-3 w-3" />
                                            {t[meta.labelKey]}
                                        </span>
                                        <span className="text-xs text-neutral-gray-medium">{formatSize(p.totalSize)}</span>
                                        <span className="ml-auto text-xs text-neutral-gray-medium">
                                            {new Date(p.submittedAt).toLocaleString(isLocale(lang) ? LOCALE_META[lang].bcp47 : 'en-US')}
                                        </span>
                                    </div>
                                    {p.reviewNote && (
                                        <p className="mt-2 rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-gray-dark">
                                            {t.reviewNotePrefix}
                                            {p.reviewNote}
                                        </p>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>
        </div>
    );
}
