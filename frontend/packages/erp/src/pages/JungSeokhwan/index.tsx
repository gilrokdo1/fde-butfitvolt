import { Route, Routes } from 'react-router-dom';
import s from './JungSeokhwan.module.css';
import PnlSimulator from './PnlSimulator';

function JungSeokhwanMain() {
  return (
    <div className={s.intro}>
      <h1 className={s.introTitle}>정석환</h1>
      <p className={s.introSubtitle}>BG 권역3</p>
      <p className={s.introDescription}>
        BG 운영 효율성을 높이는 도구들을 만들고 있습니다.
      </p>
    </div>
  );
}

export default function JungSeokhwan() {
  return (
    <Routes>
      <Route index element={<JungSeokhwanMain />} />
      <Route path="pnl" element={<PnlSimulator />} />
    </Routes>
  );
}