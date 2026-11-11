/**
 * JSON-LD 结构化数据的唯一出口。
 *
 * 为什么要一个组件而不是各页手写 `<script>`：JSON-LD 必须原样进 HTML，
 * React 只能用 `dangerouslySetInnerHTML`，而这条路上有一个真实的注入面——
 * 数据里若含 `</script>`（Skill 名称、帖子标题都是用户可写的），HTML 解析器
 * 会在那里提前闭合脚本标签，后面的内容就变成了页面里的可执行标记。
 * 所以统一在这里把 `<` 转成 `<`：JSON 解析器照样读得懂，HTML 解析器不再认得。
 *
 * 放在服务端渲染的 `<script>` 里而不是走 `metadata`：Next 的 metadata API 没有
 * JSON-LD 的位置，官方文档给的就是这个写法。next.config.ts 的 CSP 含
 * `script-src 'unsafe-inline'`，不会被拦（改 CSP 时留意这条依赖）。
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
    const json = JSON.stringify(data).replace(/</g, '\\u003c');
    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: json }}
        />
    );
}
