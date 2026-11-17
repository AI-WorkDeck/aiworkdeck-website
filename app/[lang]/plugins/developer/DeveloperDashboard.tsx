// SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { DEVELOPER_PERMISSIONS, type DeveloperData, type DeveloperProfile } from '@/lib/developer-contract';

const initial: DeveloperData = { kind: 'individual', displayName: '', organization: '', contactType: 'email', contact: '', experience: '', plan: '', permissions: [] };
type Account = { displayName: string; email: string; emailVerifiedAt?: string; phone?: string };
type Token = { id: string; label: string; expiresAt: string; lastUsedAt: string | null; revokedAt: string | null };
type Plugin = { id: string; version: string; name: string; permissions: string[]; status: string; reviewNote?: string };
const inputClass = 'mt-1.5 w-full rounded-lg border border-neutral-gray-light bg-white px-3 py-2.5 text-sm text-neutral-gray-dark outline-none transition focus:border-king-forest focus:ring-2 focus:ring-king-mint/30 disabled:bg-neutral-gray-pale disabled:text-neutral-gray-medium';
const buttonClass = 'min-h-11 rounded-lg bg-king-forest px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-king-forest/90 disabled:cursor-not-allowed disabled:opacity-50';

function accountDefaults(account: Account): DeveloperData {
  const contactType = account.emailVerifiedAt || !account.phone ? 'email' : 'phone';
  return { ...initial, displayName: account.displayName, contactType, contact: contactType === 'email' ? account.email : account.phone || account.email };
}

