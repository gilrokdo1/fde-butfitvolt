import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { FDE_MEMBERS } from '../config/menuConfig';
import s from './Layout.module.css';
import clsx from 'clsx';

export default function Layout() {
  const { user, logout } = useAuth();
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const toggleMenu = (name: string) => {
    setOpenMenu(openMenu === name ? null : name);
  };

  return (
    <div className={s.layout}>
      {/* 사이드바 */}
      <aside className={s.sidebar}>
        <div className={s.logo}>
          <span style={{ fontFamily: 'Tossface' }}>&#x1F4AA;</span>
          FDE 1기
        </div>

        <nav className={s.nav}>
          <NavLink to="/" end className={({ isActive }) => clsx(s.navItem, isActive && s.active)}>
            <span style={{ fontFamily: 'Tossface' }}>&#x1F3E0;</span>
            홈
          </NavLink>

          {FDE_MEMBERS.map((member) => (
            <div key={member.name} className={s.menuGroup}>
              <button
                className={clsx(s.navItem, s.memberItem, openMenu === member.name && s.open)}
                onClick={() => toggleMenu(member.name)}
              >
                <img
                  src={member.image}
                  alt={member.name}
                  className={s.avatar}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `data:image/svg+xml,${encodeURIComponent(
                      `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="16" fill="#5B5FC7"/><text x="16" y="20" text-anchor="middle" fill="white" font-size="14">${member.name[0]}</text></svg>`
                    )}`;
                  }}
                />
                <div className={s.memberInfo}>
                  <span className={s.memberName}>{member.name}</span>
                  <span className={s.memberTeam}>{member.team}</span>
                </div>
                <span className={clsx(s.arrow, openMenu === member.name && s.arrowOpen)}>&#9662;</span>
              </button>

              {openMenu === member.name && member.children && (
                <div className={s.subMenu}>
                  {member.children.map((child) => (
                    <NavLink
                      key={child.path}
                      to={child.path}
                      className={({ isActive }) => clsx(s.subItem, isActive && s.active)}
                    >
                      {child.name}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className={s.userArea}>
          <span className={s.userName}>{user?.name ?? '사용자'}</span>
          <button className={s.logoutBtn} onClick={logout}>로그아웃</button>
        </div>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className={s.main}>
        <Outlet />
      </main>
    </div>
  );
}
