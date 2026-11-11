import { notFound } from 'next/navigation';

/**
 * 语种前缀下的未匹配路径兜底。
 *
 * 没有这一条的话，`/en/typo` 这类地址走不到 `app/[lang]/not-found.tsx`——它只负责
 * 页面里 `notFound()` 抛出来的 404；**完全没有匹配上路由**的地址由 Next 的内建
 * 404 接管，那是一张没有 Navbar、没有 Footer、没有任何站内链接的黑白页。
 * 而 404 页恰恰是把误入的访客与爬虫送回可索引内容的最后一站。
 *
 * Next 16 有 `global-not-found.tsx` 能一次性接管，但它还挂在
 * `experimental.globalNotFound` 后面——为一张 404 页给生产站开实验开关不划算。
 * catch-all 是同层级里优先级最低的段（静态 > 动态 > catch-all），
 * 不会遮住任何真实路由。
 */
export default function CatchAllNotFound(): never {
    notFound();
}
