import { NextResponse } from 'next/server';
import { getReceipt, getReport, readReceiptBytes } from '@/lib/transparency';

export const dynamic = 'force-dynamic';

/**
 * 捐赠凭证原件。公开可读——它是账目公开这件事的证据，藏起来就没有意义了。
 *
 * **但只在所属期次已发布之后**：草稿期的凭证 id 只出现在后台，可一旦泄露
 * （截图、链接分享）就等于抢跑发布。所以每次读都回查一次报表状态，
 * 未发布一律 404，而不是 403——不确认这个 id 存在过。
 */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const receipt = getReceipt(id);
    if (!receipt) return new NextResponse(null, { status: 404 });

    const report = getReport(receipt.period);
    if (!report || report.status !== 'published') return new NextResponse(null, { status: 404 });

    const bytes = readReceiptBytes(receipt);
    if (!bytes) return new NextResponse(null, { status: 404 });

    return new NextResponse(new Uint8Array(bytes), {
        headers: {
            'Content-Type': receipt.mime,
            'Content-Length': String(bytes.length),
            // 凭证发布后不会再变（要改就是换一张新的，id 也换），一小时缓存足够挡住列表页的重复请求
            'Cache-Control': 'public, max-age=3600',
            'Content-Disposition': `inline; filename="${receipt.id}"`,
        },
    });
}
