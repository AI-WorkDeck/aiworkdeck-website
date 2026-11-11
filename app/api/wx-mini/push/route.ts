import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  describeSettleFailure,
  getAdapterForChannel,
  settleFromChannel,
} from '@/lib/payments';
import { getOrder } from '@/lib/orders';

/**
 * 小程序「消息推送」接收口（dev-board#427）。
 *
 * 公众平台 → 开发管理 → 开发设置 → 消息推送里填的那个 URL。虚拟支付的
 * 发货推送（`xpay_goods_deliver_notify`）走这里；轮询（`action:"query"`）是
 * 另一条腿，官方明写**两者至少实现一个、一起用更可靠**：
 * `wx.requestVirtualPayment` 的 success 回调会丢（微信异常退出就丢了），
 * 只靠轮询的话用户付了钱却看不到余额；只靠推送的话推送延迟时前台一直转圈。
 *
 * ## 三条纪律
 *
 * 1. **不信推送里的钱**。推送体没有签名（验的是 URL 上的 token/timestamp/nonce，
 *    那是「这个 URL 是微信在调」的证明，不是「这份 body 没被改过」的证明）。
 *    所以只从推送里取 `OutTradeNo`，金额一律回 `/xpay/query_order` 复核，
 *    再交给 `settleFromChannel` 做金额/币种/通道三比对。
 * 2. **明文 + JSON**。公众平台那侧配「JSON + 明文模式」。带 `encrypt_type=aes`
 *    的请求直接 400：安全模式要另一套 AES 解密与 msg_signature 校验，本轮不做，
 *    半套实现比没有更危险。
 * 3. **没配 Token = 整条路由 404**。与 `/api/internal/*` 同口径：功能没开通的
 *    部署上，这条路由必须表现成「不存在」。
 *
 * ## 响应形状（文档 §2.4「推送响应格式说明」）
 *
 * 推送体是 JSON，响应也必须是 JSON：`{"ErrCode":0,"ErrMsg":"success"}`。
 * **格式不对或 ErrCode 非 0，微信会重推，最多 15 次**——所以这里刻意让
 * 「查无此单 / 金额对不上 / 回查说还没付」都回非 0：重推是免费的，而静默吞掉
 * 一次真实的到账通知，用户那边就是付了钱没到账且日志里毫无痕迹。
 */

export const dynamic = 'force-dynamic';

function token(): string {
  return process.env.WXVP_PUSH_TOKEN || '';
}

/** 与「这条路由压根不存在」不可区分：未配置 Token 时的唯一响应。 */
function notConfigured(): NextResponse {
  return new NextResponse(null, { status: 404 });
}

/**
 * 公众平台的 URL 验签：`sha1(sort([token, timestamp, nonce]).join(''))`。
 * 字典序排序后直接拼接，与公众号/小程序服务器配置的校验完全同款。
 */
