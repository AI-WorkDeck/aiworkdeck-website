import { NextRequest, NextResponse } from 'next/server';
import {
  ORDER_MAX_CENTS,
  createOrder,
  findOrderByIdempotencyKey,
  generateOrderNo,
  updateOrder,
  OrderKind,
} from '@/lib/orders';
import { getSessionUser } from '@/lib/sessions';
import { resolveKeyUser } from '@/lib/account-auth';
import { validatePurchaseSku } from '@/lib/purchases';
import { getProIntroQuote, isProSku, validateProPurchase } from '@/lib/pro-products';
import { checkProPurchaseGate, normalizeLegacyProSku } from '@/lib/pro-purchase-flag';
import { getPaymentAdapter } from '@/lib/payments';
import { siteConfig } from '@/lib/site-config';
import { getDb } from '@/lib/db';
import { toBaseLocale } from '@/i18n-config';
import { pickLangText, resolveRequestLocale } from '@/lib/api-locale';

const VALID_KINDS: OrderKind[] = ['recharge', 'purchase', 'support', 'subscription'];
const ANON_SUPPORT_MAX_CENTS = 50000; // 匿名打赏上限 500 本站货币单位；登录用户打赏不设上限（dev-board#761）
// ORDER_MAX_CENTS 搬去了 lib/orders.ts：手机端内部建单口也要认同一个上限

