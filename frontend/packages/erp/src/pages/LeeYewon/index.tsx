import { NavLink, Routes, Route, Navigate } from 'react-router-dom';
import s from './LeeYewon.module.css';
import Budget from './Budget';
import GameHub from './GameHub';
import PivotPage from './pivot/PivotPage';

interface SubNav {
  to: string;
  label: string;
  icon: string;
}

// 상단 탭 — 예산관리가 메인
const SUB_NAVS: SubNav[] = [
  { to: 'budget', label: '예산관리', icon: '\u{1F4B0}' },
  { to: 'pivot', label: '데이터 피벗', icon: '\u{1F4CA}' },
  { to: 'games', label: '쉬는시간', icon: '\u{1F3AE}' },
];

export default function LeeYewon() {
  return (
    <div className={s.container}>
      <header className={s.header}>
        <div>
          <h1 className={s.title}>이예원</h1>
          <p className={s.team}>BG운영지원팀</p>
        </div>
      </header>

      <nav className={s.tabs}>
        {SUB_NAVS.map((nav) => (
          <NavLink
            key={nav.to}
            to={nav.to}
            className={({ isActive }) => `${s.tab} ${isActive ? s.tabActive : ''}`}
          >
            <span style={{ fontFamily: 'Tossface' }}>{nav.icon}</span> {nav.label}
          </NavLink>
        ))}
      </nav>

      <Routes>
        <Route index element={<Navigate to="budget" replace />} />
        <Route path="budget" element={<Budget />} />
        <Route path="pivot" element={<PivotPage />} />
        <Route path="games" element={<GameHub />} />
      </Routes>
    </div>
  );
}
