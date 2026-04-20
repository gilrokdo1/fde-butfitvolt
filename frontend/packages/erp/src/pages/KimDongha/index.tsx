import { Routes, Route } from 'react-router-dom';
import s from './KimDongha.module.css';
import SalesAnalysis from './SalesAnalysis';
import LuketeRefund from './LuketeRefund';

function KimDonghaHome() {
  return (
    <div className={s.container}>
      <h1 className={s.title}>김동하</h1>
      <p className={s.team}>BG영업기획팀</p>
      <div className={s.placeholder}>
        <h2>하고 싶은 업무</h2>
        <ol>
          <li>PT수업료 정산</li>
          <li>경영계획</li>
          <li>AI실적 자동 분석</li>
        </ol>
      </div>
    </div>
  );
}

export default function KimDongha() {
  return (
    <Routes>
      <Route index element={<KimDonghaHome />} />
      <Route path="sales" element={<SalesAnalysis />} />
      <Route path="lukete-refund" element={<LuketeRefund />} />
    </Routes>
  );
}
