import { Routes, Route, Navigate } from 'react-router-dom';
import HrDashboard from './HrDashboard';
import s from './KimYoungshin.module.css';

function KimYoungshinHome() {
  return (
    <div className={s.container}>
      <h1 className={s.title}>김영신</h1>
      <p className={s.team}>피플팀</p>
      <div className={s.placeholder}>
        <span style={{ fontFamily: 'Tossface', fontSize: 48 }}>👋</span>
        <p>안녕하세요, 피플팀 김영신입니다.</p>
        <p className={s.hint}>왼쪽 메뉴에서 HR Dashboard를 확인해보세요.</p>
      </div>
    </div>
  );
}

export default function KimYoungshin() {
  return (
    <Routes>
      <Route index element={<KimYoungshinHome />} />
      <Route path="hr-dashboard" element={<HrDashboard />} />
      <Route path="*" element={<Navigate to="" replace />} />
    </Routes>
  );
}
