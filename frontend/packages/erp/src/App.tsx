import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import { recordVisit } from './api/fde';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Home from './pages/Home';
import FDE1 from './pages/FDE1';
import DesignSystem from './pages/DesignSystem/DesignSystem';

// FDE 멤버 페이지
import DoGilrok from './pages/DoGilrok';
import KimDongha from './pages/KimDongha';
import KimSoyeon from './pages/KimSoyeon';
import KimYoungshin from './pages/KimYoungshin';
import ParkMingyu from './pages/ParkMingyu';
import LeeYewon from './pages/LeeYewon';
import JungSeokhwan from './pages/JungSeokhwan';
import ChoiJihee from './pages/ChoiJihee';
import ChoiChihwan from './pages/ChoiChihwan';

function usePageTracking() {
  const location = useLocation();
  const { isLoggedIn } = useAuth();

  useEffect(() => {
    if (isLoggedIn) {
      recordVisit(location.pathname);
    }
  }, [location.pathname, isLoggedIn]);
}

export default function App() {
  const { isLoggedIn } = useAuth();
  usePageTracking();

  return (
    <Routes>
      <Route path="/login" element={isLoggedIn ? <Navigate to="/" replace /> : <Login />} />

      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Home />} />

        {/* FDE 1기 메뉴 */}
        <Route path="fde" element={<FDE1 />} />
        <Route path="fde/design-system" element={<DesignSystem />} />

        {/* FDE 멤버별 라우트 */}
        <Route path="fde/do-gilrok/*" element={<DoGilrok />} />
        <Route path="fde/kim-dongha/*" element={<KimDongha />} />
        <Route path="fde/kim-soyeon/*" element={<KimSoyeon />} />
        <Route path="fde/kim-youngshin/*" element={<KimYoungshin />} />
        <Route path="fde/park-mingyu/*" element={<ParkMingyu />} />
        <Route path="fde/lee-yewon/*" element={<LeeYewon />} />
        <Route path="fde/jung-seokhwan/*" element={<JungSeokhwan />} />
        <Route path="fde/choi-jihee/*" element={<ChoiJihee />} />
        <Route path="fde/choi-chihwan/*" element={<ChoiChihwan />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
