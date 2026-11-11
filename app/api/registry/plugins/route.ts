import { NextResponse } from 'next/server';
import { listPlugins, compareSemver, getPluginDisplay } from '@/lib/plugins-store';
import { findUserById } from '@/lib/users';
import { siteConfig } from '@/lib/site-config';

export const dynamic = 'force-dynamic';

/**
 * 公开插件注册表 —— 桌面端 PluginMarketService 消费的契约接口。
 * 契约见桌面端仓库 docs/PLUGIN_DISTRIBUTION.md §6，字段勿随意改名/删除。
 *
 * 只暴露 approved 状态；pending / rejected / revoked 一律不出现在这里。
 */
export async function GET() {
  const approved = listPlugins({ status: 'approved' });

  // 同一 id 只暴露最高版本
  const latest = new Map<string, (typeof approved)[number]>();
  for (const p of approved) {
    const cur = latest.get(p.id);
    if (!cur || compareSemver(p.version, cur.version) > 0) latest.set(p.id, p);
  }

  const entries = [...latest.values()].map((p) => {
    const author = findUserById(p.authorId);
    return {
      id: p.id,
      ...getPluginDisplay(p),
      icon: p.icon,
      version: p.version,
      author: author?.username || p.author,
      authorDisplayName: author?.displayName || p.author,
      permissions: p.permissions,
      tools: p.tools,
      size: p.size,
      downloads: p.downloads,
      publishedAt: p.publishedAt,
      homepage: p.homepage || `${siteConfig.origin}/${siteConfig.defaultLocale}/plugins/${p.id}`,
      // PR-W3 只增不改：付费元数据，旧桌面端忽略未知字段
      priceCents: p.priceCents ?? 0,
      pricingModel: p.pricingModel ?? 'once',
    };
  });

  return NextResponse.json(entries);
}
