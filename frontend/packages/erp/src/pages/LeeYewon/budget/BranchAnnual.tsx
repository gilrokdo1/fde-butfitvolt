import { useEffect, useMemo, useState } from 'react';
import s from './BranchAnnual.module.css';
import { fetchAnnual, type AnnualResponse, type Branch } from './api';

interface Props {
  branch: Branch;
}

const CURRENT_YEAR = new Date().getFullYear();
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function formatThousand(n: number): string {
  // 천원 단위 — 와이어프레임 페이지 2 표기 ("3,300" = 3,300천원 = 330만원)
  if (n === 0) return '—';
  return Math.round(n / 1000).toLocaleString();
}

function formatKRW(n: number): string {
  return n.toLocaleString() + '원';
}

function vatMinus(n: number): number {
  return Math.round(n / 1.1);
}

function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

export default function BranchAnnual({ branch }: Props) {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [vatPlus, setVatPlus] = useState(true);
  const [data, setData] = useState<AnnualResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchAnnual(branch.id, year)
      .then(setData)
      .catch((e: unknown) => {
        const anyErr = e as { response?: { data?: { detail?: string } } };
        setError(anyErr.response?.data?.detail || (e instanceof Error ? e.message : '연간 데이터 로드 실패'));
      })
      .finally(() => setLoading(false));
  }, [branch.id, year]);

  // VAT 토글에 따라 값 변환
  const adjust = useMemo(() => {
    return (n: number) => (vatPlus ? n : vatMinus(n));
  }, [vatPlus]);

  if (loading && !data) {
    return <div className={s.loading}>연간 데이터 로드 중…</div>;
  }
  if (error) {
    return <div className={s.error}>{error}</div>;
  }
  if (!data) return null;

  const { totals, ytd_progress, categories, pending } = data;

  return (
    <div className={s.wrap}>
      {/* 상단 컨트롤 */}
      <div className={s.controls}>
        <div className={s.yearWrap}>
          <button
            className={s.yearBtn}
            onClick={() => setYear((y) => y - 1)}
            title="이전 연도"
          >
            ‹
          </button>
          <strong className={s.year}>{year}년</strong>
          <button
            className={s.yearBtn}
            onClick={() => setYear((y) => y + 1)}
            title="다음 연도"
          >
            ›
          </button>
        </div>

        <div className={s.vatToggle}>
          <button
            className={`${s.toggleBtn} ${vatPlus ? s.toggleActive : ''}`}
            onClick={() => setVatPlus(true)}
          >
            VAT 포함
          </button>
          <button
            className={`${s.toggleBtn} ${!vatPlus ? s.toggleActive : ''}`}
            onClick={() => setVatPlus(false)}
          >
            VAT 제외
          </button>
        </div>
      </div>

      {/* KPI 3종 */}
      <div className={s.kpiGrid}>
        <Kpi label="연간 예산" value={formatKRW(adjust(totals.annual_budget))} hint={`${categories.length}개 대카테고리`} />
        <Kpi
          label="YTD 지출"
          value={formatKRW(adjust(totals.annual_spend))}
          hint={`소진율 ${pct(totals.annual_ratio)} · 연 경과 ${pct(ytd_progress.ratio)}`}
        />
        <Kpi
          label="연간 잔여"
          value={formatKRW(adjust(totals.annual_remaining))}
          hint={`잔여율 ${pct(1 - totals.annual_ratio)}`}
          tone={totals.annual_ratio >= 1 ? 'danger' : totals.annual_ratio >= 0.9 ? 'warn' : 'ok'}
        />
      </div>

      {/* 매트릭스 */}
      <div className={s.card}>
        <header className={s.cardHeader}>
          <h3>계정 × 월 매트릭스</h3>
          <span className={s.cardHint}>
            상단: 예산 / 하단: 지출 (단위: 천원, {vatPlus ? 'VAT 포함' : 'VAT 제외'})
          </span>
        </header>

        <div className={s.matrixWrap}>
          <table className={s.matrix}>
            <colgroup>
              <col className={s.labelCol} />
              {MONTHS.map((m) => (
                <col key={m} className={m === ytd_progress.months_passed ? s.currentCol : ''} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className={s.labelCol}>계정</th>
                {MONTHS.map((m) => (
                  <th key={m} className={m === ytd_progress.months_passed ? s.currentColTh : ''}>
                    {m}월
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.flatMap((cat) => [
                // 대카 합계 행 (회색 배경)
                <tr key={`cat-${cat.code}`} className={s.groupRow}>
                  <td className={s.groupName} colSpan={13}>
                    {cat.name}
                    <span className={s.groupAmount}>
                      연 {formatKRW(adjust(cat.group_annual_budget))} ·
                      소진 {pct(cat.group_annual_ratio)}
                    </span>
                  </td>
                </tr>,
                // 소카 — 예산행 + 지출행
                ...cat.codes.flatMap((code) => [
                  <tr key={`b-${code.id}`}>
                    <td className={s.label} rowSpan={2}>{code.name}</td>
                    {MONTHS.map((m) => {
                      const v = code.budgets[String(m)] ?? 0;
                      return (
                        <td key={m} className={`${s.budget} ${v === 0 ? s.naCell : ''}`}>
                          {formatThousand(adjust(v))}
                        </td>
                      );
                    })}
                  </tr>,
                  <tr key={`s-${code.id}`}>
                    {MONTHS.map((m) => {
                      const spend = code.spends[String(m)] ?? 0;
                      const budget = code.budgets[String(m)] ?? 0;
                      const isOver = budget > 0 && spend > budget;
                      const noData = spend === 0;
                      return (
                        <td
                          key={m}
                          className={`${s.spend} ${isOver ? s.over : ''} ${noData ? s.naCell : ''}`}
                          title={
                            isOver
                              ? `월 예산 초과 ${(spend - budget).toLocaleString()}원`
                              : undefined
                          }
                        >
                          {formatThousand(adjust(spend))}
                        </td>
                      );
                    })}
                  </tr>,
                ]),
              ])}
            </tbody>
          </table>
        </div>
        <p className={s.tableNote}>빨간 숫자는 월 예산 초과</p>
      </div>

      {/* 대카 그룹별 연간 요약 */}
      <div className={s.card}>
        <header className={s.cardHeader}>
          <h3>대카테고리 그룹별 연간 요약</h3>
        </header>
        <table className={s.summaryTable}>
          <thead>
            <tr>
              <th>그룹</th>
              <th className={s.num}>연 예산</th>
              <th className={s.num}>YTD</th>
              <th className={s.num}>잔여</th>
              <th className={s.num}>소진율</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => {
              const remaining = cat.group_annual_budget - cat.group_annual_spend;
              const ratio = cat.group_annual_ratio;
              return (
                <tr key={cat.code}>
                  <td>{cat.name}</td>
                  <td className={s.num}>{formatKRW(adjust(cat.group_annual_budget))}</td>
                  <td className={s.num}>{formatKRW(adjust(cat.group_annual_spend))}</td>
                  <td className={`${s.num} ${remaining < 0 ? s.over : ''}`}>
                    {formatKRW(adjust(remaining))}
                  </td>
                  <td className={s.num}>
                    <span
                      className={s.pill}
                      style={{
                        background: ratio >= 1 ? '#FEE2E2' : ratio >= 0.9 ? '#FED7AA' : '#EEF2FF',
                        color: ratio >= 1 ? '#991B1B' : ratio >= 0.9 ? '#9A3412' : '#4338CA',
                      }}
                    >
                      {pct(ratio)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className={s.totalRow}>
              <td>합계</td>
              <td className={s.num}>{formatKRW(adjust(totals.annual_budget))}</td>
              <td className={s.num}>{formatKRW(adjust(totals.annual_spend))}</td>
              <td className={s.num}>{formatKRW(adjust(totals.annual_remaining))}</td>
              <td className={s.num}>{pct(totals.annual_ratio)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {pending.count > 0 && (
        <div className={`${s.card} ${s.cardPending}`}>
          <header className={s.cardHeader}>
            <h3>미정 카테고리 (집계 외)</h3>
            <span className={s.cardHint}>재분류 필요 · 월별 탭의 "미정 재분류" 버튼으로</span>
          </header>
          <div className={s.pendingLine}>
            <span>총 {pending.count}건</span>
            <strong>{formatKRW(adjust(pending.total))}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'ok' | 'warn' | 'danger';
}) {
  const colorMap = {
    ok: { bg: '#ECFDF5', border: '#A7F3D0' },
    warn: { bg: '#FFFBEB', border: '#FDE68A' },
    danger: { bg: '#FEF2F2', border: '#FECACA' },
  } as const;
  const c = tone ? colorMap[tone] : null;
  return (
    <div
      className={s.kpi}
      style={c ? { background: c.bg, borderColor: c.border } : undefined}
    >
      <div className={s.kpiLabel}>{label}</div>
      <div className={s.kpiValue}>{value}</div>
      {hint && <div className={s.kpiHint}>{hint}</div>}
    </div>
  );
}
