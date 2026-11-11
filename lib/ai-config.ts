import { platformProvider, bailianConfig } from './platform-ai/config';
import fs from 'fs';
import path from 'path';
import { siteConfig } from '@/lib/site-config';
import { getLiveFxRate, readFxCache, siteUsesLiveFx, type FxRejected, type FxSnapshot } from '@/lib/fx-rate';

/**
 * OpenRouter 配置。优先级：环境变量 > data/ai-config.json（管理后台写入）。
 * data/ai-config.json 含密钥，必须保持 gitignore。
 *
 * PR-W2 追加：AI 额度折算参数（汇率 exchangeRate、毛利乘数 marginMultiplier），
 * 折算公式见 lib/ai-quota.ts usdFromCents / centsFromUsd。
 * dev-board#853：汇率改为「手动 / 即时 / 默认」三级裁决，见 getExchangeRateInfo。
 */
const AI_CONFIG_FILE = path.join(process.cwd(), 'data', 'ai-config.json');

export interface AiConfig {
  apiKey?: string;
  model?: string;
  /**
   * 汇率来源模式（dev-board#853）。**缺省即 auto**：老文件里没有这个键，
   * 里面那个 exchangeRate 多半是早年手填（或旧后台保存时顺手回写）的 7.3，
   * 不能凭「有值」就推断维护者要手动压住即时汇率。
   */
  exchangeRateMode?: ExchangeRateMode;
  /** 手动汇率。只在 exchangeRateMode === 'manual' 时生效；auto 下保留着，切回手动时用。 */
  exchangeRate?: number;
  /** 手动汇率最近一次被后台改动的时刻（ISO），老文件没有 */
  exchangeRateUpdatedAt?: string;
  marginMultiplier?: number;
  /** PR-W3：feature 商品定价覆盖（分），键为 lib/products.ts 的 SKU key */
  featurePrices?: Record<string, number>;
  /** 独立 DeepSeek 专线配置（Circle 联盟所等） */
  deepseekApiKey?: string;
  deepseekBaseUrl?: string;
  deepseekDefaultModel?: string;
  /** 包晴天扫码律师：每月赠送晴天币数量（默认 1000）及 1 晴天币折合 Credits 分值（默认 10 分 = 0.1 Credits） */
  bqtMonthlyQingtianCoins?: number;
  centsPerQingtianCoin?: number;
}

export const DEFAULT_MODEL = 'anthropic/claude-sonnet-4.5';
export const DEFAULT_BQT_MONTHLY_QINGTIAN_COINS = 1000;
export const DEFAULT_CENTS_PER_QINGTIAN_COIN = 10;
/**
 * Credits 币种 → 美元的折算汇率**默认值随站点走**。
 *
 * Credits 一律以本站币种的最小单位记账：国内站是人民币分，所以要按汇率折成
 * OpenRouter 的美元额度；国际站本币已经是美元，折算必须是 **1**——
 * 沿用 7.3 会让国际站用户充 $100 只拿到约 $11 的 AI 额度，
 * 而且这个错误在界面上完全看不出来（余额、账单、扣费全都自洽）。
 *
 * 国内站现在默认跟随即时汇率（lib/fx-rate.ts），这个值只是即时汇率取不到时的最后兜底；
 * 后台切到「手动」时以 data/ai-config.json 的手动值为准。
 */
export const DEFAULT_EXCHANGE_RATE = siteConfig.usdExchangeRate;
export const DEFAULT_MARGIN_MULTIPLIER = 1.2;

