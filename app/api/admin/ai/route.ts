import { platformModels } from '@/lib/platform-ai/catalog';
import { platformProvider, bailianConfig, bailianConfigured } from '@/lib/platform-ai/config';
import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import {
  getAiConfig,
  getExchangeRateInfo,
  getManualExchangeRate,
  saveAiConfig,
  maskKey,
  type ExchangeRateMode,
} from '@/lib/ai-config';
import { FEATURE_PRODUCTS, MAX_PRICE_CENTS } from '@/lib/products';
import { getDb } from '@/lib/db';
import { getCredits, isMgmtConfigured } from '@/lib/openrouter-mgmt';
import { isEncryptionConfigured } from '@/lib/openrouter-keys';
import { accountOverview } from '@/lib/openrouter-rotation';
import { siteConfig } from '@/lib/site-config';

export const dynamic = 'force-dynamic';

/**
 * AI 额度池概览（PR-W2）：主账户 credits 余额 + 全部用户已分配 limit 总和。
 * limit 之和可以大于主账户余额（共享池超卖），差值告警文案由前端渲染。
 */
export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (platformProvider() === 'bailian') return NextResponse.json({ provider:'bailian',provisioningConfigured:bailianConfigured(),encryptionConfigured:isEncryptionConfigured(),allocatedLimitUsd:0,credits:null });
  const allocatedRow = getDb()
    .prepare('SELECT COALESCE(SUM(limitUsd), 0) AS s FROM openrouter_keys WHERE disabledAt IS NULL')
    .get() as { s: number };
  const base = {
    provisioningConfigured: isMgmtConfigured(),
    encryptionConfigured: isEncryptionConfigured(),
    allocatedLimitUsd: Math.round(allocatedRow.s * 100) / 100,
    accounts: accountOverview(),
  };
  if (!isMgmtConfigured()) {
    return NextResponse.json({ ...base, credits: null });
  }
  try {
    const credits = await getCredits();
    return NextResponse.json({ ...base, credits });
  } catch {
    return NextResponse.json({ ...base, credits: null, creditsError: true });
  }
}

