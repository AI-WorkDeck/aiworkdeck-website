'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { CircleUserRound } from 'lucide-react';
import { Locale } from '@/i18n-config';
import { Avatar } from '@/components/user/Avatar';

interface NavAuthProps {
    lang: Locale;
    /** 深色 hero 上的浅色变体 */
    onDark?: boolean;
    signInLabel?: string;
}

export function NavAuth({ lang, onDark, signInLabel }: NavAuthProps) {
    const [user, setUser] = useState<{
        id: string;
        username: string;
        displayName: string;
        avatarUpdatedAt?: string;
    } | null>(null);
    const [loaded, setLoaded] = useState(false);
    const pathname = usePathname();

    useEffect(() => {
        let cancelled = false;
        fetch('/api/auth/me')
            .then(res => res.json())
            .then(data => {
                if (!cancelled) {
                    setUser(data.user);
                    setLoaded(true);
                }
            })
            .catch(() => setLoaded(true));
        return () => {
            cancelled = true;
        };
    }, [pathname]);

    if (!loaded) {
        return <span className="w-8 h-8" />;
    }

    if (user) {
        return (
            <Link
                href={`/${lang}/account`}
                className={`flex items-center gap-2 px-2 py-1 rounded-full transition-colors ${onDark ? 'hover:bg-white/15' : 'hover:bg-king-forest-lightest'}`}
                title={user.displayName}
            >
                <Avatar
                    userId={user.id}
                    displayName={user.displayName}
                    avatarUpdatedAt={user.avatarUpdatedAt}
                    size={28}
                    shape="circle"
                    variant={onDark ? 'brandInvert' : 'brand'}
                    className="font-sans"
                />
            </Link>
        );
    }

    return (
        <Link
            href={`/${lang}/account`}
            className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${onDark ? 'text-white/75 hover:text-white' : 'text-neutral-gray-dark hover:text-king-forest'}`}
        >
            <CircleUserRound className="h-4.5 w-4.5" />
            {signInLabel ?? 'Sign in'}
        </Link>
    );
}
