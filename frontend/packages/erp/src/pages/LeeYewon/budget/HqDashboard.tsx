import { useEffect, useMemo, useState } from 'react';
import s from './HqDashboard.module.css';
import HqCellDetailModal from './HqCellDetailModal';
import HqPendingModal from './HqPendingModal';
import HqWarningModal from './HqWarningModal';
import { fetchHqDashboard, type HqDashboardResponse } from './api';

type DrillTarget = {
  branchId: number;
  branchName: string;
  accountCodeId: number | null;
  accountName: string | null;
  /** 셀 단위 클릭이면 그 셀의 ratio. 행 단위 클릭이면 month_ratio. */
  monthBudget: number;
  monthSpend: number;
  monthRatio: number;
};

const CURRENT_YEAR = new Date().getFullYear();

function formatKRW(n: number): string {
  return n.toLocaleString() + '원';
}

function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/** 히트맵 5단계 색 (와이어프레임 페이지 3 기준). */
function heatmapColor(ratio: number | null, progressRatio: number): { bg: string; fg: string; label: string } {
  if (ratio === null) return { bg: '#F3F4F6', fg: '#9CA3AF', label: '—' };
  const pctVal = Math.round(ratio * 100);
  if (ratio >= 1) return { bg: '#FEE2E2', fg: '#991B1B', label: `${pctVal}` };
  if (ratio >= 0.9) return { bg: '#FED7AA', fg: '#9A3412', label: `${pctVal}` };
  // 경과율 +10% 이상 — watch (노랑)
  if (progressRatio > 0 && ratio > progressRatio + 0.1) {
    return { bg: '#FEF3C7', fg: '#B45309', label: `${pctVal}` };
  }
  // 50% 이상 — 옅은 보라
  if (ratio >= 0.5) return { bg: '#E0E7FF', fg: '#4338CA', label: `${pctVal}` };
  // 정상
  return { bg: '#ECFDF5', fg: '#065F46', label: `${pctVal}` };
}

