import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { listPacks, type PackStatus } from '@/lib/packs-store';
import { isSigningConfigured } from '@/lib/plugin-signing';

export const dynamic = 'force-dynamic';

const STATUSES: PackStatus[] = ['pending', 'approved', 'rejected', 'revoked'];

/** 原生资源包审核队列：默认返回全部，可按 status 过滤 */
export async function GET(request: NextRequest) {
    if (!isAdminRequest(request)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const raw = request.nextUrl.searchParams.get('status');
    const status = STATUSES.includes(raw as PackStatus) ? (raw as PackStatus) : undefined;
    return NextResponse.json({
        packs: listPacks(status ? { status } : undefined),
        // 未配置签名私钥时不能上架，后台据此禁用「通过」按钮并提示
        signingConfigured: isSigningConfigured(),
    });
}
