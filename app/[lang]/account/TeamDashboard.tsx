'use client';

import { useEffect, useState } from 'react';
import { Locale, LOCALE_META } from '@/i18n-config';
import { BarChart3 } from 'lucide-react';

export type TeamRole = 'OWNER' | 'ADMIN' | 'MEMBER';

/** 角色中文名：三个角色在成员表和看板里都要显示，放这里供两个组件共用。 */
export function roleLabel(
    t: { teamRoleOwner: string; teamRoleAdmin: string; teamRoleMember: string },
    role: TeamRole
): string {
    if (role === 'OWNER') return t.teamRoleOwner;
    if (role === 'ADMIN') return t.teamRoleAdmin;
    return t.teamRoleMember;
}

/** 时长一律「几小时几分钟」。后端给的是分钟，直接甩 3120 这种数字没人读得出来。 */
export function formatDuration(
    t: { teamHoursMinutes: string; teamMinutesOnly: string },
    minutes: number
): string {
    const total = Math.max(0, Math.round(minutes || 0));
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h === 0) return t.teamMinutesOnly.replace('{m}', String(m));
    return t.teamHoursMinutes.replace('{h}', String(h)).replace('{m}', String(m));
}

interface Kpi {
    activeMembers: number;
    memberCount: number;
    appStarts: number;
    projectsCreated: number;
    activeMinutes: number;
    aiTurns: number;
    savedMinutes: number;
}

interface SummaryMember {
    accountId: string;
    displayName: string;
    role: TeamRole;
    activeDays: number;
    activeMinutes: number;
    aiTurns: number;
    projectsCreated: number;
    lastActiveDate: string | null;
}

interface SummaryProject {
    projectKey: string;
    label: string | null;
    minutes: number;
    members: number;
    aiTurns: number;
}

interface SummaryTeam {
    teamId: string;
    name: string;
    isHead: boolean;
    activeMembers: number;
    activeMinutes: number;
    aiTurns: number;
    projectsCreated: number;
}

interface Summary {
    scope: 'team' | 'firm';
    range: number;
    kpi: Kpi;
    savedMinutesFormula: { perAgentEdit: number; perAiTurn: number };
    daily: { date: string; activeMembers: number; aiTurns: number; activeMinutes: number }[];
    members: SummaryMember[];
    projects: SummaryProject[];
    teams?: SummaryTeam[];
}

const RANGES = [7, 30, 90] as const;

/** 页签按 DESIGN.md 走编辑式下划线，不用胶囊。 */
function Tab({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`px-2 pb-1 text-sm border-b-2 transition-colors cursor-pointer ${
                active
                    ? 'border-king-forest text-king-forest font-bold'
                    : 'border-transparent text-neutral-gray-medium hover:text-neutral-gray-dark'
            }`}
        >
            {children}
        </button>
    );
}

function Tile({ label, value, caption }: { label: string; value: string; caption?: string }) {
    return (
        <div className="min-w-0 break-words [overflow-wrap:anywhere] rounded-xl border border-neutral-gray-light bg-neutral-gray-pale px-4 py-3">
            <p className="text-xs text-neutral-gray-medium mb-1">{label}</p>
            <p className="font-display text-2xl font-bold text-king-forest tabular-nums">{value}</p>
            {caption && <p className="text-xs text-neutral-gray-medium mt-1 tabular-nums">{caption}</p>}
        </div>
    );
}

