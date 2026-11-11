import { NextResponse } from 'next/server';
import { listPacks } from '@/lib/packs-store';

export const dynamic = 'force-dynamic';

/**
 * 原生资源包封禁表 —— 桌面端沿 PluginRevocationService 的节奏（启动 + 每 24h）拉取，
 * 命中的已装 pack 在 current.json 写 revoked 标记、资源解析链对它视而不见。
 * 契约见桌面端仓库 docs/NATIVE_PACK_DISTRIBUTION.md §8.4，形制与插件封禁表一致。
 *
 * version "*" = 该 id 全部版本被封。镜像上可能存在官网没有记录的旧版本快照
 * （回退安装用），逐版本枚举挡不住它们，所以通配封禁必须如实发成 "*"。
 */
export async function GET() {
    const revoked = listPacks({ status: 'revoked' });
    const wildcardIds = new Set(revoked.filter((p) => p.revokedAll).map((p) => p.id));

    const elements = [
        ...[...wildcardIds].map((id) => {
            const latest = revoked.filter((p) => p.id === id).sort((a, b) => (a.reviewedAt || '').localeCompare(b.reviewedAt || '')).pop()!;
            return {
                id,
                version: '*',
                reason: latest.reviewNote || '平台已下架',
                revokedAt: latest.reviewedAt,
            };
        }),
        ...revoked
            .filter((p) => !wildcardIds.has(p.id))
            .map((p) => ({
                id: p.id,
                version: p.version,
                reason: p.reviewNote || '平台已下架',
                revokedAt: p.reviewedAt,
            })),
    ];
    return NextResponse.json(elements);
}
