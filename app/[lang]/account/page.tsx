import { PostpaidSection } from './PostpaidSection';
import { cloudState } from '@/lib/postpaid';
import { bqtScanEnabled } from '@/lib/bqt-auth';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { PencilLine, Plus } from 'lucide-react';
import { getDictionary } from '@/get-dictionary';
import { Locale, LOCALE_META } from '@/i18n-config';
import { emailIsAccount } from '@/lib/mail-policy';
import { getSessionUser } from '@/lib/sessions';
import { listSkills } from '@/lib/skills-store';
import { toPublicUser, isDefaultDisplayName } from '@/lib/users';
import { getBalance } from '@/lib/wallet';
import { SkillCard } from '@/components/skills/SkillCard';
import { Button } from '@/components/ui/button';
import { AuthForms } from './AuthForms';
import { LegacyEmailForm } from './LegacyEmailForm';
import { mailEnabled } from '@/lib/mail-auth';
import { phoneIsAccount } from '@/lib/phone-policy';
import { maskPhoneForName } from '@/lib/users';
import { ProfileCard } from './ProfileCard';
import { WalletSection } from './WalletSection';
import { SubscriptionSection } from './SubscriptionSection';
import { listEntitlements } from '@/lib/purchases';
import { isProPurchaseEnabled } from '@/lib/pro-purchase-flag';
import { siteConfig } from '@/lib/site-config';
import { MembershipSection } from './MembershipSection';
import { DesktopConnectSection } from './DesktopConnectSection';
import { TeamSection } from './TeamSection';
import { PurchasesSection } from './PurchasesSection';
import { SiteNotice } from './SiteNotice';
import { DangerZoneSection } from './DangerZoneSection';
import { BindPhoneGate } from './BindPhoneGate';
import { gateForUser, bindingDeadlineLabel } from '@/lib/phone-policy';
import { codeChannelReady } from '@/lib/login-channel';
import { captchaClientConfig } from '@/lib/captcha';
import { NOINDEX } from '@/lib/page-metadata';
import { refreshBqtSnapshot } from '@/lib/bqt-account';
import { bqtProRightsUntil } from '@/lib/bqt-member';

export const dynamic = 'force-dynamic';

/**
 * 分区组标题。走 DESIGN.md 的眉标语言（细线 + 宽字距小字），不是又一级 h2——
 * 页面里已经有六个 h2 了，再加一层同等重量的标题只会更乱。
 */
function GroupHeading({ children }: { children: ReactNode }) {
    return (
        <div className="flex items-center gap-3 mt-14 mb-5">
            <span className="w-8 h-px bg-king-forest/40" />
            <span className="text-[11px] tracking-[0.22em] uppercase text-king-forest font-medium">
                {children}
            </span>
        </div>
    );
}

