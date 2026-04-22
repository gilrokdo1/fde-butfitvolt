import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import DiagnosisForm from './DiagnosisForm';
import s from './BranchDiagnosis.module.css';

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

export default function BranchDiagnosis() {
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['diagnosis-summary'],
    queryFn: () => api.get<{ summary: BranchSummary[] }>('/fde-api/diagnosis/summary').then(r => r.data),
  });

  const startMutation = useMutation({
    mutationFn: (branch: string) =>
      api.post(`/fde-api/diagnosis/${encodeURIComponent(branch)}/start`, {}).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['diagnosis-summary'] });
    },
  });

  function handleCardClick(b: BranchSummary) {
    if (!b.has_diagnosis) {
      if (confirm(`${b.branch_name} 지점 진단을 새로 시작할까요?`)) {
        startMutation.mutate(b.branch_name, {
          onSuccess: () => setSelectedBranch(b.branch_name),
        });
      }
    } else {
      setSelectedBranch(b.branch_name);
    }
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

  const summary = data?.summary ?? [];
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
