import s from './LandlordSettlement.module.css';

export default function LandlordSettlement() {
  return (
    <iframe
      src="/sales-dashboard.html"
      className={s.frame}
      title="매출보고 대시보드"
    />
  );
}
