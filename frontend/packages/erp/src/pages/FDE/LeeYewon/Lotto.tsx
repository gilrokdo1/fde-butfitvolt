import { useState } from 'react';
import s from './Lotto.module.css';

function getBallColor(num: number): string {
  if (num <= 10) return '#FBC400';
  if (num <= 20) return '#69C8F2';
  if (num <= 30) return '#FF7272';
  if (num <= 40) return '#AAAAAA';
  return '#B0D840';
}

function pickLottoNumbers(): { main: number[]; bonus: number }  {
  const pool: number[] = Array.from({ length: 45 }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = pool[i] as number;
    pool[i] = pool[j] as number;
    pool[j] = tmp;
  }
  const picked = pool.slice(0, 7);
  const main = picked.slice(0, 6).sort((a, b) => a - b);
  const bonus = picked[6] as number;
  return { main, bonus };
}

type Ball = { num: number; isBonus: boolean };

export default function Lotto() {
  const [balls, setBalls] = useState<Ball[]>([]);
  const [rolling, setRolling] = useState(false);
  const [revealedCount, setRevealedCount] = useState(0);

  const draw = () => {
    if (rolling) return;
    const { main, bonus } = pickLottoNumbers();
    const next: Ball[] = [
      ...main.map((num) => ({ num, isBonus: false })),
      { num: bonus, isBonus: true },
    ];
    setBalls(next);
    setRevealedCount(0);
    setRolling(true);

    next.forEach((_, idx) => {
      setTimeout(() => {
        setRevealedCount(idx + 1);
        if (idx === next.length - 1) setRolling(false);
      }, 400 * (idx + 1));
    });
  };

  return (
    <section className={s.wrapper}>
      <header className={s.header}>
        <h2 className={s.title}>
          <span style={{ fontFamily: 'Tossface' }}>&#x1F3B1;</span> 로또 번호 추첨기
        </h2>
        <p className={s.subtitle}>버튼을 누르면 1~45 중 6개 + 보너스 번호를 뽑아드려요</p>
      </header>

      <div className={s.board}>
        {balls.length === 0 ? (
          <p className={s.empty}>아직 뽑은 번호가 없어요. 아래 버튼을 눌러보세요!</p>
        ) : (
          <div className={s.ballRow}>
            {balls.map((b, idx) => {
              const revealed = idx < revealedCount;
              return (
                <div key={idx} className={s.ballGroup}>
                  {b.isBonus && <span className={s.plus}>+</span>}
                  <div
                    className={`${s.ball} ${revealed ? s.revealed : s.rolling} ${b.isBonus ? s.bonus : ''}`}
                    style={{ background: revealed ? getBallColor(b.num) : '#E5E7EB' }}
                  >
                    {revealed ? b.num : '?'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <button className={s.button} onClick={draw} disabled={rolling}>
        {rolling ? '뽑는 중...' : balls.length === 0 ? '번호 뽑기' : '다시 뽑기'}
      </button>
    </section>
  );
}
