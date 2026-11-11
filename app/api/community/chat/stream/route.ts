import { NextRequest } from 'next/server';
import { SSE_RESPONSE_INIT } from '@/lib/ai-stream';
import { resolveRequestLocale } from '@/lib/api-locale';
import { listChatSince, getLatestChatId } from '@/lib/chat';
import { publicAuthor } from '@/lib/forum';

/**
 * 聊天室 SSE 增量推送（dev-board#317）。
 *
 * 路线是维护者拍板的「SSE 服务端短轮询」：连接后每 POLL_MS 查一次库的增量下发。
 * 不引入进程内 pub/sub——pm2 多进程/多实例下进程内事件总线本来就不可靠，
 * 而 2 秒一次的索引查询在 SQLite 上近乎免费。
 * nginx 配方沿用 lib/ai-stream.ts 的既定 SSE_RESPONSE_INIT（X-Accel-Buffering:no），
 * 心跳帧防 nginx 读超时。连接最长 MAX_LIFE_MS 后主动收尾，客户端自行重连
 * （长期挂着的连接经过部署窗口/nginx reload 会变僵尸，定期换新更省心）。
 */
export const dynamic = 'force-dynamic';

const POLL_MS = 2_000;
const HEARTBEAT_MS = 15_000;
const MAX_LIFE_MS = 5 * 60_000;

export async function GET(request: NextRequest) {
    const lang = resolveRequestLocale(request);
    const sinceRaw = Number(request.nextUrl.searchParams.get('since') ?? '');
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            // 客户端没带游标就从「现在」开始，历史由 REST 首次加载负责
            let cursor = Number.isFinite(sinceRaw) && sinceRaw >= 0 ? Math.floor(sinceRaw) : getLatestChatId();
            let closed = false;

            const send = (payload: unknown) => {
                if (closed) return;
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
                } catch {
                    cleanup();
                }
            };

            const poll = setInterval(() => {
                const rows = listChatSince(cursor);
                if (rows.length === 0) return;
                cursor = rows[rows.length - 1].id;
                send({
                    type: 'messages',
                    latest: cursor,
                    messages: rows.map(m => ({
                        id: m.id,
                        content: m.content,
                        createdAt: m.createdAt,
                        author: publicAuthor(m.userId, lang),
                    })),
                });
            }, POLL_MS);

            const heartbeat = setInterval(() => send({ type: 'ping' }), HEARTBEAT_MS);

            const life = setTimeout(() => {
                send({ type: 'reset' });
                cleanup();
            }, MAX_LIFE_MS);

            const cleanup = () => {
                if (closed) return;
                closed = true;
                clearInterval(poll);
                clearInterval(heartbeat);
                clearTimeout(life);
                try {
                    controller.close();
                } catch { /* 已关闭 */ }
            };

            request.signal.addEventListener('abort', cleanup);
            send({ type: 'hello', latest: cursor });
        },
    });

    return new Response(stream, SSE_RESPONSE_INIT);
}
