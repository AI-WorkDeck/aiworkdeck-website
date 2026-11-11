'use client';

import { useState, type ReactNode } from 'react';
import { Download, ArrowRight, Check } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { DEPLOYMENT_PRICING } from '@/lib/pricing';
import { DEFAULT_CONFIG, estimateDeployment, type DeploymentConfig } from '@/lib/deployment-planner';
import type { Locale } from '@/i18n-config';
import { budgetLabels, modelChecks, modelNames, options, personnel, pick, plannerCopy, requirements, type Copy } from './content';
import styles from './deployment.module.css';

const money = (value: number) => `¥${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const resources = ['4 vCPU / 8 GB', '8 vCPU / 16 GB', '16 vCPU / 32 GB'];

function NumberField({ label, value, onChange, min = 0, max = 100000000, step = 1, hint }: {
    label: string; value: number | null; onChange: (n: number | null) => void;
    min?: number; max?: number; step?: number; hint?: string;
}) {
    // Keep an empty required field editable without passing NaN into the estimator.
    const [draft, setDraft] = useState<string | null>(null);
    return <label className={styles.field}>
        <span>{label}</span>
        <input type="number" min={min} max={max} step={step} value={draft ?? value ?? ''}
            placeholder="—" inputMode="decimal"
            onChange={e => {
                const raw = e.target.value;
                setDraft(raw);
                if (!raw) { if (min === 0) onChange(null); return; }
                const n = Number(raw);
                if (Number.isFinite(n) && n >= min && n <= max) onChange(step === 1 ? Math.floor(n) : n);
            }}
            onBlur={e => {
                const n = Number(e.target.value);
                if (e.target.value !== '' && Number.isFinite(n)) onChange(Math.max(min, Math.min(max, step === 1 ? Math.floor(n) : n)));
                setDraft(null);
            }} />
        {hint && <small>{hint}</small>}
    </label>;
}

function Section({ number, title, intro, children }: { number: string; title: string; intro?: string; children: ReactNode }) {
    return <section className={styles.section}>
        <div className={styles.sectionTitle}><span>{number}</span><h2>{title}</h2></div>
        {intro && <p className={styles.intro}>{intro}</p>}{children}
    </section>;
}

export function DeploymentPlanner({ lang }: { lang: Locale }) {
    const copy = (value: Copy) => pick(lang, value);
    const [config, setConfig] = useState<DeploymentConfig>({ ...DEFAULT_CONFIG });
    const [showAll, setShowAll] = useState(false);
    const [exported, setExported] = useState(false);
    const set = <K extends keyof DeploymentConfig>(key: K, value: DeploymentConfig[K]) => {
        setConfig(c => ({ ...c, [key]: value })); setExported(false);
    };
    const budget = estimateDeployment(config);
    const selectedRequirements = requirements.filter(r => !r.option || config.options.includes(r.option));
    const hasLocal = config.model !== 'cloud';
    const confirmed = budget.missing.length === 0 && budget.conflicts.length === 0 && !budget.reviewRequired;
    const ours = budget.lines.filter(l => ['license', 'setup', 'adaptation', 'gitSetup'].includes(l.key));
    const customer = budget.lines.filter(l => !ours.includes(l));
    const ourFirstYear = ours.reduce((n, l) => n + (l.amount ?? 0), 0);
    const customerFirstYear = budget.firstYear - ourFirstYear;
    const period = (p: string) => p === 'once' ? copy(plannerCopy.periodOnce) : p === 'year' ? copy(plannerCopy.periodYear) : copy(plannerCopy.periodMonth);
    const pending = copy(plannerCopy.pending);
    const amount = (n: number | null) => n === null ? pending : money(n);
    const field = (key: keyof DeploymentConfig, label: string, settings: { nullable?: boolean; min?: number; max?: number; step?: number; hint?: string } = {}) => <NumberField
        label={label} value={config[key] as number | null} min={settings.min} max={settings.max} step={settings.step} hint={settings.hint}
        onChange={n => set(key, settings.nullable !== false && !['users', 'concurrency', 'cloudPercent'].includes(key) ? n : n ?? settings.min ?? 0)} />;
    const hardware = `${resources[budget.resource]}${budget.extraMemoryGB ? copy(plannerCopy.extraMemory) : ''}`;
    const missingNames = budget.missing.map(key => copy(budgetLabels[key])).join(copy(plannerCopy.listJoiner));
    const warnings = [
        ...(hasLocal ? [copy(plannerCopy.warnLocal)] : []),
        ...(config.offline ? [copy(plannerCopy.warnOffline)] : []),
        ...(budget.conflicts.length ? [copy(plannerCopy.warnConflict)] : []),
        ...(config.concurrency > 20 || config.users > 200 ? [copy(plannerCopy.warnScale)] : []),
    ];

    function exportChecklist() {
        const lineText = (lines: typeof budget.lines) => lines.map(l => `- ${copy(budgetLabels[l.key])}: ${amount(l.amount)} ${period(l.period)}`).join('\n');
        const report = [
            `# AI WorkDeck · ${copy(plannerCopy.reportTitle)}`,
            `${copy(plannerCopy.reportRevision)}: 2026-10-13`,
            copy(plannerCopy.reportDisclaimer),
            `## ${copy(plannerCopy.reportConfig)}`,
            `- ${copy(plannerCopy.reportUsersConcurrency)}: ${config.users} / ${config.concurrency}`,
            `- ${copy(modelNames[config.model])}; ${copy(plannerCopy.reportOffline)}: ${config.offline ? copy(plannerCopy.yes) : copy(plannerCopy.no)}`,
            `- ${copy(plannerCopy.reportLicense)}: ${config.commercial ? copy(plannerCopy.commercialLicense) : 'AGPLv3'}`,
            `- ${copy(plannerCopy.reportReuseServer)}: ${config.ownedServer ? copy(plannerCopy.reuseServerYes) : copy(plannerCopy.no)}`,
            `- ${copy(plannerCopy.reportOptions)}: ${options.filter(o => config.options.includes(o.id)).map(o => copy(o.title)).join(', ') || copy(plannerCopy.none)}`,
            `## ${copy(plannerCopy.payableToUs)}`, lineText(ours),
            `${copy(plannerCopy.knownOurSubtotal)}: ${money(ourFirstYear)}`,
            `## ${copy(plannerCopy.customerProcurement)}`, lineText(customer),
            `${copy(plannerCopy.knownCustomerSubtotal)}: ${money(customerFirstYear)}`,
            `## ${copy(plannerCopy.overallInvestment)}`,
            `${confirmed ? copy(plannerCopy.firstYearEstimate) : copy(plannerCopy.firstYearPartial)}: ${money(budget.firstYear)}`,
            `${copy(plannerCopy.recurringYearCost)}: ${money(budget.recurringYear)}`,
            `${copy(plannerCopy.reportPendingLabel)}: ${missingNames || copy(plannerCopy.noBlankLines)}`,
            ...warnings,
            `## ${copy(plannerCopy.budgetAssumptions)}`,
            copy(plannerCopy.assumptionsNote),
            `${copy(plannerCopy.monthlyIoTokens)}: ${config.monthlyInput ?? pending} / ${config.monthlyOutput ?? pending}`,
            `${copy(plannerCopy.ioRate)}: ${config.inputRate ?? pending} / ${config.outputRate ?? pending}`,
            `${copy(plannerCopy.cloudUsageShare)}: ${config.model === 'cloud' ? 100 : config.model === 'local' ? 0 : config.cloudPercent}%`,
            `${copy(plannerCopy.ocrAsrSummary)}: ${config.ocrPages ?? pending} × ${config.ocrRate ?? pending}; ${config.asrHours ?? pending} × ${config.asrRate ?? pending}`,
            `## ${copy(plannerCopy.serverCapacityHeading)}`,
            `${hardware}; ${copy(plannerCopy.usableDisk)}: ${budget.diskGB} GB; ${copy(plannerCopy.backupStart)}: ${budget.diskGB * 2} GB`,
            copy(plannerCopy.diskNoteReport),
            `## ${copy(plannerCopy.reqAcceptanceHeading)}`,
            ...selectedRequirements.map(r => `### ${copy(r.title)} · ${copy(r.status)}\n${copy(r.body)}\n${copy(r.acceptance)}`),
            `## ${copy(plannerCopy.meteringHeading)}`, ...modelChecks.map(c => `- ${copy(c)}`),
            `## ${copy(plannerCopy.responsibilitiesHeading)}`, ...personnel.map(p => `- ${copy(p.role)}: ${copy(p.customer)} ${copy(p.delivery)}`),
            `## ${copy(plannerCopy.scopeOfferHeading)}`,
            copy(plannerCopy.scopeOfferReportBody),
        ].join('\n\n');
        const url = URL.createObjectURL(new Blob([report], { type: 'text/markdown;charset=utf-8' }));
        const a = document.createElement('a'); a.href = url; a.download = `aiworkdeck-deployment-${lang}.md`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000); setExported(true);
    }

    return <div className={styles.planner}>
        <PageHero eyebrow={copy(plannerCopy.heroEyebrow)} title={copy(plannerCopy.heroTitle)}
            subtitle={copy(plannerCopy.heroSubtitle)} />
        <div className={styles.container}>
            <div className={styles.paymentNote}><strong>{copy(plannerCopy.whoPaysTitle)}</strong><p>{copy(plannerCopy.whoPaysBody)}</p></div>
            <div className={styles.layout}>
                <div className={styles.steps}>
                    <Section number="01" title={copy(plannerCopy.s1Title)}>
                        <div className={styles.presets}>{[10, 30, 80, 200].map(n => <button type="button" key={n} aria-pressed={config.users === n} onClick={() => {
                            setConfig(c => ({ ...c, users: n, concurrency: n <= 20 ? 3 : n <= 50 ? 5 : n <= 100 ? 10 : 20, serverMonthly: n <= 20 ? 500 : n <= 50 ? 1000 : n <= 100 ? 2000 : 4000 })); setExported(false);
                        }}>{n} {copy(plannerCopy.presetUsersSuffix)}</button>)}</div>
                        <div className={styles.fields}>
                            {field('users', copy(plannerCopy.fieldTotalUsers), { min: 1, max: 10000 })}
                            {field('concurrency', copy(plannerCopy.fieldPeakConcurrency), { min: 1, max: 1000, hint: copy(plannerCopy.fieldPeakConcurrencyHint) })}
                        </div>
                        <p className={styles.note}>{copy(plannerCopy.s1Note)}</p>
                        <label className={styles.check}><input type="checkbox" checked={config.commercial} onChange={e => set('commercial', e.target.checked)} /><span>{copy(plannerCopy.commercialCheckLabel)}<small>{copy(plannerCopy.commercialCheckHint)}</small></span></label>
                    </Section>
                    <Section number="02" title={copy(plannerCopy.s2Title)} intro={copy(plannerCopy.s2Intro)}>
                        <fieldset className={styles.choices}><legend className="sr-only">{copy(plannerCopy.modelModeLegend)}</legend>
                            {(['cloud', 'hybrid', 'local'] as const).map(mode => <label key={mode} className={config.model === mode ? styles.choiceSelected : styles.choice}>
                                <input type="radio" name="model" value={mode} checked={config.model === mode} onChange={() => set('model', mode)} />
                                <strong>{copy(modelNames[mode])}</strong><small>{mode === 'cloud' ? copy(plannerCopy.modeCloudDesc) : mode === 'hybrid' ? copy(plannerCopy.modeHybridDesc) : copy(plannerCopy.modeLocalDesc)}</small>
                            </label>)}
                        </fieldset>
                        <label className={styles.check}><input type="checkbox" checked={config.offline} onChange={e => set('offline', e.target.checked)} /><span>{copy(plannerCopy.offlineCheckLabel)}<small>{copy(plannerCopy.offlineCheckHint)}</small></span></label>
                        {warnings.length > 0 && <div className={styles.warning} role="status">{warnings.map(w => <p key={w}>{w}</p>)}</div>}
                        {config.model !== 'local' && <details className={styles.details} open><summary>{copy(plannerCopy.cloudAssumptionsSummary)}</summary>
                            <p className={styles.note}>{copy(plannerCopy.cloudAssumptionsNote)}</p>
                            <div className={styles.fields}>
                                {field('monthlyInput', copy(plannerCopy.fieldMonthlyInput), { step: 0.1 })}
                                {field('monthlyOutput', copy(plannerCopy.fieldMonthlyOutput), { step: 0.1 })}
                                {field('inputRate', copy(plannerCopy.fieldInputRate), { step: 0.01 })}
                                {field('outputRate', copy(plannerCopy.fieldOutputRate), { step: 0.01 })}
                                {config.model === 'hybrid' && field('cloudPercent', copy(plannerCopy.fieldCloudPercent), { max: 100 })}
                            </div><p className={styles.formula}>{copy(plannerCopy.cloudFormula)}</p>
                        </details>}
                        {hasLocal && <div className={styles.fields}>
                            {field('gpuPurchase', copy(plannerCopy.fieldGpuPurchase), { nullable: true, hint: copy(plannerCopy.fieldGpuPurchaseHint) })}
                            {field('gpuMonthly', copy(plannerCopy.fieldGpuMonthly), { nullable: true })}
                        </div>}
                        {(hasLocal || config.offline || config.options.includes('mobile')) && field('adaptation', copy(plannerCopy.fieldAdaptation), { nullable: true, hint: copy(plannerCopy.fieldAdaptationHint) })}
                    </Section>
                    <Section number="03" title={copy(plannerCopy.s3Title)} intro={copy(plannerCopy.s3Intro)}>
                        <div className={styles.optionGrid}>{options.map(o => <label className={styles.option} key={o.id}><input type="checkbox" checked={config.options.includes(o.id)} onChange={e => set('options', e.target.checked ? [...config.options, o.id] : config.options.filter(id => id !== o.id))} /><span><strong>{copy(o.title)}</strong><small>{copy(o.description)}</small></span></label>)}</div>
                        <div className={styles.fields}>
                            {config.options.includes('ocr') && <>{field('ocrPages', copy(plannerCopy.fieldOcrPages))}{field('ocrRate', copy(plannerCopy.fieldOcrRate), { step: 0.001 })}</>}
                            {config.options.includes('asr') && <>{field('asrHours', copy(plannerCopy.fieldAsrHours), { step: 0.5 })}{field('asrRate', copy(plannerCopy.fieldAsrRate), { step: 0.01 })}</>}
                            {config.options.includes('search') && field('searchMonthly', copy(plannerCopy.fieldSearchMonthly), { nullable: true })}
                            {config.options.includes('data') && field('dataMonthly', copy(plannerCopy.fieldDataMonthly), { nullable: true })}
                            {config.options.includes('mobile') && field('mobileMonthly', copy(plannerCopy.fieldMobileMonthly), { nullable: true })}
                            {config.options.includes('externalGit') && field('gitSetup', copy(plannerCopy.fieldGitSetup), { nullable: true })}
                        </div>
                        <p className={styles.note}>{copy(plannerCopy.s3Note)}</p>
                    </Section>
                    <Section number="04" title={copy(plannerCopy.s4Title)}>
                        <div className={styles.hardware}><div><span>{copy(plannerCopy.appServerStart)}</span><strong>{hardware}</strong></div><div><span>{copy(plannerCopy.usableDiskBackupStart)}</span><strong>{budget.diskGB} GB / {budget.diskGB * 2} GB</strong></div></div>
                        <p className={styles.note}>{copy(plannerCopy.s4Note1)}</p>
                        <p className={styles.note}>{copy(plannerCopy.s4Note2)}</p>
                        <label className={styles.check}><input type="checkbox" checked={config.ownedServer} onChange={e => set('ownedServer', e.target.checked)} /><span>{copy(plannerCopy.ownedServerCheckLabel)}<small>{copy(plannerCopy.ownedServerCheckHint)}</small></span></label>
                        <div className={styles.fields}>
                            {!config.ownedServer && field('serverMonthly', copy(plannerCopy.fieldServerMonthly))}
                            {field('backupMonthly', copy(plannerCopy.fieldBackupMonthly))}
                            {field('operationsMonthly', copy(plannerCopy.fieldOperationsMonthly), { hint: copy(plannerCopy.fieldOperationsMonthlyHint) })}
                        </div>
                    </Section>
                </div>
                <aside className={styles.budget} aria-label={copy(plannerCopy.budgetAria)}>
                    <div className={styles.budgetHead}><p>YOUR DEPLOYMENT</p><h2>{copy(plannerCopy.budgetTitle)}</h2><span>{config.users} {copy(plannerCopy.usersUnit)} · {copy(modelNames[config.model])}</span></div>
                    <div className={styles.budgetBody}>
                        <h3>{copy(plannerCopy.payableToUs)}</h3>
                        <dl>{ours.map(l => <div key={l.key}><dt>{copy(budgetLabels[l.key])}<small>{period(l.period)}</small></dt><dd>{amount(l.amount)}</dd></div>)}</dl>
                        <div className={styles.subtotal}><span>{copy(plannerCopy.subtotalOurs)}</span><strong>{money(ourFirstYear)}</strong></div>
                        <h3>{copy(plannerCopy.purchasedByYou)}</h3>
                        <p className={styles.note}>{copy(plannerCopy.customerExcludedNote)}</p>
                        <dl>{customer.map(l => <div key={l.key}><dt>{copy(budgetLabels[l.key])}<small>{period(l.period)}</small></dt><dd>{amount(l.amount)}</dd></div>)}</dl>
                        <div className={styles.subtotal}><span>{copy(plannerCopy.subtotalCustomer)}</span><strong>{money(customerFirstYear)}</strong></div>
                        <div className={styles.total} aria-live="polite" aria-atomic="true"><span>{confirmed ? copy(plannerCopy.totalConfirmed) : copy(plannerCopy.totalPartial)}</span><strong>{money(budget.firstYear)}</strong><p>{copy(plannerCopy.totalNote)}</p></div>
                        <p className={styles.note}>{copy(plannerCopy.taxNote)}</p>
                        <p className={styles.note}>{copy(plannerCopy.recurringYearLabel)}: <b>{money(budget.recurringYear)}</b></p>
                        {budget.missing.length > 0 && <p className={styles.warning}>{copy(plannerCopy.notYetIncludedPrefix)}{missingNames}{copy(plannerCopy.sentenceEnd)}</p>}
                        {budget.reviewRequired && <p className={styles.warning}>{copy(plannerCopy.reviewRequiredWarn)}</p>}
                        {budget.conflicts.length > 0 && <p className={styles.warning} role="status">{copy(plannerCopy.conflictWarn)}</p>}
                        <button type="button" className={styles.primary} onClick={exportChecklist}><Download size={17} />{copy(plannerCopy.downloadBtn)}</button>
                        <p className={styles.exportStatus} role="status">{exported ? copy(plannerCopy.exportedStatus) : copy(plannerCopy.idleStatus)}</p>
                        <a className={styles.textLink} href="#delivery">{copy(plannerCopy.seeScopeLink)}<ArrowRight size={15} /></a>
                    </div>
                </aside>
            </div>
            <section className={styles.fullSection} id="requirements">
                <div className={styles.wideTitle}><div><span className={styles.eyebrow}>SERVICE CHECKLIST</span><h2>{copy(plannerCopy.checklistHeading)}</h2></div><button className={styles.secondary} type="button" aria-pressed={showAll} onClick={() => setShowAll(!showAll)}>{showAll ? copy(plannerCopy.showSelectedBtn) : copy(plannerCopy.showAllBtn)}</button></div>
                <p className={styles.note}>{copy(plannerCopy.checklistNote)}</p>
                <div className={styles.requirements}>{(showAll ? requirements : selectedRequirements).map(r => <details key={r.id}><summary><span>{copy(r.title)}</span><em>{copy(r.status)}</em></summary><div><p>{copy(r.body)}</p><p><strong>{copy(plannerCopy.acceptancePrefix)}</strong>{copy(r.acceptance)}</p></div></details>)}</div>
                <div className={styles.metering}><h3>{copy(plannerCopy.meteringFourChecksHeading)}</h3><ol>{modelChecks.map(c => <li key={c[0]}><Check size={16} /><span>{copy(c)}</span></li>)}</ol></div>
            </section>
            <section className={styles.fullSection} id="delivery">
                <span className={styles.eyebrow}>PEOPLE &amp; DELIVERY</span><h2>{copy(plannerCopy.deliveryHeading)}</h2>
                <div className={styles.tableWrap}><table><caption className="sr-only">{copy(plannerCopy.staffingTableCaption)}</caption><thead><tr><th>{copy(plannerCopy.thRole)}</th><th>{copy(plannerCopy.thCustomerResp)}</th><th>{copy(plannerCopy.thDeliverable)}</th></tr></thead><tbody>{personnel.map(p => <tr key={p.role[0]}><th scope="row">{copy(p.role)}</th><td>{copy(p.customer)}</td><td>{copy(p.delivery)}</td></tr>)}</tbody></table></div>
                <div className={styles.offer}><div><h3>{copy(plannerCopy.offerHeading)}</h3><p>{copy(plannerCopy.offerNote1)}</p><p>{copy(plannerCopy.offerNote2)}</p></div><div className={styles.tableWrap}><table><thead><tr><th>{copy(plannerCopy.thUsers)}</th><th>{copy(plannerCopy.thLicenseYear)}</th><th>{copy(plannerCopy.thSetupOnce)}</th></tr></thead><tbody>{DEPLOYMENT_PRICING.tiers.map(r => <tr key={r.maxUsers}><th scope="row">≤ {r.maxUsers}</th><td>{money(r.licenseYear)}</td><td>{money(r.setup)}</td></tr>)}</tbody></table></div></div>
                <div className={styles.scope}><p><strong>{copy(plannerCopy.standardIncludesPrefix)}</strong>{copy(plannerCopy.standardIncludesBody)}</p><p>{copy(plannerCopy.specialistScopeBefore)} <strong>{money(DEPLOYMENT_PRICING.personDay)} {copy(plannerCopy.personDayUnit)}</strong> {copy(plannerCopy.specialistScopeAfter)}</p><p>{copy(plannerCopy.agplScopeBefore)} <a href="https://github.com/AI-WorkDeck/aiworkdeck/blob/master/legal/COMMERCIAL-LICENSE.md">{copy(plannerCopy.commercialLicenseLink)}</a>{copy(plannerCopy.sentenceEnd)}</p></div>
            </section>
            <p className={styles.footnote}>{copy(plannerCopy.footnote)}</p>
        </div>
    </div>;
}
