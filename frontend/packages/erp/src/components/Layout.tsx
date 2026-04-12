import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { useAuth } from '../contexts/AuthContext';
import { useState, useEffect, useRef } from 'react';
import { MENU_CONFIG } from '../config/menuConfig';
import s from './Layout.module.css';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedMainMenu, setSelectedMainMenu] = useState<string | null>(null);
  const [subNavCollapsed, setSubNavCollapsed] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [expandedDrawerMenu, setExpandedDrawerMenu] = useState<string | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const collapseLockedUntil = useRef(0);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // 서브네비 펼치기 (쿨다운 포함)
  const expandSubNav = () => {
    setSubNavCollapsed(false);
    collapseLockedUntil.current = Date.now() + 400;
  };

  // 대메뉴 클릭 핸들러 — 페이지 이동 없이 서브네비만 토글
  const handleMainMenuClick = (menuId: string) => {
    if (selectedMainMenu === menuId && subNavCollapsed) {
      expandSubNav();
    } else if (selectedMainMenu === menuId) {
      setSelectedMainMenu(null);
    } else {
      setSelectedMainMenu(menuId);
      expandSubNav();
    }
  };

  // URL 기반으로 현재 활성 메뉴 판단
  useEffect(() => {
    const path = location.pathname;
    // /fde/design-system or /fde (exact) → fde 메뉴
    // /fde/do-gilrok → do-gilrok 메뉴
    const memberMenu = MENU_CONFIG.find(
      (m) => m.id !== 'fde' && m.items.some((item) => path.startsWith(item.to)),
    );
    if (memberMenu) {
      setSelectedMainMenu(memberMenu.id);
    } else if (path === '/fde' || path.startsWith('/fde/design-system')) {
      setSelectedMainMenu('fde');
    }
    expandSubNav();
  }, [location.pathname]);

  // 현재 선택된 메뉴의 서브 항목
  const currentMenuItems = selectedMainMenu
    ? MENU_CONFIG.find((m) => m.id === selectedMainMenu)?.items ?? []
    : [];

  // 스크롤 시 서브네비 접기/펼치기
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const canCollapse = () => Date.now() > collapseLockedUntil.current;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY > 0 && canCollapse()) setSubNavCollapsed(true);
      else if (e.deltaY < 0 && main.scrollTop <= 0) expandSubNav();
    };
    let touchStartY = 0;
    const onTouchStart = (e: TouchEvent) => { touchStartY = e.touches[0]?.clientY ?? 0; };
    const onTouchMove = (e: TouchEvent) => {
      const deltaY = touchStartY - (e.touches[0]?.clientY ?? 0);
      if (deltaY > 10 && canCollapse()) setSubNavCollapsed(true);
      else if (deltaY < -10 && main.scrollTop <= 0) expandSubNav();
    };
    main.addEventListener('wheel', onWheel, { passive: true });
    main.addEventListener('touchstart', onTouchStart, { passive: true });
    main.addEventListener('touchmove', onTouchMove, { passive: true });
    return () => {
      main.removeEventListener('wheel', onWheel);
      main.removeEventListener('touchstart', onTouchStart);
      main.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  // 경로 변경 시 드로어 닫기
  useEffect(() => { setIsDrawerOpen(false); }, [location.pathname]);

  // 드로어 열렸을 때 body 스크롤 방지
  useEffect(() => {
    document.body.style.overflow = isDrawerOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isDrawerOpen]);

  return (
    <div className={s.layout}>
      <header className={s.layoutHeader}>
        {/* 모바일 햄버거 */}
        <button className={s.mobileHamburger} onClick={() => setIsDrawerOpen(true)} aria-label="메뉴 열기">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path d="M3 6h16M3 11h16M3 16h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>

        <div className={s.headerLeft}>
          <NavLink to="/" className={s.headerLogoLink}>
            <h1 className={s.headerLogo}>BUTFITVOLT FDE 1기</h1>
          </NavLink>

          <nav className={s.headerNav}>
            {MENU_CONFIG.map((menu) => (
              <button
                key={menu.id}
                className={clsx(s.navTab, selectedMainMenu === menu.id && s.active)}
                onClick={() => handleMainMenuClick(menu.id)}
              >
                {menu.image && (
                  <img src={menu.image} alt={menu.label} className={s.navTabAvatar} />
                )}
                {menu.label}
              </button>
            ))}
          </nav>
        </div>

        <div className={s.headerRight}>
          <div className={s.userInfo}>
            {(() => {
              const slackImg = MENU_CONFIG.find((m) => m.label === user?.name)?.image;
              return slackImg ? (
                <img src={slackImg} alt={user?.name} className={s.userAvatar} />
              ) : (
                <div className={s.userAvatarPlaceholder}>{user?.name?.charAt(0) || 'A'}</div>
              );
            })()}
            <span className={s.userName}>{user?.name || '관리자'}</span>
          </div>
          <button onClick={handleLogout} className={s.logoutButton}>로그아웃</button>
        </div>
      </header>

      {/* 서브네비 */}
      {selectedMainMenu && currentMenuItems.length > 0 && (
        <div className={clsx(s.subnavWrap, subNavCollapsed && s.subnavCollapsed)}>
          <nav className={s.subnav}>
            {currentMenuItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end
                className={({ isActive }) => clsx(s.subnavItem, isActive && s.active)}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      )}

      {/* 모바일 드로어 */}
      <div
        className={clsx(s.drawerOverlay, isDrawerOpen && s.drawerOverlayOpen)}
        onClick={() => setIsDrawerOpen(false)}
      />
      <nav className={clsx(s.drawer, isDrawerOpen && s.drawerOpen)}>
        <div className={s.drawerUserSection}>
          <div className={s.drawerUserInfo}>
            {(() => {
              const slackImg = MENU_CONFIG.find((m) => m.label === user?.name)?.image;
              return slackImg ? (
                <img src={slackImg} alt={user?.name} className={s.drawerUserAvatar} />
              ) : (
                <div className={s.drawerUserAvatarPlaceholder}>{user?.name?.charAt(0) || 'A'}</div>
              );
            })()}
            <div>
              <div className={s.drawerUserName}>{user?.name || '관리자'}</div>
            </div>
          </div>
        </div>
        <div className={s.drawerMenuList}>
          {MENU_CONFIG.map((menu) => (
            <div key={menu.id} className={s.drawerMenuGroup}>
              <button
                className={clsx(s.drawerMenuTitle, expandedDrawerMenu === menu.id && s.expanded)}
                onClick={() => setExpandedDrawerMenu((prev) => (prev === menu.id ? null : menu.id))}
              >
                <span>{menu.label}</span>
                <svg className={clsx(s.drawerChevron, expandedDrawerMenu === menu.id && s.rotated)} width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {expandedDrawerMenu === menu.id && (
                <div className={s.drawerSubItems}>
                  {menu.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) => clsx(s.drawerSubItem, isActive && s.active)}
                      onClick={() => setIsDrawerOpen(false)}
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className={s.drawerFooter}>
          <button onClick={() => { handleLogout(); setIsDrawerOpen(false); }} className={s.drawerLogoutBtn}>
            로그아웃
          </button>
        </div>
      </nav>

      <main className={s.layoutContent} ref={mainRef}>
        <div className={s.contentInner}>
          <div key={location.pathname} className="page-transition">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
