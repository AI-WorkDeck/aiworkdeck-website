'use client';

import { useId, useRef, useState } from 'react';

/**
 * 看板自绘 SVG 图表（站内无图表库，不引重依赖）。
 * 视觉遵循 DESIGN.md：品牌绿系、坐标轴与 tooltip 克制、无 emoji。
 */

const FOREST = 'var(--king-forest)';
const FOREST_RGB = '46, 90, 80'; // var(--king-forest) 的 rgb 三元组，供 rgba() 动态透明度用
const MINT = 'var(--king-mint)';
const GRID = 'var(--neutral-gray-light)';
const LABEL = 'var(--neutral-gray-medium)';

function fmtShortDate(d: string): string {
  return d.slice(5); // MM-DD
}

// ---------------------------------------------------------------------------
// 日活趋势面积图
// ---------------------------------------------------------------------------

export function AreaChart({ data }: { data: Array<{ date: string; count: number }> }) {
  const gradId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const W = 720;
  const H = 230;
  const PL = 44;
  const PR = 14;
  const PT = 16;
  const PB = 30;
  const n = data.length;
  const max = Math.max(1, ...data.map(d => d.count));
  const x = (i: number) => (n <= 1 ? PL + (W - PL - PR) / 2 : PL + (i * (W - PL - PR)) / (n - 1));
  const y = (v: number) => PT + (1 - v / max) * (H - PT - PB);

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.count).toFixed(1)}`).join(' ');
  const areaPath =
    n > 0
      ? `${linePath} L${x(n - 1).toFixed(1)},${H - PB} L${x(0).toFixed(1)},${H - PB} Z`
      : '';

  const yTicks = [0, Math.ceil(max / 2), max];
  const tickCount = Math.min(6, n);
  const xTickIdx =
    n <= 1 ? (n === 1 ? [0] : []) : Array.from({ length: tickCount }, (_, k) => Math.round((k * (n - 1)) / (tickCount - 1)));

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (n === 0 || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(x(i) - px);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    setHover(best);
  };

  const h = hover !== null && hover < n ? hover : null;
  // tooltip 靠边时翻转，避免溢出
  const tipW = 108;
  const tipX = h !== null ? Math.min(Math.max(x(h) - tipW / 2, PL), W - PR - tipW) : 0;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto select-none"
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
      role="img"
      aria-label="日活趋势"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={MINT} stopOpacity="0.35" />
          <stop offset="100%" stopColor={MINT} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {yTicks.map(t => (
        <g key={t}>
          <line x1={PL} y1={y(t)} x2={W - PR} y2={y(t)} stroke={GRID} strokeWidth="1" />
          <text x={PL - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill={LABEL}>
            {t}
          </text>
        </g>
      ))}
      {xTickIdx.map((i, k) => (
        // 末位刻度落在 x = W - PR，居中锚点会让日期越出 viewBox 被裁掉，改右对齐
        <text
          key={i}
          x={x(i)}
          y={H - 10}
          textAnchor={k === xTickIdx.length - 1 ? 'end' : 'middle'}
          fontSize="11"
          fill={LABEL}
        >
          {fmtShortDate(data[i].date)}
        </text>
      ))}
      {n > 0 && (
        <>
          <path d={areaPath} fill={`url(#${gradId})`} />
          <path d={linePath} fill="none" stroke={FOREST} strokeWidth="2" strokeLinejoin="round" />
        </>
      )}
      {h !== null && (
        <g>
          <line x1={x(h)} y1={PT} x2={x(h)} y2={H - PB} stroke={FOREST} strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
          <circle cx={x(h)} cy={y(data[h].count)} r="3.5" fill={FOREST} stroke="#fff" strokeWidth="1.5" />
          <g transform={`translate(${tipX}, ${PT})`}>
            <rect width={tipW} height="34" rx="6" fill="var(--king-forest-darker)" opacity="0.92" />
            <text x={tipW / 2} y="14" textAnchor="middle" fontSize="10" fill="var(--king-mint-lighter)">
              {data[h].date}
            </text>
            <text x={tipW / 2} y="28" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">
              {data[h].count} 台活跃
            </text>
          </g>
        </g>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 横条图（事项类型 / 版本 / 工具 / Skill 榜通用）
// ---------------------------------------------------------------------------

export function HBarChart({
  items,
  barColor = FOREST,
}: {
  items: Array<{ name: string; count: number }>;
  barColor?: string;
}) {
  const clipId = useId();
  const W = 720;
  const rowH = 30;
  const nameW = 168;
  const countW = 64;
  const barX = nameW + 10;
  const barMax = W - barX - countW;
  const H = Math.max(items.length * rowH, rowH);
  const max = Math.max(1, ...items.map(i => i.count));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="分布横条图">
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y="0" width={nameW} height={H} />
        </clipPath>
      </defs>
      {items.map((it, i) => {
        const yMid = i * rowH + rowH / 2;
        const w = Math.max((it.count / max) * barMax, 2);
        return (
          <g key={it.name}>
            <title>{`${it.name}: ${it.count.toLocaleString('zh-CN')}`}</title>
            <text
              x={nameW}
              y={yMid + 4}
              textAnchor="end"
              fontSize="12"
              fill="var(--neutral-gray-dark)"
              clipPath={`url(#${clipId})`}
            >
              {it.name}
            </text>
            <rect x={barX} y={yMid - 7} width={barMax} height="14" rx="3" fill="var(--neutral-gray-pale)" />
            <rect x={barX} y={yMid - 7} width={w} height="14" rx="3" fill={barColor} opacity={0.9 - i * 0.02} />
            <text x={barX + barMax + 8} y={yMid + 4} fontSize="12" fill={LABEL}>
              {it.count.toLocaleString('zh-CN')}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 留存热力表
// ---------------------------------------------------------------------------

export function RetentionTable({
  cohorts,
}: {
  cohorts: Array<{ cohortWeek: string; size: number; weeks: Array<number | null> }>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-neutral-gray-pale/60">
          <tr className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-gray-medium">
            <th className="px-3 py-2.5 text-left whitespace-nowrap">首见周</th>
            <th className="px-3 py-2.5 text-right">安装数</th>
            {Array.from({ length: 8 }, (_, i) => (
              <th key={i} className="px-2 py-2.5 text-center whitespace-nowrap">
                第 {i + 1} 周
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map(c => (
            <tr key={c.cohortWeek} className="border-t border-neutral-gray-light/70">
              <td className="px-3 py-2 font-mono text-xs text-neutral-dark-bg whitespace-nowrap">{c.cohortWeek}</td>
              <td className="px-3 py-2 text-right font-mono text-neutral-gray-dark">{c.size}</td>
              {c.weeks.map((w, i) => {
                if (w === null) {
                  return (
                    <td key={i} className="px-2 py-2 text-center text-neutral-gray-light">
                      —
                    </td>
                  );
                }
                const alpha = Math.min((w / 100) * 0.9, 0.9);
                return (
                  <td key={i} className="px-1 py-1 text-center">
                    <span
                      className="inline-block w-full rounded px-1 py-1 font-mono text-xs"
                      style={{
                        backgroundColor: `rgba(${FOREST_RGB}, ${alpha.toFixed(2)})`,
                        color: alpha > 0.45 ? '#fff' : 'var(--king-forest-darker)',
                      }}
                    >
                      {w.toFixed(0)}%
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
