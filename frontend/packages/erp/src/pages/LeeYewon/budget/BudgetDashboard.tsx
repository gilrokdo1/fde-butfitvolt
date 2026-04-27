import { useEffect, useMemo, useState } from 'react';
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

type Tone = 'normal' | 'watch' | 'warn' | 'danger';

/** business-rules.md § 1-4 + 경과율 비교. */
function tone(monthRatio: number, progressRatio: number, hasBudget: boolean): Tone {
  if (!hasBudget) return 'normal';
  if (monthRatio >= 1) return 'danger';
  if (monthRatio >= 0.9) return 'warn';
  if (progressRatio > 0 && monthRatio > progressRatio + 0.1) return 'watch';
  return 'normal';
}

/** 동적 클래스명은 CSS Modules 트리쉐이킹에 걸려 사라지므로 인라인 색상으로 직접 적용. */
const TONE_BAR_COLOR: Record<Tone, string> = {
  normal: '#5B5FC7',  // 보라 (FDE primary)
  watch:  '#F59E0B',  // 주황
  warn:   '#EA580C',  // 진한 주황
  danger: '#DC2626',  // 빨강
};

const TONE_BADGE: Record<Tone, { bg: string; fg: string }> = {
  normal: { bg: '#EEF2FF', fg: '#4338CA' },
  watch:  { bg: '#FEF3C7', fg: '#B45309' },
  warn:   { bg: '#FED7AA', fg: '#9A3412' },
  danger: { bg: '#FEE2E2', fg: '#991B1B' },
};

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

  // 피드백 1: 1Q 마감 배너는 분기 첫째 달(4·7·10월)에만 노출
  const showPrevQuarterBanner = useMemo(() => {
    if (!data?.previous_quarter) return false;
    if (!data.quarter_months?.length) return false;
    return month === data.quarter_months[0];
  }, [data, month]);

  // 피드백 2: 대카테고리 그룹핑
  const grouped = useMemo(() => {
    if (!data) return [];
    type Group = {
      categoryName: string;
      accounts: DashboardAccount[];
      monthBudget: number;
      monthSpend: number;
      monthRatio: number;
      quarterBudget: number;
      quarterSpend: number;
    };
    const map = new Map<string, Group>();
    for (const a of data.accounts) {
      let g = map.get(a.category_name);
      if (!g) {
        g = {
          categoryName: a.category_name,
          accounts: [],
          monthBudget: 0,
          monthSpend: 0,
          monthRatio: 0,
          quarterBudget: 0,
          quarterSpend: 0,
        };
        map.set(a.category_name, g);
      }
      g.accounts.push(a);
      g.monthBudget += a.month_budget;
      g.monthSpend += a.month_spend;
      g.quarterBudget += a.quarter_budget;
      g.quarterSpend += a.quarter_spend;
    }
    for (const g of map.values()) {
      g.monthRatio = g.monthBudget > 0 ? g.monthSpend / g.monthBudget : 0;
    }
    return Array.from(map.values());
  }, [data]);

  if (loading && !data) return <div className={s.loading}>대시보드 계산 중…</div>;
  if (error) return <div className={s.error}>{error}</div>;
  if (!data) return null;

  const { totals, month_progress, quarter, quarter_months, pending, previous_quarter } = data;
  const warnCount = data.accounts.filter((a) => a.month_budget > 0 && a.month_ratio >= 0.9 && a.month_ratio < 1).length;
  const dangerCount = data.accounts.filter((a) => a.month_budget > 0 && a.month_ratio >= 1).length;

  return (
    <div className={s.wrap}>
      {/* KPI 4종 */}
      <div className={s.kpiGrid}>
        <Kpi label={`${year}년 ${month}월 예산`} value={formatKRW(totals.month_budget)} hint="VAT 포함" />
        <Kpi
          label={`${month}월 지출`}
          value={formatKRW(totals.month_spend)}
          hint={`월 경과 ${pct(month_progress.ratio)} (${month_progress.days_passed}/${month_progress.days_total}일)`}
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

      {showPrevQuarterBanner && previous_quarter && previous_quarter.over_budget.length > 0 && (
        <div className={s.alertBanner}>
          <p className={s.alertTitle}>{previous_quarter.quarter}Q 마감 요약</p>
          {previous_quarter.over_budget.map((o) => (
            <p key={o.account_name} className={s.alertBody}>
              · {o.account_name} 분기 초과 −{o.over_amount.toLocaleString()}원
            </p>
          ))}
        </div>
      )}

      {/* 계정별 소진 — 대카테고리 그룹핑 */}
      <div className={s.card}>
        <header className={s.cardHeader}>
          <h3>{month}월 소진 현황</h3>
          <span className={s.cardHint}>
            <span className={s.markerExample} /> 월 경과 {pct(month_progress.ratio)} ({month_progress.days_passed}/{month_progress.days_total}일)
          </span>
        </header>

        <div className={s.groupList}>
          {grouped.map((g) => (
            <CategoryGroup
              key={g.categoryName}
              name={g.categoryName}
              monthBudget={g.monthBudget}
              monthSpend={g.monthSpend}
              monthRatio={g.monthRatio}
              accounts={g.accounts}
              progressRatio={month_progress.ratio}
            />
          ))}
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
            {data.accounts
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
                    {(() => {
                      const tt = tone(a.quarter_ratio, 1, a.quarter_budget > 0);
                      const c = TONE_BADGE[tt];
                      return (
                        <span
                          className={s.pill}
                          style={{ background: c.bg, color: c.fg }}
                        >
                          {pct(a.quarter_ratio)}
                        </span>
                      );
                    })()}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

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

// ─── KPI 카드 ──────────────────────────────────────────────────────
const KPI_TONE: Record<string, { bg: string; border: string }> = {
  ok:     { bg: '#ECFDF5', border: '#A7F3D0' },
  warn:   { bg: '#FFFBEB', border: '#FDE68A' },
  danger: { bg: '#FEF2F2', border: '#FECACA' },
};

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
  const c = tone ? KPI_TONE[tone] : null;
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

// ─── 대카테고리 그룹 ────────────────────────────────────────────────
function CategoryGroup({
  name,
  monthBudget,
  monthSpend,
  monthRatio,
  accounts,
  progressRatio,
}: {
  name: string;
  monthBudget: number;
  monthSpend: number;
  monthRatio: number;
  accounts: DashboardAccount[];
  progressRatio: number;
}) {
  const t = tone(monthRatio, progressRatio, monthBudget > 0);
  const fillWidth = Math.min(monthRatio * 100, 100);
  const noBudget = monthBudget === 0;

  return (
    <section className={s.group}>
      {/* 대카 헤더 */}
      <div className={s.groupHeader}>
        <div className={s.groupHeaderLeft}>
          <span className={s.groupName}>{name}</span>
          <span className={s.groupAccountCount}>{accounts.length}개 항목</span>
        </div>
        <div className={s.groupHeaderRight}>
          <span className={s.groupAmounts}>
            <strong>{monthSpend.toLocaleString()}</strong>
            <span className={s.slash}>/</span>
            <span className={s.budgetNumber}>{monthBudget.toLocaleString()}</span>
          </span>
          <Badge tone={t} ratio={monthRatio} progressRatio={progressRatio} hasBudget={!noBudget} large />
        </div>
      </div>

      {/* 대카 합산 미니바 (마커 없음 — 모든 행에서 같은 위치라 혼란만 줌) */}
      {!noBudget && (
        <div className={s.miniBarWrap}>
          <div
            className={s.miniBar}
            style={{ width: `${fillWidth}%`, background: TONE_BAR_COLOR[t] }}
          />
        </div>
      )}

      {/* 소카 들여쓰기 */}
      <div className={s.subList}>
        {accounts.map((a) => (
          <SubItem key={a.account_code_id} account={a} progressRatio={progressRatio} />
        ))}
      </div>
    </section>
  );
}

// ─── 소카테고리 항목 ────────────────────────────────────────────────
function SubItem({
  account: a,
  progressRatio,
}: {
  account: DashboardAccount;
  progressRatio: number;
}) {
  const noBudget = a.month_budget === 0;
  const t = tone(a.month_ratio, progressRatio, !noBudget);
  const fillWidth = Math.min(a.month_ratio * 100, 100);

  return (
    <div className={s.subItem}>
      <div className={s.subTopRow}>
        <span className={s.subName}>{a.account_name}</span>
        <Badge tone={t} ratio={a.month_ratio} progressRatio={progressRatio} hasBudget={!noBudget} />
      </div>
      <div className={s.subAmounts}>
        <strong className={t === 'danger' ? s.negative : ''}>
          {a.month_spend.toLocaleString()}
        </strong>
        <span className={s.slash}>/</span>
        <span className={s.budgetNumber}>{a.month_budget.toLocaleString()}</span>
        <span className={s.subQuarterHint}>
          분기 잔여 {a.quarter_remaining.toLocaleString()}
        </span>
      </div>
      <div className={s.subBarWrap}>
        <div
          className={s.subBar}
          style={{
            width: noBudget ? '0%' : `${fillWidth}%`,
            background: TONE_BAR_COLOR[t],
          }}
        />
        {/* 마커 제거 — 카드 헤더 우측에 한 번만 표시함 */}
      </div>
      {noBudget && <p className={s.subEmptyHint}>월 예산 없음</p>}
    </div>
  );
}

// ─── 진행률 배지 ───────────────────────────────────────────────────
function Badge({
  tone,
  ratio,
  progressRatio,
  hasBudget,
  large = false,
}: {
  tone: Tone;
  ratio: number;
  progressRatio: number;
  hasBudget: boolean;
  large?: boolean;
}) {
  if (!hasBudget) {
    return (
      <span
        className={`${s.badge} ${large ? s.badgeLarge : ''}`}
        style={{ background: '#F3F4F6', color: '#9CA3AF', fontWeight: 500 }}
      >
        예산 없음
      </span>
    );
  }
  let icon = '';
  let suffix = '';
  if (tone === 'danger') { icon = '⚠'; suffix = ' 초과'; }
  else if (tone === 'warn') { icon = '⚠'; }
  else if (tone === 'watch') {
    icon = '↑';
    suffix = ' 빠름';
  }
  const c = TONE_BADGE[tone];
  return (
    <span
      className={`${s.badge} ${large ? s.badgeLarge : ''}`}
      style={{ background: c.bg, color: c.fg }}
      title={tone === 'watch' ? `월 경과율 ${pct(progressRatio)}보다 빠르게 소진 중` : undefined}
    >
      {icon && <span className={s.badgeIcon}>{icon}</span>}
      {pct(ratio)}{suffix}
    </span>
  );
}
