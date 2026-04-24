import { NavLink, Routes, Route, Navigate } from 'react-router-dom';
import s from './LandlordSettlement.module.css';
import RevenueRaw from './RevenueRaw';

function Dashboard() {
  return (
    <iframe
      src="/sales-dashboard.html"
      className={s.frame}
      title="매출보고 대시보드"
    />
  );
}

export default function LandlordSettlement() {
  return (
    <div className={s.layout}>
      {/* 좌측 사이드 네비 */}
      <nav className={s.sidenav}>
        <div className={s.navGroup}>
          <div className={s.navGroupLabel}>대시보드</div>
          <NavLink to="" end className={({ isActive }) => `${s.navItem} ${isActive ? s.active : ''}`}>
            매출보고 대시보드
          </NavLink>
        </div>
        <div className={s.navGroup}>
          <div className={s.navGroupLabel}>데이터 입력</div>
          <NavLink to="revenue-raw" className={({ isActive }) => `${s.navItem} ${isActive ? s.active : ''}`}>
            매출내역 raw
          </NavLink>
        </div>
      </nav>

      {/* 우측 콘텐츠 */}
      <div className={s.content}>
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="revenue-raw" element={<RevenueRaw />} />
          <Route path="*" element={<Navigate to="" replace />} />
        </Routes>
      </div>
    </div>
  );
}