/** 保存 OpenRouter 配置（写 data/ai-config.json；环境变量存在时环境变量优先） */
export async function PUT(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const apiKey = body.apiKey !== undefined ? String(body.apiKey).trim() : undefined;
    const model = body.model !== undefined ? String(body.model).trim() : undefined;
    if (platformProvider() === 'bailian' && apiKey) return NextResponse.json({ error:'server_managed_key' }, { status:400 });
    if (apiKey !== undefined && apiKey && !/^sk-or-[A-Za-z0-9-_]{10,200}$/.test(apiKey)) {
      return NextResponse.json({ error: 'invalid_key_format' }, { status: 400 });
    }
    if (platformProvider() === 'bailian' && model !== undefined && model !== getAiConfig().model) return NextResponse.json({ error:'server_managed_credentials' }, {status:400});
    if (model !== undefined && model.length > 100) {
      return NextResponse.json({ error: 'invalid_model' }, { status: 400 });
    }
    // 折算参数（PR-W2）：汇率 0.5-100，毛利乘数 1-10（低于 1 = 亏本卖，拒绝）
    // 汇率来源（dev-board#853）：auto 跟随即时汇率，manual 以手动值为准
    let exchangeRateMode: ExchangeRateMode | undefined;
    if (body.exchangeRateMode !== undefined) {
      if (body.exchangeRateMode !== 'auto' && body.exchangeRateMode !== 'manual') {
        return NextResponse.json({ error: 'invalid_exchange_rate_mode' }, { status: 400 });
      }
      exchangeRateMode = body.exchangeRateMode;
    }
    let exchangeRate: number | undefined;
    let marginMultiplier: number | undefined;
    if (body.exchangeRate !== undefined) {
      exchangeRate = Number(body.exchangeRate);
      if (!Number.isFinite(exchangeRate) || exchangeRate < 0.5 || exchangeRate > 100) {
        return NextResponse.json({ error: 'invalid_exchange_rate' }, { status: 400 });
      }
    }
    if (body.marginMultiplier !== undefined) {
      marginMultiplier = Number(body.marginMultiplier);
      if (!Number.isFinite(marginMultiplier) || marginMultiplier < 1 || marginMultiplier > 10) {
        return NextResponse.json({ error: 'invalid_margin' }, { status: 400 });
      }
    }
    // 商品定价（PR-W3）：只接受目录内的 SKU key，价格 1~199900 分
    let featurePrices: Record<string, number> | undefined;
    if (body.featurePrices !== undefined) {
      if (typeof body.featurePrices !== 'object' || body.featurePrices === null) {
        return NextResponse.json({ error: 'invalid_feature_prices' }, { status: 400 });
      }
      featurePrices = {};
      const validKeys = new Set(FEATURE_PRODUCTS.map(p => p.key));
      for (const [key, value] of Object.entries(body.featurePrices)) {
        if (!validKeys.has(key as (typeof FEATURE_PRODUCTS)[number]['key'])) {
          return NextResponse.json({ error: 'invalid_feature_prices' }, { status: 400 });
        }
        const cents = Number(value);
        if (!Number.isInteger(cents) || cents < 1 || cents > MAX_PRICE_CENTS) {
          return NextResponse.json({ error: 'invalid_feature_prices' }, { status: 400 });
        }
        featurePrices[key] = cents;
      }
    }
    // 切到手动却没有任何可用的手动值：拒绝，而不是悄悄落回即时汇率让维护者以为手动生效了
    if (exchangeRateMode === 'manual' && exchangeRate === undefined && getManualExchangeRate() === null) {
      return NextResponse.json({ error: 'manual_rate_required' }, { status: 400 });
    }
    const deepseekApiKey = typeof body.deepseekApiKey === 'string' ? body.deepseekApiKey.trim() : undefined;
    const deepseekBaseUrl = typeof body.deepseekBaseUrl === 'string' ? body.deepseekBaseUrl.trim() : undefined;
    const deepseekDefaultModel = typeof body.deepseekDefaultModel === 'string' ? body.deepseekDefaultModel.trim() : undefined;
    const bqtMonthlyQingtianCoins = body.bqtMonthlyQingtianCoins !== undefined ? Math.max(1, Math.round(Number(body.bqtMonthlyQingtianCoins))) : undefined;
    const centsPerQingtianCoin = body.centsPerQingtianCoin !== undefined ? Math.max(1, Math.round(Number(body.centsPerQingtianCoin))) : undefined;
    saveAiConfig({
      apiKey,
      model,
      exchangeRateMode,
      exchangeRate,
      marginMultiplier,
      featurePrices,
      deepseekApiKey,
      deepseekBaseUrl,
      deepseekDefaultModel,
      bqtMonthlyQingtianCoins,
      centsPerQingtianCoin,
    });
    const ai = getAiConfig();
    const fx = getExchangeRateInfo();
    return NextResponse.json({
      ok: true,
      ai: {
        configured: !!ai.apiKey,
        keyMasked: maskKey(ai.apiKey),
        model: ai.model,
        exchangeRate: fx.rate,
        exchangeRateMode: fx.mode,
        exchangeRateSource: fx.source,
        marginMultiplier: ai.marginMultiplier,
        deepseekConfigured: !!ai.deepseekApiKey,
        deepseekKeyMasked: maskKey(ai.deepseekApiKey),
        deepseekBaseUrl: ai.deepseekBaseUrl,
        deepseekDefaultModel: ai.deepseekDefaultModel,
        bqtMonthlyQingtianCoins: ai.bqtMonthlyQingtianCoins,
        centsPerQingtianCoin: ai.centsPerQingtianCoin,
      },
    });
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
}

/** 连通性测试：用当前配置发一个最小请求 */
export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { apiKey, model } = getAiConfig();
  if (!apiKey) {
    return NextResponse.json({ error: 'ai_not_configured' }, { status: 503 });
  }
  try {
    if (platformProvider() === 'bailian' && !(await platformModels()).some(m => m.id === model)) return NextResponse.json({error:'invalid_model'}, {status:400});
    const res = await fetch(platformProvider() === 'bailian' ? `${bailianConfig().baseUrl}/chat/completions` : 'https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': siteConfig.origin,
        'X-Title': 'AI WorkDeck Skill Plaza',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
        max_tokens: 10,
        ...(platformProvider() === 'bailian' ? { enable_thinking:false } : {}),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return NextResponse.json(
        { error: 'test_failed', status: res.status, detail: platformProvider() === 'bailian' ? undefined : detail.slice(0, 300) },
        { status: 502 }
      );
    }
    const data = await res.json();
    return NextResponse.json({ ok: true, model, reply: data?.choices?.[0]?.message?.content || '' });
  } catch (e: any) {
    return NextResponse.json({ error: 'test_failed', detail: String(e?.message || e).slice(0, 300) }, { status: 502 });
  }
}
