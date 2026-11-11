import 'server-only';
import { headers } from 'next/headers';
import {
    INTL_US_LEGAL_ENTITY,
    publicEntityForHost,
    type SitePublicEntity,
} from '@/lib/site-config';

/**
 * 按请求的 Host 取对外展示的主体（页脚 + 公司页）。
 *
 * 国际站进程同时服务 www.workdeck.ai 与 www.aiworkdeck.us 两个域名（同一个
 * 127.0.0.1:3000，nginx 两个 vhost），构建期的 `SITE_ID` 分不出它们，只能按请求分。
 * 为什么可以这么做：全站 116 个页面本来就是 `force-dynamic`，读一次 Host 头
 * 不增加渲染成本；剩下几个 SSG 页（about / legal / membership）里，只有 about
 * 与页脚需要主体，退成按请求渲染是这件事的必要代价。
 *
 * **服务端专用**（`server-only`）：`headers()` 在客户端组件里不存在。
 *
 * 取值口径与反代一致：先 `x-forwarded-host`（nginx 转发时带的原始 Host），
 * 回落 `host`。两者都没有就当成本站默认主体。
 */
export async function publicEntityForRequest(): Promise<{
    entity: SitePublicEntity;
    isUs: boolean;
}> {
    const h = await headers();
    const host = h.get('x-forwarded-host') ?? h.get('host');
    const entity = publicEntityForHost(host);
    // 与 publicEntityForHost 共用同一次判断，不再重算一遍 Host 匹配——
    // 两处各判一次早晚会漂（比如将来加了别的别名域）。
    return { entity, isUs: entity === INTL_US_LEGAL_ENTITY };
}