export function checkPushSignature(
  params: { signature: string; timestamp: string; nonce: string },
  pushToken: string
): boolean {
  if (!params.signature || !params.timestamp || !params.nonce) return false;
  const expected = crypto
    .createHash('sha1')
    .update([pushToken, params.timestamp, params.nonce].sort().join(''))
    .digest('hex');
  // 长度不等时 timingSafeEqual 会抛，先挡一道
  const a = Buffer.from(expected);
  const b = Buffer.from(params.signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function signatureOk(request: NextRequest): boolean {
  const q = request.nextUrl.searchParams;
  return checkPushSignature(
    {
      signature: q.get('signature') || '',
      timestamp: q.get('timestamp') || '',
      nonce: q.get('nonce') || '',
    },
    token()
  );
}

/** 推送应答。ErrCode 0 = 收妥不再重推；非 0 = 让微信按 15 次上限重推。 */
function ack(errCode: number, errMsg: string): NextResponse {
  return NextResponse.json({ ErrCode: errCode, ErrMsg: errMsg });
}

/**
 * GET：公众平台点「保存」时的一次性校验——验签通过原样回 `echostr`（纯文本）。
 * 回 JSON 或多一个换行都会被判失败，所以这里用 `new NextResponse(text)`。
 */
export async function GET(request: NextRequest) {
  if (!token()) return notConfigured();
  if (!signatureOk(request)) {
    console.warn('[wx-mini push] GET 验签失败');
    return new NextResponse(null, { status: 401 });
  }
  const echostr = request.nextUrl.searchParams.get('echostr') || '';
  return new NextResponse(echostr, {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

export async function POST(request: NextRequest) {
  if (!token()) return notConfigured();
  if (!signatureOk(request)) {
    console.warn('[wx-mini push] POST 验签失败');
    return new NextResponse(null, { status: 401 });
  }

  // 安全模式（AES）本轮不支持，明确拒绝而不是当明文去解析
  if ((request.nextUrl.searchParams.get('encrypt_type') || '').toLowerCase() === 'aes') {
    console.error('[wx-mini push] 收到安全模式推送，请把公众平台配置改成「JSON + 明文模式」');
    return NextResponse.json({ error: 'encrypt_mode_unsupported' }, { status: 400 });
  }

  let event: Record<string, unknown>;
  try {
    event = (await request.json()) as Record<string, unknown>;
  } catch {
    console.error('[wx-mini push] 推送体不是 JSON（公众平台配置须选 JSON 格式）');
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const name = typeof event?.Event === 'string' ? event.Event : '';
  if (name !== 'xpay_goods_deliver_notify') {
    // 退款、投诉、风控等其它事件本轮不处理。回 0 免得微信重推 15 次，
    // 但一定要留日志：将来接哪一条，先从这里看它到底来没来。
    console.log(`[wx-mini push] 未处理的事件类型: ${name || '(空)'}`);
    return ack(0, 'success');
  }

  const outTradeNo = typeof event.OutTradeNo === 'string' ? event.OutTradeNo : '';
  if (!outTradeNo) {
    console.error('[wx-mini push] xpay_goods_deliver_notify 缺 OutTradeNo');
    return ack(-1, 'missing OutTradeNo');
  }

  try {
    const order = getOrder(outTradeNo);
    if (!order) {
      console.error(`[wx-mini push] 推送的单号在本站查不到: ${outTradeNo}`);
      return ack(-1, 'order not found');
    }
    // 已经结算过（轮询那条腿先到了）：直接收妥，别再出站回查一次。
    // 推送重复到达也走这里——幂等的核心。
    if (order.status === 'paid') {
      console.log(`[wx-mini push] 订单已是已支付，推送幂等收妥: ${outTradeNo}`);
      return ack(0, 'success');
    }

    // 按**订单上记的通道**取 adapter，不按推送内容猜
    const adapter = getAdapterForChannel(order.channel);
    if (!adapter) {
      console.error(`[wx-mini push] 订单 ${outTradeNo} 的通道未知: ${order.channel}`);
      return ack(-1, 'unknown channel');
    }

    // 金额以回查为准，不采信推送体里的 GoodsInfo.ActualPrice
    const settlement = await adapter.queryCharge(outTradeNo);
    if (!settlement?.paid) {
      console.error(`[wx-mini push] 回查未确认收款，等微信重推: ${outTradeNo}`);
      return ack(-1, 'not paid yet');
    }

    const result = settleFromChannel(settlement);
    if (!result.ok) {
      console.error(
        `[wx-mini push] 拒绝结算 ${outTradeNo}: ${describeSettleFailure(result.reason)}`,
        { channelAmount: settlement.amountMinor, channelCurrency: settlement.currency }
      );
      return ack(-1, describeSettleFailure(result.reason));
    }

    console.log(
      result.alreadyPaid
        ? `[wx-mini push] 重复推送，订单已是已支付: ${outTradeNo}`
        : `[wx-mini push] 订单已更新为已支付: ${outTradeNo}`
    );
    return ack(0, 'success');
  } catch (error) {
    // 出站回查失败等瞬时故障：回非 0 让微信重推，别把一笔真到账丢在这里
    console.error(`[wx-mini push] 处理失败 ${outTradeNo}:`, error);
    return ack(-1, 'internal error');
  }
}
