'use client';

import { useAdminSite } from '../AdminWorkspace';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Download, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Eyebrow, MetricTile, Notice, Panel, Skeleton } from '../ui';
import { AreaChart, HBarChart, RetentionTable } from './Charts';

/** 管理后台使用统计看板（维护者专用，固定中文，不走 i18n 词典）。 */

interface Summary {
  range: { from: string; to: string };
  dailyActive: Array<{ date: string; count: number }>;
  totals: {
    installs: number;
    newInstalls: number;
    mau: number;
    wau: number;
    aiTurns: number;
    docsEdited: number;
    tokens: number;
  };
  versionDist: Array<{ version: string; count: number }>;
  topTools: Array<{ name: string; count: number }>;
  topSkills: Array<{ name: string; count: number }>;
  matterDist: Array<{ name: string; count: number }>;
  retention: { cohorts: Array<{ cohortWeek: string; size: number; weeks: Array<number | null> }> };
}

const QUICK_RANGES = [
  { key: '7', label: '近 7 天', days: 7 },
  { key: '30', label: '近 30 天', days: 30 },
  { key: '90', label: '近 90 天', days: 90 },
] as const;

function daysAgo(days: number): string {
  return new Date(Date.now() - (days - 1) * 24 * 3600 * 1000).toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 大数字紧凑显示：融资演示口径，万/亿分档。 */
function fmtCompact(v: number): string {
  if (v >= 1e8) return `${(v / 1e8).toFixed(v >= 1e9 ? 0 : 1)} 亿`;
  if (v >= 1e4) return `${(v / 1e4).toFixed(v >= 1e5 ? 0 : 1)} 万`;
  return v.toLocaleString('zh-CN');
}

export function TelemetryDashboard() {
    const { fetch, url, pageUrl, copy } = useAdminSite();
  const params = useParams<{ lang: string }>();
  const lang = params?.lang ?? 'zh';

  const [quick, setQuick] = useState<'7' | '30' | '90' | 'custom'>('90');
  const [from, setFrom] = useState(daysAgo(90));
  const [to, setTo] = useState(today());
  const [data, setData] = useState<Summary | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (f: string, t: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/telemetry?from=${f}&to=${t}`);
      if (res.status === 401) {
        setAuthed(false);
        setData(null);
        return;
      }
      if (!res.ok) {
        setError(res.status === 503 ? copy.notConnected : copy.unavailable);
        return;
      }
      setData(await res.json());
      setAuthed(true);
    } catch {
      setError('加载失败，请检查网络后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(from, to);
    // 仅首次加载；后续区间变化由按钮显式触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyQuick = (key: '7' | '30' | '90') => {
    const range = QUICK_RANGES.find(r => r.key === key)!;
    const f = daysAgo(range.days);
    const t = today();
    setQuick(key);
    setFrom(f);
    setTo(t);
    load(f, t);
  };

  const applyCustom = () => {
    if (!from || !to || from > to) {
      setError('起止日期不合法');
      return;
    }
    setQuick('custom');
    load(from, to);
  };

  const csvUrl = useMemo(() => url(`/api/admin/telemetry?from=${from}&to=${to}&format=csv`), [from, to]);

  const hasData = !!data && data.dailyActive.length > 0;

  if (authed === false) {
    return (
      <div className="flex items-start justify-center pt-10 pb-24">
        <div className="w-full max-w-sm bg-white/70 backdrop-blur-xl border border-neutral-gray-light/90 rounded-xl p-8 text-center shadow-[0_18px_40px_-24px_rgba(18,58,38,0.28)]">
          <ShieldCheck className="w-6 h-6 text-king-forest mx-auto mb-3" strokeWidth={1.75} />
          <p className="font-display text-xl font-bold text-neutral-dark-bg mb-1.5">需要维护者登录</p>
          <p className="text-sm leading-relaxed text-neutral-gray-medium mb-6">
            请先在站点后台输入管理口令，再回到本页。
          </p>
          <Button asChild className="font-bold">
            <a href={pageUrl(`/${lang}/admin`)}>前往站点后台登录</a>
          </Button>
        </div>
      </div>
    );
  }

  if (authed === null && error) return <Notice><p>{error}</p><Button onClick={() => load(from, to)} variant="outline" className="mt-3">{copy.retry}</Button></Notice>;

  if (authed === null) {
    return (
      <div className="flex flex-col gap-8">
        <Skeleton className="h-10 w-56" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[0, 1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 页头：与 /admin 同一套眉标 + 衬线标题 */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>AI WorkDeck Console</Eyebrow>
          <h1 className="font-display text-4xl font-semibold text-neutral-dark-bg mt-3">使用统计</h1>
          <p className="text-neutral-gray-medium mt-2">桌面端匿名遥测汇总（installId 口径，不关联账户）</p>
        </div>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="gap-1.5 border-neutral-gray-light bg-white/70 text-neutral-gray-dark"
        >
          <a href={pageUrl(`/${lang}/admin`)}>
            <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.75} />
            返回站点后台
          </a>
        </Button>
      </header>

      {/* 区间选择 + 导出 */}
      <div className="flex items-end justify-between flex-wrap gap-4 border-b border-neutral-gray-light/80 pb-4">
        <div className="flex items-end gap-5 flex-wrap">
          <div className="flex items-center gap-1">
            {QUICK_RANGES.map(r => (
              <button
                key={r.key}
                onClick={() => applyQuick(r.key)}
                className={
                  quick === r.key
                    ? 'px-3 py-1.5 text-sm font-medium text-king-forest border-b-2 border-king-forest'
                    : 'px-3 py-1.5 text-sm font-medium text-neutral-gray-medium border-b-2 border-transparent hover:text-king-forest transition-colors'
                }
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="h-9 rounded-lg border border-neutral-gray-light bg-white px-2.5 text-sm text-neutral-gray-dark font-mono"
            />
            <span className="text-neutral-gray-medium text-sm">至</span>
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="h-9 rounded-lg border border-neutral-gray-light bg-white px-2.5 text-sm text-neutral-gray-dark font-mono"
            />
            <Button variant="outline" size="sm" onClick={applyCustom} disabled={loading} className="border-neutral-gray-light text-neutral-gray-dark">
              应用
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => load(from, to)}
            disabled={loading}
            className="gap-1.5 border-neutral-gray-light bg-white/70 text-neutral-gray-dark"
          >
            <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} />
            刷新
          </Button>
          {hasData && (
            <Button asChild size="sm" className="gap-1 font-bold">
              <a href={csvUrl} download>
                <Download className="w-3.5 h-3.5" />
                导出 CSV
              </a>
            </Button>
          )}
        </div>
      </div>

      {error && <Notice tone="danger">{error}</Notice>}

      {!data ? (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[0, 1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : !hasData ? (
        <Panel>
          <div className="py-16 text-center">
            <p className="font-display text-xl font-bold text-neutral-dark-bg mb-2">暂无上报数据</p>
            <p className="text-sm text-neutral-gray-medium">
              所选区间（{data.range.from} 至 {data.range.to}）内还没有收到桌面端遥测。
            </p>
          </div>
        </Panel>
      ) : (
        <>
          {/* KPI 大数字行 */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <MetricTile
              label="活跃安装"
              value={fmtCompact(data.totals.installs)}
              hint={`区间新增 ${data.totals.newInstalls}`}
            />
            <MetricTile
              label="月活（MAU）"
              value={fmtCompact(data.totals.mau)}
              hint={`周活 ${fmtCompact(data.totals.wau)}`}
            />
            <MetricTile label="AI 对话总量" value={fmtCompact(data.totals.aiTurns)} hint="区间内 ai.turn 累计" />
            <MetricTile label="处理文档量" value={fmtCompact(data.totals.docsEdited)} hint="区间内编辑动作累计" />
            <MetricTile label="累计 Token" value={fmtCompact(data.totals.tokens)} hint="区间内输入与输出合计" />
          </div>

          {/* 日活趋势 */}
          <Panel title="日活趋势" description={`${data.range.from} 至 ${data.range.to} · 按 installId 去重`}>
            <AreaChart data={data.dailyActive} />
          </Panel>

          {/* 事项类型 + 版本分布 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Panel title="事项类型分布" description="AI 识别的法律事项类别 Top 15">
              {data.matterDist.length > 0 ? (
                <HBarChart items={data.matterDist} />
              ) : (
                <EmptyBlock text="区间内暂无事项分类数据" />
              )}
            </Panel>
            <Panel title="版本采用分布" description="区间内每台安装取最新上报版本">
              {data.versionDist.length > 0 ? (
                <HBarChart
                  items={data.versionDist.map(v => ({ name: v.version, count: v.count }))}
                  barColor="var(--king-forest-darker)"
                />
              ) : (
                <EmptyBlock text="区间内暂无版本数据" />
              )}
            </Panel>
          </div>

          {/* 工具 / Skill Top 榜 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Panel title="工具使用 Top 15" description="AI 编排器工具调用次数">
              {data.topTools.length > 0 ? <HBarChart items={data.topTools} /> : <EmptyBlock text="区间内暂无工具调用数据" />}
            </Panel>
            <Panel title="Skill 使用 Top 15" description="Skill 触发次数">
              {data.topSkills.length > 0 ? <HBarChart items={data.topSkills} /> : <EmptyBlock text="区间内暂无 Skill 数据" />}
            </Panel>
          </div>

          {/* 留存 */}
          <Panel title="周留存" description="按首见周分组，第 N 周仍活跃的安装占比；未到期的周以 — 显示">
            {data.retention.cohorts.length > 0 ? (
              <RetentionTable cohorts={data.retention.cohorts} />
            ) : (
              <EmptyBlock text="区间内暂无新增安装，无法计算留存" />
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return <p className="text-sm text-neutral-gray-medium text-center py-10">{text}</p>;
}