/** 服务端格式化：客户端组件里现算会让 SSR 与浏览器的 ICU/时区差异撞出 hydration 不一致。 */
function formatJoined(iso: string, lang: Locale): string {
    return new Date(iso).toLocaleDateString(LOCALE_META[lang].bcp47, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
}

/** 个人账户页：不进索引。页面内容因人而异且需要登录，进索引没有意义。 */
export const metadata: Metadata = { robots: NOINDEX };

export default async function AccountPage({
    params,
    searchParams,
}: {
    params: Promise<{ lang: Locale }>;
    searchParams: Promise<{ next?: string; flow?: string; legacyEmail?: string }>;
}) {
    const { lang } = await params;
    const { next, flow, legacyEmail } = await searchParams;
    const migrateEmail = phoneIsAccount() && legacyEmail === '1';
    const dict = await getDictionary(lang);
    const t = dict.authPage;

    const user = await getSessionUser();

    if (migrateEmail && user?.phone && user.passwordHash) {
        return <div className="min-h-screen bg-neutral-gray-pale pt-32 pb-24"><div className="container mx-auto px-4 max-w-md">
            <SiteNotice lang={lang} dict={dict} />
            <LegacyEmailForm lang={lang} dict={dict} phoneLabel={maskPhoneForName(user.phone)} mailReady={mailEnabled()} captcha={captchaClientConfig()} />
        </div></div>;
    }

    if (!user || migrateEmail || flow === 'register' || flow === 'reset') {
        return (
            <div className="min-h-screen bg-neutral-gray-pale pt-32 pb-24">
                <div className="container mx-auto px-4 max-w-md">
                    {/* 注册前就要知道自己在哪个站注册——注册完再发现走错门，账户已经建在别处了 */}
                    <SiteNotice lang={lang} dict={dict} />
                    <AuthForms bqtEnabled={bqtScanEnabled()} lang={lang} dict={dict} next={next} legacyEmail={migrateEmail} codeChannelReady={codeChannelReady()} captcha={captchaClientConfig()} />
                    {/* 直接落到这张登录卡的新用户，此前没有任何去处 */}
                    <p className="mt-6 text-center text-sm text-neutral-gray-medium">
                        {t.newHere}{' '}
                        <Link href={`/${lang}/start`} className="font-medium text-king-forest hover:underline">
                            {t.newHereLink}
                        </Link>
                    </p>
                </div>
            </div>
        );
    }

    // 绑定了包晴天的律师：先刷新权益快照（积分卡与 Pro 读快照）。Pro 正由包晴天会员提供时，续费指向包晴天；会员失效后照常可在本站买 Pro。
    await refreshBqtSnapshot(user.id);
    const bqtMember = !!bqtProRightsUntil(user.id);
    const mySkills = listSkills({ authorId: user.id, sort: 'newest' });
    const ta = dict.accountPage;

    // 大陆站存量账号还没绑手机号：挂强制补绑闸。
    // 期限后 `blocked` 的账号根本登不进来（login 路由拦在建会话之前），所以这里
    // 只会遇到 must_bind——但仍按 gate 判而不是判 `!user.phone`，免得两处口径漂。
    const mustBindPhone = gateForUser(user) === 'must_bind';

    return (
        <div className="min-h-screen bg-neutral-gray-pale pt-28 pb-24">
            <div className="container mx-auto px-4 md:px-8 max-w-6xl">
                {mustBindPhone && (
                    <BindPhoneGate lang={lang} dict={dict} deadline={bindingDeadlineLabel()} captcha={captchaClientConfig()} />
                )}

                <ProfileCard
                    lang={lang}
                    dict={dict}
                    user={{ ...toPublicUser(user), email: user.email }}
                    joined={formatJoined(user.createdAt, lang)}
                    nameIsDefault={isDefaultDisplayName(user)}
                    stats={{
                        // 两个都是同步的本地读（SQLite / JSON），服务端直出，页面上没有加载态
                        balanceCents: getBalance(user.id),
                        skillCount: mySkills.length,
                        downloads: mySkills.reduce((sum, s) => sum + s.downloads, 0),
                    }}
                />

                <PostpaidSection lang={lang} dict={dict} initial={cloudState(user.id)} />

                <SubscriptionSection
                    lang={lang}
                    dict={dict}
                    entitlement={listEntitlements(user.id).find(e => e.feature === 'pro') ?? null}
                    paymentChannel={siteConfig.paymentChannel}
                    purchaseEnabled={isProPurchaseEnabled()}
                    bqtMember={bqtMember}
                />

                {/* 桌面连接（AWD Key）：新用户登录后唯一必须做的事，排在最前，
                    别让人为了拿一把 Key 先滚过钱包 */}
                <GroupHeading>{ta.groupStart}</GroupHeading>
                <DesktopConnectSection lang={lang} dict={dict} />

                {/* 我的团队：创建/加入、成员与律所、使用看板（dev-board#496） */}
                <GroupHeading>{ta.groupTeam}</GroupHeading>
                <div id="team" className="scroll-mt-28">
                    <TeamSection
                        lang={lang}
                        dict={dict}
                        hasIdentity={emailIsAccount() ? !!user.email : !!user.phone}
                    />
                </div>

                <GroupHeading>{ta.groupAssets}</GroupHeading>
                <div id="wallet" className="scroll-mt-28">
                    <WalletSection lang={lang} dict={dict} />
                </div>
                {/* 会员等级：紧邻钱包，同属「资产」分组 */}
                <MembershipSection lang={lang} dict={dict} />
                {/* 已购与创作者收益（PR-W3） */}
                <PurchasesSection lang={lang} dict={dict} />

                <GroupHeading>{ta.groupCreate}</GroupHeading>
                <div className="mb-6 rounded-xl border border-neutral-gray-light bg-white p-5">
                    <h2 className="font-display text-xl font-semibold text-neutral-dark-bg">{ta.developerCenterTitle}</h2>
                    <p className="my-3 text-sm text-neutral-gray-medium">{ta.developerCenterDesc}</p>
                    <Link href={`/${lang}/plugins/developer`}><Button variant="accent" size="sm">{ta.developerCenterCta}</Button></Link>
                </div>
                <div id="creations" className="scroll-mt-28">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                        <h2 className="font-display text-xl font-semibold text-neutral-dark-bg">{t.mySkills}</h2>
                        <Link href={`/${lang}/skills/submit`}>
                            <Button variant="accent" size="sm" className="font-bold gap-1">
                                <Plus className="w-4 h-4" />
                                {t.submitNew}
                            </Button>
                        </Link>
                    </div>
                    {mySkills.length === 0 ? (
                        <p className="text-neutral-gray-medium py-12 text-center">
                            {dict.skillsPage.noSkillsYet}
                        </p>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {mySkills.map(skill => (
                                <div key={skill.id} className="relative group/wrap">
                                    <SkillCard
                                        lang={lang}
                                        dict={dict}
                                        skill={skill}
                                        author={toPublicUser(user)}
                                    />
                                    <Link
                                        href={`/${lang}/skills/submit?edit=${skill.id}`}
                                        className="absolute top-4 right-4 p-2 rounded-lg bg-white border border-neutral-gray-light text-neutral-gray-medium opacity-0 group-hover/wrap:opacity-100 hover:text-king-forest hover:border-king-forest transition-all"
                                        title={dict.skillsPage.edit}
                                    >
                                        <PencilLine className="w-4 h-4" />
                                    </Link>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 注销账户：不可逆，按惯例压在最底部 */}
                <GroupHeading>{ta.groupSecurity}</GroupHeading>
                <DangerZoneSection lang={lang} dict={dict} />
            </div>
        </div>
    );
}
