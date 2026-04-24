import { useEffect, useState } from 'react';
import s from './BudgetDashboard.module.css';
import { fetchDashboard, type Branch, type DashboardAccount, type DashboardResponse } from './api';

interface Props {
  branch: Branch;
  year: number;
  month: number;
}

function formatKRW(n: number): string {
  return n.toLocaleString() + '원';
}

function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/** business-rules.md § 1-4 기준. 경과율 대비는 월 경과율과 비교. */
function tone(monthRatio: number, progressRatio: number): 'normal' | 'watch' | 'warn' | 'danger' {
  if (monthRatio >= 1) return 'danger';
  if (monthRatio >= 0.9) return 'warn';
  // 경과율보다 높으면 주의 (진도가 빠름)
  if (progressRatio > 0 && monthRatio > progressRatio + 0.1) return 'watch';
  return 'normal';
}

export default function BudgetDashboard({ branch, year, month }: Props) {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchDashboard(branch.id, year, month)
      .then(setData)
      .catch((e: unknown) => {
        const anyErr = e as { response?: { data?: { detail?: string } } };
        setError(anyErr.response?.data?.detail || (e instanceof Error ? e.message : '대시보드 로드 실패'));
      })
      .finally(() => setLoading(false));
  }, [branch.id, year, month]);

  if (loading && !data) {
    return <div className={s.loading}>대시보드 계산 중…</div>;
  }
  if (error) {
    return <div className={s.error}>{error}</div>;
  }
  if (!data) return null;

  const { totals, accounts, month_progress, quarter, quarter_months, pending, previous_quarter } = data;
  const warnCount = accounts.filter((a) => a.month_budget > 0 && a.month_ratio >= 0.9 && a.month_ratio < 1).length;
  const dangerCount = accounts.filter((a) => a.month_budget > 0 && a.month_ratio >= 1).length;

  return (
    <div className={s.wrap}>
      {/* KPI 4종 */}
      <div className={s.kpiGrid}>
        <Kpi label={`${year}년 ${month}월 예산`} value={formatKRW(totals.month_budget)} hint="VAT 포함" />
        <Kpi
          label={`${month}월 지출`}
          value={formatKRW(totals.month_spend)}
          hint={`${accounts.length}개 계정 · 월 경과 ${pct(month_progress.ratio)}`}
        />
        <Kpi
          label={`${month}월 잔여`}
          value={formatKRW(totals.month_remaining)}
          hint={`소진율 ${pct(totals.month_ratio)}`}
          tone={totals.month_ratio >= 1 ? 'danger' : totals.month_ratio >= 0.9 ? 'warn' : 'ok'}
        />
        <Kpi
          label="경고"
          value={
            dangerCount > 0 ? `${dangerCount}건 초과`
              : warnCount > 0 ? `${warnCount}건 주의`
              : '-'
          }
          hint={dangerCount > 0 ? '100% 이상' : warnCount > 0 ? '90% 이상' : '없음'}
          tone={dangerCount > 0 ? 'danger' : warnCount > 0 ? 'warn' : undefined}
        />
      </div>

      {previous_quarter && previous_quarter.over_budget.length > 0 && (
        <div className={s.alertBanner}>
          <p className={s.alertTitle}>{previous_quarter.quarter}Q 마감 요약</p>
          {previous_quarter.over_budget.map((o) => (
            <p key={o.account_name} className={s.alertBody}>
              · {o.account_name} 분기 초과 −{o.over_amount.toLocaleString()}원
            </p>
          ))}
        </div>
      )}

      {/* 계정별 소진 프로그레스 */}
      <div className={s.card}>
        <header className={s.cardHeader}>
          <h3>계정별 {month}월 소진 현황</h3>
          <span className={s.cardHint}>
            월 경과율 {pct(month_progress.ratio)} ({month_progress.days_passed}/{month_progress.days_total}일)
          </span>
        </header>

        <div className={s.progressList}>
          {accounts.map((a) => (
            <ProgressItem key={a.account_code_id} account={a} progressRatio={month_progress.ratio} />
          ))}
        </div>

        <div className={s.legend}>
          <span><span className={`${s.legendSwatch} ${s.legendFill}`} /> 월 지출</span>
          <span><span className={`${s.legendSwatch} ${s.legendDanger}`} /> 경과율 초과</span>
          <span><span className={`${s.legendSwatch} ${s.legendMarker}`} /> 월 경과 시점</span>
        </div>
      </div>

      {/* 분기 누적 표 */}
      <div className={s.card}>
        <header className={s.cardHeader}>
          <h3>
            {quarter}Q 분기 누적 ({quarter_months[0]}~{quarter_months[2]}월)
          </h3>
          <span className={s.cardHint}>분기 총 예산 {formatKRW(totals.quarter_budget)}</span>
        </header>
        <table className={s.quarterTable}>
          <thead>
            <tr>
              <th>계정</th>
              <th className={s.num}>분기 누적</th>
              <th className={s.num}>분기 예산</th>
              <th className={s.num}>잔여</th>
              <th className={s.num}>소진율</th>
            </tr>
          </thead>
          <tbody>
            {accounts
              .filter((a) => a.quarter_budget > 0 || a.quarter_spend > 0)
              .map((a) => (
                <tr key={a.account_code_id}>
                  <td>{a.account_name}</td>
                  <td className={s.num}>{a.quarter_spend.toLocaleString()}</td>
                  <td className={s.num}>{a.quarter_budget.toLocaleString()}</td>
                  <td className={`${s.num} ${a.quarter_remaining < 0 ? s.negative : ''}`}>
                    {a.quarter_remaining.toLocaleString()}
                  </td>
                  <td className={s.num}>
                    <span className={`${s.pill} ${s[`pill_${tone(a.quarter_ratio, 1)}`]}`}>
                      {pct(a.quarter_ratio)}
                    </span>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* 미정 별도 KPI */}
      {pending.count > 0 && (
        <div className={`${s.card} ${s.cardPending}`}>
          <header className={s.cardHeader}>
            <h3>미정 카테고리 대기</h3>
            <span className={s.cardHint}>집계에서 제외됨 · 재분류 필요</span>
          </header>
          <div className={s.pendingLine}>
            <span>{pending.count}건</span>
            <strong>{pending.total.toLocaleString()}원</strong>
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
  return (
    <div className={`${s.kpi} ${tone ? s[`kpi_${tone}`] : ''}`}>
      <div className={s.kpiLabel}>{label}</div>
      <div className={s.kpiValue}>{value}</div>
      {hint && <div className={s.kpiHint}>{hint}</div>}
    </div>
  );
}

function ProgressItem({
  account: a,
  progressRatio,
}: {
  account: DashboardAccount;
  progressRatio: number;
}) {
  const t = tone(a.month_ratio, progressRatio);
  const fillWidth = Math.min(a.month_ratio * 100, 100);
  const markerLeft = progressRatio * 100;
  const noBudget = a.month_budget === 0;

  return (
    <div className={s.progressItem}>
      <div className={s.progressHeader}>
        <span className={s.accountName}>
          {a.account_name}
          {a.is_fixed_cost && <span className={s.fixedBadge}>고정비</span>}
        </span>
        <span className={s.progressNumbers}>
          <strong className={t === 'danger' ? s.negative : ''}>
            {a.month_spend.toLocaleString()}
          </strong>
          <span className={s.slash}>/</span>
          <span className={s.budgetNumber}>{a.month_budget.toLocaleString()}</span>
        </span>
      </div>
      <div className={s.progressBarWrap}>
        <div
          className={`${s.progressFill} ${s[`fill_${t}`]}`}
          style={{ width: noBudget ? '0%' : `${fillWidth}%` }}
        />
        {!noBudget && (
          <div className={s.progressMarker} style={{ left: `${markerLeft}%` }} />
        )}
      </div>
      <div className={s.progressMeta}>
        <span className={`${s.metaLeft} ${s[`meta_${t}`]}`}>
          {noBudget ? '월 예산 없음' : `월 ${pct(a.month_ratio)}${t === 'watch' ? ' · 경과율보다 높음' : ''}`}
        </span>
        <span className={s.metaRight}>
          분기 잔여 {a.quarter_remaining.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
