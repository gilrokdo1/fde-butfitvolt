import { Routes, Route } from 'react-router-dom';
import { Link } from 'react-router-dom';
import s from './ChoiJihee.module.css';
import LandlordSettlement from './LandlordSettlement';
import GowithConvert from './GowithConvert';

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

      <div className={s.projectCard}>
        <div className={s.projectHeader}>
          <span className={s.projectIcon} style={{ fontFamily: 'Tossface' }}>💳</span>
          <div>
            <h2 className={s.projectTitle}>고위드 카드 자동전표 변환</h2>
            <p className={s.projectDesc}>
              고위드 카드 월별 내역을 더존 자동전표 양식으로 변환합니다.
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
            <span>고위드 Raw 데이터 업로드</span>
          </div>
          <div className={s.featureItem}>
            <span className={s.featureDot} />
            <span>임직원 소속코드 매핑 관리</span>
          </div>
          <div className={s.featureItem}>
            <span className={s.featureDot} />
            <span>더존 자동전표 양식 자동 생성</span>
          </div>
        </div>
        <Link to="/fde/choi-jihee/gowith-convert" className={s.goBtn}>
          고위드 변환 바로가기 →
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
      <Route path="gowith-convert" element={<GowithConvert />} />
    </Routes>
  );
}
