import { DEPLOYMENT_PRICING } from './pricing';

export type ModelMode = 'cloud' | 'hybrid' | 'local';
export type OptionId = 'ocr' | 'asr' | 'search' | 'data' | 'mobile' | 'parse' | 'tts' | 'externalGit';
export interface DeploymentConfig {
    users: number;
    concurrency: number;
    model: ModelMode;
    commercial: boolean;
    offline: boolean;
    ownedServer: boolean;
    options: OptionId[];
    monthlyInput: number | null; // million tokens / user / month
    monthlyOutput: number | null;
    inputRate: number | null; // CNY / million tokens, planning assumption
    outputRate: number | null;
    cloudPercent: number;
    serverMonthly: number | null;
    backupMonthly: number | null;
    operationsMonthly: number | null;
    gpuPurchase: number | null;
    gpuMonthly: number | null;
    adaptation: number | null;
    ocrPages: number | null;
    ocrRate: number | null;
    asrHours: number | null;
    asrRate: number | null;
    searchMonthly: number | null;
    dataMonthly: number | null;
    mobileMonthly: number | null;
    gitSetup: number | null;
}
export const DEFAULT_CONFIG: DeploymentConfig = {
    users: 20, concurrency: 3, model: 'cloud', commercial: true, offline: false,
    ownedServer: false, options: [], monthlyInput: 2, monthlyOutput: 0.5,
    inputRate: 2, outputRate: 8, cloudPercent: 30,
    serverMonthly: 500, backupMonthly: 100, operationsMonthly: 0,
    gpuPurchase: null, gpuMonthly: null, adaptation: null,
    ocrPages: 1000, ocrRate: 0.1, asrHours: 20, asrRate: 1,
    searchMonthly: null, dataMonthly: null, mobileMonthly: null, gitSetup: null,
};
export type BudgetKey = 'license' | 'setup' | 'server' | 'backup' | 'operations' | 'model' | 'gpuPurchase' | 'gpuMonthly' | 'adaptation' | 'ocr' | 'asr' | 'search' | 'data' | 'mobile' | 'gitSetup';
export interface BudgetLine { key: BudgetKey; period: 'once' | 'month' | 'year'; amount: number | null }
export function estimateDeployment(c: DeploymentConfig) {
    const product = (a: number | null, b: number | null) => a === null || b === null ? null : a * b;
    const modelInput = product(c.monthlyInput, c.inputRate);
    const modelOutput = product(c.monthlyOutput, c.outputRate);
    const tier = DEPLOYMENT_PRICING.tiers.find(t => c.users <= t.maxUsers);
    const ratio = c.model === 'cloud' ? 1 : c.model === 'hybrid' ? c.cloudPercent / 100 : 0;
    const lines: BudgetLine[] = [
        { key: 'license', period: 'year', amount: c.commercial ? tier?.licenseYear ?? null : 0 },
        { key: 'setup', period: 'once', amount: tier?.setup ?? null },
        { key: 'server', period: 'month', amount: c.ownedServer ? 0 : c.serverMonthly },
        { key: 'backup', period: 'month', amount: c.backupMonthly },
        { key: 'operations', period: 'month', amount: c.operationsMonthly },
        { key: 'model', period: 'month', amount: ratio === 0 ? 0 : modelInput === null || modelOutput === null ? null : c.users * (modelInput + modelOutput) * ratio },
    ];
    if (c.model !== 'cloud') lines.push(
        { key: 'gpuPurchase', period: 'once', amount: c.gpuPurchase },
        { key: 'gpuMonthly', period: 'month', amount: c.gpuMonthly },
    );
    if (c.model !== 'cloud' || c.offline || c.options.includes('mobile')) lines.push({ key: 'adaptation', period: 'once', amount: c.adaptation });
    if (c.options.includes('ocr')) lines.push({ key: 'ocr', period: 'month', amount: product(c.ocrPages, c.ocrRate) });
    if (c.options.includes('asr')) lines.push({ key: 'asr', period: 'month', amount: product(c.asrHours, c.asrRate) });
    for (const key of ['search', 'data', 'mobile'] as const) {
        if (c.options.includes(key)) lines.push({ key, period: 'month', amount: c[`${key}Monthly`] });
    }
    if (c.options.includes('externalGit')) lines.push({ key: 'gitSetup', period: 'once', amount: c.gitSetup });
    for (const line of lines) if (line.amount !== null) line.amount = Math.round(line.amount * 100) / 100;
    const sum = (period: BudgetLine['period']) => Math.round(lines.filter(l => l.period === period).reduce((n, l) => n + (l.amount ?? 0), 0) * 100) / 100;
    const once = sum('once'), monthly = sum('month'), annual = sum('year');
    // Capacity bands are planning envelopes, never a tested users-per-server claim.
    const resource = c.users > 100 || c.concurrency > 10 ? 2 : c.users > 20 || c.concurrency > 3 ? 1 : 0;
    const conflicts = c.offline ? [
        ...(c.model !== 'local' ? ['cloudModel'] : []),
        ...c.options.filter(o => ['ocr', 'asr', 'search', 'data', 'mobile'].includes(o)),
    ] : [];
    const reviewRequired = c.offline || c.model !== 'cloud' || c.options.includes('externalGit') || c.options.includes('mobile') || c.users > 200 || c.concurrency > 20;
    return { lines, once, monthly, annual,
        firstYear: Math.round((once + monthly * 12 + annual) * 100) / 100,
        recurringYear: Math.round((monthly * 12 + annual) * 100) / 100,
        missing: lines.filter(l => l.amount === null).map(l => l.key),
        resource, conflicts, reviewRequired,
        diskGB: Math.ceil((100 + c.users * 5) / 100) * 100,
        extraMemoryGB: c.options.includes('parse') ? 16 : 0,
    };
}
