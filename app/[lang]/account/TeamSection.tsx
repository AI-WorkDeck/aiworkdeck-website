'use client';

import { useCallback, useEffect, useState } from 'react';
import { Locale, LOCALE_META } from '@/i18n-config';
import { emailIsAccount } from '@/lib/mail-policy';
import { Button } from '@/components/ui/button';
import { Building2, Users } from 'lucide-react';
import { TeamDashboard, roleLabel, type TeamRole } from './TeamDashboard';

interface Invite {
    id: string;
    teamId: string;
    teamName: string;
    /** 大陆站有值、国际站为 null；`email` 反之（dev-board#778）。 */
    phone: string | null;
    email: string | null;
    role: TeamRole;
    createdAt: string;
    expiresAt: string;
}

interface Team {
    id: string;
    name: string;
    ownerAccountId: string;
    shareProjectNames: boolean;
    createdAt: string;
}

interface Member {
    accountId: string;
    displayName: string;
    role: TeamRole;
    joinedAt: string;
}

interface Firm {
    id: string;
    name: string;
    headTeamId: string;
    isHead: boolean;
    joinCode?: string;
    teams: { id: string; name: string; memberCount: number; isHead: boolean }[];
}

interface TeamState {
    team: Team | null;
    /** 无团队时：我的账号本体（cn 手机号 / intl 邮箱）收到的邀请 */
    invites?: Invite[];
    myAccountId?: string;
    myRole?: TeamRole;
    members?: Member[];
    pendingInvites?: Invite[];
    /** 仅 OWNER/ADMIN 拿得到 */
    joinCode?: string;
    firm?: Firm | null;
}

const inputClass =
    'h-11 min-w-0 max-w-full rounded-lg border border-neutral-gray-light bg-white px-3 text-sm text-neutral-gray-dark focus:outline-none focus:ring-2 focus:ring-king-mint';

/** 后端一律回 `{ error: '<code>' }`，映射不到就落回通用文案。 */
function errorText(
    t: { teamErrors: Record<string, string>; teamActionFailed: string },
    code?: string
): string {
    return (code && t.teamErrors[code]) || t.teamActionFailed;
}

