import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { reconcileAllQuotas } from '@/lib/ai-quota';
import { reconcileStalePending } from '@/lib/ai-alloc';
import { reclaimExpiredHolds } from '@/lib/gateway/spend';
import { reclaimStaleInFlight } from '@/lib/gateway/idempotency';
import { sweepExpiredAsrObjects } from '@/lib/gateway/asr';
import { retryPendingConsumes } from '@/lib/bqt-member';

export const dynamic = 'force-dynamic';

/**
 * 卡在 in_flight 的幂等行多久算死。
 *
 * 取所有服务里最长的上游超时（60 秒）再放宽一大截：判早了会把真的还在跑的
 * 请求降级成 failed，于是同一个键能被并发跑第二遍——那正是幂等要防的事。
 * 判晚一点的代价只是用户多等一会儿才能重试。
 */
const STALE_IN_FLIGHT_MS = 15 * 60 * 1000;

/**
 * AI 额度对账（定时任务入口）。做两件事：
 *
 * 1. **回抄用量**：逐个同步有 key 的账户，把远端新增用量折成 Credits 扣掉。
 *    取消用户侧 allocate 之后，官网这边再没有「用户主动发起一次分配」这个天然触发点；
 *    用量回抄若只挂在读接口上，长期不打开账户页的用户就等于白用。
 *
 * 2. **清扫历史 pending**：旧的两阶段分配（先扣钱再提额）留下的 pending 行。
 *    这条以前**唯一**的触发点就是 allocateAiQuota 本身——入口一下线，超过 10 分钟的
 *    pending 会永远悬着：钱已扣、状态停在 pending。所以入口下线与本任务必须同批上线。
 *
 * crontab（每小时，与备份/到期清理错开）：
 *   17 * * * * curl -fsS -X POST -H "Cookie: awd_admin=$AWD_ADMIN_TOKEN" \
 *     http://127.0.0.1:3000/api/admin/ai/reconcile >> /var/log/awd-ai-reconcile.log 2>&1
 */
export async function POST(request: NextRequest) {
    if (!isAdminRequest(request)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    // 历史 pending 先清，避免它与新的用量回抄在同一个账户上交错
    await reconcileStalePending();

    // 网关的两项回收**排在用量回抄之前**：释放过期预扣会把钱退回余额，
    // 而余额是 reconcileAllQuotas 重设 AI limit 的输入——顺序反了，
    // 刚退回来的那笔要等下一个小时才反映到 AI 额度上。
    // 删中转音频排在释放预扣之前：释放会把 hold 置成 released，
    // 之后就没有任何一条查询能告诉我们「这个任务的对象键是什么」了。
    const objects = await sweepExpiredAsrObjects();
    const holds = reclaimExpiredHolds();
    const stale = reclaimStaleInFlight(
        new Date(Date.now() - STALE_IN_FLIGHT_MS).toISOString()
    );

    const quotas = await reconcileAllQuotas();
    // 包晴天积分发件箱补发：超时/无响应/SYSTEM_BUSY 的扣减用原单号原积分重发（挂在这条既有 cron 上）。
    const bqtRetried = await retryPendingConsumes().catch(e => { console.error('[bqt] retryPendingConsumes failed', e instanceof Error ? e.message : e); return -1; });
    return NextResponse.json({
        ok: true,
        quotas,
        bqt: { retriedConsumes: bqtRetried },
        gateway: {
            releasedHolds: holds.released,
            reclaimedRequests: stale.reclaimed,
            deletedAudioObjects: objects.deleted,
        },
        at: new Date().toISOString(),
    });
}
