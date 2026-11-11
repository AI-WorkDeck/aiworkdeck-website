import { ReactNode } from 'react';

/**
 * 把词典模板里的 `{key}` 占位符替换成 ReactNode（句中嵌链接用）。
 *
 * 原本各写各的：定价区的页脚小字一份、/start 的说明一份。抽出来是因为
 * 「在一句话中间放链接」这件事本身就要求文案整句进词典——把句子拆成
 * 「前半段 + 链接 + 后半段」三个键，翻译时语序一变就拼不回来了。
 * 无状态纯函数，服务端与客户端组件都能用。
 */
export function interpolate(template: string, parts: Record<string, ReactNode>): ReactNode[] {
    return template.split(/(\{\w+\})/g).map((seg, i) => {
        const m = seg.match(/^\{(\w+)\}$/);
        if (m && m[1] in parts) return <span key={i}>{parts[m[1]]}</span>;
        return seg;
    });
}
