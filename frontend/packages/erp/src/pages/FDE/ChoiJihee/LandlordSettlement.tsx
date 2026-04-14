import s from './LandlordSettlement.module.css';

export default function LandlordSettlement() {
  return (
    <div className={s.container}>
      <div className={s.header}>
        <div>
          <h1 className={s.title}>임대인 정산</h1>
          <p className={s.subtitle}>재무기획실 · 최지희</p>
        </div>
      </div>

      <div className={s.content}>
        <div className={s.emptyState}>
          <span className={s.emptyIcon} style={{ fontFamily: 'Tossface' }}>🏢</span>
          <p className={s.emptyTitle}>기능 개발 중</p>
          <p className={s.emptyDesc}>임대인 정산 기능이 곧 추가됩니다.</p>
        </div>
      </div>
    </div>
  );
}
