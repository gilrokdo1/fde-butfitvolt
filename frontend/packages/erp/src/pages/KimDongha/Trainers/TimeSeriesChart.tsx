import { useMemo } from 'react';
import type { TrainerMonthlyRow } from '../../../api/fde';
import s from './Trainers.module.css';

interface Props {
  rows: TrainerMonthlyRow[];
  start: string;
  end: string;
}

interface Series {
  key: 'active_members' | 'sessions_done' | 'conversion_rate' | 'rereg_rate';
  label: string;
  unit: string;
  color: string;
  formatter: (v: number | null) => string;
  values: Array<{ month: string; value: number | null }>;
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

    const active: Array<{ month: string; value: number | null }> = [];
    const sessions: Array<{ month: string; value: number | null }> = [];
    const conv: Array<{ month: string; value: number | null }> = [];
    const rereg: Array<{ month: string; value: number | null }> = [];

    for (const month of months) {
      const bucket = byMonth.get(month) ?? [];
      const am = bucket.reduce((a, x) => a + x.active_members, 0);
      const sm = bucket.reduce((a, x) => a + x.sessions_done, 0);
      const te = bucket.reduce((a, x) => a + x.trial_end_count, 0);
      const tc = bucket.reduce((a, x) => a + x.trial_convert_count, 0);
      const re = bucket.reduce((a, x) => a + x.regular_end_count, 0);
      const rr = bucket.reduce((a, x) => a + x.regular_rereg_count, 0);
      active.push({ month, value: bucket.length ? am : null });
      sessions.push({ month, value: bucket.length ? sm : null });
      conv.push({ month, value: te > 0 ? (tc / te) * 100 : null });
      rereg.push({ month, value: re > 0 ? (rr / re) * 100 : null });
    }

    return [
      { key: 'active_members', label: '유효회원', unit: '명', color: '#5B5FC7', formatter: (v) => v === null ? '-' : v.toLocaleString('ko-KR'), values: active },
      { key: 'sessions_done', label: '월 세션', unit: '회', color: '#2a9d8f', formatter: (v) => v === null ? '-' : v.toLocaleString('ko-KR'), values: sessions },
      { key: 'conversion_rate', label: '체험전환율', unit: '%', color: '#e6a23c', formatter: (v) => v === null ? '-' : `${v.toFixed(1)}%`, values: conv },
      { key: 'rereg_rate', label: '재등록률', unit: '%', color: '#d93a3a', formatter: (v) => v === null ? '-' : `${v.toFixed(1)}%`, values: rereg },
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

function MiniChart({ series }: { series: Series }) {
  const W = 360;
  const H = 160;
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

  // 라인 경로 (null 구간은 끊음)
  let pathD = '';
  let penDown = false;
  values.forEach((p, i) => {
    if (p.value === null) { penDown = false; return; }
    const x = toX(i);
    const y = toY(p.value);
    pathD += `${penDown ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)} `;
    penDown = true;
  });

  // Y축 라벨 3개 (max, mid, min)
  const yLabels = [yMax, (yMax + yMin) / 2, yMin];

  // X축 라벨: 최대 6개 스파스
  const xLabelStep = Math.max(1, Math.ceil(values.length / 6));

  const last = [...values].reverse().find((p) => p.value !== null);

  return (
    <div className={s.chartCard}>
      <div className={s.chartHeader}>
        <span className={s.chartLabel}>{series.label}</span>
        {last && (
          <span className={s.chartLast} style={{ color: series.color }}>
            최근 {series.formatter(last.value)}
          </span>
        )}
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={s.chartSvg}>
        {/* Y grid */}
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

        {/* X 라벨 */}
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

        {/* 라인 */}
        <path d={pathD} fill="none" stroke={series.color} strokeWidth="2" />

        {/* 포인트 + 값 툴팁용 타이틀 */}
        {values.map((p, i) => {
          if (p.value === null) return null;
          return (
            <circle key={i} cx={toX(i)} cy={toY(p.value)} r="2.8" fill={series.color}>
              <title>{p.month}: {series.formatter(p.value)}</title>
            </circle>
          );
        })}
      </svg>
    </div>
  );
}
