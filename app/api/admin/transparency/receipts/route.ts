import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import {
    RECEIPT_MAX_BYTES,
    RECEIPT_MIME_EXT,
    addReceipt,
    deleteReceipt,
    listReceipts,
    parsePeriod,
} from '@/lib/transparency';

export const dynamic = 'force-dynamic';

/**
 * 捐赠凭证上传。multipart 的 `type` 由浏览器给，**不能当作事实**——
 * 白名单在服务端按声明的 MIME 拦一道，扩展名与落盘路径一律由随机 id 拼出。
 */
export async function POST(request: NextRequest) {
    if (!isAdminRequest(request)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    let form: FormData;
    try {
        form = await request.formData();
    } catch {
        return NextResponse.json({ error: 'bad_request', field: 'body' }, { status: 400 });
    }
    const period = String(form.get('period') ?? '');
    try {
        parsePeriod(period);
    } catch {
        return NextResponse.json({ error: 'bad_request', field: 'period' }, { status: 400 });
    }
    const file = form.get('file');
    if (!(file instanceof File)) {
        return NextResponse.json({ error: 'bad_request', field: 'file' }, { status: 400 });
    }
    if (file.size > RECEIPT_MAX_BYTES) {
        return NextResponse.json({ error: 'too_large', maxBytes: RECEIPT_MAX_BYTES }, { status: 400 });
    }
    if (!RECEIPT_MIME_EXT[file.type]) {
        return NextResponse.json(
            { error: 'unsupported_format', allowed: Object.keys(RECEIPT_MIME_EXT) },
            { status: 400 }
        );
    }
    const caption = form.get('caption');
    const { receipt, error } = addReceipt({
        period,
        fileName: file.name,
        mime: file.type,
        bytes: Buffer.from(await file.arrayBuffer()),
        caption: typeof caption === 'string' ? caption : null,
    });
    if (error) return NextResponse.json({ error }, { status: 400 });
    return NextResponse.json({ receipt, receipts: listReceipts(period) });
}

export async function DELETE(request: NextRequest) {
    if (!isAdminRequest(request)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const id = request.nextUrl.searchParams.get('id') ?? '';
    if (!deleteReceipt(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ ok: true });
}