/** 邀请码输入：8 位大写字母数字，边输边规整，免得用户粘进小写或空格后被判 bad_code。 */
function normalizeCode(raw: string): string {
    return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

export function TeamSection({
    lang,
    dict,
    hasIdentity,
}: {
    lang: Locale;
    dict: any;
    /**
     * 当前账号的**账号本体**是否已就位：大陆站看手机号、国际站看邮箱。
     * 无团队态下建队/加入都要求它（dev-board#496 / #778）。
     */
    hasIdentity: boolean;
}) {
    const t = dict.accountPage;
    // 站点是构建期常量（NEXT_PUBLIC_AWD_SITE），这里只是给下面几处文案与字段选择
    // 一个名字，免得每处都写一遍 emailIsAccount()。
    const mailSite = emailIsAccount();
    const [state, setState] = useState<TeamState | null>(null);
    const [loadError, setLoadError] = useState('');
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);
    // 写操作后连带刷新看板（看板自己管 range/scope，不能由这里直接 load）
    const [refreshKey, setRefreshKey] = useState(0);

    // 表单态
    const [newTeamName, setNewTeamName] = useState('');
    const [joinCodeInput, setJoinCodeInput] = useState('');
    const [renaming, setRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState('');
    // 大陆站装手机号、国际站装邮箱——同一个输入框，同一个 state
    const [inviteIdentity, setInviteIdentity] = useState('');
    const [inviteRole, setInviteRole] = useState<'ADMIN' | 'MEMBER'>('MEMBER');
    const [firmName, setFirmName] = useState('');
    const [firmCodeInput, setFirmCodeInput] = useState('');
    const [firmRenaming, setFirmRenaming] = useState(false);
    const [firmRenameValue, setFirmRenameValue] = useState('');
    const [copied, setCopied] = useState('');

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/account/team');
            if (!res.ok) throw new Error('load failed');
            setState(await res.json());
            setLoadError('');
        } catch {
            setLoadError(t.loadFailed);
        }
    }, [t.loadFailed]);

    useEffect(() => {
        load();
    }, [load]);

    /** 所有写操作走这里：统一置忙、错误码翻译、成功后重拉团队与看板。 */
    const run = useCallback(
        async (path: string, init: RequestInit): Promise<boolean> => {
            setBusy(true);
            setMsg('');
            try {
                const res = await fetch(path, init);
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    setMsg(errorText(t, data?.error));
                    return false;
                }
                await load();
                setRefreshKey(k => k + 1);
                return true;
            } catch {
                setMsg(t.teamActionFailed);
                return false;
            } finally {
                setBusy(false);
            }
        },
        [load, t]
    );

    const post = useCallback(
        (path: string, body?: unknown) =>
            run(path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body ?? {}),
            }),
        [run]
    );
    const patch = useCallback(
        (path: string, body: unknown) =>
            run(path, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            }),
        [run]
    );
    const del = useCallback((path: string) => run(path, { method: 'DELETE' }), [run]);

    const copy = async (value: string, key: string) => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(key);
            window.setTimeout(() => setCopied(''), 2000);
        } catch {
            setCopied('');
        }
    };

    const dateLocale = LOCALE_META[lang].bcp47;
    const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(dateLocale);

    const team = state?.team ?? null;
    const myRole = state?.myRole;
    const isOwner = myRole === 'OWNER';
    const isManager = myRole === 'OWNER' || myRole === 'ADMIN';
    const firm = state?.firm ?? null;

    const cardClass =
        'bg-white border border-[#dce2de] rounded-xl p-6 md:p-8 shadow-sm mb-10';

    if (loadError) {
        return (
            <div className={cardClass}>
                <div className="flex items-center gap-3 mb-2">
                    <Users className="w-5 h-5 text-king-forest" strokeWidth={1.75} />
                    <h2 className="font-display text-xl font-semibold text-neutral-dark-bg">{t.teamTitle}</h2>
                </div>
                <p className="text-sm text-neutral-gray-medium py-6 text-center">{loadError}</p>
            </div>
        );
    }

    if (!state) return null;

    // ── 无团队：三条路并排，不藏二级菜单 ──────────────────────────────
    if (!team) {
        const invites = state.invites ?? [];
        return (
            <div className={cardClass}>
                <div className="flex items-center gap-3 mb-2">
                    <Users className="w-5 h-5 text-king-forest" strokeWidth={1.75} />
                    <h2 className="font-display text-xl font-semibold text-neutral-dark-bg">{t.teamTitle}</h2>
                </div>
                <p className="text-sm text-neutral-gray-dark mb-6">{t.teamNoTeamDesc}</p>

                {!hasIdentity && (
                    <p className="text-sm text-[var(--king-gold-text,#7E6439)] mb-4">
                        {mailSite ? t.teamEmailRequiredHint : t.teamPhoneRequiredHint}
                    </p>
                )}
                {msg && <p className="text-sm text-red-600 mb-4">{msg}</p>}

                <div className="grid gap-x-6 gap-y-6 md:grid-cols-3 md:grid-rows-[auto_auto_1fr] md:gap-y-3">
                    <div className="grid min-w-0 gap-3 md:row-span-3 md:grid-rows-subgrid">
                        <h3 className="text-sm font-semibold text-neutral-gray-dark">{t.teamCreateTitle}</h3>
                        <p className="text-xs leading-relaxed text-neutral-gray-medium">{t.teamCreateDesc}</p>
                        <div className="grid content-start gap-2 xl:grid-cols-[minmax(0,1fr)_auto]">
                            <input
                                value={newTeamName}
                                onChange={e => setNewTeamName(e.target.value)}
                                placeholder={t.teamNamePlaceholder}
                                maxLength={40}
                                className={`${inputClass} w-full min-w-0`}
                            />
                            <Button
                                size="sm"
                                disabled={busy || !hasIdentity || !newTeamName.trim()}
                                onClick={async () => {
                                    if (await post('/api/account/team', { name: newTeamName.trim() })) {
                                        setNewTeamName('');
                                    }
                                }}
                                className="bg-king-forest hover:bg-king-forest/90 font-bold"
                            >
                                {t.teamCreateBtn}
                            </Button>
                        </div>
                    </div>

                    <div className="grid min-w-0 gap-3 md:row-span-3 md:grid-rows-subgrid">
                        <h3 className="text-sm font-semibold text-neutral-gray-dark">{t.teamJoinTitle}</h3>
                        <p className="text-xs leading-relaxed text-neutral-gray-medium">{t.teamJoinDesc}</p>
                        <div className="grid content-start gap-2 xl:grid-cols-[minmax(0,1fr)_auto]">
                            <input
                                value={joinCodeInput}
                                onChange={e => setJoinCodeInput(normalizeCode(e.target.value))}
                                placeholder={t.teamJoinCodePlaceholder}
                                className={`${inputClass} w-full min-w-0 font-mono tracking-[0.18em] uppercase`}
                            />
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={busy || !hasIdentity || joinCodeInput.length !== 8}
                                onClick={async () => {
                                    if (await post('/api/account/team/join', { code: joinCodeInput })) {
                                        setJoinCodeInput('');
                                    }
                                }}
                                className="border-king-forest text-king-forest"
                            >
                                {t.teamJoinBtn}
                            </Button>
                        </div>
                    </div>

                    <div className="min-w-0 pt-3 md:row-span-3 md:pt-0">
                        <h3 className="text-sm font-semibold text-neutral-gray-dark mb-3">{t.teamInvitesTitle}</h3>
                        {invites.length === 0 ? (
                            <p className="text-xs leading-relaxed text-neutral-gray-medium">
                                {mailSite ? t.teamInvitesEmptyEmail : t.teamInvitesEmpty}
                            </p>
                        ) : (
                            <ul className="space-y-3">
                                {invites.map(inv => (
                                    <li
                                        key={inv.id}
                                        className="rounded-xl border border-neutral-gray-light bg-neutral-gray-pale px-3 py-2"
                                    >
                                        <p className="break-words [overflow-wrap:anywhere] text-sm font-bold text-neutral-dark-bg">{inv.teamName}</p>
                                        <p className="text-xs text-neutral-gray-medium mb-2">
                                            {roleLabel(t, inv.role)} ·{' '}
                                            {t.teamInviteExpires.replace('{date}', fmtDate(inv.expiresAt))}
                                        </p>
                                        <Button
                                            size="sm"
                                            disabled={busy}
                                            onClick={() => post(`/api/account/team/invites/${inv.id}/accept`)}
                                            className="bg-king-forest hover:bg-king-forest/90 font-bold"
                                        >
                                            {t.teamAcceptBtn}
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ── 有团队 ────────────────────────────────────────────────────────
    const members = state.members ?? [];
    const pendingInvites = state.pendingInvites ?? [];

    return (
        <>
            <div className={cardClass}>
                <div className="flex flex-col md:flex-row md:items-center gap-4 mb-6">
                    <div className="flex items-center gap-3 flex-1">
                        <Users className="w-5 h-5 text-king-forest" strokeWidth={1.75} />
                        <h2 className="font-display text-xl font-semibold text-neutral-dark-bg">{t.teamTitle}</h2>
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-neutral-gray-medium">{t.teamMyRoleLabel}</p>
                        <p className="text-sm font-bold text-neutral-dark-bg">
                            {myRole ? roleLabel(t, myRole) : '—'}
                        </p>
                    </div>
                </div>

                {msg && <p className="text-sm text-red-600 mb-4">{msg}</p>}

                <div className="flex flex-wrap items-center gap-3 mb-6 pb-6 border-b border-neutral-gray-light">
                    <span className="text-xs text-neutral-gray-medium">{t.teamNameLabel}</span>
                    {renaming ? (
                        <>
                            <input
                                value={renameValue}
                                onChange={e => setRenameValue(e.target.value)}
                                maxLength={40}
                                className={`${inputClass} w-full sm:w-56`}
                            />
                            <Button
                                size="sm"
                                disabled={busy || !renameValue.trim()}
                                onClick={async () => {
                                    if (await patch('/api/account/team', { name: renameValue.trim() })) {
                                        setRenaming(false);
                                    }
                                }}
                                className="bg-king-forest hover:bg-king-forest/90 font-bold"
                            >
                                {t.teamSave}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setRenaming(false)}>
                                {t.teamCancel}
                            </Button>
                        </>
                    ) : (
                        <>
                            <span className="min-w-0 break-words [overflow-wrap:anywhere] font-display text-lg font-bold text-neutral-dark-bg">
                                {team.name}
                            </span>
                            {isManager && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                        setRenameValue(team.name);
                                        setRenaming(true);
                                    }}
                                    className="text-king-forest"
                                >
                                    {t.teamRename}
                                </Button>
                            )}
                        </>
                    )}
                </div>

                {/* 邀请码：管理者才拿得到，MEMBER 连这块都不渲染 */}
                {state.joinCode && (
                    <div className="mb-6 pb-6 border-b border-neutral-gray-light">
                        <h3 className="text-sm font-semibold text-neutral-gray-dark mb-1">{t.teamJoinCodeTitle}</h3>
                        <p className="text-xs text-neutral-gray-medium mb-3">{t.teamJoinCodeHint}</p>
                        <div className="flex flex-wrap items-center gap-3">
                            <span className="font-mono text-2xl font-bold tracking-[0.24em] text-king-forest">
                                {state.joinCode}
                            </span>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => copy(state.joinCode as string, 'team')}
                            >
                                {copied === 'team' ? t.copied : t.copy}
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                onClick={() => {
                                    if (!window.confirm(t.teamRegenerateConfirm)) return;
                                    post('/api/account/team/join-code/regenerate');
                                }}
                                className="text-neutral-gray-dark"
                            >
                                {t.teamRegenerate}
                            </Button>
                        </div>
                    </div>
                )}

                <h3 className="text-sm font-semibold text-neutral-gray-dark mb-3">{t.teamMembersTitle}</h3>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[36rem] text-sm">
                        <thead>
                            <tr className="border-b-2 border-neutral-gray-light text-left text-neutral-gray-medium">
                                <th className="py-2 pr-4 font-medium">{t.teamColMember}</th>
                                <th className="py-2 pr-4 font-medium">{t.teamColRole}</th>
                                <th className="py-2 pr-4 font-medium">{t.teamColJoinedAt}</th>
                                <th className="py-2 font-medium text-right"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {members.map(m => {
                                const isMe = m.accountId === state.myAccountId;
                                const canEditRole = isManager && !isMe && m.role !== 'OWNER';
                                return (
                                    <tr key={m.accountId} className="border-b border-neutral-gray-light/60">
                                        <td className="min-w-40 py-2.5 pr-4 text-neutral-dark-bg">
                                            {m.displayName}
                                            {isMe && (
                                                <span className="ml-2 text-xs text-neutral-gray-medium">
                                                    {t.teamYou}
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-2.5 pr-4 text-neutral-gray-dark">
                                            {canEditRole ? (
                                                <select
                                                    value={m.role}
                                                    disabled={busy}
                                                    onChange={e =>
                                                        patch(
                                                            `/api/account/team/members/${m.accountId}`,
                                                            { role: e.target.value }
                                                        )
                                                    }
                                                    className={`${inputClass} py-0`}
                                                >
                                                    <option value="ADMIN">{t.teamRoleAdmin}</option>
                                                    <option value="MEMBER">{t.teamRoleMember}</option>
                                                </select>
                                            ) : (
                                                roleLabel(t, m.role)
                                            )}
                                        </td>
                                        <td className="py-2.5 pr-4 text-neutral-gray-dark whitespace-nowrap">
                                            {fmtDate(m.joinedAt)}
                                        </td>
                                        <td className="py-2.5 text-right">
                                            {isMe && !isOwner && (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    disabled={busy}
                                                    onClick={() => {
                                                        if (!window.confirm(t.teamLeaveConfirm)) return;
                                                        del(`/api/account/team/members/${m.accountId}`);
                                                    }}
                                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                >
                                                    {t.teamLeave}
                                                </Button>
                                            )}
                                            {!isMe && isManager && m.role !== 'OWNER' && (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    disabled={busy}
                                                    onClick={() => {
                                                        if (!window.confirm(t.teamRemoveConfirm)) return;
                                                        del(`/api/account/team/members/${m.accountId}`);
                                                    }}
                                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                >
                                                    {t.teamRemove}
                                                </Button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {isManager && (
                    <div className="mt-6 pt-6 border-t border-neutral-gray-light">
                        <h3 className="text-sm font-semibold text-neutral-gray-dark mb-3">
                            {mailSite ? t.teamInviteByEmailTitle : t.teamInviteByPhoneTitle}
                        </h3>
                        <div className="flex flex-wrap items-center gap-2 mb-6">
                            <input
                                value={inviteIdentity}
                                onChange={e => setInviteIdentity(e.target.value)}
                                placeholder={mailSite ? t.teamEmailPlaceholder : t.teamPhonePlaceholder}
                                inputMode={mailSite ? 'email' : 'tel'}
                                className={`${inputClass} w-full sm:w-64`}
                            />
                            <select
                                value={inviteRole}
                                onChange={e => setInviteRole(e.target.value as 'ADMIN' | 'MEMBER')}
                                className={inputClass}
                            >
                                <option value="MEMBER">{t.teamRoleMember}</option>
                                <option value="ADMIN">{t.teamRoleAdmin}</option>
                            </select>
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={busy || !inviteIdentity.trim()}
                                onClick={async () => {
                                    const identity = inviteIdentity.trim();
                                    const ok = await post('/api/account/team/invites', {
                                        ...(mailSite ? { email: identity } : { phone: identity }),
                                        role: inviteRole,
                                    });
                                    if (ok) setInviteIdentity('');
                                }}
                                className="border-king-forest text-king-forest"
                            >
                                {t.teamInviteBtn}
                            </Button>
                        </div>

                        <h3 className="text-sm font-semibold text-neutral-gray-dark mb-3">
                            {t.teamPendingInvitesTitle}
                        </h3>
                        {pendingInvites.length === 0 ? (
                            <p className="text-sm text-neutral-gray-medium py-4">{t.teamPendingEmpty}</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[36rem] text-sm">
                                    <thead>
                                        <tr className="border-b-2 border-neutral-gray-light text-left text-neutral-gray-medium">
                                            <th className="py-2 pr-4 font-medium">
                                                {mailSite ? t.teamColEmail : t.teamColPhone}
                                            </th>
                                            <th className="py-2 pr-4 font-medium">{t.teamColRole}</th>
                                            <th className="py-2 pr-4 font-medium">{t.teamColExpiresAt}</th>
                                            <th className="py-2 font-medium text-right"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pendingInvites.map(inv => (
                                            <tr key={inv.id} className="border-b border-neutral-gray-light/60">
                                                <td className="min-w-40 py-2.5 pr-4 font-mono text-neutral-dark-bg">
                                                    {mailSite ? inv.email : inv.phone}
                                                </td>
                                                <td className="py-2.5 pr-4 text-neutral-gray-dark">
                                                    {roleLabel(t, inv.role)}
                                                </td>
                                                <td className="py-2.5 pr-4 text-neutral-gray-dark whitespace-nowrap">
                                                    {fmtDate(inv.expiresAt)}
                                                </td>
                                                <td className="py-2.5 text-right">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        disabled={busy}
                                                        onClick={() => {
                                                            if (!window.confirm(t.teamRevokeInviteConfirm)) return;
                                                            del(`/api/account/team/invites/${inv.id}`);
                                                        }}
                                                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                    >
                                                        {t.teamRevokeInvite}
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* 律所区：常显。未入所时也要看得见两条入口，别等用户去猜。 */}
            <div className={cardClass}>
                <div className="flex items-center gap-3 mb-2">
                    <Building2 className="w-5 h-5 text-king-forest" strokeWidth={1.75} />
                    <h2 className="font-display text-xl font-semibold text-neutral-dark-bg">{t.teamFirmTitle}</h2>
                </div>

                {!firm ? (
                    !isOwner ? (
                        <p className="text-sm text-neutral-gray-medium mt-3">{t.teamFirmNoneMemberHint}</p>
                    ) : (
                        <>
                            <p className="text-sm text-neutral-gray-dark mb-6">{t.teamFirmNoneOwnerHint}</p>
                            <div className="grid gap-x-6 gap-y-6 md:grid-cols-2 md:gap-y-3">
                                <div className="grid min-w-0 gap-3 md:row-span-2 md:grid-rows-subgrid">
                                    <h3 className="text-sm font-semibold text-neutral-gray-dark">
                                        {t.teamFirmCreateTitle}
                                    </h3>
                                    <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
                                        <input
                                            value={firmName}
                                            onChange={e => setFirmName(e.target.value)}
                                            placeholder={t.teamFirmNamePlaceholder}
                                            maxLength={60}
                                            className={`${inputClass} w-full min-w-0`}
                                        />
                                        <Button
                                            size="sm"
                                            disabled={busy || !firmName.trim()}
                                            onClick={async () => {
                                                if (
                                                    await post('/api/account/team/firm', {
                                                        name: firmName.trim(),
                                                    })
                                                ) {
                                                    setFirmName('');
                                                }
                                            }}
                                            className="bg-king-forest hover:bg-king-forest/90 font-bold"
                                        >
                                            {t.teamFirmCreateBtn}
                                        </Button>
                                    </div>
                                </div>
                                <div className="grid min-w-0 gap-3 md:row-span-2 md:grid-rows-subgrid">
                                    <h3 className="text-sm font-semibold text-neutral-gray-dark">
                                        {t.teamFirmJoinTitle}
                                    </h3>
                                    <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
                                        <input
                                            value={firmCodeInput}
                                            onChange={e => setFirmCodeInput(normalizeCode(e.target.value))}
                                            placeholder={t.teamJoinCodePlaceholder}
                                            className={`${inputClass} w-full min-w-0 font-mono tracking-[0.18em] uppercase`}
                                        />
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={busy || firmCodeInput.length !== 8}
                                            onClick={async () => {
                                                if (
                                                    await post('/api/account/team/firm/join', {
                                                        code: firmCodeInput,
                                                    })
                                                ) {
                                                    setFirmCodeInput('');
                                                }
                                            }}
                                            className="border-king-forest text-king-forest"
                                        >
                                            {t.teamFirmJoinBtn}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </>
                    )
                ) : (
                    <>
                        <div className="flex flex-wrap items-center gap-3 mt-4 mb-6 pb-6 border-b border-neutral-gray-light">
                            <span className="text-xs text-neutral-gray-medium">{t.teamFirmNameLabel}</span>
                            {firmRenaming ? (
                                <>
                                    <input
                                        value={firmRenameValue}
                                        onChange={e => setFirmRenameValue(e.target.value)}
                                        maxLength={60}
                                        className={`${inputClass} w-full sm:w-56`}
                                    />
                                    <Button
                                        size="sm"
                                        disabled={busy || !firmRenameValue.trim()}
                                        onClick={async () => {
                                            if (
                                                await patch('/api/account/team/firm', {
                                                    name: firmRenameValue.trim(),
                                                })
                                            ) {
                                                setFirmRenaming(false);
                                            }
                                        }}
                                        className="bg-king-forest hover:bg-king-forest/90 font-bold"
                                    >
                                        {t.teamSave}
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => setFirmRenaming(false)}>
                                        {t.teamCancel}
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <span className="min-w-0 break-words [overflow-wrap:anywhere] font-display text-lg font-bold text-neutral-dark-bg">
                                        {firm.name}
                                    </span>
                                    {firm.isHead && (
                                        <span className="rounded border border-king-forest/25 bg-king-forest/5 px-1.5 py-0.5 text-[11px] text-king-forest">
                                            {t.teamFirmHeadBadge}
                                        </span>
                                    )}
                                    {firm.isHead && isManager && (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => {
                                                setFirmRenameValue(firm.name);
                                                setFirmRenaming(true);
                                            }}
                                            className="text-king-forest"
                                        >
                                            {t.teamRename}
                                        </Button>
                                    )}
                                </>
                            )}
                        </div>

                        {firm.joinCode && (
                            <div className="mb-6 pb-6 border-b border-neutral-gray-light">
                                <h3 className="text-sm font-semibold text-neutral-gray-dark mb-1">
                                    {t.teamFirmJoinCodeTitle}
                                </h3>
                                <p className="text-xs text-neutral-gray-medium mb-3">{t.teamFirmJoinCodeHint}</p>
                                <div className="flex flex-wrap items-center gap-3">
                                    <span className="font-mono text-2xl font-bold tracking-[0.24em] text-king-forest">
                                        {firm.joinCode}
                                    </span>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => copy(firm.joinCode as string, 'firm')}
                                    >
                                        {copied === 'firm' ? t.copied : t.copy}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled={busy}
                                        onClick={() => {
                                            if (!window.confirm(t.teamFirmRegenerateConfirm)) return;
                                            post('/api/account/team/firm/join-code/regenerate');
                                        }}
                                        className="text-neutral-gray-dark"
                                    >
                                        {t.teamRegenerate}
                                    </Button>
                                </div>
                            </div>
                        )}

                        <h3 className="text-sm font-semibold text-neutral-gray-dark mb-3">{t.teamFirmTeamsTitle}</h3>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[32rem] text-sm">
                                <thead>
                                    <tr className="border-b-2 border-neutral-gray-light text-left text-neutral-gray-medium">
                                        <th className="py-2 pr-4 font-medium">{t.teamColTeam}</th>
                                        <th className="py-2 pr-4 font-medium text-right">
                                            {t.teamColMemberCount}
                                        </th>
                                        <th className="py-2 font-medium text-right"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {firm.teams.map(ft => (
                                        <tr key={ft.id} className="border-b border-neutral-gray-light/60">
                                            <td className="min-w-40 py-2.5 pr-4 text-neutral-dark-bg">
                                                {ft.name}
                                                {ft.isHead && (
                                                    <span className="ml-2 rounded border border-king-forest/25 bg-king-forest/5 px-1.5 py-0.5 text-[11px] text-king-forest">
                                                        {t.teamFirmHeadBadge}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-neutral-gray-dark">
                                                {ft.memberCount}
                                            </td>
                                            <td className="py-2.5 text-right">
                                                {firm.isHead && isManager && !ft.isHead && (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        disabled={busy}
                                                        onClick={() => {
                                                            if (!window.confirm(t.teamFirmRemoveTeamConfirm))
                                                                return;
                                                            del(`/api/account/team/firm/teams/${ft.id}`);
                                                        }}
                                                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                    >
                                                        {t.teamFirmRemoveTeam}
                                                    </Button>
                                                )}
                                                {!firm.isHead && isOwner && ft.id === team.id && (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        disabled={busy}
                                                        onClick={() => {
                                                            if (!window.confirm(t.teamFirmLeaveConfirm)) return;
                                                            del(`/api/account/team/firm/teams/${ft.id}`);
                                                        }}
                                                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                    >
                                                        {t.teamFirmLeave}
                                                    </Button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>

            {/* 数据共享开关：紧贴看板顶部，不塞进设置深处 */}
            <div className="bg-white border border-[#dce2de] rounded-xl p-6 md:p-8 shadow-sm mb-6">
                <label className="flex items-start gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={team.shareProjectNames}
                        disabled={!isManager || busy}
                        onChange={e =>
                            patch('/api/account/team', { shareProjectNames: e.target.checked })
                        }
                        className="mt-0.5 h-4 w-4 accent-king-forest"
                    />
                    <span>
                        <span className="block text-sm font-bold text-neutral-gray-dark">
                            {t.teamShareNamesLabel}
                        </span>
                        <span className="block text-xs text-neutral-gray-medium mt-1">
                            {t.teamShareNamesHint}
                        </span>
                    </span>
                </label>
            </div>

            <TeamDashboard lang={lang} dict={dict} hasFirm={!!firm} refreshKey={refreshKey} />
        </>
    );
}
