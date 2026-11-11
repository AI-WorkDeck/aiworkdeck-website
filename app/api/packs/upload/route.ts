import { Readable } from 'stream';
import { NextRequest, NextResponse } from 'next/server';
import { getUserByToken, SESSION_COOKIE } from '@/lib/sessions';
import { receiveUpload } from '@/lib/packs-store';
import { packErrorMessage } from '@/lib/pack-messages';
import { pickLangText, resolveRequestLocale } from '@/lib/api-locale';

export const dynamic = 'force-dynamic';
// 几百 MB 的归档在慢网下会跑很久；上限拉到 Next 允许的最大值
export const maxDuration = 300;

/**
 * 原生资源包提交第二步：流式收一个组件归档。
 * PUT /api/packs/upload?token=...&file=graphviz-1.0.0-mac-arm64.tar.gz
 * Content-Type: application/octet-stream
 *
 * **绝不使用 request.formData() / arrayBuffer()**：它们会把整包缓冲进内存，
 * 生产机 1.8 GB 内存跑四个站点，一个 300 MB 的包足以打死整台机器
 * （docs/NATIVE_PACK_DISTRIBUTION.md §8.1 明确要求 octet-stream 流式落盘）。
 * 这里把 web ReadableStream 转成 Node Readable 交给存储层边写边算哈希。
 *
 * nginx 侧要为本路由单独放大 client_max_body_size（doc/nginx-workdeck-ai.conf），
 * 且 /api/ 已配 proxy_request_buffering off——否则 nginx 会先把整包落到自己的
 * 临时文件里，流式就成了摆设。
 */
export async function PUT(request: NextRequest) {
    const user = getUserByToken(request.cookies.get(SESSION_COOKIE)?.value);
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const lang = resolveRequestLocale(request);
    const token = request.nextUrl.searchParams.get('token') || '';
    const file = request.nextUrl.searchParams.get('file') || '';
    if (!token || !file) {
        return NextResponse.json(
            { error: 'bad_request', message: pickLangText(lang, '缺少 token 或 file 参数', 'Missing token or file parameter') },
            { status: 400 }
        );
    }
    if (!request.body) {
        return NextResponse.json(
            { error: 'empty_body', message: pickLangText(lang, '请求体为空', 'Request body is empty') },
            { status: 400 }
        );
    }

    const rawLength = request.headers.get('content-length');
    const contentLength = rawLength && /^\d+$/.test(rawLength) ? Number(rawLength) : undefined;

    const source = Readable.fromWeb(request.body as Parameters<typeof Readable.fromWeb>[0]);
    const result = await receiveUpload(token, file, source, { authorId: user.id, contentLength });
    if (result.error) {
        const status = result.error === 'size_mismatch' ? 413 : 400;
        return NextResponse.json(
            { error: result.error, message: packErrorMessage(result.error, result.detail, lang) },
            { status }
        );
    }
    return NextResponse.json({ ok: true, file, size: result.size, sha256: result.sha256 });
}
