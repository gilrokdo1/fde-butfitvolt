import { Routes, Route } from 'react-router-dom';
import { Link } from 'react-router-dom';
import s from './ChoiJihee.module.css';
import LandlordSettlement from './LandlordSettlement';

function ChoiJiheeHome() {
  return (
    <div className={s.container}>
      <div className={s.header}>
        <div>
          <h1 className={s.title}>최지희</h1>
          <p className={s.team}>재무기획실</p>
        </div>
      </div>

      <div className={s.projectCard}>
        <div className={s.projectHeader}>
          <span className={s.projectIcon} style={{ fontFamily: 'Tossface' }}>🏢</span>
          <div>
            <h2 className={s.projectTitle}>임대인 정산 자동화 기능 구현</h2>
            <p className={s.projectDesc}>
              임대인 정산 업무를 자동화하여 반복 작업을 줄이고 정확성을 높입니다.
            </p>
          </div>
        </div>
        <div className={s.projectMeta}>
          <span className={s.badge}>진행 중</span>
          <span className={s.metaText}>재무기획실 · 2026</span>
        </div>
        <div className={s.divider} />
        <div className={s.featureList}>
          <div className={s.featureItem}>
            <span className={s.featureDot} />
            <span>임대인별 정산 내역 자동 계산</span>
          </div>
          <div className={s.featureItem}>
            <span className={s.featureDot} />
            <span>월별 정산 리포트 생성</span>
          </div>
          <div className={s.featureItem}>
            <span className={s.featureDot} />
            <span>수기 작업 제거 및 오류 최소화</span>
          </div>
        </div>
        <Link to="/fde/choi-jihee/landlord-settlement" className={s.goBtn}>
          임대인 정산 바로가기 →
        </Link>
      </div>
    </div>
  );
}

export default function ChoiJihee() {
  return (
    <Routes>
      <Route index element={<ChoiJiheeHome />} />
      <Route path="landlord-settlement" element={<LandlordSettlement />} />
    </Routes>
  );
}
