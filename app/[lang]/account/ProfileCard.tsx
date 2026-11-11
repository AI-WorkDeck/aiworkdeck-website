'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarDays, PencilLine } from 'lucide-react';
import { Locale } from '@/i18n-config';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/user/Avatar';
import { formatSiteAmount } from '@/lib/site-config';
import { LogoutButton } from './LogoutButton';
import { ProfileDialog } from './ProfileDialog';

/**
 * 账户中心的概览头部。
 *
 * 摘要数字全部由服务端算好传进来（Credits 余额与投稿数都是同步的本地读），
 * 所以这里没有加载态、没有闪烁。
 *
 * `joined` 也是服务端格式化好的字符串：在客户端组件里现算
 * toLocaleDateString，SSR 与浏览器两边的时区/ICU 差异会造成 hydration 不一致。
 */

interface ProfileCardProps {
    lang: Locale;
    dict: any;
    user: {
        id: string;
        username: string;
        email: string;
        displayName: string;
        bio?: string;
        avatarUpdatedAt?: string;
    };
    joined: string;
    /**
     * 展示名还是系统给的默认值（打码手机号 / 打码邮箱 / 等于用户名 / 空）。
     * 由服务端 `isDefaultDisplayName` 算好传进来：判定要读 phone，而 phone
     * 不该为了一条横幅被带到客户端组件里。
     */
    nameIsDefault: boolean;
    stats: {
        balanceCents: number;
        skillCount: number;
        downloads: number;
    };
}

export function ProfileCard({ lang, dict, user, joined, nameIsDefault, stats }: ProfileCardProps) {
    const t = dict.accountPage;
    const ta = dict.authPage;
    const [editing, setEditing] = useState(false);

    const summary = [
        { href: '#wallet', label: t.statBalance, value: formatSiteAmount(stats.balanceCents) },
        { href: '#creations', label: t.statSkills, value: String(stats.skillCount) },
        { href: '#creations', label: t.statDownloads, value: String(stats.downloads) },
    ];

    return (
        <>
            <div className="bg-white border border-[#dce2de] rounded-xl p-6 md:p-8 shadow-sm mb-12">
                {/* 姓名引导：手机号注册的账户默认展示名是打码号，同事在案卷的参与人列表、
                    版本时间线、批注作者里看到的就是它（dev-board#564） */}
                {nameIsDefault && (
                    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-king-mint bg-king-mint/10 px-4 py-3">
                        <p className="flex-1 min-w-0 basis-48 text-sm text-neutral-dark-bg">{t.nameDefaultBanner}</p>
                        <Button
                            size="sm"
                            onClick={() => setEditing(true)}
                            className="bg-king-forest hover:bg-king-forest/90 font-bold gap-1.5"
                        >
                            <PencilLine className="w-4 h-4" strokeWidth={1.75} />
                            {t.nameDefaultBannerCta}
                        </Button>
                    </div>
                )}

                <div className="flex flex-col md:flex-row md:items-center gap-6">
                    <button
                        type="button"
                        onClick={() => setEditing(true)}
                        title={t.editProfile}
                        className="group relative self-start rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-king-mint"
                    >
                        <Avatar
                            userId={user.id}
                            displayName={user.displayName}
                            avatarUpdatedAt={user.avatarUpdatedAt}
                            size={72}
                        />
                        <span className="absolute inset-0 rounded-xl bg-neutral-dark-bg/55 text-white text-[11px] font-medium flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            {t.profileAvatarChange}
                        </span>
                    </button>

                    <div className="flex-1 min-w-0">
                        <h1 className="break-words [overflow-wrap:anywhere] font-display text-2xl font-semibold text-neutral-dark-bg">
                            {ta.welcome}
                            {user.displayName}
                        </h1>
                        {/* 用户名是内部标识，不再当名字显示（dev-board#567）：用户分不清它与展示名，
                            那就只给他看一个。手机号注册的账户没有邮箱，整行不显示。 */}
                        {user.email && (
                            <p className="text-sm text-neutral-gray-medium font-mono mt-1 truncate">
                                {user.email}
                            </p>
                        )}
                        <p className="text-xs text-neutral-gray-medium mt-1.5 flex items-center gap-1.5">
                            <CalendarDays className="w-3.5 h-3.5" strokeWidth={1.75} />
                            {t.joinedAt} {joined}
                        </p>
                        {user.bio && (
                            <p className="break-words [overflow-wrap:anywhere] text-sm text-neutral-gray-dark mt-3 max-w-2xl leading-relaxed">
                                {user.bio}
                            </p>
                        )}
                    </div>

                    <div className="flex flex-col gap-4 md:items-end">
                        <div className="flex gap-2 flex-wrap">
                            <Button
                                onClick={() => setEditing(true)}
                                className="bg-king-forest hover:bg-king-forest/90 font-bold gap-1.5"
                            >
                                <PencilLine className="w-4 h-4" strokeWidth={1.75} />
                                {t.editProfile}
                            </Button>
                            <Link href={`/${lang}/u/${user.username}`}>
                                <Button variant="outline" className="border-king-forest text-king-forest">
                                    {ta.viewPublic}
                                </Button>
                            </Link>
                            <LogoutButton lang={lang} label={ta.logout} />
                        </div>
                    </div>
                </div>

                {/* 摘要：点一下直接落到下面对应的分区，不用自己滚 */}
                <div className="mt-7 pt-6 border-t border-neutral-gray-light grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {summary.map(item => (
                        <Link
                            key={item.label}
                            href={item.href}
                            className="group/stat min-w-0 break-words [overflow-wrap:anywhere] block rounded-lg -m-2 p-2 transition-colors hover:bg-neutral-gray-pale"
                        >
                            <div className="font-display text-2xl font-bold text-neutral-dark-bg tabular-nums group-hover/stat:text-king-forest transition-colors">
                                {item.value}
                            </div>
                            <div className="text-xs text-neutral-gray-medium mt-0.5">{item.label}</div>
                        </Link>
                    ))}
                </div>
            </div>

            <ProfileDialog open={editing} onOpenChange={setEditing} dict={dict} user={user} />
        </>
    );
}
