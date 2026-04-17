import { useState } from 'react';
import s from './LeeYewon.module.css';
import GameHub from './GameHub';
import PivotPage from './pivot/PivotPage';

export default function LeeYewonHome() {
  const [showGames, setShowGames] = useState(false);

  if (showGames) {
    return (
      <div className={s.container}>
        <div className={s.header}>
          <div>
            <h1 className={s.title}>쉬는시간</h1>
            <p className={s.team}>잠깐 쉬어가세요</p>
          </div>
          <button
            className={s.iconButton}
            onClick={() => setShowGames(false)}
            title="업무로 돌아가기"
          >
            <span style={{ fontFamily: 'Tossface' }}>&#x1F4BC;</span>
          </button>
        </div>
        <GameHub />
      </div>
    );
  }

  return (
    <div className={s.container}>
      <div className={s.header}>
        <div>
          <h1 className={s.title}>이예원</h1>
          <p className={s.team}>BG운영지원팀</p>
        </div>
        <button
          className={s.iconButton}
          onClick={() => setShowGames(true)}
          title="쉬는시간"
        >
          <span style={{ fontFamily: 'Tossface' }}>&#x1F3AE;</span>
        </button>
      </div>
      <PivotPage />
    </div>
  );
}