export function DeveloperDashboard({ lang, t, account }: { lang: string; t: any; account: Account }) {
  const [profile, setProfile] = useState<DeveloperProfile | null>(null);
  const [form, setForm] = useState<DeveloperData>(() => accountDefaults(account));
  const [tokens, setTokens] = useState<Token[]>([]);
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [history, setHistory] = useState<{ version: number; action: string; note: string; createdAt: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [phase, setPhase] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [issued, setIssued] = useState('');
  const [label, setLabel] = useState('Agent');
  const [days, setDays] = useState(30);
  const errors: Record<string, string> = t.errors;
  const status: Record<string, string> = t.status;

  const load = useCallback(async (refreshForm = true) => {
    const res = await fetch('/api/developers', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setProfile(data.profile);
    setTokens(data.tokens);
    setPlugins(data.plugins);
    setHistory(data.history);
    if (refreshForm) setForm(data.profile ? Object.fromEntries(Object.keys(initial).map(key => [key, data.profile[key]])) as unknown as DeveloperData : accountDefaults(account));
    setLoaded(true);
    setLoadFailed(false);
  }, [account]);

  useEffect(() => { load().catch(e => { setMessage(e.message); setLoadFailed(true); }); }, [load]);

  async function run(action: () => Promise<void>, busyPhase = t.working) {
    setBusy(true);
    setPhase(busyPhase);
    setMessage('');
    try { await action(); }
    catch (e) { const code = e instanceof Error ? e.message : 'unknown'; setMessage(errors[code] || code); }
    finally { setBusy(false); setPhase(''); }
  }

  async function request(url: string, method: string, body: unknown) {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error);
    return result;
  }

  async function saveAndApply(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await request('/api/developers', 'PUT', { profile: form, expectedVersion: profile?.version ?? 0, apply: true });
      await load();
      setMessage(t.savedNotice);
    }, t.submittingApplication);
  }

  const applicationClosed = profile?.status === 'pending' || profile?.status === 'suspended';

  return <div className="space-y-6 text-neutral-gray-dark">
    <section className="rounded-xl border border-neutral-gray-light bg-white p-5 text-sm leading-7 shadow-sm">
      <p>{t.introP1}</p>
      <p className="mt-1">{t.introP2}</p>
      <div className="mt-4 flex flex-wrap gap-4 font-medium text-king-forest underline underline-offset-4">
        <Link href={`/${lang}/plugins/submit`}>{t.submitLink}</Link>
        <Link href={`/${lang}/plugins/develop`}>{t.guideLink}</Link>
      </div>
    </section>

    <p role="status" aria-live="polite" className="min-h-6 text-sm">{busy ? phase : message}</p>
    {!loaded ? (loadFailed ? <button className={buttonClass} disabled={busy} onClick={() => run(async () => { await load(); })}>{t.loadFailedRetry}</button> : <p>{t.loadingProfile}</p>) : <>
      <section className="rounded-xl border border-neutral-gray-light bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold">{t.profileHeading}</h2>
          <span className="rounded-full bg-neutral-gray-pale px-2.5 py-1 text-xs font-medium">{status[profile?.status ?? 'draft']}</span>
        </div>
        <p className="mt-2 text-sm leading-6 text-neutral-gray-medium">{t.profileNotice}</p>
        {profile?.reviewNote && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm">{profile.reviewNote}</p>}
        <p className="mt-3 text-sm">{t.contactVerificationPrefix}{profile?.contactVerification || t.contactVerificationPending}</p>
        <form onSubmit={saveAndApply} className="mt-5 space-y-5">
          <fieldset disabled={busy || applicationClosed} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label>{t.identityTypeLabel}<select className={inputClass} value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value as DeveloperData['kind'] })}><option value="individual">{t.identityIndividual}</option><option value="organization">{t.identityOrganization}</option></select></label>
              <label>{t.developerNameLabel}<input required maxLength={80} className={inputClass} value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} /></label>
            </div>
            {form.kind === 'organization' && <label className="block">{t.organizationNameLabel}<input required maxLength={120} className={inputClass} value={form.organization} onChange={e => setForm({ ...form, organization: e.target.value })} /></label>}
            <div className="grid gap-4 sm:grid-cols-2">
              <label>{t.contactChannelLabel}<select className={inputClass} value={form.contactType} onChange={e => setForm({ ...form, contactType: e.target.value as DeveloperData['contactType'] })}><option value="email">Email</option><option value="phone">{t.contactPhone}</option><option value="other">{t.contactOther}</option></select></label>
              <label>{t.contactDetailsLabel}<input required maxLength={200} className={inputClass} type={form.contactType === 'email' ? 'email' : 'text'} value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} /></label>
            </div>
            <label className="block">{t.planLabel}<textarea required maxLength={2000} rows={3} className={inputClass} value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })} /></label>
            <label className="block">{t.experienceLabel}<textarea required maxLength={2000} rows={2} className={inputClass} value={form.experience} onChange={e => setForm({ ...form, experience: e.target.value })} /></label>
            <fieldset><legend className="font-medium">{t.permissionsLegend}</legend><div className="mt-2 flex flex-wrap gap-3">{DEVELOPER_PERMISSIONS.map(p => <label className="flex items-center gap-2 rounded-lg border border-neutral-gray-light px-3 py-2 text-sm" key={p}><input type="checkbox" checked={form.permissions.includes(p)} onChange={e => setForm({ ...form, permissions: e.target.checked ? [...form.permissions, p] : form.permissions.filter(x => x !== p) })} />{p}</label>)}</div></fieldset>
            <p className="text-sm text-neutral-gray-medium">{t.permissionsHint}</p>
          </fieldset>
          {!applicationClosed && <button className={buttonClass} disabled={busy} type="submit">{t.saveProfileBtn}</button>}
        </form>
      </section>

      <details className="group rounded-xl border border-neutral-gray-light bg-white p-5 shadow-sm">
        <summary className="cursor-pointer text-lg font-semibold">{t.tokensHeading}</summary>
        <p className="my-3 text-sm leading-6 text-neutral-gray-medium">{t.tokensIntro}</p>
        {issued && <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3"><label>{t.newTokenLabel}<input className={inputClass} readOnly value={issued} spellCheck={false} /></label><button className="mt-2 underline" onClick={() => setIssued('')}>{t.hideTokenBtn}</button></div>}
        <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); run(async () => { const data = await request('/api/developers/token', 'POST', { label, expiresInDays: days }); setIssued(data.token); await load(false); }, t.generatingToken); }}>
          <label>{t.tokenNameLabel}<input maxLength={80} required className={inputClass} value={label} onChange={e => setLabel(e.target.value)} /></label>
          <label>{t.tokenDaysLabel}<input type="number" min={1} max={90} required className={inputClass} value={days} onChange={e => setDays(Number(e.target.value))} /></label>
          <button className={buttonClass} disabled={busy || profile?.status !== 'approved'}>{t.generateTokenBtn}</button>
        </form>
        <ul className="mt-4 space-y-3">{tokens.map(token => <li key={token.id} className="border-t border-neutral-gray-light pt-3 text-sm"><strong>{token.label}</strong> · {t.tokenExpires} {token.expiresAt.slice(0, 10)} · {t.tokenLastUsed} {token.lastUsedAt || '—'}{token.revokedAt ? <span> · {t.tokenRevoked}</span> : <button className="ml-3 underline" disabled={busy} onClick={() => run(async () => { await request('/api/developers/token', 'DELETE', { id: token.id }); setIssued(''); await load(false); }, t.revokingToken)}>{t.revokeBtn}</button>}</li>)}</ul>
      </details>

      <section className="rounded-xl border border-neutral-gray-light bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold">{t.myPluginsHeading}</h2>
        <p className="my-2 text-sm text-neutral-gray-medium">{t.myPluginsIntro}</p>
        {plugins.length ? <ul className="space-y-4">{plugins.map(p => <li className="border-t border-neutral-gray-light pt-3" key={`${p.id}@${p.version}`}><strong>{p.name}</strong> · {p.id}@{p.version} · {status[p.status] || p.status}<p className="text-sm">{p.permissions.join(', ') || t.noPermissions}</p>{p.reviewNote && <p>{p.reviewNote}</p>}</li>)}</ul> : <p>{t.noSubmissionsYet}</p>}
      </section>
      <details className="rounded-xl border border-neutral-gray-light bg-white p-5 shadow-sm"><summary className="cursor-pointer">{t.historySummary}</summary><ul className="mt-3 space-y-2 text-sm">{history.map(h => <li key={h.version}>{h.createdAt} · {h.action}{h.note && ` · ${h.note}`}</li>)}</ul></details>
    </>}
  </div>;
}