function readFileConfig(): AiConfig {
  try {
    if (!fs.existsSync(AI_CONFIG_FILE)) return {};
    return JSON.parse(fs.readFileSync(AI_CONFIG_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function positiveOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * 汇率刻意不在这里：它要走 `getExchangeRateInfo()` 的三级裁决，
 * 而且读它会顺带触发即时汇率的惰性刷新——只要 apiKey / 定价的调用方不该承担这个副作用。
 */
export function getAiConfig(): {
  apiKey?: string;
  model: string;
  marginMultiplier: number;
  featurePrices?: Record<string, number>;
  deepseekApiKey?: string;
  deepseekBaseUrl: string;
  deepseekDefaultModel: string;
  bqtMonthlyQingtianCoins: number;
  centsPerQingtianCoin: number;
} {
  const file = readFileConfig();
  return {
    apiKey: platformProvider() === 'bailian' ? bailianConfig().apiKey || undefined : process.env.OPENROUTER_API_KEY || file.apiKey || undefined,
    model: platformProvider() === 'bailian' ? bailianConfig().defaultModel : process.env.OPENROUTER_MODEL || file.model || DEFAULT_MODEL,
    marginMultiplier: positiveOr(file.marginMultiplier, DEFAULT_MARGIN_MULTIPLIER),
    featurePrices: file.featurePrices,
    deepseekApiKey: process.env.AWD_DEEPSEEK_API_KEY?.trim() || file.deepseekApiKey?.trim() || undefined,
    deepseekBaseUrl: (process.env.AWD_DEEPSEEK_BASE_URL?.trim() || file.deepseekBaseUrl?.trim() || 'https://api.deepseek.com/v1').replace(/\/+$/, ''),
    deepseekDefaultModel: process.env.AWD_DEEPSEEK_DEFAULT_MODEL?.trim() || file.deepseekDefaultModel?.trim() || 'deepseek-chat',
    bqtMonthlyQingtianCoins: Math.round(positiveOr(process.env.AWD_BQT_MONTHLY_QINGTIAN_COINS ?? file.bqtMonthlyQingtianCoins, DEFAULT_BQT_MONTHLY_QINGTIAN_COINS)),
    centsPerQingtianCoin: Math.round(positiveOr(process.env.AWD_CENTS_PER_QINGTIAN_COIN ?? file.centsPerQingtianCoin, DEFAULT_CENTS_PER_QINGTIAN_COIN)),
  };
}

export type ExchangeRateMode = 'auto' | 'manual';
export type ExchangeRateSource = 'live' | 'manual' | 'default';

export interface ExchangeRateInfo {
  /** 计费用的汇率（本币 → 美元），恒为有限正数 */
  rate: number;
  source: ExchangeRateSource;
  /** live=本站取到即时值的时刻；manual=后台改动时刻（老文件为 null）；default=null */
  updatedAt: string | null;
  mode: ExchangeRateMode;
  /** 即时汇率的数据源名称（仅 live） */
  provider: string | null;
  /** 数据源自己标注的日期/时间（仅 live） */
  asOf: string | null;
}

function manualRateOf(file: AiConfig): number | null {
  const n = Number(file.exchangeRate);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 文件里保存的手动汇率（无论当前是否处于手动模式），没有则 null */
export function getManualExchangeRate(): number | null {
  return manualRateOf(readFileConfig());
}

/**
 * 计费汇率的**唯一出口**（dev-board#853）。优先级：
 *   手动模式且有合法手动值 → 手动
 *   否则即时汇率（上一次有效值）→ 即时
 *   否则站点默认值（cn 7.3）
 * 本币是美元的站点恒为 1，不看文件、不拉即时汇率——国际站沿用人民币汇率会让
 * 用户充 $100 只拿到约 $11 的 AI 额度，而且界面上完全看不出来。
 *
 * 同步、不等网络：即时汇率过期时只在后台刷新，本次照用旧值。
 */
export function getExchangeRateInfo(): ExchangeRateInfo {
  const fallback: ExchangeRateInfo = {
    rate: DEFAULT_EXCHANGE_RATE,
    source: 'default',
    updatedAt: null,
    mode: 'auto',
    provider: null,
    asOf: null,
  };
  if (!siteUsesLiveFx()) return fallback;

  const file = readFileConfig();
  const mode: ExchangeRateMode = file.exchangeRateMode === 'manual' ? 'manual' : 'auto';
  const manual = manualRateOf(file);
  if (mode === 'manual' && manual !== null) {
    return {
      rate: manual,
      source: 'manual',
      updatedAt: file.exchangeRateUpdatedAt ?? null,
      mode,
      provider: null,
      asOf: null,
    };
  }
  const live = getLiveFxRate();
  if (live) {
    return {
      rate: live.rate,
      source: 'live',
      updatedAt: live.fetchedAt,
      mode,
      provider: live.sourceName,
      asOf: live.asOf,
    };
  }
  return { ...fallback, mode };
}

/** 后台展示用：生效值之外，再给出手动值、即时值与最近一次被护栏拒掉的值。 */
export function getExchangeRateAdminView(): ExchangeRateInfo & {
  liveEnabled: boolean;
  defaultRate: number;
  manualRate: number | null;
  live: FxSnapshot | null;
  lastAttemptAt: string | null;
  lastRejected: FxRejected | null;
} {
  const info = getExchangeRateInfo();
  const liveEnabled = siteUsesLiveFx();
  // 手动模式下 getExchangeRateInfo 不碰即时汇率；这里读一次给维护者对照，也借此保持缓存新鲜
  const live = liveEnabled ? getLiveFxRate() : null;
  const cache = liveEnabled ? readFxCache() : {};
  return {
    ...info,
    liveEnabled,
    defaultRate: DEFAULT_EXCHANGE_RATE,
    manualRate: liveEnabled ? getManualExchangeRate() : null,
    live,
    lastAttemptAt: cache.lastAttemptAt ?? null,
    lastRejected: cache.lastRejected ?? null,
  };
}

/** 管理后台保存配置（不落库环境变量，只写文件层） */
export function saveAiConfig(config: AiConfig) {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const current = readFileConfig();
  const next: AiConfig = {
    apiKey: config.apiKey !== undefined ? config.apiKey || undefined : current.apiKey,
    model: config.model !== undefined ? config.model || undefined : current.model,
    exchangeRateMode:
      config.exchangeRateMode !== undefined ? config.exchangeRateMode : current.exchangeRateMode,
    exchangeRate:
      config.exchangeRate !== undefined ? config.exchangeRate || undefined : current.exchangeRate,
    exchangeRateUpdatedAt:
      config.exchangeRate !== undefined && config.exchangeRate !== current.exchangeRate
        ? new Date().toISOString()
        : current.exchangeRateUpdatedAt,
    marginMultiplier:
      config.marginMultiplier !== undefined
        ? config.marginMultiplier || undefined
        : current.marginMultiplier,
    featurePrices:
      config.featurePrices !== undefined
        ? { ...current.featurePrices, ...config.featurePrices }
        : current.featurePrices,
    deepseekApiKey:
      config.deepseekApiKey !== undefined
        ? config.deepseekApiKey || undefined
        : current.deepseekApiKey,
    deepseekBaseUrl:
      config.deepseekBaseUrl !== undefined
        ? config.deepseekBaseUrl || undefined
        : current.deepseekBaseUrl,
    deepseekDefaultModel:
      config.deepseekDefaultModel !== undefined
        ? config.deepseekDefaultModel || undefined
        : current.deepseekDefaultModel,
    bqtMonthlyQingtianCoins:
      config.bqtMonthlyQingtianCoins !== undefined
        ? config.bqtMonthlyQingtianCoins || undefined
        : current.bqtMonthlyQingtianCoins,
    centsPerQingtianCoin:
      config.centsPerQingtianCoin !== undefined
        ? config.centsPerQingtianCoin || undefined
        : current.centsPerQingtianCoin,
  };
  fs.writeFileSync(AI_CONFIG_FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
}

/** 展示用：密钥打码 */
export function maskKey(key: string | undefined): string {
  if (!key) return '';
  if (key.length <= 8) return '****';
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}
