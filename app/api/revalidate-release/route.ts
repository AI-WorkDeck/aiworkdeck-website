import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';

/**
 * 镜像同步脚本（桌面仓 deploy/update-mirror-sync.sh）写完 installers/latest.json
 * 后回调这里，立即作废 /start 下载链的 fetch 缓存（lib/latest-release.ts 两个
 * fetch 共用的 'latest-release' tag）。
 *
 * 没有回调也不致命：两个 fetch 自己的 revalidate（镜像 300 秒 / GitHub 3600 秒）
 * 兜底。这个端点要消灭的是发版后的双重延迟窗口——2026-08-19 复盘：镜像同步
 * 本身迟了 47 分钟（pack release 顶掉 releases/latest 把同步脚本打挂），叠加
 * 页面缓存的 5 分钟，被误判成「SWR 坏了」。同步完成即回调，页面窗口归零，
 * 剩下的延迟都真属于同步链路，不再有两段窗口互相顶锅。
 *
 * token 与服务器 /etc/aiworkdeck/mirror-sync.env 里的 AWD_REVALIDATE_TOKEN 同值。
 */
export async function POST(req: Request) {
    const token = process.env.AWD_REVALIDATE_TOKEN;
    if (!token) {
        return NextResponse.json({ error: 'not configured' }, { status: 503 });
    }
    if (req.headers.get('authorization') !== `Bearer ${token}`) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    // { expire: 0 } = 立即硬过期：下一个请求前台重取（本机 nginx，毫秒级）。
    // Next 16 的单参数形态已弃用；第二参 'max' 是 SWR 档，还会放过一次旧响应，
    // 与「同步完成即切新版」的目的相悖，不用。
    revalidateTag('latest-release', { expire: 0 });
    return NextResponse.json({ ok: true });
}
