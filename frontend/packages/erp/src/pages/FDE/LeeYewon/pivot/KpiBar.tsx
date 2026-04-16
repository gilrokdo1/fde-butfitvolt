import s from './KpiBar.module.css';
import type { PivotResult, ValueField } from './pivotEngine';

interface Props {
  result: PivotResult;
  values: ValueField[];
  totalRows: number;
}

const COLORS: Record<string, { bg: string; color: string }> = {
  price: { bg: '#ECFDF5', color: '#059669' },
  plate: { bg: '#EFF6FF', color: '#2563EB' },
};

function formatNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString('ko-KR', { maximumFractionDigits: 1 });
}

export default function KpiBar({ result, values, totalRows }: Props) {
  return (
    <div className={s.bar}>
      <div className={s.card}>
        <span className={s.label}>조회 건수</span>
        <span className={s.value}>{totalRows.toLocaleString('ko-KR')}</span>
      </div>
      {values.map((vf) => {
        const total = result.grandTotals.get(vf.field) ?? 0;
        const style = COLORS[vf.field];
        return (
          <div
            key={`${vf.field}-${vf.agg}`}
            className={s.card}
            style={style ? { background: style.bg } : undefined}
          >
            <span className={s.label}>
              {vf.field} ({vf.agg})
            </span>
            <span className={s.value} style={style ? { color: style.color } : undefined}>
              {formatNumber(total)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
