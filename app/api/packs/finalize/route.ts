import { NextRequest, NextResponse } from 'next/server';
import { getUserByToken, SESSION_COOKIE } from '@/lib/sessions';
import { finalizePack } from '@/lib/packs-store';
import { packErrorMessage } from '@/lib/pack-messages';
import { pickLangText, resolveRequestLocale } from '@/lib/api-locale';

export const dynamic = 'force-dynamic';
// 受理检查要把每个归档流式过一遍（哈希 + 逐条目防护），大包耗时以分钟计
export const maxDuration = 300;

/**
 * 原生资源包提交第三步：全部文件传完后触发受理检查。
 * POST /api/packs/finalize?token=...
 *
 * 通过则进 pending 人工审核队列；不过则整个提交目录删除并返回具体原因
 * （docs/NATIVE_PACK_DISTRIBUTION.md §8.1）。
 */
export async function POST(request: NextRequest) {
    const user = getUserByToken(request.cookies.get(SESSION_COOKIE)?.value);
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const lang = resolveRequestLocale(request);
    const token = request.nextUrl.searchParams.get('token') || '';
    if (!token) {
        return NextResponse.json(
            { error: 'bad_request', message: pickLangText(lang, '缺少 token 参数', 'Missing token parameter') },
            { status: 400 }
        );
    }

    const { pack, error, detail } = await finalizePack(token, { authorId: user.id });
    if (error || !pack) {
        return NextResponse.json({ error, message: packErrorMessage(error, detail, lang) }, { status: 400 });
    }
    return NextResponse.json({
        pack: {
            id: pack.id,
            version: pack.version,
            status: pack.status,
            totalSize: pack.totalSize,
            components: pack.components,
        },
    });
}
