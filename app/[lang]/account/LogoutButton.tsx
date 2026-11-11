'use client';

import { Locale } from '@/i18n-config';
import { Button } from '@/components/ui/button';

export function LogoutButton({ lang, label }: { lang: Locale; label: string }) {
    const handleLogout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        // 整页跳转，确保导航栏登录态同步刷新
        window.location.assign(`/${lang}/marketplace`);
    };

    return (
        <Button variant="ghost" onClick={handleLogout} className="text-neutral-gray-medium">
            {label}
        </Button>
    );
}
