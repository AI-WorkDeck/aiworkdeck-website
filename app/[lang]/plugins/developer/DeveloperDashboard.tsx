// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { DEVELOPER_PERMISSIONS, type DeveloperData, type DeveloperProfile } from '@/lib/developer-contract';
const initial: DeveloperData = { kind: 'individual', displayName: '', organization: '', contactType: 'email', contact: '', experience: '', plan: '', permissions: [] };
type Token = { id: string; label: string; expiresAt: string; lastUsedAt: string | null; revokedAt: string | null };
type Plugin = { id: string; version: string; name: string; permissions: string[]; status: string; reviewNote?: string };
const inputClass = 'mt-1 w-full rounded-lg border border-neutral-gray-light bg-white px-3 py-2 text-sm';
const buttonClass = 'rounded-lg bg-king-forest px-4 py-2 text-sm font-medium text-white disabled:opacity-50';
export function DeveloperDashboard({ lang, t }: { lang: string; t: any }) {
  const [profile, setProfile] = useState<DeveloperProfile | null>(null);
  const [form, setForm] = useState<DeveloperData>(initial); const [tokens, setTokens] = useState<Token[]>([]); const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [history, setHistory] = useState<{ version: number; action: string; note: string; createdAt: string }[]>([]);
  const [loaded, setLoaded] = useState(false); const [loadFailed, setLoadFailed] = useState(false); const [phase, setPhase] = useState(''); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const [issued, setIssued] = useState(''); const [label, setLabel] = useState('Agent'); const [days, setDays] = useState(30);
  const errors: Record<string, string> = t.errors;
  const load = useCallback(async (refreshForm = true) => {
    const res = await fetch('/api/developers', { cache: 'no-store' }); const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setProfile(data.profile); setTokens(data.tokens); setPlugins(data.plugins); setHistory(data.history);
    if (refreshForm && data.profile) setForm(Object.fromEntries(Object.keys(initial).map(key => [key, data.profile[key]])) as unknown as DeveloperData);
    setLoaded(true); setLoadFailed(false);
  }, []);
  useEffect(() => { load().catch(e => { setMessage(e.message); setLoadFailed(true); }); }, [load]);
  async function run(action: () => Promise<void>, busyPhase = t.working) { setBusy(true); setPhase(busyPhase); setMessage(''); try { await action(); } catch (e) { const code = e instanceof Error ? e.message : 'unknown'; setMessage(errors[code] || code); } finally { setBusy(false); setPhase(''); } }
  async function request(url: string, method: string, body: unknown) {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const result = await res.json(); if (!res.ok) throw new Error(result.error); return result;
  }
  async function save(event: FormEvent) { event.preventDefault(); await run(async () => { await request('/api/developers', 'PUT', { profile: form, expectedVersion: profile?.version ?? 0 }); await load(); setMessage(t.savedNotice); }, t.savingProfile); }
  const status: Record<string, string> = t.status;
  return <div className="space-y-8 text-neutral-gray-dark">
    <section className="rounded-xl border border-neutral-gray-light bg-white p-5 text-sm leading-7">
      <p>{t.introP1}</p>
      <p>{t.introP2}</p>
      <div className="mt-3 flex flex-wrap gap-4 text-king-forest underline"><Link href={`/${lang}/plugins/develop`}>{t.guideLink}</Link><Link href={`/${lang}/plugins/submit`}>{t.submitLink}</Link></div>
    </section>
    <p role="status" aria-live="polite">{busy ? phase : message}</p>
    {!loaded ? (loadFailed ? <button className={buttonClass} disabled={busy} onClick={() => run(async () => { await load(); })}>{t.loadFailedRetry}</button> : <p>{t.loadingProfile}</p>) : <>
      <section className="rounded-xl border border-neutral-gray-light bg-white p-5">
        <h2 className="text-xl font-semibold">{t.profileHeading} · {status[profile?.status ?? 'draft']}</h2>
        <p className="mt-2 text-sm">{t.profileNotice}</p>
        {profile?.reviewNote && <p className="mt-2 rounded bg-amber-50 p-3">{profile.reviewNote}</p>}
        <p className="mt-2 text-sm">{t.contactVerificationPrefix}{profile?.contactVerification || t.contactVerificationPending}</p>
        <form onSubmit={save} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2"><label>{t.identityTypeLabel}<select className={inputClass} value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value as DeveloperData['kind'] })}><option value="individual">{t.identityIndividual}</option><option value="organization">{t.identityOrganization}</option></select></label>
          <label>{t.developerNameLabel}<input required maxLength={80} className={inputClass} value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} /></label></div>
          <label className="block">{t.organizationNameLabel}<input required={form.kind === 'organization'} maxLength={120} className={inputClass} value={form.organization} onChange={e => setForm({ ...form, organization: e.target.value })} /></label>
          <div className="grid gap-4 sm:grid-cols-2"><label>{t.contactChannelLabel}<select className={inputClass} value={form.contactType} onChange={e => setForm({ ...form, contactType: e.target.value as DeveloperData['contactType'] })}><option value="email">Email</option><option value="phone">{t.contactPhone}</option><option value="other">{t.contactOther}</option></select></label>
          <label>{t.contactDetailsLabel}<input required maxLength={200} className={inputClass} type={form.contactType === 'email' ? 'email' : 'text'} value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} /></label></div>
          <label className="block">{t.experienceLabel}<textarea required maxLength={2000} rows={3} className={inputClass} value={form.experience} onChange={e => setForm({ ...form, experience: e.target.value })} /></label>
          <label className="block">{t.planLabel}<textarea required maxLength={2000} rows={3} className={inputClass} value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })} /></label>
          <fieldset><legend>{t.permissionsLegend}</legend><div className="mt-2 flex flex-wrap gap-3">{DEVELOPER_PERMISSIONS.map(p => <label className="flex items-center gap-2 text-sm" key={p}><input type="checkbox" checked={form.permissions.includes(p)} onChange={e => setForm({ ...form, permissions: e.target.checked ? [...form.permissions, p] : form.permissions.filter(x => x !== p) })} />{p}</label>)}</div></fieldset>
          <p className="text-sm">{t.permissionsHint}</p>
          <div className="flex flex-wrap gap-3"><button className={buttonClass} disabled={busy} type="submit">{t.saveProfileBtn}</button><button type="button" className={buttonClass} disabled={busy || !profile || !['draft', 'rejected'].includes(profile.status)} onClick={() => run(async () => { await request('/api/developers/apply', 'POST', { expectedVersion: profile!.version }); await load(false); }, t.submittingApplication)}>{t.applyBtn}</button></div>
        </form>
      </section>
      <section className="rounded-xl border border-neutral-gray-light bg-white p-5">
        <h2 className="text-xl font-semibold">{t.tokensHeading}</h2><p className="my-3 text-sm leading-6">{t.tokensIntro}</p>
        {issued && <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-3"><label>{t.newTokenLabel}<input className={inputClass} readOnly value={issued} spellCheck={false} /></label><button className="mt-2 underline" onClick={() => setIssued('')}>{t.hideTokenBtn}</button></div>}
        <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); run(async () => { const data = await request('/api/developers/token', 'POST', { label, expiresInDays: days }); setIssued(data.token); await load(false); }, t.generatingToken); }}><label>{t.tokenNameLabel}<input maxLength={80} required className={inputClass} value={label} onChange={e => setLabel(e.target.value)} /></label><label>{t.tokenDaysLabel}<input type="number" min={1} max={90} required className={inputClass} value={days} onChange={e => setDays(Number(e.target.value))} /></label><button className={buttonClass} disabled={busy || profile?.status !== 'approved'}>{t.generateTokenBtn}</button></form>
        <ul className="mt-4 space-y-3">{tokens.map(token => <li key={token.id} className="border-t border-neutral-gray-light pt-3 text-sm"><strong>{token.label}</strong> · {t.tokenExpires} {token.expiresAt.slice(0, 10)} · {t.tokenLastUsed} {token.lastUsedAt || '—'}{token.revokedAt ? <span> · {t.tokenRevoked}</span> : <button className="ml-3 underline" disabled={busy} onClick={() => run(async () => { await request('/api/developers/token', 'DELETE', { id: token.id }); setIssued(''); await load(false); }, t.revokingToken)}>{t.revokeBtn}</button>}</li>)}</ul>
      </section>
      <section className="rounded-xl border border-neutral-gray-light bg-white p-5"><h2 className="text-xl font-semibold">{t.myPluginsHeading}</h2><p className="my-2 text-sm">{t.myPluginsIntro}</p>{plugins.length ? <ul className="space-y-4">{plugins.map(p => <li className="border-t border-neutral-gray-light pt-3" key={`${p.id}@${p.version}`}><strong>{p.name}</strong> · {p.id}@{p.version} · {p.status}<p className="text-sm">{p.permissions.join(', ') || t.noPermissions}</p>{p.reviewNote && <p>{p.reviewNote}</p>}</li>)}</ul> : <p>{t.noSubmissionsYet}</p>}</section>
      <details className="rounded-xl border border-neutral-gray-light bg-white p-5"><summary>{t.historySummary}</summary><ul className="mt-3 space-y-2 text-sm">{history.map(h => <li key={h.version}>{h.createdAt} · {h.action}{h.note && ` · ${h.note}`}</li>)}</ul></details>
    </>}
  </div>;
}
