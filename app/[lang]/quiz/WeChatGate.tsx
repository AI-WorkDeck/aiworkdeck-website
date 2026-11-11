'use client';

import { useState } from 'react';
import { Check, Compass, Copy } from 'lucide-react';

/**
 * 微信内引导页（dev-board#329）：测试内容不进微信 webview，这里只做两件事——
 * 教人「在浏览器打开」+ 用一张样例结果卡当钩子。没有任何测试题、没有分享话术。
 */
export function WeChatGate({ t, url }: { t: any; url: string }) {
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
        } catch {
            // 老 WebView 没有 clipboard API：选中提示文本让用户手动复制
            setCopied(true);
        }
    };

    return (
        <div className="flex flex-col items-center gap-6">
            <div className="w-full rounded-xl border border-neutral-gray-light bg-white p-6 text-center">
                <Compass className="mx-auto h-8 w-8 text-king-forest" strokeWidth={1.5} />
                <h2 className="mt-3 font-display text-xl font-semibold text-neutral-dark-bg">{t.title}</h2>
                <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-neutral-gray-medium">{t.desc}</p>
                <button type="button" onClick={copy}
                    className="mt-5 inline-flex h-11 items-center gap-2 rounded-lg border border-king-forest px-6 text-[14px] font-bold text-king-forest transition-colors hover:bg-king-forest hover:text-white">
                    {copied ? <Check className="h-4 w-4" strokeWidth={2} /> : <Copy className="h-4 w-4" strokeWidth={1.75} />}
                    {copied ? t.copied : t.copy}
                </button>
                {copied && <p className="mt-2 break-all font-mono text-[12px] text-neutral-gray-medium">{url}</p>}
            </div>

            <div className="w-full">
                <p className="mb-3 text-center text-[13px] text-neutral-gray-medium">{t.preview}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/api/quiz/card?type=juanwang" alt="" width={540} height={720}
                    className="mx-auto w-full max-w-[340px] rounded-lg shadow-[0_30px_80px_-24px_rgba(46,90,80,0.45)]" />
            </div>
        </div>
    );
}
