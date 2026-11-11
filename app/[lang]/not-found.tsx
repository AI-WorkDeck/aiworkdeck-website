import { getDictionary } from '@/get-dictionary';
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
    const [en, zh] = await Promise.all([getDictionary('en'), getDictionary('zh')]);
    return <NotFoundContent copy={{ en: en.notFoundPage, zh: zh.notFoundPage }} />;
}
