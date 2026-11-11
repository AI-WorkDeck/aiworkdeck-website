import Stripe from 'stripe';
import { getOrder } from '../orders';
import { siteConfig } from '../site-config';
import {
  ChannelSettlement,
  CreateChargeInput,
  CreateChargeResult,
  CurrencyCode,
  PaymentChannelAdapter,
  WebhookVerificationError,
} from './types';

/**
 * Stripe Checkout 适配器（国际站）。
 *
 * 返回 Stripe 托管收银台链接，前端可直接打开或编码为二维码，付款后再回本站。
 * 卡号不经过我们的服务器。
 *
 * 只处理 Checkout 的同步完成 / 异步到账事件，且必须 payment_status === 'paid'。
 * 两者统一进入 settleFromChannel 的金额、币种校验与幂等结算；其余事件不写入。
 */

/** 密钥按调用读，不在模块加载时快照——避免部署时改 env 却要靠重启才生效的隐形依赖。 */
function secretKey(): string {
  return process.env.STRIPE_SECRET_KEY || '';
}

function webhookSecret(): string {
  return process.env.STRIPE_WEBHOOK_SECRET || '';
}

let cached: { key: string; client: Stripe } | null = null;

/** 按当前 env 里的密钥取客户端；密钥变了就重建（连接池复用只在同一把密钥内）。 */
function client(): Stripe {
  const key = secretKey();
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY 未配置，无法调用 Stripe');
  }
  if (!cached || cached.key !== key) {
    cached = { key, client: new Stripe(key) };
  }
  return cached.client;
}

/** 匿名支持回首页弹窗；充值和购买继续回账户页。回跳参数不能作为已付款凭据。 */
function returnUrl(baseUrl: string, outTradeNo: string, result: 'success' | 'cancel'): string {
  const support = getOrder(outTradeNo)?.kind === 'support';
  const q = new URLSearchParams({ [support ? 'donation' : 'checkout']: result, order: outTradeNo });
  if (support) q.set('site', 'intl'); // 境内手机扫码也留在国际支付体系，不被地理分流到大陆站。
  const path = support ? '' : '/account';
  return `${baseUrl}/${siteConfig.defaultLocale}${path}?${q.toString()}`;
}

export const stripeAdapter: PaymentChannelAdapter = {
  id: 'stripe',
  currency: 'USD',

  isConfigured() {
    return Boolean(secretKey() && webhookSecret());
  },

  async createCharge(input: CreateChargeInput): Promise<CreateChargeResult> {
    const session = await client().checkout.sessions.create({
      mode: 'payment',
      // 两处都写 outTradeNo：client_reference_id 是 Checkout 的一等公民（后台可搜），
      // metadata 是兜底——两者任一能取到就够，webhook 里按此顺序回读。
      client_reference_id: input.outTradeNo,
      metadata: { outTradeNo: input.outTradeNo },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: input.amountMinor,
            product_data: { name: input.description },
          },
        },
      ],
      success_url: returnUrl(input.baseUrl, input.outTradeNo, 'success'),
      cancel_url: returnUrl(input.baseUrl, input.outTradeNo, 'cancel'),
    });

    if (!session.url) {
      throw new Error('Stripe 未返回 Checkout 跳转地址');
    }

    return {
      channel: 'stripe',
      present: 'redirect',
      redirectUrl: session.url,
      providerRef: session.id,
    };
  },

  async parseWebhook(headers: Headers, rawBody: string): Promise<ChannelSettlement | null> {
    const secret = webhookSecret();
    // 没配就拒绝，绝不留「未配置则跳过验签」的分支：那等于把入账接口对全网敞开，
    // 任何人 POST 一个自造的 checkout.session.completed 就能白拿商品。
    if (!secret) {
      throw new WebhookVerificationError(
        'STRIPE_WEBHOOK_SECRET 未配置，拒绝处理 Stripe webhook（fail closed）'
      );
    }

    const signature = headers.get('stripe-signature') || '';
    let event: Stripe.Event;
    try {
      // rawBody 必须是**未经解析的原始字节**：验签算的是原文的 HMAC，
      // JSON.parse 再 stringify 回来的报文键序/空白都可能变，签名必然对不上。
      event = client().webhooks.constructEvent(rawBody, signature, secret);
    } catch (error) {
      throw new WebhookVerificationError(
        `Stripe webhook 验签失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') return null;

    const session = event.data.object as Stripe.Checkout.Session;
    // 异步付款方式（部分银行转账类）会先 completed 但 payment_status 仍是 unpaid，
    // 真正到账走的是 checkout.session.async_payment_succeeded。此处只认已付。
    if (session.payment_status !== 'paid') return null;

    const outTradeNo = session.client_reference_id || session.metadata?.outTradeNo;
    if (!outTradeNo) {
      console.error(`[stripe] ${event.type} 缺少 outTradeNo:`, session.id);
      return null;
    }

    return toSettlement(outTradeNo, session);
  },

  async queryCharge(outTradeNo: string): Promise<ChannelSettlement | null> {
    // Stripe 无法按 client_reference_id 反查 Session，只能拿建单时落库的 session id 取。
    // 取不到就返回 null，由调用方回落到本地状态（webhook 到达后自然会转 paid）。
    const order = getOrder(outTradeNo);
    if (!order?.providerRef) return null;

    const session = await client().checkout.sessions.retrieve(order.providerRef);
    return toSettlement(outTradeNo, session);
  },
};

function toSettlement(outTradeNo: string, session: Stripe.Checkout.Session): ChannelSettlement {
  const paymentIntent = session.payment_intent;
  return {
    channel: 'stripe',
    outTradeNo,
    paid: session.payment_status === 'paid',
    amountMinor: session.amount_total ?? 0,
    // 大写化只是对齐 ISO 4217 写法；真出现非本站币种，settleFromChannel 会以
    // currency_mismatch 拒绝结算，不会因为这里的类型断言而放行。
    currency: (session.currency || '').toUpperCase() as CurrencyCode,
    transactionId: typeof paymentIntent === 'string' ? paymentIntent : (paymentIntent?.id ?? undefined),
    payerRef: session.customer_details?.email ?? undefined,
  };
}
