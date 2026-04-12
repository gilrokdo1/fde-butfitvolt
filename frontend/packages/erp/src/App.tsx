import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Home from './pages/Home';

// FDE 멤버 페이지
import DoGilrok from './pages/FDE/DoGilrok';
import KimDongha from './pages/FDE/KimDongha';
import KimSoyeon from './pages/FDE/KimSoyeon';
import KimYoungshin from './pages/FDE/KimYoungshin';
import ParkMingyu from './pages/FDE/ParkMingyu';
import LeeYewon from './pages/FDE/LeeYewon';
import ChoiJaeeun from './pages/FDE/ChoiJaeeun';
import ChoiJihee from './pages/FDE/ChoiJihee';
import ChoiChihwan from './pages/FDE/ChoiChihwan';

export default function App() {
  const { token } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={token ? <Navigate to="/" replace /> : <Login />} />

      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Home />} />

        {/* FDE 멤버별 라우트 */}
        <Route path="fde/do-gilrok/*" element={<DoGilrok />} />
        <Route path="fde/kim-dongha/*" element={<KimDongha />} />
        <Route path="fde/kim-soyeon/*" element={<KimSoyeon />} />
        <Route path="fde/kim-youngshin/*" element={<KimYoungshin />} />
        <Route path="fde/park-mingyu/*" element={<ParkMingyu />} />
        <Route path="fde/lee-yewon/*" element={<LeeYewon />} />
        <Route path="fde/choi-jaeeun/*" element={<ChoiJaeeun />} />
        <Route path="fde/choi-jihee/*" element={<ChoiJihee />} />
        <Route path="fde/choi-chihwan/*" element={<ChoiChihwan />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
