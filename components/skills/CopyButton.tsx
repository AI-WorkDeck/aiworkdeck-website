'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function CopyButton({ text, label, copiedLabel }: { text: string; label: string; copiedLabel: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // 剪贴板不可用时静默失败
        }
    };

    return (
        <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-neutral-gray-light bg-white text-neutral-gray-dark hover:border-king-forest hover:text-king-forest transition-colors cursor-pointer"
        >
            {copied ? <Check className="w-3.5 h-3.5 text-king-mint" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? copiedLabel : label}
        </button>
    );
}
