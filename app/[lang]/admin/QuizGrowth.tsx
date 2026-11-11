'use client';

import { useAdminSite } from './AdminWorkspace';

import { useCallback, useEffect, useState } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QUIZ_TYPE_MAP } from '@/lib/quiz-data';
import {
    EmptyState,
    MetricTile,
    Panel,
    TableShell,
    TableSkeleton,
    Thead,
    TD,
    TD_NUM,
    TH,
    TH_RIGHT,
    TR,
} from './ui';
import type { QuizAdminStats } from '@/lib/quiz-results';

/**
 * 法人格增长面板（dev-board#329 维护者：数据放后台自助看，省得每次问）。
 * 数据契约见 lib/quiz-results.ts quizAdminStats；北极星三率口径与 growth/README 一致：
 * 完成率 visit→complete、保存率 complete→download（长按保存计不到，取下限）、
 * 回流率 qcard 来源 visit 占比。
 */

/** 来源代号 → 人话（qcard 是结果卡上的二维码，+wx 表示落在微信内引导页） */
const SOURCE_LABELS: Record<string, string> = {
    'qcard': '结果卡扫码（浏览器）',
    'qcard+wx': '结果卡扫码（微信内引导页）',
    '+wx': '直接链接（微信内引导页）',
    'direct': '直接访问',
    'cert': '证书横幅',
    'cert+wx': '证书横幅（微信内）',
    'profile': '个人主页入口',
    'profile+wx': '个人主页入口（微信内）',
};

const pct = (num: number, den: number) => (den > 0 ? `${Math.round((num / den) * 100)}%` : '—');

