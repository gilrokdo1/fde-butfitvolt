import { useEffect, useState } from 'react';
import s from './Budget.module.css';
import BranchMonthly from './budget/BranchMonthly';
import BranchAnnual from './budget/BranchAnnual';
import HqDashboard from './budget/HqDashboard';
import MigrationModal from './budget/MigrationModal';
import PendingReclassifyModal from './budget/PendingReclassifyModal';
import { activateBranch, checkHqAccess, fetchBranches, type Branch } from './budget/api';

type BudgetTab = 'monthly' | 'annual';
type ViewMode = 'branch' | 'hq';

export default function Budget() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [tab, setTab] = useState<BudgetTab>('monthly');
  const [error, setError] = useState<string | null>(null);
  const [showMigration, setShowMigration] = useState(false);
  const [showReclassify, setShowReclassify] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [activating, setActivating] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('branch');
  const [hqAvailable, setHqAvailable] = useState(false);

  // 본사 권한 체크 (실패 = 권한 없음 = 토글 안 보임)
  useEffect(() => {
    checkHqAccess().then(setHqAvailable);
  }, []);

  async function handleActivate() {
    if (!selectedBranch || selectedBranch.is_active) return;
    if (!confirm(`'${selectedBranch.name}' 지점을 활성화할까요?\n활성화하면 지출 등록·이관 등 모든 기능을 사용할 수 있습니다.`)) return;
    setActivating(true);
    setError(null);
    try {
      await activateBranch(selectedBranch.code);
      // 목록 재조회 (해당 지점만 is_active=true로 갱신)
      const list = await fetchBranches();
      setBranches(list);
    } catch (e: unknown) {
      const anyErr = e as { response?: { data?: { detail?: string } } };
      setError(anyErr.response?.data?.detail || (e instanceof Error ? e.message : '활성화 실패'));
    } finally {
      setActivating(false);
    }
  }

  useEffect(() => {
    fetchBranches()
      .then((list) => {
        setBranches(list);
        // 파일럿: 활성화된 첫 지점(신도림)을 기본 선택
        const firstActive = list.find((b) => b.is_active);
        if (firstActive) setSelectedBranchId(firstActive.id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : '지점 목록 로드 실패'));
  }, []);

  const selectedBranch = branches.find((b) => b.id === selectedBranchId) ?? null;

  return (
    <section className={s.wrapper}>
      <header className={s.header}>
        <h2 className={s.title}>
          <span style={{ fontFamily: 'Tossface' }}>&#x1F4B0;</span> 예산관리
        </h2>
        <p className={s.subtitle}>지점별·카테고리별 예산과 집행 현황을 관리합니다.</p>
      </header>

      {error && <div className={s.error}>{error}</div>}

      <div className={s.toolbar}>
        {hqAvailable && (
          <div className={s.subTabs} style={{ marginRight: 4 }}>
            <button
              className={`${s.subTab} ${viewMode === 'branch' ? s.subTabActive : ''}`}
              onClick={() => setViewMode('branch')}
              title="지점별 상세 보기"
            >
              🏢 지점
            </button>
            <button
              className={`${s.subTab} ${viewMode === 'hq' ? s.subTabActive : ''}`}
              onClick={() => setViewMode('hq')}
              title="활성 지점 통합 비교"
            >
              🏛️ 본사
            </button>
          </div>
        )}

        {viewMode === 'branch' && (
          <>
            <label className={s.branchSelect}>
              <span className={s.branchSelectLabel}>지점</span>
              <select
                value={selectedBranchId ?? ''}
                onChange={(e) => setSelectedBranchId(Number(e.target.value))}
              >
                {branches.length === 0 && <option value="">(로딩 중...)</option>}
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {!b.is_active ? ' (비활성)' : ''}
                  </option>
                ))}
              </select>
            </label>

            <div className={s.subTabs}>
              <button
                className={`${s.subTab} ${tab === 'monthly' ? s.subTabActive : ''}`}
                onClick={() => setTab('monthly')}
              >
                월별
              </button>
              <button
                className={`${s.subTab} ${tab === 'annual' ? s.subTabActive : ''}`}
                onClick={() => setTab('annual')}
              >
                연간
              </button>
            </div>
          </>
        )}

        {viewMode === 'branch' && selectedBranch && !selectedBranch.is_active && (
          <button
            type="button"
            onClick={handleActivate}
            disabled={activating}
            style={{
              padding: '6px 12px',
              background: '#5B5FC7',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              cursor: activating ? 'wait' : 'pointer',
              fontWeight: 500,
              opacity: activating ? 0.7 : 1,
            }}
            title="이 지점을 활성화 (이예원 본인만 가능)"
          >
            {activating ? '활성화 중...' : `🟢 ${selectedBranch.name} 지점 활성화`}
          </button>
        )}

        {viewMode === 'branch' && selectedBranch && selectedBranch.is_active && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => setShowReclassify(true)}
              style={{
                padding: '6px 12px',
                background: '#FFFBEB',
                border: '1px solid #FDE68A',
                borderRadius: 6,
                fontSize: 12,
                color: '#92400E',
                cursor: 'pointer',
                fontWeight: 500,
              }}
              title="미정 카테고리로 등록된 지출을 정식 카테고리로 재분류"
            >
              🤔 미정 재분류
            </button>
            <button
              type="button"
              onClick={() => setShowMigration(true)}
              style={{
                padding: '6px 12px',
                background: 'white',
                border: '1px solid #D1D5DB',
                borderRadius: 6,
                fontSize: 12,
                color: '#4B5563',
                cursor: 'pointer',
              }}
              title="이관용 JSON을 업로드해 일괄 입력"
            >
              ⤴ 데이터 이관
            </button>
          </div>
        )}
      </div>

      {viewMode === 'hq' ? (
        <HqDashboard />
      ) : selectedBranch && selectedBranch.is_active ? (
        tab === 'monthly' ? (
          <BranchMonthly key={reloadToken} branch={selectedBranch} />
        ) : (
          <BranchAnnual branch={selectedBranch} />
        )
      ) : selectedBranch && !selectedBranch.is_active ? (
        <div className={s.placeholder}>
          <span style={{ fontFamily: 'Tossface', fontSize: 56 }}>&#x1F4A4;</span>
          <p className={s.placeholderTitle}>{selectedBranch.name} 지점은 비활성 상태입니다</p>
          <p className={s.placeholderHint}>
            우측 상단 "🟢 {selectedBranch.name} 지점 활성화" 버튼을 눌러 켜면<br />
            예산·지출·이관 등 모든 기능을 사용할 수 있습니다.
          </p>
        </div>
      ) : (
        <div className={s.placeholder}>
          <span style={{ fontFamily: 'Tossface', fontSize: 56 }}>&#x1F3E2;</span>
          <p className={s.placeholderTitle}>지점을 선택하세요</p>
          <p className={s.placeholderHint}>드롭다운에서 지점을 선택해 시작하세요.</p>
        </div>
      )}

      {showMigration && selectedBranch && (
        <MigrationModal
          branch={selectedBranch}
          onClose={() => setShowMigration(false)}
          onDone={() => setReloadToken((t) => t + 1)}
        />
      )}

      {showReclassify && selectedBranch && (
        <PendingReclassifyModal
          branch={selectedBranch}
          onClose={() => setShowReclassify(false)}
          onChanged={() => setReloadToken((t) => t + 1)}
        />
      )}
    </section>
  );
}
