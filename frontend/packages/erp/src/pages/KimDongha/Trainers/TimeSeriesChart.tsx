import { useMemo, useRef, useState } from 'react';
import type { TrainerMonthlyRow } from '../../../api/fde';
import s from './Trainers.module.css';

interface Props {
  rows: TrainerMonthlyRow[];
  start: string;
  end: string;
}

interface Series {
  key: 'active_members' | 'sessions_done' | 'conversion_rate' | 'rereg_rate' | 'completion_rate' | 'days_per_8_avg';
  label: string;
  unit: string;
  color: string;
  formatter: (v: number | null) => string;
  values: Array<{ month: string; value: number | null; extra?: string }>;
}

function monthList(start: string, end: string): string[] {
  const out: string[] = [];
  const [sy, sm] = [Number(start.slice(0, 4)), Number(start.slice(5, 7))];
  const [ey, em] = [Number(end.slice(0, 4)), Number(end.slice(5, 7))];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

export default function TimeSeriesChart({ rows, start, end }: Props) {
  const months = useMemo(() => monthList(start, end), [start, end]);

  const series = useMemo<Series[]>(() => {
    const byMonth = new Map<string, TrainerMonthlyRow[]>();
    for (const r of rows) {
      const arr = byMonth.get(r.target_month) ?? [];
      arr.push(r);
      byMonth.set(r.target_month, arr);
    }

    const active: Array<{ month: string; value: number | null; extra?: string }> = [];
    const sessions: Array<{ month: string; value: number | null; extra?: string }> = [];
    const conv: Array<{ month: string; value: number | null; extra?: string }> = [];
    const rereg: Array<{ month: string; value: number | null; extra?: string }> = [];
    const comp: Array<{ month: string; value: number | null; extra?: string }> = [];
    const d8: Array<{ month: string; value: number | null; extra?: string }> = [];

    for (const month of months) {
      const bucket = byMonth.get(month) ?? [];
      const am = bucket.reduce((a, x) => a + x.active_members, 0);
      const sm = bucket.reduce((a, x) => a + x.sessions_done, 0);
      const te = bucket.reduce((a, x) => a + x.trial_end_count, 0);
      const tc = bucket.reduce((a, x) => a + x.trial_convert_count, 0);
      const re = bucket.reduce((a, x) => a + x.regular_end_count, 0);
      const rr = bucket.reduce((a, x) => a + x.regular_rereg_count, 0);
      const cc = bucket.reduce((a, x) => a + (x.completion_count ?? 0), 0);
      const co = bucket.reduce((a, x) => a + (x.completion_ontime ?? 0), 0);
      const d8s = bucket.reduce((a, x) => a + (x.days_per_8_sum ?? 0), 0);
      const d8c = bucket.reduce((a, x) => a + (x.days_per_8_count ?? 0), 0);
      active.push({ month, value: bucket.length ? am : null });
      sessions.push({ month, value: bucket.length ? sm : null });
      conv.push({
        month,
        value: te > 0 ? (tc / te) * 100 : null,
        extra: te > 0 ? `${tc}/${te}` : '데이터 없음',
      });
      rereg.push({
        month,
        value: re > 0 ? (rr / re) * 100 : null,
        extra: re > 0 ? `${rr}/${re}` : '데이터 없음',
      });
      comp.push({
        month,
        value: cc > 0 ? (co / cc) * 100 : null,
        extra: cc > 0 ? `${co}/${cc}건` : '시작 멤버십 없음',
      });
      d8.push({
        month,
        value: d8c > 0 ? d8s / d8c : null,
        extra: d8c > 0 ? `n=${d8c}건` : '시작 멤버십 없음',
      });
    }

    return [
      { key: 'active_members', label: '유효회원', unit: '명', color: '#5B5FC7', formatter: (v) => v === null ? '-' : v.toLocaleString('ko-KR'), values: active },
      { key: 'sessions_done', label: '월 세션', unit: '회', color: '#2a9d8f', formatter: (v) => v === null ? '-' : v.toLocaleString('ko-KR'), values: sessions },
      { key: 'conversion_rate', label: '체험전환율', unit: '%', color: '#e6a23c', formatter: (v) => v === null ? '-' : `${v.toFixed(1)}%`, values: conv },
      { key: 'rereg_rate', label: '재등록률', unit: '%', color: '#d93a3a', formatter: (v) => v === null ? '-' : `${v.toFixed(1)}%`, values: rereg },
      { key: 'completion_rate', label: '세션 완료율 (코호트)', unit: '%', color: '#7b5bc7', formatter: (v) => v === null ? '-' : `${v.toFixed(1)}%`, values: comp },
      { key: 'days_per_8_avg', label: '평균 소진일 (8회 정규화)', unit: '일', color: '#3d7ea6', formatter: (v) => v === null ? '-' : `${v.toFixed(1)}일`, values: d8 },
    ];
  }, [rows, months]);

  if (months.length === 0) {
    return <div className={s.empty}>표시할 기간이 없습니다.</div>;
  }

  return (
    <div className={s.chartGrid}>
      {series.map((ser) => (
        <MiniChart key={ser.key} series={ser} />
      ))}
    </div>
  );
}

interface Hover {
  i: number;
  cx: number;
  cy: number;
  month: string;
  label: string;
  extra?: string;
  side: 'left' | 'right';
}

function MiniChart({ series }: { series: Series }) {
  const W = 360;
  const H = 180;
  const PAD_L = 36;
  const PAD_R = 8;
  const PAD_T = 14;
  const PAD_B = 28;

  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const values = series.values;
  const numeric = values.map((p) => p.value).filter((v): v is number => v !== null);
  const max = numeric.length ? Math.max(...numeric) : 1;
  const min = numeric.length ? Math.min(...numeric) : 0;
  const yMax = max === min ? max + 1 : max + (max - min) * 0.1;
  const yMin = max === min ? Math.max(min - 1, 0) : Math.max(min - (max - min) * 0.1, 0);
  const yRange = yMax - yMin || 1;

  const xStep = values.length > 1 ? chartW / (values.length - 1) : 0;

  const toY = (v: number) => PAD_T + chartH - ((v - yMin) / yRange) * chartH;
  const toX = (i: number) => PAD_L + i * xStep;

  let pathD = '';
  let penDown = false;
  values.forEach((p, i) => {
    if (p.value === null) { penDown = false; return; }
    const x = toX(i);
    const y = toY(p.value);
    pathD += `${penDown ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)} `;
    penDown = true;
  });

  const yLabels = [yMax, (yMax + yMin) / 2, yMin];
  const xLabelStep = Math.max(1, Math.ceil(values.length / 6));
  const last = [...values].reverse().find((p) => p.value !== null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);

  const onSvgMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (values.length === 0 || xStep === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = W / rect.width;
    const relX = (e.clientX - rect.left) * scale;
    // 가장 가까운 포인트 인덱스
    const rawIdx = Math.round((relX - PAD_L) / xStep);
    const idx = Math.min(values.length - 1, Math.max(0, rawIdx));
    const p = values[idx];
    if (!p || p.value === null) {
      setHover(null);
      return;
    }
    const cx = toX(idx);
    const cy = toY(p.value);
    setHover({
      i: idx,
      cx,
      cy,
      month: p.month,
      label: series.formatter(p.value),
      extra: p.extra,
      side: cx > W / 2 ? 'left' : 'right',
    });
  };

  const onSvgLeave = () => setHover(null);

  // 화면 좌표계(.chartSvg가 width:100% viewBox=preserveAspectRatio=none) 에서 SVG 내부 좌표를 다시 컨테이너 좌표로 환산
  // 보통 preserveAspectRatio=none 이므로 % 좌표를 그대로 style에 넣으면 비례 배치됨
  const tooltipStyle: React.CSSProperties | undefined = hover && containerRef.current
    ? {
        left: hover.side === 'right' ? `calc(${(hover.cx / W) * 100}% + 10px)` : undefined,
        right: hover.side === 'left' ? `calc(${((W - hover.cx) / W) * 100}% + 10px)` : undefined,
        top: `calc(${(hover.cy / H) * 100}% - 8px)`,
      }
    : undefined;

  return (
    <div className={s.chartCard} ref={containerRef}>
      <div className={s.chartHeader}>
        <span className={s.chartLabel}>{series.label}</span>
        {last && (
          <span className={s.chartLast} style={{ color: series.color }}>
            최근 {series.formatter(last.value)}
          </span>
        )}
      </div>
      <div className={s.chartSvgWrap}>
        <svg
          width="100%"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className={s.chartSvg}
          onMouseMove={onSvgMove}
          onMouseLeave={onSvgLeave}
        >
          {yLabels.map((y, i) => {
            const yy = toY(y);
            return (
              <g key={i}>
                <line x1={PAD_L} y1={yy} x2={W - PAD_R} y2={yy} stroke="var(--border-secondary)" strokeDasharray="2 3" />
                <text x={PAD_L - 6} y={yy + 3} textAnchor="end" fontSize="10" fill="var(--text-tertiary)">
                  {series.unit === '%' ? `${y.toFixed(0)}%` : Math.round(y).toLocaleString('ko-KR')}
                </text>
              </g>
            );
          })}

          {values.map((p, i) => {
            if (i % xLabelStep !== 0 && i !== values.length - 1) return null;
            return (
              <text
                key={p.month}
                x={toX(i)}
                y={H - 8}
                textAnchor="middle"
                fontSize="10"
                fill="var(--text-tertiary)"
              >
                {p.month.slice(2)}
              </text>
            );
          })}

          <path d={pathD} fill="none" stroke={series.color} strokeWidth="2" />

          {values.map((p, i) => {
            if (p.value === null) return null;
            const isHover = hover?.i === i;
            return (
              <circle
                key={i}
                cx={toX(i)}
                cy={toY(p.value)}
                r={isHover ? 5 : 2.8}
                fill={series.color}
                stroke={isHover ? 'white' : 'none'}
                strokeWidth={isHover ? 2 : 0}
              />
            );
          })}

          {hover && (
            <line
              x1={hover.cx}
              y1={PAD_T}
              x2={hover.cx}
              y2={H - PAD_B}
              stroke={series.color}
              strokeDasharray="3 3"
              opacity="0.4"
            />
          )}
        </svg>

        {hover && (
          <div className={s.chartTooltip} style={tooltipStyle}>
            <div className={s.chartTooltipMonth}>{hover.month}</div>
            <div className={s.chartTooltipValue} style={{ color: series.color }}>{hover.label}</div>
            {hover.extra && <div className={s.chartTooltipExtra}>{hover.extra}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
