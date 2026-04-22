import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import DiagnosisForm from './DiagnosisForm';
import s from './BranchDiagnosis.module.css';

const BRANCHES = [
  '역삼ARC', '도곡', '신도림', '논현', '판교', '강변',
  '가산', '삼성', '광화문', '한티', '마곡', '판벤타',
  '역삼GFC', '합정',
];

interface BranchSummary {
  branch_name: string;
  has_diagnosis: boolean;
  diagnosis_id: number | null;
  diagnosed_at: string | null;
  achieved: boolean;
  total: number;
  checked_count: number;
  rate: number;
}

function buildFallback(): BranchSummary[] {
  return BRANCHES.map(b => ({
    branch_name: b,
    has_diagnosis: false,
    diagnosis_id: null,
    diagnosed_at: null,
    achieved: false,
    total: 0,
    checked_count: 0,
    rate: 0,
  }));
}

function mergeSummary(apiData: BranchSummary[] | undefined): BranchSummary[] {
  if (!apiData || apiData.length === 0) return buildFallback();
  const byName = Object.fromEntries(apiData.map(b => [b.branch_name, b]));
  return BRANCHES.map(name => byName[name] ?? {
    branch_name: name,
    has_diagnosis: false,
    diagnosis_id: null,
    diagnosed_at: null,
    achieved: false,
    total: 0,
    checked_count: 0,
    rate: 0,
  });
}

export default function BranchDiagnosis() {
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['diagnosis-summary'],
    queryFn: () =>
      api.get<{ summary: BranchSummary[] }>('/fde-api/diagnosis/summary')
        .then(r => r.data)
        .catch(() => ({ summary: [] as BranchSummary[] })),
  });

  function handleCardClick(b: BranchSummary) {
    setSelectedBranch(b.branch_name);
  }

  if (selectedBranch) {
    return (
      <DiagnosisForm
        branch={selectedBranch}
        onBack={() => {
          setSelectedBranch(null);
          qc.invalidateQueries({ queryKey: ['diagnosis-summary'] });
        }}
      />
    );
  }

  const summary = mergeSummary(data?.summary);
  const achievedCount = summary.filter(b => b.achieved).length;
  const diagnosedCount = summary.filter(b => b.has_diagnosis).length;

  return (
    <div className={s.container}>
      <div className={s.header}>
        <div>
          <h1 className={s.title}>80점 경영 진단</h1>
          <p className={s.subtitle}>지점별 80점 경영 기준 달성 현황</p>
        </div>
        <div className={s.stats}>
          <span className={s.statItem}>진단 완료 <strong>{diagnosedCount}</strong>/{summary.length}</span>
          <span className={s.statAchieved}>80점 달성 <strong>{achievedCount}</strong></span>
        </div>
      </div>

      {isLoading ? (
        <p className={s.loading}>불러오는 중...</p>
      ) : (
        <div className={s.grid}>
          {summary.map(b => (
            <div
              key={b.branch_name}
              className={`${s.card} ${b.achieved ? s.cardAchieved : b.has_diagnosis ? s.cardInProgress : s.cardEmpty}`}
              onClick={() => handleCardClick(b)}
            >
              <div className={s.cardHeader}>
                <span className={s.branchName}>{b.branch_name}</span>
                {b.achieved && <span className={s.badge}>✓ 달성</span>}
                {!b.achieved && b.has_diagnosis && <span className={s.badgeProgress}>진단중</span>}
              </div>

              {b.has_diagnosis ? (
                <>
                  <div className={s.progressBar}>
                    <div className={s.progressFill} style={{ width: `${b.rate}%` }} />
                  </div>
                  <div className={s.cardFooter}>
                    <span className={s.rate}>{b.rate}% ({b.checked_count}/{b.total})</span>
                    {b.diagnosed_at && (
                      <span className={s.date}>{b.diagnosed_at}</span>
                    )}
                  </div>
                </>
              ) : (
                <p className={s.emptyHint}>클릭하여 진단 시작</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