export function TeamDashboard({
    lang,
    dict,
    hasFirm,
    refreshKey,
}: {
    lang: Locale;
    dict: any;
    hasFirm: boolean;
    refreshKey: number;
}) {
    const t = dict.accountPage;
    const [range, setRange] = useState<number>(7);
    const [scopeChoice, setScopeChoice] = useState<'team' | 'firm'>('team');
    const [data, setData] = useState<Summary | null>(null);
    const [error, setError] = useState('');

    // 团队退出律所后 scope 若还停在 firm 就会一直拿 404：由 hasFirm 派生，不留残值
    const scope = hasFirm ? scopeChoice : 'team';

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/account/team/summary?range=${range}&scope=${scope}`);
                const json = await res.json().catch(() => ({}));
                if (cancelled) return;
                if (!res.ok) {
                    setData(null);
                    setError((json?.error && t.teamErrors[json.error]) || t.loadFailed);
                    return;
                }
                setData(json);
                setError('');
            } catch {
                if (cancelled) return;
                setData(null);
                setError(t.loadFailed);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [range, scope, refreshKey, t.loadFailed, t.teamErrors]);

    const dateLocale = LOCALE_META[lang].bcp47;
    const num = (n: number) => (n ?? 0).toLocaleString(dateLocale);
    const noData = !!data && data.kpi.activeMembers === 0 && data.projects.length === 0;

    return (
        <div className="bg-white border border-[#dce2de] rounded-xl p-6 md:p-8 shadow-sm mb-10">
            <div className="flex flex-col md:flex-row md:items-center gap-4 mb-6">
                <div className="flex items-center gap-3 flex-1">
                    <BarChart3 className="w-5 h-5 text-king-forest" strokeWidth={1.75} />
                    <h2 className="font-display text-xl font-semibold text-neutral-dark-bg">
                        {t.teamDashboardTitle}
                    </h2>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                    {hasFirm && (
                        <div className="flex items-center gap-1 border-r border-neutral-gray-light pr-4">
                            <Tab active={scope === 'team'} onClick={() => setScopeChoice('team')}>
                                {t.teamScopeTeam}
                            </Tab>
                            <Tab active={scope === 'firm'} onClick={() => setScopeChoice('firm')}>
                                {t.teamScopeFirm}
                            </Tab>
                        </div>
                    )}
                    <div className="flex flex-wrap items-center gap-1">
                        {RANGES.map(r => (
                            <Tab key={r} active={range === r} onClick={() => setRange(r)}>
                                {r === 7 ? t.teamRange7 : r === 30 ? t.teamRange30 : t.teamRange90}
                            </Tab>
                        ))}
                    </div>
                </div>
            </div>

            {error && <p className="text-sm text-neutral-gray-medium py-6 text-center">{error}</p>}

            {data && (
                <>
                    <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                        <Tile
                            label={t.teamKpiUsage}
                            value={num(data.kpi.activeMembers)}
                            caption={t.teamKpiUsageCaption
                                .replace('{active}', num(data.kpi.activeMembers))
                                .replace('{total}', num(data.kpi.memberCount))}
                        />
                        <Tile label={t.teamKpiProjectsCreated} value={num(data.kpi.projectsCreated)} />
                        <Tile label={t.teamKpiAppStarts} value={num(data.kpi.appStarts)} />
                        <Tile
                            label={t.teamKpiActiveMinutes}
                            value={formatDuration(t, data.kpi.activeMinutes)}
                        />
                        <Tile
                            label={t.teamKpiSavedMinutes}
                            value={formatDuration(t, data.kpi.savedMinutes)}
                        />
                    </div>
                    {/* 节约时间是估算，系数从接口取，UI 上必须把公式写明，免得被当成实测工时 */}
                    <p className="mt-3 text-xs text-neutral-gray-medium">
                        {t.teamSavedFormula
                            .replace('{edit}', String(data.savedMinutesFormula.perAgentEdit))
                            .replace('{turn}', String(data.savedMinutesFormula.perAiTurn))}
                    </p>

                    {noData && (
                        <p className="text-sm text-neutral-gray-medium py-8 text-center">
                            {t.teamSummaryEmpty}
                        </p>
                    )}

                    {data.members.length > 0 && (
                        <div className="mt-8">
                            <h3 className="text-sm font-semibold text-neutral-gray-dark mb-3">
                                {t.teamMemberStatsTitle}
                            </h3>
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[52rem] text-sm">
                                    <thead>
                                        <tr className="border-b-2 border-neutral-gray-light text-left text-neutral-gray-medium">
                                            <th className="py-2 pr-4 font-medium">{t.teamColMember}</th>
                                            <th className="py-2 pr-4 font-medium">{t.teamColRole}</th>
                                            <th className="py-2 pr-4 font-medium text-right">
                                                {t.teamColActiveDays}
                                            </th>
                                            <th className="py-2 pr-4 font-medium text-right">
                                                {t.teamColActiveMinutes}
                                            </th>
                                            <th className="py-2 pr-4 font-medium text-right">
                                                {t.teamColAiTurns}
                                            </th>
                                            <th className="py-2 pr-4 font-medium text-right">
                                                {t.teamColProjectsCreated}
                                            </th>
                                            <th className="py-2 font-medium">{t.teamColLastActive}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.members.map(m => (
                                            <tr
                                                key={m.accountId}
                                                className="border-b border-neutral-gray-light/60"
                                            >
                                                <td className="min-w-40 py-2.5 pr-4 text-neutral-dark-bg">
                                                    {m.displayName}
                                                </td>
                                                <td className="py-2.5 pr-4 text-neutral-gray-dark">
                                                    {roleLabel(t, m.role)}
                                                </td>
                                                <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-neutral-gray-dark">
                                                    {num(m.activeDays)}
                                                </td>
                                                <td className="py-2.5 pr-4 text-right text-neutral-gray-dark whitespace-nowrap">
                                                    {formatDuration(t, m.activeMinutes)}
                                                </td>
                                                <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-neutral-gray-dark">
                                                    {num(m.aiTurns)}
                                                </td>
                                                <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-neutral-gray-dark">
                                                    {num(m.projectsCreated)}
                                                </td>
                                                <td className="py-2.5 text-neutral-gray-medium whitespace-nowrap">
                                                    {m.lastActiveDate
                                                        ? new Date(m.lastActiveDate).toLocaleDateString(
                                                              dateLocale
                                                          )
                                                        : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {data.projects.length > 0 && (
                        <div className="mt-8">
                            <h3 className="text-sm font-semibold text-neutral-gray-dark mb-3">
                                {t.teamProjectsTitle}
                            </h3>
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[36rem] text-sm">
                                    <thead>
                                        <tr className="border-b-2 border-neutral-gray-light text-left text-neutral-gray-medium">
                                            <th className="py-2 pr-4 font-medium">{t.teamColProject}</th>
                                            <th className="py-2 pr-4 font-medium text-right">
                                                {t.teamColMinutes}
                                            </th>
                                            <th className="py-2 pr-4 font-medium text-right">
                                                {t.teamColParticipants}
                                            </th>
                                            <th className="py-2 font-medium text-right">
                                                {t.teamColAiTurns}
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.projects.map(p => (
                                            <tr
                                                key={p.projectKey}
                                                className="border-b border-neutral-gray-light/60"
                                            >
                                                <td className="min-w-40 py-2.5 pr-4 text-neutral-dark-bg">
                                                    {p.label ? (
                                                        p.label
                                                    ) : (
                                                        <span className="font-mono text-neutral-gray-dark">
                                                            {p.projectKey.slice(0, 8)}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-2.5 pr-4 text-right text-neutral-gray-dark whitespace-nowrap">
                                                    {formatDuration(t, p.minutes)}
                                                </td>
                                                <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-neutral-gray-dark">
                                                    {num(p.members)}
                                                </td>
                                                <td className="py-2.5 text-right font-mono tabular-nums text-neutral-gray-dark">
                                                    {num(p.aiTurns)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {scope === 'firm' && data.teams && data.teams.length > 0 && (
                        <div className="mt-8">
                            <h3 className="text-sm font-semibold text-neutral-gray-dark mb-3">
                                {t.teamTeamsStatsTitle}
                            </h3>
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[40rem] text-sm">
                                    <thead>
                                        <tr className="border-b-2 border-neutral-gray-light text-left text-neutral-gray-medium">
                                            <th className="py-2 pr-4 font-medium">{t.teamColTeam}</th>
                                            <th className="py-2 pr-4 font-medium text-right">
                                                {t.teamKpiActiveMembers}
                                            </th>
                                            <th className="py-2 pr-4 font-medium text-right">
                                                {t.teamColActiveMinutes}
                                            </th>
                                            <th className="py-2 pr-4 font-medium text-right">
                                                {t.teamColAiTurns}
                                            </th>
                                            <th className="py-2 font-medium text-right">
                                                {t.teamColProjectsCreated}
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.teams.map(tm => (
                                            <tr
                                                key={tm.teamId}
                                                className="border-b border-neutral-gray-light/60"
                                            >
                                                <td className="min-w-40 py-2.5 pr-4 text-neutral-dark-bg">
                                                    {tm.name}
                                                    {tm.isHead && (
                                                        <span className="ml-2 rounded border border-king-forest/25 bg-king-forest/5 px-1.5 py-0.5 text-[11px] text-king-forest">
                                                            {t.teamFirmHeadBadge}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-neutral-gray-dark">
                                                    {num(tm.activeMembers)}
                                                </td>
                                                <td className="py-2.5 pr-4 text-right text-neutral-gray-dark whitespace-nowrap">
                                                    {formatDuration(t, tm.activeMinutes)}
                                                </td>
                                                <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-neutral-gray-dark">
                                                    {num(tm.aiTurns)}
                                                </td>
                                                <td className="py-2.5 text-right font-mono tabular-nums text-neutral-gray-dark">
                                                    {num(tm.projectsCreated)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
