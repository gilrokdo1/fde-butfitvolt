import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addExcludedTrainer,
  getCompletionDebug,
  getExcludedTrainers,
  getInactiveCandidates,
  getTrainerCriteria,
  getTrainerMonthly,
  getTrainerOverview,
  refreshTrainerSnapshot,
  removeExcludedTrainer,
  updateTrainerCriteria,
  type CompletionDebug,
  type ExcludedTrainer,
  type InactiveCandidate,
  type TrainerCriteria,
  type TrainerMonthlyRow,
  type TrainerOverviewRow,
} from '../../../api/fde';
import FormulaAccordion from './FormulaAccordion';
import MemberDetailModal, { type DetailKind } from './MemberDetailModal';
import TimeSeriesChart from './TimeSeriesChart';
import s from './Trainers.module.css';

type SortKey =
  | 'trainer_name'
  | 'branch'
  | 'active_members_avg'
  | 'sessions_avg'
  | 'conversion_rate'
  | 'rereg_rate'
  | 'completion_rate'
  | 'days_per_8_avg'
  | 'status';
type SortOrder = 'asc' | 'desc';

type DrawerTab = 'table' | 'chart';

function monthOptions(): string[] {
  const out: string[] = [];
  const start = new Date(2025, 0, 1);
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), 1);
  const d = new Date(start);
  while (d <= end) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

function pct(n: number | null): string {
  if (n === null || Number.isNaN(n)) return '-';
  return `${n.toFixed(1)}%`;
}

function num(n: number): string {
  return n.toLocaleString('ko-KR');
}

function evalTrainer(r: TrainerOverviewRow, c: TrainerCriteria) {
  const fails: string[] = [];
  const flags = {
    active: r.active_members_avg < c.active_members_min,
    sessions: r.sessions_avg < c.sessions_min,
    conversion: r.conversion_rate !== null && r.conversion_rate < c.conversion_min,
    rereg: r.rereg_rate !== null && r.rereg_rate < c.rereg_min,
    completion: r.completion_rate !== null && r.completion_rate < c.completion_min,
  };
  if (flags.active) fails.push('유효회원');
  if (flags.sessions) fails.push('세션');
  if (flags.conversion) fails.push('체험전환');
  if (flags.rereg) fails.push('재등록');
  if (flags.completion) fails.push('완료율');
  return {
    flags,
    failCount: fails.length,
    shouldConsider: fails.length >= c.fail_threshold,
    fails,
  };
}

