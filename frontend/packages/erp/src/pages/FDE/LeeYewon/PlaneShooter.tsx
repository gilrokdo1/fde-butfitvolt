import { useEffect, useRef, useState } from 'react';
import s from './PlaneShooter.module.css';
import planeImageUrl from './plane.png';
import fireImageUrl from './fire.png';

const WIDTH = 360;
const HEIGHT = 560;
const PLAYER_WIDTH = 56;
const PLAYER_HEIGHT = 56;
const ENEMY_SIZE = 40;
const BULLET_WIDTH = 4;
const BULLET_HEIGHT = 12;
const PLAYER_SPEED = 5;
const BULLET_SPEED = 8;
const ENEMY_SPEED_MIN = 1.5;
const ENEMY_SPEED_MAX = 3.5;
const ENEMY_SPAWN_INTERVAL = 800;

type Bullet = { x: number; y: number };
type Enemy = { x: number; y: number; speed: number };

type GameState = 'ready' | 'playing' | 'over';

export default function PlaneShooter() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<GameState>('ready');
  const [score, setScore] = useState(0);
  const [best, setBest] = useState<number>(() => {
    const saved = localStorage.getItem('yewon_plane_best');
    return saved ? Number(saved) : 0;
  });

  const stateRef = useRef<GameState>('ready');
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const planeImage = new Image();
    planeImage.src = planeImageUrl;
    let planeImageReady = false;
    planeImage.onload = () => {
      planeImageReady = true;
    };

    const fireImage = new Image();
    fireImage.src = fireImageUrl;
    let fireImageReady = false;
    fireImage.onload = () => {
      fireImageReady = true;
    };

    let playerX = WIDTH / 2 - PLAYER_WIDTH / 2;
    const playerY = HEIGHT - PLAYER_HEIGHT - 20;
    let bullets: Bullet[] = [];
    let enemies: Enemy[] = [];
    let localScore = 0;
    let lastSpawn = 0;
    let lastShot = 0;
    const keys = new Set<string>();
    let rafId = 0;

    const reset = () => {
      playerX = WIDTH / 2 - PLAYER_WIDTH / 2;
      bullets = [];
      enemies = [];
      localScore = 0;
      lastSpawn = 0;
      lastShot = 0;
      setScore(0);
    };

    const spawnEnemy = () => {
      enemies.push({
        x: Math.random() * (WIDTH - ENEMY_SIZE),
        y: -ENEMY_SIZE,
        speed: ENEMY_SPEED_MIN + Math.random() * (ENEMY_SPEED_MAX - ENEMY_SPEED_MIN),
      });
    };

    const drawPlayer = () => {
      if (planeImageReady) {
        ctx.save();
        ctx.shadowColor = '#5B5FC7';
        ctx.shadowBlur = 16;
        ctx.drawImage(planeImage, playerX, playerY, PLAYER_WIDTH, PLAYER_HEIGHT);
        ctx.restore();
      } else {
        ctx.fillStyle = '#5B5FC7';
        ctx.fillRect(playerX, playerY, PLAYER_WIDTH, PLAYER_HEIGHT);
      }
    };

    const drawEnemy = (e: Enemy) => {
      if (fireImageReady) {
        ctx.save();
        ctx.shadowColor = '#FF7272';
        ctx.shadowBlur = 12;
        ctx.drawImage(fireImage, e.x, e.y, ENEMY_SIZE, ENEMY_SIZE);
        ctx.restore();
      } else {
        ctx.fillStyle = '#FF7272';
        ctx.fillRect(e.x, e.y, ENEMY_SIZE, ENEMY_SIZE);
      }
    };

    const drawBullet = (b: Bullet) => {
      ctx.fillStyle = '#FBC400';
      ctx.fillRect(b.x, b.y, BULLET_WIDTH, BULLET_HEIGHT);
    };

    const drawBackground = () => {
      ctx.fillStyle = '#0B0F2A';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      for (let i = 0; i < 30; i++) {
        const x = (i * 137) % WIDTH;
        const y = ((i * 97 + Date.now() / 30) % HEIGHT);
        ctx.fillRect(x, y, 2, 2);
      }
    };

    const tick = (t: number) => {
      drawBackground();

      if (stateRef.current === 'playing') {
        if (keys.has('ArrowLeft') || keys.has('a')) {
          playerX = Math.max(0, playerX - PLAYER_SPEED);
        }
        if (keys.has('ArrowRight') || keys.has('d')) {
          playerX = Math.min(WIDTH - PLAYER_WIDTH, playerX + PLAYER_SPEED);
        }
        if (keys.has(' ') && t - lastShot > 180) {
          bullets.push({ x: playerX + PLAYER_WIDTH / 2 - BULLET_WIDTH / 2, y: playerY });
          lastShot = t;
        }

        if (t - lastSpawn > ENEMY_SPAWN_INTERVAL) {
          spawnEnemy();
          lastSpawn = t;
        }

        bullets = bullets
          .map((b) => ({ ...b, y: b.y - BULLET_SPEED }))
          .filter((b) => b.y + BULLET_HEIGHT > 0);

        enemies = enemies
          .map((e) => ({ ...e, y: e.y + e.speed }))
          .filter((e) => e.y < HEIGHT);

        for (let i = enemies.length - 1; i >= 0; i--) {
          const e = enemies[i];
          if (!e) continue;
          for (let j = bullets.length - 1; j >= 0; j--) {
            const b = bullets[j];
            if (!b) continue;
            if (
              b.x < e.x + ENEMY_SIZE &&
              b.x + BULLET_WIDTH > e.x &&
              b.y < e.y + ENEMY_SIZE &&
              b.y + BULLET_HEIGHT > e.y
            ) {
              enemies.splice(i, 1);
              bullets.splice(j, 1);
              localScore += 10;
              setScore(localScore);
              break;
            }
          }
        }

        for (const e of enemies) {
          if (
            playerX < e.x + ENEMY_SIZE &&
            playerX + PLAYER_WIDTH > e.x &&
            playerY < e.y + ENEMY_SIZE &&
            playerY + PLAYER_HEIGHT > e.y
          ) {
            setState('over');
            setBest((prev) => {
              if (localScore > prev) {
                localStorage.setItem('yewon_plane_best', String(localScore));
                return localScore;
              }
              return prev;
            });
            break;
          }
        }
      }

      enemies.forEach(drawEnemy);
      bullets.forEach(drawBullet);
      if (stateRef.current !== 'ready') drawPlayer();

      if (stateRef.current === 'ready') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 22px Pretendard, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('시작하려면 클릭', WIDTH / 2, HEIGHT / 2);
        ctx.font = '13px Pretendard, sans-serif';
        ctx.fillText('← → 이동 / Space 발사', WIDTH / 2, HEIGHT / 2 + 28);
      }

      if (stateRef.current === 'over') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 28px Pretendard, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Game Over', WIDTH / 2, HEIGHT / 2 - 16);
        ctx.font = '16px Pretendard, sans-serif';
        ctx.fillText(`점수 ${localScore}`, WIDTH / 2, HEIGHT / 2 + 14);
        ctx.font = '13px Pretendard, sans-serif';
        ctx.fillText('클릭해서 다시 시작', WIDTH / 2, HEIGHT / 2 + 42);
      }

      rafId = requestAnimationFrame(tick);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      keys.add(e.key);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keys.delete(e.key);
    };
    const handleClick = () => {
      if (stateRef.current === 'ready' || stateRef.current === 'over') {
        reset();
        setState('playing');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    canvas.addEventListener('click', handleClick);
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      canvas.removeEventListener('click', handleClick);
    };
  }, []);

  return (
    <section className={s.wrapper}>
      <header className={s.header}>
        <h2 className={s.title}>
          <span style={{ fontFamily: 'Tossface' }}>&#x2708;&#xFE0F;</span> 비행기 슈팅
        </h2>
        <p className={s.subtitle}>적 비행기를 격추하세요</p>
      </header>

      <div className={s.scoreBar}>
        <div className={s.scoreItem}>
          <span className={s.scoreLabel}>점수</span>
          <span className={s.scoreValue}>{score}</span>
        </div>
        <div className={s.scoreItem}>
          <span className={s.scoreLabel}>최고</span>
          <span className={s.scoreValue}>{best}</span>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        className={s.canvas}
        tabIndex={0}
      />

      <p className={s.hint}>← → 방향키로 이동, Space로 발사</p>
    </section>
  );
}
