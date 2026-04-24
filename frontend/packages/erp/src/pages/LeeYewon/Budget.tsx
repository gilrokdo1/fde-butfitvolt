import { useEffect, useState } from 'react';
import s from './Budget.module.css';
import BranchMonthly from './budget/BranchMonthly';
import BranchAnnual from './budget/BranchAnnual';
import MigrationModal from './budget/MigrationModal';
import { fetchBranches, type Branch } from './budget/api';

type BudgetTab = 'monthly' | 'annual';

export default function Budget() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [tab, setTab] = useState<BudgetTab>('monthly');
  const [error, setError] = useState<string | null>(null);
  const [showMigration, setShowMigration] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

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
        <label className={s.branchSelect}>
          <span className={s.branchSelectLabel}>지점</span>
          <select
            value={selectedBranchId ?? ''}
            onChange={(e) => setSelectedBranchId(Number(e.target.value))}
          >
            {branches.length === 0 && <option value="">(로딩 중...)</option>}
            {branches.map((b) => (
              <option key={b.id} value={b.id} disabled={!b.is_active}>
                {b.name}
                {!b.is_active ? ' (준비 중)' : ''}
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

        {selectedBranch && (
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
        )}
      </div>

      {selectedBranch ? (
        tab === 'monthly' ? (
          <BranchMonthly key={reloadToken} branch={selectedBranch} />
        ) : (
          <BranchAnnual branch={selectedBranch} />
        )
      ) : (
        <div className={s.placeholder}>
          <span style={{ fontFamily: 'Tossface', fontSize: 56 }}>&#x1F3E2;</span>
          <p className={s.placeholderTitle}>지점을 선택하세요</p>
          <p className={s.placeholderHint}>파일럿 기간엔 신도림 지점만 사용할 수 있습니다.</p>
        </div>
      )}

      {showMigration && selectedBranch && (
        <MigrationModal
          branch={selectedBranch}
          onClose={() => setShowMigration(false)}
          onDone={() => setReloadToken((t) => t + 1)}
        />
      )}
    </section>
  );
}
