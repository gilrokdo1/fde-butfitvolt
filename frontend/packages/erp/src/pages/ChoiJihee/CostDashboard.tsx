import s from './LandlordSettlement.module.css';

const API_BASE = import.meta.env.VITE_API_URL || 'https://fde.butfitvolt.click';

export default function CostDashboard() {
  return (
    <iframe
      src={`${API_BASE}/fde-api/jihee/cost/dashboard`}
      className={s.frame}
      title="지점별 비용 대시보드"
    />
  );
}