export function QuizGrowth() {
    const { fetch } = useAdminSite();
    const [stats, setStats] = useState<QuizAdminStats | null>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/quiz');
            if (res.ok) setStats(await res.json());
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    if (loading && !stats) return <TableSkeleton />;
    if (!stats) return <EmptyState icon={BarChart3} title="数据拉取失败" hint="刷新重试；确认已登录管理后台。" />;

    const { totals, today, daily, types, sources, quizStartRefs, savedResults, recent } = stats;
    const EV_LABELS: Record<string, string> = { complete: '完成测试', share: '系统分享', download: '下载卡片' };
    const fmtTime = (iso: string) =>
        new Date(iso).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    const qcardVisits = sources.filter(s => s.from.startsWith('qcard')).reduce((n, s) => n + s.count, 0);

    return (
        <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <MetricTile label="今日完成" value={today.complete} hint={`累计 ${totals.complete}`} />
                <MetricTile label="完成率（进题→出结果）" value={pct(totals.complete, totals.start)}
                    hint={`访问→开始 ${pct(totals.start, totals.visit)}`} />
                <MetricTile label="回流率（结果卡扫码）" value={pct(qcardVisits, totals.visit)}
                    hint={`${qcardVisits} 次访问来自结果卡二维码`} />
                <MetricTile label="测后注册引导" value={quizStartRefs}
                    hint={`结果页「开始使用」→ /start；存档结果 ${savedResults}`} />
            </div>

            <Panel title="转化漏斗" description="下载数是「下载结果卡」按钮的点击；微信内长按保存计不到，实际保存高于此数。" padded={false}>
                <TableShell>
                    <Thead>
                        <tr>
                            <th className={TH}>阶段</th>
                            <th className={TH_RIGHT}>今日</th>
                            <th className={TH_RIGHT}>累计</th>
                            <th className={TH_RIGHT}>累计转化</th>
                        </tr>
                    </Thead>
                    <tbody>
                        {([
                            ['访问', today.visit, totals.visit, '—'],
                            ['开始答题', today.start, totals.start, pct(totals.start, totals.visit)],
                            ['完成', today.complete, totals.complete, pct(totals.complete, totals.start)],
                            ['系统分享（发微信/存相册）', today.share ?? 0, totals.share ?? 0, pct(totals.share ?? 0, totals.complete)],
                            ['下载结果卡', today.download, totals.download, pct(totals.download, totals.complete)],
                        ] as const).map(([label, t, all, rate]) => (
                            <tr key={label} className={TR}>
                                <td className={TD}>{label}</td>
                                <td className={TD_NUM}>{t}</td>
                                <td className={TD_NUM}>{all}</td>
                                <td className={TD_NUM}>{rate}</td>
                            </tr>
                        ))}
                    </tbody>
                </TableShell>
            </Panel>

            <Panel title="类型分布" description="「累计占比」含 09-02 17:14 权重再平衡前的历史数据，判断当前权重是否偏科看「近 3 天」列；「保存/分享」=该类型的系统分享+下载动作数，「保存率」高的人格更容易被晒出去。" padded={false}>
                {types.length === 0 ? (
                    <EmptyState icon={BarChart3} title="还没有完成记录" />
                ) : (
                    <TableShell>
                        <Thead>
                            <tr>
                                <th className={TH}>法人格</th>
                                <th className={TH_RIGHT}>今日</th>
                                <th className={TH_RIGHT}>近 3 天</th>
                                <th className={TH_RIGHT}>累计</th>
                                <th className={TH_RIGHT}>累计占比</th>
                                <th className={TH_RIGHT}>保存/分享</th>
                                <th className={TH_RIGHT}>保存率</th>
                                <th className={TH_RIGHT}>卡面稀缺宣称</th>
                            </tr>
                        </Thead>
                        <tbody>
                            {types.map(row => (
                                <tr key={row.typeId} className={TR}>
                                    <td className={TD}>{QUIZ_TYPE_MAP[row.typeId]?.nameZh ?? row.typeId}</td>
                                    <td className={TD_NUM}>{row.today}</td>
                                    <td className={TD_NUM}>{row.recent3}</td>
                                    <td className={TD_NUM}>{row.total}</td>
                                    <td className={TD_NUM}>{pct(row.total, totals.complete)}</td>
                                    <td className={TD_NUM}>{row.save}</td>
                                    <td className={TD_NUM}>{pct(row.save, row.total)}</td>
                                    <td className={TD_NUM}>{QUIZ_TYPE_MAP[row.typeId] ? `${QUIZ_TYPE_MAP[row.typeId].rarity}%` : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </TableShell>
                )}
            </Panel>

            <Panel title="明细流水" description="最近 50 条完成/分享/下载动作。「昵称」是用户答完题自愿填写并印在结果卡上的称呼，未填则空；09-03 前的历史事件没有昵称字段。" padded={false}>
                {recent.length === 0 ? (
                    <EmptyState icon={BarChart3} title="还没有动作记录" />
                ) : (
                    <TableShell>
                        <Thead>
                            <tr>
                                <th className={TH}>时间</th>
                                <th className={TH}>动作</th>
                                <th className={TH}>法人格</th>
                                <th className={TH}>昵称</th>
                            </tr>
                        </Thead>
                        <tbody>
                            {recent.map((r, i) => (
                                <tr key={`${r.at}-${i}`} className={TR}>
                                    <td className={`${TD} font-mono text-[13px] tabular-nums`}>{fmtTime(r.at)}</td>
                                    <td className={TD}>
                                        <span className={r.ev === 'complete' ? '' : 'font-bold text-king-forest'}>
                                            {EV_LABELS[r.ev] ?? r.ev}
                                        </span>
                                        {r.v === 'biz' && (
                                            <span className="ml-1.5 rounded-full border border-king-forest/30 px-1.5 py-px text-[11px] text-king-forest">
                                                名片版
                                            </span>
                                        )}
                                    </td>
                                    <td className={TD}>{r.typeId ? (QUIZ_TYPE_MAP[r.typeId]?.nameZh ?? r.typeId) : '—'}</td>
                                    <td className={TD}>{r.n || <span className="text-neutral-gray-medium">—</span>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </TableShell>
                )}
            </Panel>

            <div className="grid gap-6 lg:grid-cols-2">
                <Panel title="访问来源" padded={false}>
                    <TableShell>
                        <Thead>
                            <tr>
                                <th className={TH}>来源</th>
                                <th className={TH_RIGHT}>访问</th>
                            </tr>
                        </Thead>
                        <tbody>
                            {sources.map(s => (
                                <tr key={s.from} className={TR}>
                                    <td className={TD}>{SOURCE_LABELS[s.from] ?? s.from}</td>
                                    <td className={TD_NUM}>{s.count}</td>
                                </tr>
                            ))}
                        </tbody>
                    </TableShell>
                </Panel>

                <Panel title="近 14 天" padded={false}>
                    <TableShell>
                        <Thead>
                            <tr>
                                <th className={TH}>日期</th>
                                <th className={TH_RIGHT}>访问</th>
                                <th className={TH_RIGHT}>开始</th>
                                <th className={TH_RIGHT}>完成</th>
                            </tr>
                        </Thead>
                        <tbody>
                            {[...daily].reverse().map(d => (
                                <tr key={d.date} className={TR}>
                                    <td className={TD}>{d.date}</td>
                                    <td className={TD_NUM}>{d.visit}</td>
                                    <td className={TD_NUM}>{d.start}</td>
                                    <td className={TD_NUM}>{d.complete}</td>
                                </tr>
                            ))}
                        </tbody>
                    </TableShell>
                </Panel>
            </div>

            <div>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()} disabled={loading}>
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} strokeWidth={1.75} />
                    刷新
                </Button>
            </div>
        </div>
    );
}
