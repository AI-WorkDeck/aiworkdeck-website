'use client';

import { useCallback, useEffect, useState } from 'react';
import { Inbox, Plus, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAdminSite } from './AdminWorkspace';
import { callJson, transportMessage } from './adminApi';
import {
    EmptyState,
    Field,
    Notice,
    Panel,
    SectionHeader,
    StatusDot,
    TableShell,
    TableSkeleton,
    Thead,
    TD,
    TD_NUM,
    TH,
    TH_RIGHT,
    TR,
} from './ui';

/**
 * Circle 联盟律所后台：每个站点一份律所表（站点由顶部选择器决定）。
 * 维护者专用，界面固定中文、不走 i18n 词典。
 */

interface Firm {
    code: string;
    country: string;
    name: string;
    suffix: string;
    marginMultiplier: number;
    freeDeepseekCents: number;
    enabled: boolean;
    expiresAt: string | null;
    createdAt: string;
    updatedAt: string;
    boundUsersCount: number;
}
interface FirmUser { userId: string; username: string | null; displayName: string | null; boundAt: string; deepseekRemainingCents: number }

const ERRORS: Record<string, string> = {
    invalid_code: '邀请码只能用大写字母、数字和连字符，2–40 位（会自动转大写）。',
    code_exists: '这个邀请码已存在。',
    invalid_name: '律所名称必填，最长 120 字。',
    invalid_country: '国家/地区必填，最长 60 字。',
    invalid_suffix: '后缀必填，最长 40 字，不能含括号。',
    invalid_margin: '毛利乘数需在 1 到 10 之间（1.0 = 不加价）。',
    invalid_cents: 'DeepSeek 赠送额度需为不小于 0 的金额。',
    invalid_expires_at: '到期日期无效。',
    not_found: '律所不存在，请刷新。',
    unauthorized: '登录已失效，请重新登录。',
};

interface Draft { code: string; name: string; country: string; suffix: string; margin: string; freeAmount: string; expiresOn: string; enabled: boolean }
const EMPTY_DRAFT: Draft = { code: '', name: '', country: '', suffix: '', margin: '1.0', freeAmount: '20', expiresOn: '', enabled: true };

/** 「1.0 = 不加价」放在每个出现毛利的地方，避免把 1.0 误读成「100% 加价」。 */
function marginLabel(m: number): string {
    if (Math.abs(m - 1) < 1e-9) return '×1.0 · 不加价';
    return `×${m} · 加价 ${Math.round((m - 1) * 1000) / 10}%`;
}

function isExpired(f: Firm) { return !!f.expiresAt && f.expiresAt <= new Date().toISOString(); }

