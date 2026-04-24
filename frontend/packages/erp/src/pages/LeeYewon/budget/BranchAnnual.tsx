import s from '../Budget.module.css';
import type { Branch } from './api';

interface Props {
  branch: Branch;
}

export default function BranchAnnual({ branch }: Props) {
  return (
    <div className={s.placeholder}>
      <span style={{ fontFamily: 'Tossface', fontSize: 48 }}>&#x1F4CA;</span>
      <p className={s.placeholderTitle}>{branch.name} · 연간 매트릭스</p>
      <p className={s.placeholderHint}>
        계정 × 월 12열 매트릭스 · VAT 토글 · 대계정 그룹 요약이 이곳에 들어갑니다. (Phase 4)
      </p>
    </div>
  );
}
