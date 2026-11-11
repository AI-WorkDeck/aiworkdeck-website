import fs from 'fs';
import { Readable } from 'stream';
import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import {
    approvePack,
    getPack,
    packArchivePath,
    readPackInspection,
    rejectPack,
    revokePack,
} from '@/lib/packs-store';
import { notifySubmissionReviewed, type ReviewAction } from '@/lib/review-notify';

export const dynamic = 'force-dynamic';

/**
 * 审核结果通知，口径同 app/api/admin/plugins/[id]/route.ts：
 * 状态已落库，这一步只是转述；发信永不抛异常，拖不垮审核动作。
 * 资源包没有独立展示名，用 id。
 */
async function notifyAuthor(id: string, version: string, action: ReviewAction, note?: string) {
    const entry = getPack(id, version) || getPack(id);
    if (!entry) return;
    await notifySubmissionReviewed({
        kind: 'pack',
        id: entry.id,
        version,
        action,
        note,
        authorId: entry.authorId,
    });
}

/**
 * 审核动作。body: { version, action: 'approve' | 'reject' | 'revoke', note? }
 *
 * 与 JAR 插件同样没有自动通过路径：原生二进制没有 class 常量池那样可交叉验证的面，
 * 审核结论主要依赖来源可信度，拿不准就驳回（NATIVE_PACK_DISTRIBUTION.md §8.2）。
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    if (!isAdminRequest(request)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    let body: { version?: string; action?: string; note?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }

    const version = String(body.version || '').trim();
    const action = String(body.action || '');
    if (!version) return NextResponse.json({ error: 'version_required' }, { status: 400 });

    if (action === 'approve') {
        const { ok, reason } = approvePack(id, version);
        if (!ok) {
            const message =
                reason === 'signing_not_configured'
                    ? '服务器未配置 AWD_PLUGIN_SIGNING_KEY，无法签名上架'
                    : reason === 'archive_missing'
                      ? '提交目录里的组件归档已丢失，请让作者重新提交'
                      : '资源包版本不存在';
            return NextResponse.json({ error: reason, message }, { status: reason === 'not_found' ? 404 : 500 });
        }
        await notifyAuthor(id, version, 'approve');
        return NextResponse.json({ ok: true });
    }

    if (action === 'reject' || action === 'revoke') {
        const note = String(body.note || '').trim();
        if (!note) {
            return NextResponse.json(
                { error: 'note_required', message: action === 'reject' ? '驳回必须填写原因' : '封禁必须填写原因' },
                { status: 400 }
            );
        }
        const done = action === 'reject' ? rejectPack(id, version, note) : revokePack(id, version, note);
        if (!done) return NextResponse.json({ error: 'not_found' }, { status: 404 });
        await notifyAuthor(id, version, action === 'reject' ? 'reject' : 'revoke', note);
        return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'unknown_action' }, { status: 400 });
}

/**
 * 审核详情与人工核查下载：
 *   ?version=1.0.0                        -> { pack, inspection }（逐条目清单 + URL/IP 线索）
 *   ?version=1.0.0&archive=xxx.tar.gz     -> 归档原文（流式，几百 MB 不进内存）
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    if (!isAdminRequest(request)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const version = request.nextUrl.searchParams.get('version') || '';
    const archive = request.nextUrl.searchParams.get('archive') || '';

    if (!version) {
        const entry = getPack(id);
        return entry ? NextResponse.json({ pack: entry }) : NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    if (archive) {
        const filePath = packArchivePath(id, version, archive);
        if (!filePath) return NextResponse.json({ error: 'not_found' }, { status: 404 });
        const { size } = fs.statSync(filePath);
        const stream = Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream<Uint8Array>;
        return new NextResponse(stream, {
            headers: {
                'Content-Type': 'application/gzip',
                'Content-Length': String(size),
                'Content-Disposition': `attachment; filename="${encodeURIComponent(archive)}"`,
            },
        });
    }

    const pack = getPack(id, version);
    if (!pack) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ pack, inspection: readPackInspection(id, version) || {} });
}
