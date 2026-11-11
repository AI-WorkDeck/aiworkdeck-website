// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';

import { useAdminSite } from './AdminWorkspace';
import { useCallback, useEffect, useState } from 'react';
import type { DeveloperProfile } from '@/lib/developer-contract';
type Entry = DeveloperProfile & { plugins: { id: string; name: string; version: string; permissions: string[]; status: string }[]; history: { version: number; action: string; note: string; createdAt: string }[] };
export function DeveloperReview() {
    const { fetch } = useAdminSite();
  const [entries, setEntries] = useState<Entry[]>([]); const [loading, setLoading] = useState(true); const [loaded, setLoaded] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({}); const [checked, setChecked] = useState<Record<string, boolean>>({});
  const load = useCallback(async () => { setLoading(true); try { const r = await fetch('/api/admin/developers', { cache: 'no-store' }); const data = await r.json(); if (!r.ok) throw new Error(data.error); setEntries(data.developers); setChecked({}); setNotes({}); setLoaded(true); setError(''); } finally { setLoading(false); } }, []);
  useEffect(() => { load().catch(e => setError(e.message)); }, [load]);
  async function review(p: Entry, action: string) {
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/admin/developers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: p.userId, expectedVersion: p.version, action, note: notes[p.userId] || '', contactChecked: checked[p.userId] === true }) });
      const data = await r.json(); if (!r.ok) throw new Error(data.error);
      setChecked({}); await load();
    } catch (e) { setError(e instanceof Error ? e.message : '审核失败'); } finally { setBusy(false); }
  }
  return <section className="space-y-5"><h2 className="text-2xl font-semibold">开发者资格审核</h2><p>初期免费。核对自行声明的身份、作品计划、权限理由与联系渠道；这不是实名 / KYC 认证，也不替代逐个插件安全审核。联系方式仅管理员和本人可见。</p><p role="status" aria-live="polite">{busy ? '正在保存审核决定…' : loading ? '正在读取开发者申请…' : error}</p><button disabled={loading || busy} className="underline" onClick={() => load().catch(e => setError(e.message))}>刷新</button>
    {loaded && !loading && !entries.length && <p>暂无申请。</p>}
    {entries.map(p => <article key={p.userId} className="space-y-3 rounded-xl border border-neutral-gray-light bg-white p-5">
      <h3 className="text-lg font-semibold">{p.displayName} · {p.status}</h3><p className="text-sm">账号 ID：{p.userId} · 资料版本 {p.version}</p>
      <dl className="grid gap-2 text-sm"><div><dt className="font-medium">自行声明身份</dt><dd>{p.kind === 'organization' ? `组织：${p.organization}` : '个人'}</dd></div><div><dt className="font-medium">私有联系方式</dt><dd>{p.contactType}：{p.contact} · 核验：{p.contactVerification || '待核验'}</dd></div><div><dt className="font-medium">开发经历</dt><dd className="whitespace-pre-wrap">{p.experience}</dd></div><div><dt className="font-medium">开发计划与权限理由</dt><dd className="whitespace-pre-wrap">{p.plan}</dd></div><div><dt className="font-medium">申请权限</dt><dd>{p.permissions.join(', ') || '无'}</dd></div></dl>
      {p.reviewNote && <p>上次意见：{p.reviewNote}</p>}
      <details><summary>该账号插件（{p.plugins.length}）与资格记录</summary><ul>{p.plugins.map(x => <li key={`${x.id}@${x.version}`}>{x.name} · {x.id}@{x.version} · {x.status} · {x.permissions.join(', ') || '无权限'}</li>)}</ul><ul className="mt-3 text-sm">{p.history.map(h => <li key={h.version}>{h.createdAt} · {h.action} · {h.note}</li>)}</ul></details>
      {['pending', 'approved', 'suspended'].includes(p.status) && <div className="space-y-3"><label className="block">审核说明（驳回、暂停必填）<textarea maxLength={2000} className="mt-1 w-full rounded border border-neutral-gray-light p-2" value={notes[p.userId] || ''} onChange={e => setNotes({ ...notes, [p.userId]: e.target.value })} /></label>
        {['pending', 'suspended'].includes(p.status) && <label className="flex items-center gap-2"><input type="checkbox" checked={checked[p.userId] || false} onChange={e => setChecked({ ...checked, [p.userId]: e.target.checked })} />已通过该渠道人工联系确认（已验证的账号邮箱/手机号可免选）</label>}
        <div className="flex gap-4">{['pending', 'suspended'].includes(p.status) && <button disabled={busy} className="rounded bg-king-forest px-4 py-2 text-white disabled:opacity-50" onClick={() => review(p, 'approve')}>{p.status === 'suspended' ? '复核并恢复资格' : '通过资格审核'}</button>}{p.status === 'pending' && <button disabled={busy || !notes[p.userId]?.trim()} className="underline disabled:opacity-50" onClick={() => review(p, 'reject')}>要求补充资料</button>}{p.status === 'approved' && <button disabled={busy || !notes[p.userId]?.trim()} className="underline disabled:opacity-50" onClick={() => review(p, 'suspend')}>暂停资格</button>}</div></div>}
    </article>)}
  </section>;
}