export default function Trainers() {
  const allMonths = useMemo(monthOptions, []);
  const defaultStart = '2025-01';
  const defaultEnd = allMonths[allMonths.length - 1] ?? '2026-03';

  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [branchFilter, setBranchFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('status');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [criteriaOpen, setCriteriaOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TrainerOverviewRow[]>([]);
  const [meta, setMeta] = useState<{
    snapshot_date: string | null;
    month_count: number;
    excluded_staff_count?: number;
    inactive_3mo_count?: number;
    inactive_3mo_window?: string;
    completion_rows_total?: number;
    completion_rows_in_period?: number;
    completion_latest_snapshot?: string | null;
  } | null>(null);

  const [excludedList, setExcludedList] = useState<ExcludedTrainer[]>([]);
  const [newExcludeName, setNewExcludeName] = useState('');
  const [excludeBusy, setExcludeBusy] = useState(false);

  const [inactiveCandidates, setInactiveCandidates] = useState<InactiveCandidate[]>([]);
  const [inactiveWindowLabel, setInactiveWindowLabel] = useState<string | null>(null);
  const [inactiveMonths] = useState(6);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [refreshToast, setRefreshToast] = useState<string | null>(null);

  const [debugBusy, setDebugBusy] = useState(false);
  const [debugResult, setDebugResult] = useState<CompletionDebug | null>(null);
  const [debugError, setDebugError] = useState<string | null>(null);

  const [criteria, setCriteria] = useState<TrainerCriteria | null>(null);
  const [draftCriteria, setDraftCriteria] = useState<TrainerCriteria | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  const [drawerTrainer, setDrawerTrainer] = useState<TrainerOverviewRow | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('table');
  const [drawerRows, setDrawerRows] = useState<TrainerMonthlyRow[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const [detail, setDetail] = useState<{ kind: DetailKind; row: TrainerOverviewRow } | null>(null);

  const fetchOverview = useCallback(async (st: string, en: string) => {
    setLoading(true);
    try {
      const res = await getTrainerOverview(st, en);
      setRows(res.data.data);
      setMeta({
        snapshot_date: res.data._meta.snapshot_date,
        month_count: res.data._meta.month_count,
        excluded_staff_count: res.data._meta.excluded_staff_count,
        inactive_3mo_count: res.data._meta.inactive_3mo_count,
        inactive_3mo_window: res.data._meta.inactive_3mo_window,
        completion_rows_total: res.data._meta.completion_rows_total,
        completion_rows_in_period: res.data._meta.completion_rows_in_period,
        completion_latest_snapshot: res.data._meta.completion_latest_snapshot,
      });
    } catch {
      setRows([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCriteria = useCallback(async () => {
    try {
      const res = await getTrainerCriteria();
      setCriteria(res.data);
      setDraftCriteria(res.data);
    } catch {
      /* noop */
    }
  }, []);

  const fetchExcluded = useCallback(async () => {
    try {
      const res = await getExcludedTrainers();
      setExcludedList(res.data.data);
    } catch {
      /* noop */
    }
  }, []);

  const fetchInactive = useCallback(async () => {
    try {
      const res = await getInactiveCandidates(inactiveMonths);
      setInactiveCandidates(res.data.data);
      setInactiveWindowLabel(res.data._meta.window);
    } catch {
      /* noop */
    }
  }, [inactiveMonths]);

  useEffect(() => { fetchOverview(start, end); }, [start, end, fetchOverview]);
  useEffect(() => { fetchCriteria(); }, [fetchCriteria]);
  useEffect(() => { fetchExcluded(); }, [fetchExcluded]);
  useEffect(() => { fetchInactive(); }, [fetchInactive]);

  const branches = useMemo(() => {
    const set = new Set(rows.map((r) => r.branch).filter(Boolean));
    return Array.from(set).sort();
  }, [rows]);

  // 평가에 쓰는 기준값 = draftCriteria (실시간 프리뷰)
  const effectiveCriteria = draftCriteria;

  const filteredEvaluated = useMemo(() => {
    if (!effectiveCriteria) return [];
    const kw = search.trim().toLowerCase();
    return rows
      .filter((r) => (branchFilter ? r.branch === branchFilter : true))
      .filter((r) => (kw ? (r.trainer_name ?? '').toLowerCase().includes(kw) : true))
      .map((r) => ({ row: r, eva: evalTrainer(r, effectiveCriteria) }));
  }, [rows, branchFilter, search, effectiveCriteria]);

  const sorted = useMemo(() => {
    const copy = [...filteredEvaluated];
    copy.sort((a, b) => {
      const mul = sortOrder === 'asc' ? 1 : -1;
      const pick = (x: typeof a): number | string => {
        switch (sortKey) {
          case 'trainer_name': return x.row.trainer_name ?? '';
          case 'branch': return x.row.branch ?? '';
          case 'active_members_avg': return x.row.active_members_avg;
          case 'sessions_avg': return x.row.sessions_avg;
          case 'conversion_rate': return x.row.conversion_rate ?? -1;
          case 'rereg_rate': return x.row.rereg_rate ?? -1;
          case 'completion_rate': return x.row.completion_rate ?? -1;
          case 'days_per_8_avg': return x.row.days_per_8_avg ?? 9999;
          case 'status': return x.eva.shouldConsider ? 1 : 0;
        }
      };
      const av = pick(a);
      const bv = pick(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mul;
      return String(av).localeCompare(String(bv)) * mul;
    });
    return copy;
  }, [filteredEvaluated, sortKey, sortOrder]);

  const summary = useMemo(() => {
    const total = filteredEvaluated.length;
    const considerCount = filteredEvaluated.filter((x) => x.eva.shouldConsider).length;
    const anyFailCount = filteredEvaluated.filter((x) => x.eva.failCount > 0).length;
    return { total, considerCount, anyFailCount };
  }, [filteredEvaluated]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortOrder(key === 'trainer_name' || key === 'branch' ? 'asc' : 'desc'); }
  };

  const handleRefreshSnapshot = async () => {
    setRefreshBusy(true);
    setRefreshToast(null);
    try {
      await refreshTrainerSnapshot();
      setRefreshToast('스냅샷 재집계 시작됨. 수 분 후 자동 반영됩니다. (새로고침으로 확인)');
      setTimeout(() => setRefreshToast(null), 12000);
    } catch {
      setRefreshToast('재집계 실패. 잠시 후 다시 시도해주세요.');
      setTimeout(() => setRefreshToast(null), 5000);
    } finally {
      setRefreshBusy(false);
    }
  };

  const handleCompletionDebug = async () => {
    setDebugBusy(true);
    setDebugError(null);
    try {
      const res = await getCompletionDebug(start, end);
      setDebugResult(res.data);
    } catch (e) {
      setDebugError(`진단 호출 실패: ${e instanceof Error ? e.message : String(e)}`);
      setDebugResult(null);
    } finally {
      setDebugBusy(false);
    }
  };

  const handleAddExclude = async () => {
    const name = newExcludeName.trim();
    if (!name) return;
    setExcludeBusy(true);
    try {
      await addExcludedTrainer(name);
      await Promise.all([fetchExcluded(), fetchInactive(), fetchOverview(start, end)]);
      setNewExcludeName('');
    } finally {
      setExcludeBusy(false);
    }
  };

  const handleRemoveExclude = async (name: string) => {
    setExcludeBusy(true);
    try {
      await removeExcludedTrainer(name);
      await Promise.all([fetchExcluded(), fetchInactive(), fetchOverview(start, end)]);
    } finally {
      setExcludeBusy(false);
    }
  };

  const handleExcludeCandidate = async (name: string, reason: string) => {
    setExcludeBusy(true);
    try {
      await addExcludedTrainer(name, reason);
      await Promise.all([fetchExcluded(), fetchInactive(), fetchOverview(start, end)]);
    } finally {
      setExcludeBusy(false);
    }
  };

  const handleSaveCriteria = async () => {
    if (!draftCriteria) return;
    setSaving(true);
    try {
      await updateTrainerCriteria({
        active_members_min: draftCriteria.active_members_min,
        sessions_min: draftCriteria.sessions_min,
        conversion_min: draftCriteria.conversion_min,
        rereg_min: draftCriteria.rereg_min,
        fail_threshold: draftCriteria.fail_threshold,
        completion_min: draftCriteria.completion_min,
        days_per_8_max: draftCriteria.days_per_8_max,
        ref_days_per_8: draftCriteria.ref_days_per_8,
      });
      await fetchCriteria();
      // ref_days_per_8 이 바뀌면 overview 재집계 (기대 기한 산식 바뀜)
      await fetchOverview(start, end);
      setSaveToast('저장되었습니다');
      setTimeout(() => setSaveToast(null), 2500);
    } finally {
      setSaving(false);
    }
  };

  const openTrainerDrawer = async (row: TrainerOverviewRow) => {
    setDrawerTrainer(row);
    setDrawerTab('table');
    setDrawerLoading(true);
    setDrawerRows([]);
    try {
      if (!row.trainer_name) return;
      const res = await getTrainerMonthly(row.trainer_name, row.branch, start, end);
      setDrawerRows(res.data.data);
    } finally {
      setDrawerLoading(false);
    }
  };

  const openDetail = (kind: DetailKind, row: TrainerOverviewRow) => {
    if (!row.trainer_name) return;
    setDetail({ kind, row });
  };

  const criteriaDirty = criteria && draftCriteria
    ? (criteria.active_members_min !== draftCriteria.active_members_min
      || criteria.sessions_min !== draftCriteria.sessions_min
      || criteria.conversion_min !== draftCriteria.conversion_min
      || criteria.rereg_min !== draftCriteria.rereg_min
      || criteria.fail_threshold !== draftCriteria.fail_threshold
      || criteria.completion_min !== draftCriteria.completion_min
      || criteria.days_per_8_max !== draftCriteria.days_per_8_max
      || criteria.ref_days_per_8 !== draftCriteria.ref_days_per_8)
    : false;

  const sortArrow = (key: SortKey) => (sortKey !== key ? '' : sortOrder === 'asc' ? ' ▲' : ' ▼');

  return (
    <div className={s.container}>
      <div className={s.header}>
        <h1 className={s.title}>트레이너 관리</h1>
        <div className={s.meta}>
          <span>기간: {start} ~ {end}</span>
          <span>전 지점 · PT 담당</span>
          {meta?.snapshot_date && <span>스냅샷: {meta.snapshot_date}</span>}
          <span className={s.badge}>영업기획실</span>
        </div>
      </div>

      {/* 필터 */}
      <div className={s.filterRow}>
        <span className={s.filterLabel}>기간</span>
        <select className={s.filterSelect} value={start} onChange={(e) => setStart(e.target.value)}>
          {allMonths.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <span>~</span>
        <select className={s.filterSelect} value={end} onChange={(e) => setEnd(e.target.value)}>
          {allMonths.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>

        <span className={s.filterLabel} style={{ marginLeft: 12 }}>지점</span>
        <select className={s.filterSelect} value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
          <option value="">전체</option>
          {branches.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>

        <input
          className={s.filterInput}
          placeholder="트레이너 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className={s.spacer} />

        <button
          className={s.linkBtn}
          onClick={handleCompletionDebug}
          disabled={debugBusy}
          title="완료 지표 데이터 진단 (replica DB 단계별 카운트)"
        >{debugBusy ? '진단 중…' : '🔍 완료 진단'}</button>
        <button
          className={s.linkBtn}
          onClick={handleRefreshSnapshot}
          disabled={refreshBusy}
          title="replica DB에서 다시 집계 (환불·제외 기준 적용). 수 분 소요."
        >{refreshBusy ? '재집계 중…' : '🔄 스냅샷 재집계'}</button>
      </div>

      {(debugResult || debugError) && (
        <div className={s.debugBox}>
          <div className={s.debugHeader}>
            <strong>🔍 완료 지표 진단</strong>
            <button className={s.closeBtn} onClick={() => { setDebugResult(null); setDebugError(null); }} aria-label="닫기">×</button>
          </div>
          {debugError && <div style={{ color: 'var(--color-error, #d93a3a)' }}>{debugError}</div>}
          {debugResult && (
            <pre className={s.debugPre}>{JSON.stringify(debugResult, null, 2)}</pre>
          )}
        </div>
      )}

      {refreshToast && <div className={s.refreshToast}>{refreshToast}</div>}

      {/* 요약 (3카드: 평균 월 세션 제거) */}
      <div className={s.summaryGrid3}>
        <div className={s.summaryCard}>
          <div className={s.cardLabel}>평가 대상 트레이너</div>
          <div className={s.cardValue}>{num(summary.total)}<span className={s.cardUnit}>명</span></div>
          <div className={s.cardSub}>지점 × 트레이너 단위</div>
        </div>
        <div className={s.summaryCard}>
          <div className={s.cardLabel}>하나라도 미달</div>
          <div className={s.cardValue}>{num(summary.anyFailCount)}<span className={s.cardUnit}>명</span></div>
          <div className={s.cardSub}>1개 이상의 지표 기준 미달</div>
        </div>
        <div className={s.summaryCard}>
          <div className={s.cardLabel}>재계약 고려</div>
          <div className={`${s.cardValue} ${summary.considerCount > 0 ? s.cardValueAlert : ''}`}>
            {num(summary.considerCount)}<span className={s.cardUnit}>명</span>
          </div>
          <div className={s.cardSub}>
            미달 지표 {draftCriteria?.fail_threshold ?? 3}개 이상
          </div>
        </div>
      </div>

      {/* 기준값 편집 (실시간 프리뷰 + 명시 저장) */}
      {criteria && draftCriteria && (
        <div className={s.criteriaPanel}>
          <div className={s.criteriaHeader} onClick={() => setCriteriaOpen((v) => !v)}>
            <div className={s.criteriaTitle}>
              ⚙️ 평가 기준값 {criteriaOpen ? '▲' : '▼'}
              {criteriaDirty && <span className={s.dirtyTag}>미저장 변경 (프리뷰 반영중)</span>}
              <span style={{ marginLeft: 12, fontWeight: 400, color: 'var(--text-tertiary)', fontSize: 'var(--font-sm)' }}>
                유효회원 ≥ {draftCriteria.active_members_min} · 세션 ≥ {draftCriteria.sessions_min} ·
                전환 ≥ {draftCriteria.conversion_min}% · 재등록 ≥ {draftCriteria.rereg_min}% ·
                완료율 ≥ {draftCriteria.completion_min}% (8회당 {draftCriteria.ref_days_per_8}일 기준) ·
                재계약 고려 ≥ {draftCriteria.fail_threshold}개 미달
              </span>
            </div>
          </div>
          {criteriaOpen && (
            <div className={s.criteriaBody}>
              <div className={s.criteriaField}>
                <label>유효회원 최소</label>
                <input
                  type="number" min={0}
                  value={draftCriteria.active_members_min}
                  onChange={(e) => setDraftCriteria({ ...draftCriteria, active_members_min: Number(e.target.value) })}
                />
              </div>
              <div className={s.criteriaField}>
                <label>월 세션 최소</label>
                <input
                  type="number" min={0}
                  value={draftCriteria.sessions_min}
                  onChange={(e) => setDraftCriteria({ ...draftCriteria, sessions_min: Number(e.target.value) })}
                />
              </div>
              <div className={s.criteriaField}>
                <label>체험전환율 (%)</label>
                <input
                  type="number" min={0} max={100} step={0.1}
                  value={draftCriteria.conversion_min}
                  onChange={(e) => setDraftCriteria({ ...draftCriteria, conversion_min: Number(e.target.value) })}
                />
              </div>
              <div className={s.criteriaField}>
                <label>재등록률 (%)</label>
                <input
                  type="number" min={0} max={100} step={0.1}
                  value={draftCriteria.rereg_min}
                  onChange={(e) => setDraftCriteria({ ...draftCriteria, rereg_min: Number(e.target.value) })}
                />
              </div>
              <div className={s.criteriaField}>
                <label>세션 완료율 최소 (%)</label>
                <input
                  type="number" min={0} max={100} step={0.1}
                  value={draftCriteria.completion_min}
                  onChange={(e) => setDraftCriteria({ ...draftCriteria, completion_min: Number(e.target.value) })}
                />
              </div>
              <div className={s.criteriaField}>
                <label>기준 소진일 (8회당 일수)</label>
                <input
                  type="number" min={1} max={365}
                  value={draftCriteria.ref_days_per_8}
                  onChange={(e) => setDraftCriteria({ ...draftCriteria, ref_days_per_8: Number(e.target.value) })}
                />
              </div>
              <div className={s.criteriaField}>
                <label>재계약 고려 임계값</label>
                <input
                  type="number" min={1} max={5}
                  value={draftCriteria.fail_threshold}
                  onChange={(e) => setDraftCriteria({ ...draftCriteria, fail_threshold: Number(e.target.value) })}
                />
              </div>
              <div className={s.criteriaActions}>
                {criteria.updated_at && (
                  <span className={s.updatedMeta}>
                    최종 저장: {criteria.updated_at.slice(0, 19)} {criteria.updated_by ? `· ${criteria.updated_by}` : ''}
                  </span>
                )}
                {saveToast && <span className={s.saveToast}>{saveToast}</span>}
                <button
                  className={s.linkBtn}
                  onClick={() => setDraftCriteria(criteria)}
                  disabled={!criteriaDirty || saving}
                >되돌리기</button>
                <button
                  className={s.primaryBtn}
                  onClick={handleSaveCriteria}
                  disabled={!criteriaDirty || saving}
                >{saving ? '저장 중…' : '저장'}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 제외 트레이너 관리 */}
      {criteria && (
        <details className={s.criteriaPanel}>
          <summary className={s.excludedSummary}>
            🚫 평가 제외 트레이너 <span className={s.excludedCountTag}>{excludedList.length}명</span>
            <span className={s.excludedHint}>직원·특수 케이스 수동 제외 (최근 3개월 세션 0건은 자동 제외)</span>
          </summary>
          <div className={s.excludedBody}>
            <div className={s.excludedList}>
              {excludedList.length === 0 ? (
                <div className={s.excludedEmpty}>제외된 트레이너 없음.</div>
              ) : (
                excludedList.map((x) => (
                  <div key={x.trainer_name} className={s.excludedChip}>
                    <span className={s.excludedName}>{x.trainer_name}</span>
                    <button
                      className={s.excludedRemoveBtn}
                      onClick={() => handleRemoveExclude(x.trainer_name)}
                      disabled={excludeBusy}
                      aria-label="제외 해제"
                    >×</button>
                  </div>
                ))
              )}
            </div>
            <div className={s.excludedAddRow}>
              <input
                className={s.filterInput}
                placeholder="트레이너 이름"
                value={newExcludeName}
                onChange={(e) => setNewExcludeName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddExclude(); }}
              />
              <button
                className={s.primaryBtn}
                onClick={handleAddExclude}
                disabled={!newExcludeName.trim() || excludeBusy}
              >추가</button>
            </div>

            <div className={s.candidateBlock}>
              <div className={s.candidateTitle}>
                🗓️ 최근 {inactiveMonths}개월 수업 없음
                {inactiveWindowLabel && <span className={s.candidateWindow}>({inactiveWindowLabel})</span>}
                <span className={s.candidateHint}>클릭하면 제외 리스트에 추가됩니다.</span>
              </div>
              {inactiveCandidates.length === 0 ? (
                <div className={s.excludedEmpty}>해당하는 트레이너 없음.</div>
              ) : (
                <div className={s.candidateList}>
                  {inactiveCandidates.map((c) => (
                    <button
                      key={c.trainer_name}
                      className={s.candidateChip}
                      onClick={() => handleExcludeCandidate(c.trainer_name, '최근 수업 없음')}
                      disabled={excludeBusy}
                      title={`마지막 활동: ${c.last_active_month ?? '-'} · 과거 세션 합 ${c.prior_sessions.toLocaleString('ko-KR')}회`}
                    >
                      <span className={s.candidateName}>{c.trainer_name}</span>
                      <span className={s.candidateMeta}>
                        마지막 {c.last_active_month ?? '-'} · {c.prior_sessions.toLocaleString('ko-KR')}회
                      </span>
                      <span className={s.candidateAdd}>+</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </details>
      )}

      {/* 수식·규칙 아코디언 */}
      {criteria && draftCriteria && (
        <FormulaAccordion
          criteria={draftCriteria}
          inactiveWindow={meta?.inactive_3mo_window}
          excludedCount={excludedList.length}
        />
      )}

      {/* 테이블 */}
      <div className={s.section}>
        <div className={s.sectionTitle}>트레이너별 지표 (기간 평균)</div>
        <div className={s.sectionDesc}>
          유효회원·월 세션은 기간 내 월 평균, 체험전환율·재등록률은 분자/분모 합계 비율.
          세션 완료율·소진일은 <strong>멤버십 시작월 기준 코호트</strong>로 집계(최근 2개월 코호트는 진행중 멤버십이 많아 값이 계속 업데이트됨).
          값이 <strong style={{ color: 'var(--color-error, #d93a3a)' }}>빨간색</strong>이면 현재 기준값 미달.
          숫자 셀을 클릭하면 근거 데이터(세션/회원 목록)를 볼 수 있고, 트레이너명은 월별 추이 드로어를 엽니다.
          {(meta?.excluded_staff_count || meta?.inactive_3mo_count) ? (
            <span className={s.filterNote}>
              (필터 적용: 직원 {meta?.excluded_staff_count ?? 0}명, 최근 3개월 세션 0건 {meta?.inactive_3mo_count ?? 0}명 제외됨)
            </span>
          ) : null}
          {meta && meta.completion_rows_total !== undefined && (
            <span className={s.filterNote} style={{ background: (meta.completion_rows_in_period ?? 0) === 0 ? 'rgba(230,162,60,0.14)' : undefined }}>
              완료 스냅샷: 전체 {(meta.completion_rows_total ?? 0).toLocaleString('ko-KR')}건, 기간 매칭 {(meta.completion_rows_in_period ?? 0).toLocaleString('ko-KR')}건
              {meta.completion_latest_snapshot ? ` · ${meta.completion_latest_snapshot}` : ' · 미수집'}
            </span>
          )}
        </div>

        {loading ? (
          <div className={s.loading}>데이터를 불러오는 중…</div>
        ) : sorted.length === 0 ? (
          <div className={s.empty}>
            조건에 맞는 데이터가 없습니다.<br />
            스냅샷이 아직 생성되지 않았다면 <code>python -m jobs.trainer_snapshot</code>을 실행해주세요.
          </div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={sortKey === 'trainer_name' ? s.sortActive : ''} onClick={() => handleSort('trainer_name')}>
                    트레이너{sortArrow('trainer_name')}
                  </th>
                  <th className={sortKey === 'branch' ? s.sortActive : ''} onClick={() => handleSort('branch')}>
                    지점{sortArrow('branch')}
                  </th>
                  <th className={sortKey === 'active_members_avg' ? s.sortActive : ''} onClick={() => handleSort('active_members_avg')}>
                    유효회원(월평균){sortArrow('active_members_avg')}
                  </th>
                  <th className={sortKey === 'sessions_avg' ? s.sortActive : ''} onClick={() => handleSort('sessions_avg')}>
                    월 세션(평균){sortArrow('sessions_avg')}
                  </th>
                  <th className={sortKey === 'conversion_rate' ? s.sortActive : ''} onClick={() => handleSort('conversion_rate')}>
                    체험전환율{sortArrow('conversion_rate')}
                  </th>
                  <th className={sortKey === 'rereg_rate' ? s.sortActive : ''} onClick={() => handleSort('rereg_rate')}>
                    재등록률{sortArrow('rereg_rate')}
                  </th>
                  <th className={sortKey === 'completion_rate' ? s.sortActive : ''} onClick={() => handleSort('completion_rate')}>
                    세션 완료율{sortArrow('completion_rate')}
                  </th>
                  <th className={sortKey === 'days_per_8_avg' ? s.sortActive : ''} onClick={() => handleSort('days_per_8_avg')}>
                    소진일(8회){sortArrow('days_per_8_avg')}
                  </th>
                  <th className={sortKey === 'status' ? s.sortActive : ''} onClick={() => handleSort('status')}>
                    상태{sortArrow('status')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(({ row, eva }) => (
                  <tr key={`${row.trainer_name ?? '?'}-${row.branch}`}>
                    <td className={s.nameCell} onClick={() => openTrainerDrawer(row)}>
                      {row.trainer_name ?? '(이름없음)'}
                    </td>
                    <td>{row.branch}</td>
                    <td
                      className={`${s.clickableCell} ${eva.flags.active ? s.failCell : ''}`}
                      onClick={() => openDetail('active', row)}
                    >{row.active_members_avg.toFixed(1)}</td>
                    <td
                      className={`${s.clickableCell} ${eva.flags.sessions ? s.failCell : ''}`}
                      onClick={() => openDetail('sessions', row)}
                    >{row.sessions_avg.toFixed(1)}</td>
                    <td
                      className={`${s.clickableCell} ${eva.flags.conversion ? s.failCell : ''} ${row.conversion_rate === null ? s.nullCell : ''}`}
                      onClick={() => openDetail('trial', row)}
                    >
                      {pct(row.conversion_rate)}
                      {row.conversion_rate !== null && (
                        <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-xs)', marginLeft: 4 }}>
                          ({row.trial_convert}/{row.trial_end})
                        </span>
                      )}
                    </td>
                    <td
                      className={`${s.clickableCell} ${eva.flags.rereg ? s.failCell : ''} ${row.rereg_rate === null ? s.nullCell : ''}`}
                      onClick={() => openDetail('rereg', row)}
                    >
                      {pct(row.rereg_rate)}
                      {row.rereg_rate !== null && (
                        <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-xs)', marginLeft: 4 }}>
                          ({row.regular_rereg}/{row.regular_end})
                        </span>
                      )}
                    </td>
                    <td
                      className={`${s.clickableCell} ${eva.flags.completion ? s.failCell : ''} ${row.completion_rate === null ? s.nullCell : ''}`}
                      onClick={() => openDetail('completion', row)}
                    >
                      {pct(row.completion_rate)}
                      {row.completion_rate !== null && (
                        <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-xs)', marginLeft: 4 }}>
                          ({row.completion_ontime}/{row.completion_count})
                        </span>
                      )}
                    </td>
                    <td
                      className={`${s.clickableCell} ${row.days_per_8_avg === null ? s.nullCell : ''}`}
                      onClick={() => openDetail('completion', row)}
                    >
                      {row.days_per_8_avg === null ? '-' : `${row.days_per_8_avg.toFixed(1)}일`}
                    </td>
                    <td>
                      {eva.shouldConsider && (
                        <span
                          className={`${s.statusBadge} ${s.statusDanger}`}
                          title={eva.fails.length > 0 ? `미달: ${eva.fails.join(', ')}` : undefined}
                        >
                          재계약 고려
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 월별 추이 드로어 (표 / 차트 탭) */}
      {drawerTrainer && (
        <div className={s.drawerOverlay} onClick={() => setDrawerTrainer(null)}>
          <div className={s.drawer} onClick={(e) => e.stopPropagation()}>
            <div className={s.drawerHeader}>
              <div>
                <div className={s.drawerTitle}>{drawerTrainer.trainer_name ?? '(이름없음)'}</div>
                <div className={s.meta}>
                  <span>{drawerTrainer.branch}</span>
                  <span>{start} ~ {end}</span>
                </div>
              </div>
              <button className={s.closeBtn} onClick={() => setDrawerTrainer(null)} aria-label="닫기">×</button>
            </div>

            <div className={s.tabs}>
              <button
                className={`${s.tabBtn} ${drawerTab === 'table' ? s.tabBtnActive : ''}`}
                onClick={() => setDrawerTab('table')}
              >월별 표</button>
              <button
                className={`${s.tabBtn} ${drawerTab === 'chart' ? s.tabBtnActive : ''}`}
                onClick={() => setDrawerTab('chart')}
              >시계열 차트</button>
            </div>

            {drawerLoading ? (
              <div className={s.loading}>불러오는 중…</div>
            ) : drawerTab === 'table' ? (
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>월</th>
                      <th>지점</th>
                      <th>유효회원</th>
                      <th>세션</th>
                      <th>체험 종료/전환</th>
                      <th>정규 만료/재등록</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drawerRows.map((r) => {
                      const convRate = r.trial_end_count > 0
                        ? (r.trial_convert_count / r.trial_end_count) * 100 : null;
                      const reRate = r.regular_end_count > 0
                        ? (r.regular_rereg_count / r.regular_end_count) * 100 : null;
                      return (
                        <tr key={`${r.target_month}-${r.branch}`}>
                          <td>{r.target_month}</td>
                          <td>{r.branch}</td>
                          <td>{num(r.active_members)}</td>
                          <td>{num(r.sessions_done)}</td>
                          <td>
                            {r.trial_convert_count}/{r.trial_end_count}
                            {convRate !== null && <span style={{ color: 'var(--text-tertiary)', marginLeft: 4 }}>({pct(convRate)})</span>}
                          </td>
                          <td>
                            {r.regular_rereg_count}/{r.regular_end_count}
                            {reRate !== null && <span style={{ color: 'var(--text-tertiary)', marginLeft: 4 }}>({pct(reRate)})</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <TimeSeriesChart rows={drawerRows} start={start} end={end} />
            )}
          </div>
        </div>
      )}

      {detail && (
        <MemberDetailModal
          kind={detail.kind}
          trainerName={detail.row.trainer_name ?? ''}
          trainerUserIds={detail.row.trainer_user_ids ?? []}
          branch={detail.row.branch}
          start={start}
          end={end}
          onClose={() => setDetail(null)}
        />
      )}

      <div className={s.dataMeta}>
        데이터 기준: {meta?.snapshot_date ?? '-'} 스냅샷 · 기간 {start} ~ {end} ({meta?.month_count ?? 0}개월)
      </div>
    </div>
  );
}
