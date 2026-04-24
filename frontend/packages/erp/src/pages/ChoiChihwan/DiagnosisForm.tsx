import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import s from './DiagnosisForm.module.css';

interface DiagItem {
  id: number;
  category: string;
  sub_category: string;
  item_text: string;
  sort_order: number;
  checked: boolean;
  link: string;
  note: string;
  담당자: string;
  개선예정일: string;
}

interface Diagnosis {
  id: number;
  diagnosed_at: string;
  achieved: boolean;
  note: string | null;
}

interface LatestResponse {
  diagnosis: Diagnosis | null;
  items: DiagItem[];
}

interface PrevItem {
  item_text: string;
  checked: boolean;
}

interface Props {
  branch: string;
  onBack: () => void;
}

const CATEGORIES = ['Biz', 'BX', 'HR', 'Operation'];
const CAT_COLOR: Record<string, string> = {
  Biz: '#5B5FC7',
  BX: '#0EA5E9',
  HR: '#10B981',
  Operation: '#F59E0B',
};

export default function DiagnosisForm({ branch, onBack }: Props) {
  const [activeTab, setActiveTab] = useState('Biz');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [expandedItem, setExpandedItem] = useState<number | null>(null);
  const [localItems, setLocalItems] = useState<DiagItem[]>([]);
  const [dirty, setDirty] = useState(false);
  const [showUnchecked, setShowUnchecked] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<LatestResponse>({
    queryKey: ['diagnosis-latest', branch],
    queryFn: () =>
      api.get<LatestResponse>(
        `/fde-api/diagnosis/${encodeURIComponent(branch)}/latest`
      ).then(r => r.data)
      .catch(() => ({ diagnosis: null, items: [] as DiagItem[] })),
  });

  const { data: prevData } = useQuery({
    queryKey: ['diagnosis-previous', branch],
    queryFn: () =>
      api.get<{ items: PrevItem[] }>(
        `/fde-api/diagnosis/${encodeURIComponent(branch)}/previous`
      ).then(r => r.data)
      .catch(() => ({ items: [] as PrevItem[] })),
  });

  const prevCheckedSet = useMemo(
    () => new Set(prevData?.items.filter(i => i.checked).map(i => i.item_text) ?? []),
    [prevData]
  );
  const hasPrevDiag = (prevData?.items.length ?? 0) > 0;

  useEffect(() => {
    if (data?.items && data.items.length > 0) {
      setLocalItems(data.items.map(i => ({
        ...i,
        담당자: i.담당자 ?? '',
        개선예정일: i.개선예정일 ?? '',
      })));
      setDirty(false);
    }
  }, [data]);

  const startMutation = useMutation({
    mutationFn: () =>
      api.post<{ diagnosis_id: number; total: number }>(
        `/fde-api/diagnosis/${encodeURIComponent(branch)}/start`, {}
      ).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['diagnosis-latest', branch] });
      qc.invalidateQueries({ queryKey: ['diagnosis-summary'] });
    },
  });

  const saveMutation = useMutation({
    mutationFn: (items: DiagItem[]) =>
      api.patch(`/fde-api/diagnosis/${data!.diagnosis!.id}/items`, {
        items: items.map(i => ({
          id: i.id,
          checked: i.checked,
          link: i.link,
          note: i.note,
          담당자: i.담당자,
          개선예정일: i.개선예정일,
        })),
      }),
    onSuccess: () => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['diagnosis-latest', branch] });
    },
  });

  const achieveMutation = useMutation({
    mutationFn: (achieved: boolean) =>
      api.patch(`/fde-api/diagnosis/${data!.diagnosis!.id}/achieve`, { achieved }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['diagnosis-latest', branch] });
      qc.invalidateQueries({ queryKey: ['diagnosis-summary'] });
    },
  });

  // 자동 저장 — 마지막 변경 후 1.5초
  useEffect(() => {
    if (!dirty || !data?.diagnosis) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveMutation.mutate(localItems);
    }, 1500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [localItems, dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleGroup(sub: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(sub)) next.delete(sub); else next.add(sub);
      return next;
    });
  }

  const toggleCheck = useCallback((id: number) => {
    setLocalItems(prev => prev.map(i => i.id === id ? { ...i, checked: !i.checked } : i));
    setDirty(true);
  }, []);

  const updateField = useCallback((id: number, field: keyof DiagItem, value: string) => {
    setLocalItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
    setDirty(true);
  }, []);

  if (isLoading) return (
    <div className={s.container}>
      <div className={s.topBar}>
        <button className={s.backBtn} onClick={onBack}>← 목록</button>
      </div>
      <div className={s.loading}>불러오는 중...</div>
    </div>
  );

  if (!data?.diagnosis && localItems.length === 0) {
    return (
      <div className={s.container}>
        <div className={s.topBar}>
          <button className={s.backBtn} onClick={onBack}>← 목록</button>
          <div className={s.topCenter}>
            <span className={s.branchTitle}>{branch} 지점</span>
          </div>
        </div>
        <div className={s.emptyState}>
          <p className={s.emptyStateText}>아직 진단 기록이 없습니다.</p>
          <button
            className={s.startBtn}
            onClick={() => startMutation.mutate()}
            disabled={startMutation.isPending}
          >
            {startMutation.isPending ? '시작 중…' : '새 진단 시작'}
          </button>
          {startMutation.isError && (
            <p className={s.errorMsg}>백엔드 연결 필요 — PR 머지 후 사용 가능합니다.</p>
          )}
        </div>
      </div>
    );
  }

  const items = localItems.length ? localItems : (data?.items ?? []);
  const diag = data?.diagnosis ?? null;

  const catStats = CATEGORIES.reduce<Record<string, { total: number; checked: number }>>((acc, cat) => {
    const catItems = items.filter(i => i.category === cat);
    acc[cat] = { total: catItems.length, checked: catItems.filter(i => i.checked).length };
    return acc;
  }, {});

  const tabItems = items.filter(i => i.category === activeTab);
  const filteredTabItems = showUnchecked ? tabItems.filter(i => !i.checked) : tabItems;
  const uncheckedCount = tabItems.filter(i => !i.checked).length;

  const subGroups = filteredTabItems.reduce<Record<string, DiagItem[]>>((acc, item) => {
    if (!acc[item.sub_category]) acc[item.sub_category] = [];
    acc[item.sub_category]!.push(item);
    return acc;
  }, {});

  const totalChecked = items.filter(i => i.checked).length;
  const totalRate = items.length ? Math.round(totalChecked / items.length * 100) : 0;

  return (
    <div className={s.container}>
      <div className={s.topBar}>
        <button className={s.backBtn} onClick={onBack}>← 목록</button>
        <div className={s.topCenter}>
          <span className={s.branchTitle}>{branch} 지점</span>
          {diag?.diagnosed_at && (
            <span className={s.diagDate}>마지막 진단 {diag.diagnosed_at}</span>
          )}
        </div>
        <div className={s.topActions}>
          {saveMutation.isPending && <span className={s.saveStatus}>저장 중…</span>}
          {dirty && !saveMutation.isPending && <span className={s.saveStatus}>변경됨</span>}
          {diag && (
            <button
              className={diag.achieved ? s.unachieveBtn : s.achieveBtn}
              onClick={() => achieveMutation.mutate(!diag.achieved)}
              disabled={achieveMutation.isPending}
            >
              {diag.achieved ? '달성 취소' : '80점 달성 완료'}
            </button>
          )}
        </div>
      </div>

      <div className={s.overallBar}>
        <div className={s.overallProgress}>
          <div className={s.overallFill} style={{ width: `${totalRate}%` }} />
        </div>
        <span className={s.overallRate}>{totalRate}% ({totalChecked}/{items.length})</span>
      </div>

      <div className={s.tabRow}>
        <div className={s.tabs}>
          {CATEGORIES.map(cat => {
            const st = catStats[cat] ?? { total: 0, checked: 0 };
            return (
              <button
                key={cat}
                className={`${s.tab} ${activeTab === cat ? s.tabActive : ''}`}
                style={activeTab === cat ? { borderBottomColor: CAT_COLOR[cat] } : {}}
                onClick={() => setActiveTab(cat)}
              >
                <span className={s.tabLabel} style={{ color: activeTab === cat ? CAT_COLOR[cat] : undefined }}>
                  {cat}
                </span>
                <span className={s.tabStat}>{st.checked}/{st.total}</span>
              </button>
            );
          })}
        </div>
        <button
          className={`${s.filterBtn} ${showUnchecked ? s.filterBtnActive : ''}`}
          onClick={() => setShowUnchecked(v => !v)}
        >
          {showUnchecked ? `미달만 (${uncheckedCount})` : '미달만 보기'}
        </button>
      </div>

      <div className={s.itemList}>
        {Object.entries(subGroups).map(([sub, subItems]) => {
          const subChecked = (subItems as DiagItem[]).filter(i => i.checked).length;
          const isCollapsed = collapsedGroups.has(sub);
          return (
            <div key={sub} className={s.subGroup}>
              <div className={s.subHeader} onClick={() => toggleGroup(sub)} style={{ cursor: 'pointer' }}>
                <span className={s.subTitle}>{sub}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={s.subCount}>{subChecked}/{(subItems as DiagItem[]).length}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{isCollapsed ? '▶' : '▼'}</span>
                </div>
              </div>
              {!isCollapsed && (subItems as DiagItem[]).map(item => {
                const wasChecked = prevCheckedSet.has(item.item_text);
                const compLabel = hasPrevDiag
                  ? (!wasChecked && item.checked ? '개선' : wasChecked && !item.checked ? '퇴보' : null)
                  : null;
                const isExpanded = expandedItem === item.id;
                return (
                  <div key={item.id} className={`${s.item} ${item.checked ? s.itemChecked : ''}`}>
                    <div
                      className={s.itemMain}
                      onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                    >
                      <span
                        className={`${s.checkbox} ${item.checked ? s.checkboxOn : ''}`}
                        onClick={e => { e.stopPropagation(); toggleCheck(item.id); }}
                      >
                        {item.checked ? '✓' : ''}
                      </span>
                      <span className={s.itemText}>{item.item_text}</span>
                      {compLabel && (
                        <span className={compLabel === '개선' ? s.compImproved : s.compRegressed}>
                          {compLabel}
                        </span>
                      )}
                      <span className={s.expandIndicator}>{isExpanded ? '▲' : '▼'}</span>
                    </div>
                    {isExpanded && (
                      <div className={s.itemDetail} onClick={e => e.stopPropagation()}>
                        <input
                          className={s.linkInput}
                          placeholder="관련 링크"
                          value={item.link}
                          onChange={e => updateField(item.id, 'link', e.target.value)}
                        />
                        {!item.checked && (
                          <div className={s.actionPlanRow}>
                            <span className={s.actionPlanLabel}>미체크시</span>
                            <input
                              className={s.assigneeInput}
                              placeholder="담당자"
                              value={item.담당자}
                              onChange={e => updateField(item.id, '담당자', e.target.value)}
                            />
                            <input
                              className={s.noteInput}
                              placeholder="개선계획"
                              value={item.note}
                              onChange={e => updateField(item.id, 'note', e.target.value)}
                            />
                            <input
                              type="date"
                              className={s.dueDateInput}
                              value={item.개선예정일}
                              onChange={e => updateField(item.id, '개선예정일', e.target.value)}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
        {showUnchecked && uncheckedCount === 0 && (
          <p className={s.allClearMsg}>✓ 이 탭의 모든 항목이 완료됐습니다!</p>
        )}
      </div>
    </div>
  );
}