export async function POST(request: NextRequest) {
  const defaultLang = resolveRequestLocale(request);
  try {
    const body = await request.json();
    const lang = resolveRequestLocale(request, body?.lang);
    const t = (zh: string, en: string) => pickLangText(lang, zh, en);
    const { amount } = body;
    let skuId = body.skuId;
    let description: string = body.description ?? t('支持 AI WorkDeck', 'Support AI WorkDeck');
    let kind: OrderKind = body.kind ?? 'support';
    const idempotencyKey: string | null =
      typeof body.idempotencyKey === 'string' &&
      body.idempotencyKey.length > 0 &&
      body.idempotencyKey.length <= 128
        ? body.idempotencyKey
        : null;

    // 金额必须是正整数（单位分）
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      return NextResponse.json({ error: t('金额必须为正整数（单位分）', 'Amount must be a positive integer (in minor units)') }, { status: 400 });
    }
    if (kind === 'support' && siteConfig.paymentChannel === 'stripe' && amount < 100) {
      return NextResponse.json({ error: 'Minimum donation is USD $1.00' }, { status: 400 });
    }
    if (!VALID_KINDS.includes(kind)) {
      return NextResponse.json({ error: t('无效的订单类型', 'Invalid order kind') }, { status: 400 });
    }
    if (typeof description !== 'string' || description.length === 0 || description.length > 127) {
      return NextResponse.json({ error: t('无效的订单描述', 'Invalid order description') }, { status: 400 });
    }

    // support（打赏）允许匿名，但匿名单笔限额；登录用户打赏不设上限。其余类型必须登录。
    // 桌面端以 awdk_ Bearer 直接下充值单，与网页 Cookie 会话并行（先 Bearer 后 Cookie）。
    // 国际 Donation 显式匿名：扫码手机没有桌面会话，也能凭订单号确认付款。
    // 仅支持款允许此标志；旧调用和大陆站继续保留原来的登录 / 属主规则。
    const anonymous = kind === 'support' && siteConfig.paymentChannel === 'stripe' && body.anonymous === true;
    const user = anonymous ? undefined : (resolveKeyUser(request) ?? (await getSessionUser()));
    if (kind === 'support') {
      if (!user && amount > ANON_SUPPORT_MAX_CENTS) {
        return NextResponse.json(
          { error: siteConfig.currency === 'USD'
            ? `Anonymous donations cannot exceed USD $${ANON_SUPPORT_MAX_CENTS / 100}.${anonymous ? '' : ' Sign in for a higher amount.'}`
            : t(`未登录打赏金额不能超过 ¥${ANON_SUPPORT_MAX_CENTS / 100}，登录后不限额`, `Anonymous donations cannot exceed ¥${ANON_SUPPORT_MAX_CENTS / 100}. Sign in for a higher amount.`) },
          { status: 400 }
        );
      }
    } else if (!user) {
      return NextResponse.json({ error: t('请先登录', 'Please sign in first') }, { status: 401 });
    } else if (amount > ORDER_MAX_CENTS) {
      return NextResponse.json(
        { error: t(`单笔金额不能超过 ${ORDER_MAX_CENTS / 100} 元`, `Single order amount cannot exceed ${ORDER_MAX_CENTS / 100}`) },
        { status: 400 }
      );
    }

    // Pro 购买开关（PRO_PURCHASE_ENABLED，默认见 lib/pro-purchase-flag.ts）+ monthly-only。
    // 对任何 kind 的 Pro SKU（含 #228 旧写法 pro:monthly / pro:yearly）生效：
    // 关 → 403 不建单、不调支付通道（与定价页按钮双保险）；年付两种写法 → 400 not_purchasable。
    const gate = checkProPurchaseGate(skuId, process.env, lang);
    if (gate) {
      return NextResponse.json({ error: gate.error, code: gate.code }, { status: gate.status });
    }
    // #228 旧 pro:monthly（kind=purchase）归一为 subscription / pro_monthly，切换期旧页面不挂
    ({ kind, skuId } = normalizeLegacyProSku(kind, skuId) as { kind: OrderKind; skuId: unknown });

    // subscription：个人 Pro（pro_monthly / pro_yearly）。一次性购买，可续购。
    // purchase：skuId 语义校验（skill:<id> / plugin:<id> / feature:<key>），
    // 金额必须等于当前标价；重复购买同一 SKU 直接 409。
    if (kind === 'subscription') {
      if (!isProSku(skuId)) {
        return NextResponse.json({ error: t('商品不存在', 'Item not found') }, { status: 400 });
      }
      // 价格只认 lib/saas-pricing.ts 的 SAAS_PRICE_FEN，且仅限人民币站（微信 Native）。
      const checked = validateProPurchase(skuId, amount, siteConfig.currency);
      if ('error' in checked) {
        const messages = {
          invalid_sku: t('商品不存在', 'Item not found'),
          not_purchasable: t('该商品不可购买', 'This item is not available for purchase'),
          amount_mismatch: t('金额与当前标价不符，请刷新后重试', 'Amount does not match the current price. Please refresh and try again.'),
        } as const;
        return NextResponse.json({ error: messages[checked.error] }, { status: 400 });
      }
      // Only prevent new overlapping sales; paid callbacks still fulfill their original order.
      const applePro = getDb().prepare("SELECT 1 FROM entitlements WHERE userId=? AND feature='pro.appstore' AND expiresAt>?")
        .get(user!.id, new Date().toISOString());
      if (applePro) {
        return NextResponse.json({ code: 'appstore_subscription_active', error: t(
          '你已有有效的 Apple Pro 订阅，请在 Apple 订阅设置中管理，当前无需重复购买。',
          'You already have an active Apple Pro subscription. Manage it in Apple subscription settings; another purchase is not needed.'
        ) }, { status: 409 });
      }
      if (skuId === 'pro_monthly_intro') {
        const intro = getProIntroQuote(getDb(), user!.id);
        if (!intro.eligible) {
          return NextResponse.json({ code: 'intro_quota_exhausted', error: t(
            '首 3 个月特惠名额已用完，请按标准月付（¥149/月）续订。',
            'Your 3-month introductory offer has been used. Please renew at the standard ¥149/month rate.'
          ) }, { status: 409 });
        }
      }
      description = (toBaseLocale(lang) === 'en' ? checked.product.nameEn || checked.product.name : checked.product.name).slice(0, 127);
    } else if (kind === 'purchase') {
      const checked = validatePurchaseSku(user!.id, skuId, amount);
      if ('error' in checked) {
        if (checked.error === 'already_owned') {
          return NextResponse.json({ error: t('已拥有该商品，无需重复购买', 'You already own this item.') }, { status: 409 });
        }
        const messages = {
          invalid_sku: t('商品不存在', 'Item not found'),
          not_purchasable: t('该商品不可购买', 'This item is not available for purchase'),
          amount_mismatch: t('金额与当前标价不符，请刷新后重试', 'Amount does not match the current price. Please refresh and try again.'),
        } as const;
        return NextResponse.json({ error: messages[checked.error] }, { status: 400 });
      }
      // 订单描述由服务端按商品生成，不采信客户端传入
      description = (toBaseLocale(lang) === 'en' ? `Purchase ${checked.sku.itemNameEn || checked.sku.itemName}` : `购买 ${checked.sku.itemName}`).slice(0, 127);
    }

    // 幂等：同一用户同一 idempotencyKey 返回既有订单，不重复下单
    const existing = idempotencyKey
      ? findOrderByIdempotencyKey(user?.id ?? null, idempotencyKey)
      : undefined;
    if (existing) {
      if (existing.status === 'paid') {
        return NextResponse.json({
          success: true,
          outTradeNo: existing.outTradeNo,
          amount: existing.amount,
          status: 'paid',
        });
      }
      // skuId 必须一并比对：商品名不唯一时同名同价条目会生成相同 description，
      // 漏比 skuId 会让 B 商品的请求复用 A 商品的订单、支付后错发权益
      const requestSkuId = typeof skuId === 'string' ? skuId : null;
      if (
        existing.amount !== amount ||
        existing.kind !== kind ||
        existing.description !== description ||
        (existing.skuId ?? null) !== requestSkuId
      ) {
        return NextResponse.json({ error: t('幂等键与既有订单参数不一致', 'Idempotency key parameters do not match the existing order') }, { status: 409 });
      }
    }

    const outTradeNo = existing?.outTradeNo ?? generateOrderNo(kind.toUpperCase());

    // 通道是部署级常量（siteConfig.paymentChannel），不按请求来源判定
    const adapter = getPaymentAdapter();
    if (!adapter.isConfigured()) {
      console.error(`[payment] 支付通道 ${adapter.id} 密钥不全，无法建单`);
      return NextResponse.json({ error: t('支付通道暂不可用，请稍后重试', 'Payment channel is temporarily unavailable. Please try again later.') }, { status: 503 });
    }

    if (!existing) {
      createOrder({
        id: outTradeNo,
        outTradeNo,
        description,
        amount,
        status: 'pending',
        userId: user?.id ?? null,
        kind,
        skuId: typeof skuId === 'string' ? skuId : null,
        // 通道与币种在建单时定死：回调/回查一律按订单上记的这两项校验与结算
        channel: adapter.id,
        currency: adapter.currency,
        idempotencyKey,
      });
    }

    let baseUrl = process.env.NEXT_PUBLIC_BASE_URL || siteConfig.origin;
    // 国际双域 Cookie 不共享；已登录支持者必须回到建单时的域名才能查询自己的订单。
    // 只接受明确的官网 Host，绝不把任意 Origin / 转发头拼进支付回跳链接。
    if (kind === 'support' && adapter.id === 'stripe') {
      const host = request.headers.get('host')?.toLowerCase();
      if (host && ['workdeck.ai', 'www.workdeck.ai', 'aiworkdeck.us', 'www.aiworkdeck.us'].includes(host)) {
        baseUrl = `https://${host}`;
      }
    }
    const charge = await adapter.createCharge({ outTradeNo, description, amountMinor: amount, baseUrl });

    // 判别联合逼着每种形态各自显式展开，不用「哪个字段非空」反推
    if (charge.channel === 'stripe') {
      // Session id 落库：Stripe 无法按 client_reference_id 反查 Session，
      // 回查（queryCharge）只能靠这个引用
      updateOrder(outTradeNo, { providerRef: charge.providerRef });
      return NextResponse.json({
        success: true,
        // present 是前端选渲染路径的显式判据。缺了它前端只能靠「有没有 qrCode」推断，
        // 而推断在将来出现第三种形态时会静默走错分支
        present: 'redirect',
        outTradeNo,
        amount,
        redirectUrl: charge.redirectUrl,
      });
    }

    if (charge.channel === 'wxpay') {
      return NextResponse.json({
        success: true,
        present: 'qrcode',
        outTradeNo,
        codeUrl: charge.codeUrl,
        qrCode: charge.qrCode,
        amount,
      });
    }

    // 这条建单口只走部署级默认通道（大陆站 wxpay / 国际站 stripe）。
    // 小程序虚拟支付（wxvp）只在 /api/internal/account 里建单，走不到这里；
    // 真走到了说明 siteConfig.paymentChannel 被配成了别的值——宁可 500，
    // 也不能把一份认不出来的建单结果当成二维码回给前端。
    console.error(`创建支付订单失败：默认通道返回了不受支持的形态 ${charge.channel}`);
    return NextResponse.json({ error: pickLangText(defaultLang, '创建支付订单失败', 'Failed to create payment order') }, { status: 500 });
  } catch (error: any) {
    console.error('创建支付订单失败:', error);
    return NextResponse.json(
      { error: pickLangText(defaultLang, '创建支付订单失败', 'Failed to create payment order'), message: error.message },
      { status: 500 }
    );
  }
}
