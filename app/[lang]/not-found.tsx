import { getDictionary } from '@/get-dictionary';
import { i18n } from '@/i18n-config';
import { NotFoundContent } from './NotFoundContent';

/**
 * 自定义 404。在此之前用的是 Next 默认页——状态码对，但没有 Navbar/Footer 之外的
 * 任何出路，且没有一条通向站内的链接（404 页是把误入的爬虫与访客送回可索引内容
 * 的最后一站）。
 *
 * `not-found.tsx` 收不到 `params`，所以两个语种的文案都在这里取好，
 * 由客户端组件按 `useParams()` 挑一份，见 NotFoundContent.tsx。
 */
export default async function NotFound() {
    // Every locale's (short) copy, so zh-hant and the other 17 languages get their own 404 text (X32).
    const copy = Object.fromEntries(await Promise.all(i18n.locales.map(async l => [l, (await getDictionary(l)).notFoundPage])));
    return <NotFoundContent copy={copy as Parameters<typeof NotFoundContent>[0]['copy']} />;
}
