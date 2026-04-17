import { useEffect, useState } from 'react';
import s from './GameRanking.module.css';
import { fetchTopScores, type GameId, type GameScore } from './gameScoresApi';

interface Props {
  game: GameId;
  title: string;
  highlightUserId?: number;
  limit?: number;
}

const MEDAL = ['🥇', '🥈', '🥉'];

function formatMeta(game: GameId, meta?: Record<string, unknown> | null): string {
  if (!meta) return '';
  if (game === 'tetris') {
    const lines = meta['lines'];
    const level = meta['level'];
    const parts: string[] = [];
    if (typeof lines === 'number') parts.push(`${lines}줄`);
    if (typeof level === 'number') parts.push(`Lv.${level}`);
    return parts.join(' · ');
  }
  return '';
}

export default function GameRanking({ game, title, highlightUserId, limit = 10 }: Props) {
  const [rows, setRows] = useState<GameScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchTopScores(game, limit)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '조회 실패');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [game, limit]);

  return (
    <section className={s.wrap}>
      <h3 className={s.title}>
        <span style={{ fontFamily: 'Tossface' }}>&#x1F3C6;</span> {title}
      </h3>
      {loading && <p className={s.empty}>불러오는 중...</p>}
      {error && <p className={s.error}>{error}</p>}
      {!loading && !error && rows.length === 0 && (
        <p className={s.empty}>아직 기록이 없어요. 1등이 되어보세요!</p>
      )}
      {!loading && !error && rows.length > 0 && (
        <ol className={s.list}>
          {rows.map((r, i) => (
            <li
              key={`${r.user_id}-${i}`}
              className={`${s.row} ${highlightUserId === r.user_id ? s.rowMe : ''}`}
            >
              <span className={s.rank}>
                {i < 3 ? (
                  <span style={{ fontFamily: 'Tossface', fontSize: 18 }}>{MEDAL[i]}</span>
                ) : (
                  `${i + 1}`
                )}
              </span>
              <div className={s.userBlock}>
                {r.user_photo ? (
                  <img src={r.user_photo} alt={r.user_name} className={s.photo} />
                ) : (
                  <div className={s.photoFallback}>{r.user_name.slice(0, 1)}</div>
                )}
                <div className={s.userInfo}>
                  <span className={s.userName}>{r.user_name}</span>
                  {formatMeta(game, r.meta) && (
                    <span className={s.meta}>{formatMeta(game, r.meta)}</span>
                  )}
                </div>
              </div>
              <span className={s.score}>{r.score.toLocaleString('ko-KR')}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
