import s from '../Budget.module.css';
import type { Branch } from './api';

interface Props {
  branch: Branch;
}

export default function BranchMonthly({ branch }: Props) {
  return (
    <div className={s.placeholder}>
      <span style={{ fontFamily: 'Tossface', fontSize: 48 }}>&#x1F4C5;</span>
      <p className={s.placeholderTitle}>{branch.name} · 월별 대시보드</p>
      <p className={s.placeholderHint}>
        KPI · 계정별 소진 현황 · 분기 누적 표가 이곳에 들어갑니다. (Phase 1~2)
      </p>
    </div>
  );
}
