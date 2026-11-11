// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
import {useState} from 'react';
import {LOCALE_META,type Locale} from '@/i18n-config';
import type {cloudState} from '@/lib/postpaid';
type State=ReturnType<typeof cloudState>;
export function PostpaidSection({lang,dict,initial}:{lang:Locale;dict:any;initial:State}) {
    const t=dict.accountPage.postpaid;
    const [state,setState]=useState(initial),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(false);
    const amount=(n:number)=>new Intl.NumberFormat(LOCALE_META[lang].bcp47,{style:'currency',currency:state.billing.cashCurrency}).format(n/100);
    const date=(value:string)=>new Date(value).toLocaleString(LOCALE_META[lang].bcp47);
    async function refresh() {
        setBusy(true);setError(false);
        try {const r=await fetch('/api/account/postpaid',{cache:'no-store'});if(!r.ok)throw new Error();setState(await r.json());}catch{setError(true);}finally{setBusy(false);}
    }
    async function accept(action='accept') {
        setBusy(true);setError(false);
        try {const r=await fetch('/api/account/postpaid',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({policyVersion:state.billing.policyVersion,confirmed:true,action})});if(!r.ok)throw new Error();setState(await r.json());setConfirmed(false);}
        catch {setError(true);}finally{setBusy(false);}
    }
    return <section id="postpaid" className="scroll-mt-28 mt-8 rounded-xl border border-king-forest/30 bg-white p-6 md:p-8" aria-busy={busy}>
        <h2 className="text-xl font-semibold">{t.title}</h2>
        <p className="mt-3 text-sm leading-relaxed">{t.terms}</p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div><dt>{t.storage}</dt><dd>{t.storageRate.replace('{amount}',amount(state.billing.storagePrice.cashCentsPerGiBMonth))}</dd></div>
            <div><dt>{t.egress}</dt><dd>{t.egressRate.replace('{amount}',amount(state.billing.egressPrice.cashCentsPerGiB))}</dd></div>
            <div><dt>{t.limit}</dt><dd>{amount(state.billing.creditLimitCents)}</dd></div>
            <div><dt>{t.debt}</dt><dd>{amount(state.billing.debtCents)}</dd></div>
        </dl>
        {state.billing.cleanupAt&&<p role="status" className="mt-4 text-red-700">{t.deadline.replace('{date}',date(state.billing.cleanupAt))}</p>}
        {state.billing.accepted?<p className="mt-4">{t.accepted}</p>:!state.billing.acceptEnabled?<p role="status" className="mt-4">{t.unavailable}</p>:<div className="mt-4 space-y-3">
            <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} disabled={busy}/><span>{t.confirm}</span></label>
            <button className="rounded bg-king-forest px-4 py-2 text-white disabled:opacity-50" disabled={!confirmed||busy} onClick={()=>accept()}>{busy?t.loading:t.accept}</button>
        </div>}
        {state.cloudAccess.frozen&&state.billing.debtCents===0&&<button className="mt-4 rounded border px-4 py-2" disabled={busy} onClick={()=>accept('resume')}>{t.resume}</button>}
        <button className="mt-4 rounded border px-4 py-2" disabled={busy} onClick={refresh}>{busy?t.loading:t.refresh}</button>
        <a className="mt-4 block text-king-forest underline" href="#wallet">{t.repay}</a>
        {error&&<p role="alert" className="mt-3 text-red-700">{t.error}</p>}
    </section>;
}
