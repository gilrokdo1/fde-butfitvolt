import { useState, type ComponentType } from 'react';
import s from './GameHub.module.css';
import Lotto from './Lotto';
import PlaneShooter from './PlaneShooter';

type GameId = 'lotto' | 'plane';

type Game = {
  id: GameId;
  icon: string;
  name: string;
  description: string;
  component: ComponentType;
};

const GAMES: Game[] = [
  {
    id: 'lotto',
    icon: '\u{1F3B1}',
    name: '로또 번호',
    description: '1~45 중 6개 + 보너스 번호',
    component: Lotto,
  },
  {
    id: 'plane',
    icon: '\u{2708}\u{FE0F}',
    name: '비행기 슈팅',
    description: '← → 이동 / Space 발사',
    component: PlaneShooter,
  },
];

export default function GameHub() {
  const [selected, setSelected] = useState<GameId | null>(null);

  if (selected) {
    const game = GAMES.find((g) => g.id === selected);
    if (!game) return null;
    const GameComponent = game.component;
    return (
      <div>
        <button className={s.backButton} onClick={() => setSelected(null)}>
          <span>&larr;</span> 미니게임천국
        </button>
        <GameComponent />
      </div>
    );
  }

  return (
    <section className={s.wrapper}>
      <header className={s.header}>
        <h2 className={s.title}>
          <span style={{ fontFamily: 'Tossface' }}>&#x1F3AE;</span> 미니게임천국
        </h2>
        <p className={s.subtitle}>원하는 게임을 선택하세요</p>
      </header>

      <div className={s.grid}>
        {GAMES.map((game) => (
          <button
            key={game.id}
            className={s.card}
            onClick={() => setSelected(game.id)}
          >
            <span className={s.cardIcon} style={{ fontFamily: 'Tossface' }}>
              {game.icon}
            </span>
            <span className={s.cardName}>{game.name}</span>
            <span className={s.cardDesc}>{game.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
