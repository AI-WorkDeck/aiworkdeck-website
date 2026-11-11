'use client';

import { useCallback, useEffect, useState } from 'react';
import { Locale, LOCALE_META } from '@/i18n-config';
import { Button } from '@/components/ui/button';
import { KeyRound } from 'lucide-react';

interface ApiKeyInfo {
    id: number;
    prefix: string;
    createdAt: string;
    label: string | null;
}

export function DesktopConnectSection({ lang, dict }: { lang: Locale; dict: any }) {
    const t = dict.accountPage;
    const [keys, setKeys] = useState<ApiKeyInfo[] | null>(null);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/account/keys');
            if (!res.ok) throw new Error('load failed');
            const data = await res.json();
            setKeys(data.keys);
            setError('');
        } catch {
            setError(t.loadFailed);
        }
    }, [t.loadFailed]);

    useEffect(() => {
        load();
    }, [load]);

    const handleRevoke = async (id: number) => {
        if (!window.confirm(t.revokeConfirm)) return;
        try {
            const res = await fetch(`/api/account/keys/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('revoke failed');
            await load();
        } catch {
            setError(t.loadFailed);
        }
    };

    const dateLocale = LOCALE_META[lang].bcp47;

    return (
        <div className="bg-white border border-[#dce2de] rounded-xl p-6 md:p-8 shadow-sm mb-10">
            <div className="flex items-center gap-3 mb-2">
                <KeyRound className="w-5 h-5 text-king-forest" strokeWidth={1.75} />
                <h2 className="font-display text-xl font-semibold text-neutral-dark-bg">{t.devicesTitle}</h2>
            </div>
            {/* 这一栏此前是「生成 Key 粘到桌面端」。桌面端 v0.18.0 起直接用手机号/邮箱登录，
                Key 由服务端在登录时自动签发，用户不再需要看到它，所以生成流程整个删掉了。
                列表本身留着并改成设备口径：每次登录就是一枚 key，吊销 = 断开那台设备。 */}
            <p className="text-sm text-neutral-gray-dark mb-5">{t.devicesGuide}</p>

            {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

            {keys === null ? null : keys.length === 0 ? (
                <p className="text-sm text-neutral-gray-medium py-4 text-center">{t.noKeys}</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[32rem] text-sm">
                        <thead>
                            <tr className="border-b-2 border-neutral-gray-light text-left text-neutral-gray-medium">
                                <th className="py-2 pr-4 font-medium">{t.colDevice}</th>
                                <th className="py-2 pr-4 font-medium">{t.colCreatedAt}</th>
                                <th className="py-2 font-medium text-right"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {keys.map(key => (
                                <tr key={key.id} className="border-b border-neutral-gray-light/60">
                                    <td className="min-w-40 py-2.5 pr-4 text-neutral-dark-bg">
                                        {key.label || t.unnamedDevice}
                                    </td>
                                    <td className="py-2.5 pr-4 text-neutral-gray-dark whitespace-nowrap">
                                        {new Date(key.createdAt).toLocaleString(dateLocale)}
                                    </td>
                                    <td className="py-2.5 text-right">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleRevoke(key.id)}
                                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                        >
                                            {t.revoke}
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