export default function HqDashboard() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [data, setData] = useState<HqDashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drill, setDrill] = useState<DrillTarget | null>(null);
  const [showPending, setShowPending] = useState(false);
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchHqDashboard(year, month)
      .then(setData)
      .catch((e: unknown) => {
        const anyErr = e as { response?: { data?: { detail?: string } } };
        setError(anyErr.response?.data?.detail || (e instanceof Error ? e.message : '본사 대시보드 로드 실패'));
      })
      .finally(() => setLoading(false));
  }, [year, month]);

  // 셀 빠른 조회 맵
  const cellMap = useMemo(() => {
    if (!data) return new Map<string, number | null>();
    const m = new Map<string, number | null>();
    for (const c of data.heatmap.cells) {
      m.set(`${c.branch_id}:${c.account_code_id}`, c.ratio);
    }
    return m;
  }, [data]);

  if (loading && !data) {
    return <div className={s.loading}>본사 대시보드 계산 중…</div>;
  }
  if (error) return <div className={s.error}>{error}</div>;
  if (!data) return null;

  const { totals, branches, heatmap, month_progress, quarter, quarter_months } = data;

  return (
    <div className={s.wrap}>
      {/* 분기/월 컨트롤 */}
      <div className={s.controls}>
        <div className={s.yearWrap}>
          <button className={s.yearBtn} onClick={() => setYear((y) => y - 1)}>‹</button>
          <strong className={s.year}>{year}년</strong>
          <button className={s.yearBtn} onClick={() => setYear((y) => y + 1)}>›</button>
        </div>
        <div className={s.monthChips}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
            <button
              key={m}
              className={`${s.chip} ${m === month ? s.chipActive : ''} ${quarter_months.includes(m) ? s.chipQuarter : ''}`}
              onClick={() => setMonth(m)}
            >
              {m}월
            </button>
          ))}
        </div>
        <span className={s.quarterLabel}>{quarter}Q · 월 경과 {pct(month_progress.ratio)}</span>
      </div>

      {/* KPI 4종 */}
      <div className={s.kpiGrid}>
        <Kpi
          label={`${year}년 ${month}월 총 예산`}
          value={formatKRW(totals.month_budget)}
          hint={`활성 ${branches.length}개 지점 합계`}
        />
        <Kpi
          label="누적 지출"
          value={formatKRW(totals.month_spend)}
          hint={`소진율 ${pct(totals.month_ratio)} · 경과 ${pct(month_progress.ratio)}`}
        />
        <Kpi
          label="주의 지점"
          value={
            totals.danger_branches > 0
              ? `${totals.danger_branches}곳 초과`
              : totals.warn_branches > 0
                ? `${totals.warn_branches}곳 주의`
                : '-'
          }
          hint={
            totals.danger_branches > 0
              ? '100% 이상 계정 보유'
              : totals.warn_branches > 0
                ? '90% 이상 계정 보유'
                : '없음'
          }
          tone={totals.danger_branches > 0 ? 'danger' : totals.warn_branches > 0 ? 'warn' : undefined}
          onClick={
            totals.danger_branches + totals.warn_branches > 0
              ? () => setShowWarning(true)
              : undefined
          }
          clickHint="90%+ 계정을 지점별로 상세 보기"
        />
        <Kpi
          label="미정 대기"
          value={totals.pending_count > 0 ? `${totals.pending_count}건` : '-'}
          hint={totals.pending_count > 0 ? formatKRW(totals.pending_total) : '없음'}
          tone={totals.pending_count > 0 ? 'warn' : undefined}
          onClick={totals.pending_count > 0 ? () => setShowPending(true) : undefined}
          clickHint="지점별 미정 상세 보기"
        />
      </div>

      {branches.length === 0 ? (
        <div className={s.empty}>
          <p>활성화된 지점이 아직 없습니다.</p>
          <p className={s.emptyHint}>지점 보기에서 지점을 활성화하세요.</p>
        </div>
      ) : (
        <>
          {/* 히트맵 */}
          <div className={s.card}>
            <header className={s.cardHeader}>
              <h3>계정 × 지점 소진율 히트맵</h3>
              <span className={s.cardHint}>월 경과율 {pct(month_progress.ratio)} 기준 · 빈 셀(—) = 예산 없음</span>
            </header>
            <div className={s.heatmapWrap}>
              <table className={s.heatmap}>
                <thead>
                  <tr>
                    <th className={s.labelCol}>계정 \ 지점</th>
                    {branches.map((b) => (
                      <th key={b.id} className={s.branchHeader}>
                        {b.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heatmap.accounts.map((a) => (
                    <tr key={a.id}>
                      <td className={s.label}>
                        <span className={s.accountName}>{a.name}</span>
                        <span className={s.catName}>{a.category_name}</span>
                      </td>
                      {branches.map((b) => {
                        const ratio = cellMap.get(`${b.id}:${a.id}`) ?? null;
                        const c = heatmapColor(ratio, month_progress.ratio);
                        const clickable = ratio !== null;
                        return (
                          <td
                            key={b.id}
                            className={s.cell}
                            style={{
                              background: c.bg,
                              color: c.fg,
                              cursor: clickable ? 'pointer' : 'default',
                            }}
                            onClick={() => {
                              if (!clickable) return;
                              setDrill({
                                branchId: b.id,
                                branchName: b.name,
                                accountCodeId: a.id,
                                accountName: a.name,
                                monthBudget: 0,  // 셀 단위 예산은 응답에 없음 → 모달에서 합산만 표시
                                monthSpend: 0,
                                monthRatio: ratio,
                              });
                            }}
                            title={
                              ratio === null
                                ? `${b.name} · ${a.name}: 월 예산 없음`
                                : `${b.name} · ${a.name}: ${pct(ratio)} 소진 — 클릭하면 상세`
                            }
                          >
                            {c.label}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={s.legend}>
              <span><span className={s.legendBox} style={{ background: '#ECFDF5' }} /> 정상 (&lt;50%)</span>
              <span><span className={s.legendBox} style={{ background: '#E0E7FF' }} /> 50% 이상</span>
              <span><span className={s.legendBox} style={{ background: '#FEF3C7' }} /> 경과율 초과 (watch)</span>
              <span><span className={s.legendBox} style={{ background: '#FED7AA' }} /> 90~100% (warn)</span>
              <span><span className={s.legendBox} style={{ background: '#FEE2E2' }} /> 100%+ (초과)</span>
            </div>
          </div>

          {/* 지점 비교 표 */}
          <div className={s.card}>
            <header className={s.cardHeader}>
              <h3>지점 비교 ({month}월)</h3>
              <span className={s.cardHint}>분기 누적도 함께</span>
            </header>
            <table className={s.compareTable}>
              <thead>
                <tr>
                  <th>지점</th>
                  <th className={s.num}>{month}월 예산</th>
                  <th className={s.num}>{month}월 지출</th>
                  <th className={s.num}>월 소진율</th>
                  <th className={s.num}>{quarter}Q 누적</th>
                  <th className={s.num}>분기 소진율</th>
                  <th className={s.num}>경고</th>
                  <th className={s.num}>미정</th>
                </tr>
              </thead>
              <tbody>
                {branches.map((b) => {
                  const monthC = heatmapColor(b.month_ratio || null, month_progress.ratio);
                  const quarterC = heatmapColor(b.quarter_ratio || null, 1);
                  return (
                    <tr
                      key={b.id}
                      onClick={() => {
                        if (b.month_budget === 0 && b.month_spend === 0) return;
                        setDrill({
                          branchId: b.id,
                          branchName: b.name,
                          accountCodeId: null,
                          accountName: null,
                          monthBudget: b.month_budget,
                          monthSpend: b.month_spend,
                          monthRatio: b.month_ratio,
                        });
                      }}
                      style={{ cursor: 'pointer' }}
                      title={`${b.name} ${month}월 전체 지출 보기`}
                    >
                      <td><strong>{b.name}</strong></td>
                      <td className={s.num}>{b.month_budget.toLocaleString()}</td>
                      <td className={s.num}>{b.month_spend.toLocaleString()}</td>
                      <td className={s.num}>
                        <span
                          className={s.pill}
                          style={{ background: monthC.bg, color: monthC.fg }}
                        >
                          {pct(b.month_ratio)}
                        </span>
                      </td>
                      <td className={s.num}>{b.quarter_spend.toLocaleString()}</td>
                      <td className={s.num}>
                        <span
                          className={s.pill}
                          style={{ background: quarterC.bg, color: quarterC.fg }}
                        >
                          {pct(b.quarter_ratio)}
                        </span>
                      </td>
                      <td className={s.num}>
                        {b.danger_count > 0 && <span className={s.dangerBadge}>{b.danger_count} 초과</span>}
                        {b.warn_count > 0 && <span className={s.warnBadge}>{b.warn_count} 주의</span>}
                        {b.danger_count === 0 && b.warn_count === 0 && <span className={s.muted}>-</span>}
                      </td>
                      <td className={s.num}>
                        {b.pending_count > 0 ? (
                          <span className={s.warnBadge}>
                            {b.pending_count}건 · {b.pending_total.toLocaleString()}
                          </span>
                        ) : (
                          <span className={s.muted}>-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className={s.totalRow}>
                  <td>합계</td>
                  <td className={s.num}>{totals.month_budget.toLocaleString()}</td>
                  <td className={s.num}>{totals.month_spend.toLocaleString()}</td>
                  <td className={s.num}>{pct(totals.month_ratio)}</td>
                  <td className={s.num} colSpan={4}>
                    잔여 {totals.month_remaining.toLocaleString()}원
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {drill && (
        <HqCellDetailModal
          branchId={drill.branchId}
          branchName={drill.branchName}
          accountCodeId={drill.accountCodeId}
          accountName={drill.accountName}
          monthBudget={drill.monthBudget}
          monthSpend={drill.monthSpend}
          monthRatio={drill.monthRatio}
          year={year}
          month={month}
          onClose={() => setDrill(null)}
        />
      )}

      {showPending && (
        <HqPendingModal
          year={year}
          month={month}
          onClose={() => setShowPending(false)}
        />
      )}

      {showWarning && (
        <HqWarningModal
          year={year}
          month={month}
          onClose={() => setShowWarning(false)}
        />
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone,
  onClick,
  clickHint,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'warn' | 'danger';
  onClick?: () => void;
  clickHint?: string;
}) {
  const colorMap = {
    warn: { bg: '#FFFBEB', border: '#FDE68A' },
    danger: { bg: '#FEF2F2', border: '#FECACA' },
  } as const;
  const c = tone ? colorMap[tone] : null;
  const clickable = !!onClick;
  return (
    <div
      className={s.kpi}
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={(e) => {
        if (clickable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick?.();
        }
      }}
      style={{
        ...(c ? { background: c.bg, borderColor: c.border } : {}),
        cursor: clickable ? 'pointer' : undefined,
      }}
      title={clickable ? clickHint : undefined}
    >
      <div className={s.kpiLabel}>
        {label}
        {clickable && <span style={{ marginLeft: 6, fontSize: 10, color: '#6B7280' }}>↗</span>}
      </div>
      <div className={s.kpiValue}>{value}</div>
      {hint && <div className={s.kpiHint}>{hint}</div>}
    </div>
  );
}