export function CircleAdmin({ onNeedLogin }: { onNeedLogin: () => void }) {
    const { fetch, copy, config, locale, site } = useAdminSite();
    const fmtMoney = (cents: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: config.currency }).format(cents / 100);
    const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale) : '—');
    const [firms, setFirms] = useState<Firm[] | null>(null);
    const [loadError, setLoadError] = useState('');
    const [needLogin, setNeedLogin] = useState(false);
    const [editing, setEditing] = useState<string | 'new' | null>(null);
    const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
    const [msg, setMsg] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const [usersOf, setUsersOf] = useState<{ firm: Firm; users: FirmUser[] | null } | null>(null);

    const explain = useCallback((r: { status: number; error: string }) => {
        if (r.status === 401) setNeedLogin(true);
        return transportMessage(r, copy) ?? ERRORS[r.error] ?? `操作失败（${r.error}）`;
    }, [copy]);

    const load = useCallback(async () => {
        setLoadError('');
        const r = await callJson<{ firms: Firm[] }>(fetch, '/api/admin/circle-firms');
        if (r.ok) setFirms(r.data.firms); else setLoadError(explain(r));
    }, [fetch, explain]);
    useEffect(() => { load(); }, [load]);

    function startEdit(f: Firm | null) {
        setMsg(null);
        if (!f) { setEditing('new'); setDraft(EMPTY_DRAFT); return; }
        setEditing(f.code);
        setDraft({
            code: f.code, name: f.name, country: f.country, suffix: f.suffix, margin: String(f.marginMultiplier),
            freeAmount: (f.freeDeepseekCents / 100).toFixed(2), expiresOn: f.expiresAt ? f.expiresAt.slice(0, 10) : '', enabled: f.enabled,
        });
    }

    async function send(method: 'POST' | 'PATCH', body: Record<string, unknown>, okText: string) {
        setBusy(true);
        setMsg(null);
        const r = await callJson<{ firms: Firm[] }>(fetch, '/api/admin/circle-firms', { method, body });
        setBusy(false);
        if (!r.ok) { setMsg({ tone: 'danger', text: explain(r) }); return false; }
        setFirms(r.data.firms);
        setMsg({ tone: 'info', text: okText });
        return true;
    }

    async function save(e: React.FormEvent) {
        e.preventDefault();
        const free = Number(draft.freeAmount);
        const body: Record<string, unknown> = {
            code: draft.code,
            name: draft.name,
            country: draft.country,
            suffix: draft.suffix,
            marginMultiplier: Number(draft.margin),
            freeDeepseekCents: Number.isFinite(free) ? Math.round(free * 100) : -1,
            // 到期日按该日 23:59:59（UTC+8）止，两站律所都在亚洲时区。
            expiresAt: draft.expiresOn ? `${draft.expiresOn}T23:59:59+08:00` : null,
        };
        if (editing === 'new') body.enabled = draft.enabled;
        const ok = await send(editing === 'new' ? 'POST' : 'PATCH', body, editing === 'new' ? `已创建 ${draft.code.trim().toUpperCase()}。` : `已保存 ${draft.code}。`);
        if (ok) setEditing(null);
    }

    function toggle(f: Firm) {
        const text = f.enabled
            ? `停用 ${f.code}（${f.name}）？停用后新用户无法再用这个邀请码绑定；已绑定的 ${f.boundUsersCount} 位用户不受影响。`
            : `重新启用 ${f.code}（${f.name}）？`;
        if (!window.confirm(text)) return;
        send('PATCH', { code: f.code, enabled: !f.enabled }, f.enabled ? `已停用 ${f.code}。` : `已启用 ${f.code}。`);
    }

    async function showUsers(f: Firm) {
        setUsersOf({ firm: f, users: null });
        const r = await callJson<{ users: FirmUser[] }>(fetch, `/api/admin/circle-firms/${encodeURIComponent(f.code)}/users`);
        if (r.ok) setUsersOf({ firm: f, users: r.data.users });
        else { setUsersOf(null); setMsg({ tone: 'danger', text: explain(r) }); }
    }

    if (needLogin) {
        return (
            <Notice>
                <p className="flex items-center gap-2"><ShieldCheck className="w-4 h-4" strokeWidth={1.75} />尚未登录后台。请先在本站标签页输入管理口令，再回到「Circle 律所」。</p>
                <Button onClick={onNeedLogin} variant="outline" className="mt-3">去登录</Button>
            </Notice>
        );
    }
    if (loadError && !firms) return <Notice><p>{loadError}</p><Button onClick={load} variant="outline" className="mt-3">{copy.retry}</Button></Notice>;

    const marginNum = Number(draft.margin);
    return (
        <div className="flex flex-col gap-8">
            <SectionHeader
                eyebrow={`计费线 · Circle · ${copy[site]}`}
                title="Circle 联盟律所"
                description="律所用户凭邀请码绑定：显示名加后缀、按律所毛利计费、绑定时送一笔仅限 DeepSeek 的额度。毛利 1.0 = 按成本价、不加价（Circle 律所通常如此）。"
                actions={<>
                    <Button variant="outline" size="sm" onClick={load} className="gap-1.5 border-neutral-gray-light bg-white/70 text-neutral-gray-dark"><RefreshCw className="w-3.5 h-3.5" />刷新</Button>
                    <Button size="sm" onClick={() => startEdit(null)} className="gap-1.5"><Plus className="w-3.5 h-3.5" />新建律所</Button>
                </>}
            />
            {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

            {editing && (
                <Panel title={editing === 'new' ? '新建律所' : `编辑 ${editing}`}
                    description={editing === 'new' ? undefined : '赠送额度只对之后绑定的用户生效；改后缀不会改已绑定用户的显示名。'}>
                    <form onSubmit={save} className="grid gap-5 md:grid-cols-3">
                        <Field label="邀请码" hint="大写字母、数字、连字符；保存时自动转大写。创建后不可改。">
                            <Input value={draft.code} disabled={editing !== 'new'} onChange={e => setDraft({ ...draft, code: e.target.value })} placeholder="KW-XXX-2026" className="bg-white font-mono" dir="ltr" />
                        </Field>
                        <Field label="律所名称"><Input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Singapore: Example LLP" className="bg-white" /></Field>
                        <Field label="国家/地区"><Input value={draft.country} onChange={e => setDraft({ ...draft, country: e.target.value })} placeholder="Singapore" className="bg-white" /></Field>
                        <Field label="显示名后缀" hint={`绑定后显示名变为「张三 (${draft.suffix || '后缀'})」。`}>
                            <Input value={draft.suffix} onChange={e => setDraft({ ...draft, suffix: e.target.value })} placeholder="Example" className="bg-white" />
                        </Field>
                        <Field label="毛利乘数" hint={Number.isFinite(marginNum) && marginNum >= 1 ? `${marginLabel(marginNum)}。范围 1–10；1.0 = 按成本价。` : '范围 1–10；1.0 = 按成本价、不加价。'}>
                            <Input value={draft.margin} onChange={e => setDraft({ ...draft, margin: e.target.value })} inputMode="decimal" className="bg-white" />
                        </Field>
                        <Field label={`绑定赠送 DeepSeek 额度（${config.currency}）`} hint="只能用于 DeepSeek 模型；0 = 不送。">
                            <Input value={draft.freeAmount} onChange={e => setDraft({ ...draft, freeAmount: e.target.value })} inputMode="decimal" className="bg-white" />
                        </Field>
                        <Field label="邀请码到期日" hint="留空 = 长期有效。到期后不能再绑定，已绑定用户不受影响。">
                            <Input type="date" value={draft.expiresOn} onChange={e => setDraft({ ...draft, expiresOn: e.target.value })} className="bg-white" />
                        </Field>
                        {editing === 'new' && (
                            <Field label="状态">
                                <label className="flex h-10 items-center gap-2 text-sm text-neutral-gray-dark">
                                    <input type="checkbox" checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })} className="h-4 w-4 accent-king-forest" />
                                    创建后立即启用
                                </label>
                            </Field>
                        )}
                        <div className="md:col-span-3 flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setEditing(null)}>取消</Button>
                            <Button type="submit" disabled={busy}>{editing === 'new' ? '创建' : '保存'}</Button>
                        </div>
                    </form>
                </Panel>
            )}

            <Panel title="律所列表" padded={false}>
                {!firms ? <TableSkeleton cols={7} /> : firms.length === 0 ? <EmptyState icon={Inbox} title="还没有律所" hint="点「新建律所」添加第一家。" /> : (
                    <TableShell>
                        <Thead><tr>
                            <th className={TH}>邀请码</th><th className={TH}>律所</th><th className={TH}>后缀</th><th className={TH}>毛利</th>
                            <th className={TH_RIGHT}>DeepSeek 赠送</th><th className={TH}>状态</th><th className={TH_RIGHT}>已绑定</th><th className={TH_RIGHT}>操作</th>
                        </tr></Thead>
                        <tbody>
                            {firms.map(f => (
                                <tr key={f.code} className={TR}>
                                    <td className={`${TD} font-mono text-xs`} dir="ltr">{f.code}</td>
                                    <td className={TD}><p>{f.name}</p><p className="text-xs text-neutral-gray-medium">{f.country}</p></td>
                                    <td className={TD}>{f.suffix}</td>
                                    <td className={`${TD} whitespace-nowrap`}>
                                        <span className={Math.abs(f.marginMultiplier - 1) < 1e-9 ? 'text-king-forest' : 'text-amber-700'}>{marginLabel(f.marginMultiplier)}</span>
                                    </td>
                                    <td className={TD_NUM}>{fmtMoney(f.freeDeepseekCents)}</td>
                                    <td className={TD}>
                                        <StatusDot tone={!f.enabled ? 'muted' : isExpired(f) ? 'warn' : 'ok'}>{!f.enabled ? '已停用' : isExpired(f) ? '已到期' : '启用中'}</StatusDot>
                                        <p className="text-xs text-neutral-gray-medium">到期 {f.expiresAt ? fmtDate(f.expiresAt) : '长期'}</p>
                                    </td>
                                    <td className={TD_NUM}>
                                        <button type="button" onClick={() => showUsers(f)} className="inline-flex items-center gap-1 text-king-forest hover:underline" title="查看已绑定用户">
                                            <Users className="w-3.5 h-3.5" />{f.boundUsersCount}
                                        </button>
                                    </td>
                                    <td className={`${TD} text-right whitespace-nowrap`}>
                                        <Button size="sm" variant="outline" onClick={() => startEdit(f)}>编辑</Button>
                                        <Button size="sm" variant={f.enabled ? 'ghost' : 'outline'} onClick={() => toggle(f)} disabled={busy} className="ms-2">{f.enabled ? '停用' : '启用'}</Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </TableShell>
                )}
            </Panel>

            {usersOf && (
                <Panel title={`${usersOf.firm.name} · 已绑定用户`} description="DeepSeek 剩余 = 绑定赠送额度中尚未用完、未过期的部分。" padded={false}
                    actions={<Button size="sm" variant="outline" onClick={() => setUsersOf(null)}>收起</Button>}>
                    {!usersOf.users ? <TableSkeleton cols={4} /> : usersOf.users.length === 0 ? <EmptyState icon={Users} title="还没有用户绑定这家律所" /> : (
                        <TableShell>
                            <Thead><tr><th className={TH}>用户</th><th className={TH}>绑定时间</th><th className={TH_RIGHT}>DeepSeek 剩余</th></tr></Thead>
                            <tbody>
                                {usersOf.users.map(u => (
                                    <tr key={u.userId} className={TR}>
                                        <td className={TD}><p>{u.displayName ?? '（用户不存在）'}</p><p className="font-mono text-xs text-neutral-gray-medium">{u.username ? `@${u.username}` : u.userId}</p></td>
                                        <td className={`${TD} text-xs`}>{new Date(u.boundAt).toLocaleString(locale, { hour12: false })}</td>
                                        <td className={TD_NUM}>{fmtMoney(u.deepseekRemainingCents)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </TableShell>
                    )}
                </Panel>
            )}
        </div>
    );
}
