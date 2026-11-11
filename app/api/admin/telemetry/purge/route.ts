import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { withTransaction } from '@/lib/db';
import { purgeExpiredTelemetry } from '@/lib/telemetry-store';

export const dynamic = 'force-dynamic';

/** 隐私政策《八、保存期限》对匿名遥测的承诺：24 个月，届期滚动删除。 */
const DEFAULT_RETENTION_MONTHS = 24;
const MAX_RETENTION_MONTHS = 120;

/**
 * 匿名遥测保留期清理（定时任务入口）。
 *
 * 做成端点而不是独立脚本，两条理由：
 *
 * 1. 只有一份到期逻辑。脚本里另写一遍 DELETE，迟早会与 lib/telemetry-store.ts 漂移，
 *    而这是对外承诺过的保留期——漂移的后果是删多了（丢数据）或删少了（违诺）。
 * 2. **服务器上 /usr/bin/node 是 v20，跑碰 better-sqlite3 的脚本会段错误**
 *    （原生模块是按 PM2 那个 node 的 ABI 编的，版本不匹配直接 SIGSEGV，
 *    要绕就得每条 cron 都写死 nvm 里的 node 全路径，一次 node 升级就集体哑掉）。
 *    端点跑在 PM2 已经加载好的那个 node 里，天然没有这个问题，cron 只需要 curl。
 *
 * 与 credits/expire 不同的是：**遥测漏跑就是真的超期留存**。余额的正确性不依赖
 * 那个任务（getBalance 本就排除过期批次），而这里没有任何「视图层兜底」，
 * 数据留在库里就是留着了。所以这条 cron 挂了要当回事。
 *
 * 鉴权沿用后台唯一凭据：awd_admin cookie 的值就是 AWD_ADMIN_TOKEN 原文，
 * 所以 cron 直接带 cookie 即可，不必为一个定时任务把 Bearer 也放进 isAdminRequest
 * （那会同时放宽全部 admin 端点的入口）。
 *
 * 副作用提醒：清理跑完，admin 看板的「累计安装数」会变小、24 个月前的留存 cohort
 * 会整行消失。这是保留期政策的必然结果，不是数据事故，详见 summarizeTelemetry 的注释。
 *
 * crontab（每天凌晨 5 点，与 backup-db 的 3 点、credits/expire 的 4 点错开；
 * 排在备份之后，让当天的快照里还留着清理前的行，便于事后核对删了什么）：
 *   0 5 * * * curl -fsS -X POST -H "Cookie: awd_admin=$AWD_ADMIN_TOKEN" \
 *     http://127.0.0.1:3000/api/admin/telemetry/purge >> /var/log/awd-telemetry-purge.log 2>&1
 */
export async function POST(request: NextRequest) {
    if (!isAdminRequest(request)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    // cron 的 curl 不带 body，解析失败按默认保留期走
    const body = (await request.json().catch(() => ({}))) as { months?: unknown };
    let months = DEFAULT_RETENTION_MONTHS;
    if (body.months !== undefined) {
        if (
            typeof body.months !== 'number' ||
            !Number.isInteger(body.months) ||
            body.months < 1 ||
            body.months > MAX_RETENTION_MONTHS
        ) {
            return NextResponse.json(
                { error: 'bad_request', message: `months 必须是 1..${MAX_RETENTION_MONTHS} 的整数` },
                { status: 400 }
            );
        }
        months = body.months;
    }

    const now = new Date();
    // setUTCMonth 遇到短月会向后溢出（3-31 减 1 个月 → 2-31 → 3-03），使 cutoff 略微偏晚、
    // 多删几天。方向是「删早了」而不是「留久了」，对保留期承诺是安全的一侧，故不额外校正。
    const cutoff = new Date(now.getTime());
    cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
    const cutoffIso = cutoff.toISOString();

    // 删除与审计同一事务：purgeExpiredTelemetry 内部的 withTransaction 会嵌套成 savepoint，
    // 不会出现「删了但没留痕」。
    const result = withTransaction(db => {
        const purged = purgeExpiredTelemetry(cutoffIso);
        db.prepare('INSERT INTO admin_audit (ts, action, detail) VALUES (?, ?, ?)').run(
            now.toISOString(),
            'telemetry_purge',
            JSON.stringify({ months, cutoffIso, ...purged })
        );
        return purged;
    });

    return NextResponse.json({
        ok: true,
        months,
        cutoffIso,
        ...result,
        at: now.toISOString(),
    });
}
