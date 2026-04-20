import { useEffect, useRef, useState } from 'react';
import s from './Tetris.module.css';
import GameRanking from './GameRanking';
import { submitGameScore } from './gameScoresApi';
import { useAuth } from '../../../contexts/AuthContext';

const COLS = 10;
const ROWS = 20;
const CELL = 28;
const BOARD_W = COLS * CELL;
const BOARD_H = ROWS * CELL;

type Cell = number; // 0 = empty, 1~7 = piece type
type Board = Cell[][];

const COLORS: Record<number, string> = {
  0: '#1A1F3A',
  1: '#5BC0EB', // I 청록
  2: '#FBC400', // O 노랑
  3: '#9D4EDD', // T 보라
  4: '#06D6A0', // S 초록
  5: '#FF6B6B', // Z 빨강
  6: '#4361EE', // J 파랑
  7: '#F77F00', // L 주황
};

// 7종 블록 — 회전 상태별 셀 좌표
const SHAPES: number[][][][] = [
  [], // 0 placeholder
  // I
  [
    [[0, 1], [1, 1], [2, 1], [3, 1]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[1, 0], [1, 1], [1, 2], [1, 3]],
  ],
  // O
  [
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    [[0, 0], [1, 0], [0, 1], [1, 1]],
  ],
  // T
  [
    [[1, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [1, 2]],
    [[1, 0], [0, 1], [1, 1], [1, 2]],
  ],
  // S
  [
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[1, 1], [2, 1], [0, 2], [1, 2]],
    [[0, 0], [0, 1], [1, 1], [1, 2]],
  ],
  // Z
  [
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[2, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 0], [0, 1], [1, 1], [0, 2]],
  ],
  // J
  [
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [0, 2], [1, 2]],
  ],
  // L
  [
    [[2, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 1], [0, 2]],
    [[0, 0], [1, 0], [1, 1], [1, 2]],
  ],
];

function createBoard(): Board {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function randomPiece(): number {
  return Math.floor(Math.random() * 7) + 1;
}

interface Piece {
  type: number;
  rot: number;
  x: number;
  y: number;
}

function getCells(p: Piece): [number, number][] {
  const shape = SHAPES[p.type]?.[p.rot];
  if (!shape) return [];
  return shape.map(([dx, dy]) => [p.x + (dx as number), p.y + (dy as number)]);
}

function collides(board: Board, p: Piece): boolean {
  for (const [x, y] of getCells(p)) {
    if (x < 0 || x >= COLS || y >= ROWS) return true;
    if (y >= 0 && board[y]?.[x]) return true;
  }
  return false;
}

function mergePiece(board: Board, p: Piece): Board {
  const next = board.map((row) => [...row]);
  for (const [x, y] of getCells(p)) {
    if (y >= 0 && y < ROWS && x >= 0 && x < COLS) {
      next[y]![x] = p.type;
    }
  }
  return next;
}

function clearLines(board: Board): { board: Board; cleared: number } {
  const remain = board.filter((row) => row.some((c) => !c));
  const cleared = ROWS - remain.length;
  const filled: Board = Array.from({ length: cleared }, () => Array(COLS).fill(0));
  return { board: [...filled, ...remain], cleared };
}

function spawnPiece(type: number): Piece {
  return { type, rot: 0, x: 3, y: type === 1 ? -1 : 0 };
}

const SCORE_PER_LINE = [0, 100, 300, 500, 800];

type GameState = 'ready' | 'playing' | 'over';

export default function Tetris() {
  const { user } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nextCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<GameState>('ready');
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [level, setLevel] = useState(1);
  const [finalStats, setFinalStats] = useState<{ score: number; lines: number; level: number }>({
    score: 0,
    lines: 0,
    level: 1,
  });
  const [rankingKey, setRankingKey] = useState(0);
  const [best, setBest] = useState(() => {
    const saved = localStorage.getItem('yewon_tetris_best');
    return saved ? Number(saved) : 0;
  });

  const stateRef = useRef<GameState>('ready');
  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const nextCanvas = nextCanvasRef.current;
    if (!canvas || !nextCanvas) return;
    const ctx = canvas.getContext('2d');
    const nctx = nextCanvas.getContext('2d');
    if (!ctx || !nctx) return;

    let board: Board = createBoard();
    let piece: Piece = spawnPiece(randomPiece());
    let nextType: number = randomPiece();
    let localScore = 0;
    let localLines = 0;
    let localLevel = 1;
    let dropCounter = 0;
    let lastTime = 0;
    let rafId = 0;

    const reset = () => {
      board = createBoard();
      piece = spawnPiece(randomPiece());
      nextType = randomPiece();
      localScore = 0;
      localLines = 0;
      localLevel = 1;
      dropCounter = 0;
      setScore(0);
      setLines(0);
      setLevel(1);
    };

    const getDropInterval = () => Math.max(80, 800 - (localLevel - 1) * 70);

    const drawCell = (c: CanvasRenderingContext2D, x: number, y: number, type: number, size = CELL) => {
      const color = COLORS[type] || '#1A1F3A';
      c.fillStyle = color;
      c.fillRect(x, y, size, size);
      if (type > 0) {
        c.fillStyle = 'rgba(255,255,255,0.25)';
        c.fillRect(x, y, size, 3);
        c.fillRect(x, y, 3, size);
        c.fillStyle = 'rgba(0,0,0,0.25)';
        c.fillRect(x, y + size - 3, size, 3);
        c.fillRect(x + size - 3, y, 3, size);
      }
    };

    const drawBoard = () => {
      ctx.fillStyle = '#0B0F2A';
      ctx.fillRect(0, 0, BOARD_W, BOARD_H);
      // 그리드
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      for (let i = 1; i < COLS; i++) {
        ctx.beginPath();
        ctx.moveTo(i * CELL, 0);
        ctx.lineTo(i * CELL, BOARD_H);
        ctx.stroke();
      }
      for (let j = 1; j < ROWS; j++) {
        ctx.beginPath();
        ctx.moveTo(0, j * CELL);
        ctx.lineTo(BOARD_W, j * CELL);
        ctx.stroke();
      }

      // 놓인 블록
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const v = board[y]?.[x];
          if (v) drawCell(ctx, x * CELL, y * CELL, v);
        }
      }

      // 고스트 (바닥 예측)
      const ghost: Piece = { ...piece };
      while (!collides(board, { ...ghost, y: ghost.y + 1 })) ghost.y++;
      ctx.save();
      ctx.globalAlpha = 0.25;
      for (const [x, y] of getCells(ghost)) {
        if (y >= 0) drawCell(ctx, x * CELL, y * CELL, piece.type);
      }
      ctx.restore();

      // 현재 조각
      for (const [x, y] of getCells(piece)) {
        if (y >= 0) drawCell(ctx, x * CELL, y * CELL, piece.type);
      }
    };

    const drawNext = () => {
      const NC = 20;
      nctx.fillStyle = '#0B0F2A';
      nctx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
      const shape = SHAPES[nextType]?.[0];
      if (!shape) return;
      const xs = shape.map((c) => c[0] as number);
      const ys = shape.map((c) => c[1] as number);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const offX = (nextCanvas.width - (Math.max(...xs) - minX + 1) * NC) / 2;
      const offY = (nextCanvas.height - (Math.max(...ys) - minY + 1) * NC) / 2;
      for (const [x, y] of shape) {
        drawCell(nctx, offX + ((x as number) - minX) * NC, offY + ((y as number) - minY) * NC, nextType, NC);
      }
    };

    const spawnNext = () => {
      piece = spawnPiece(nextType);
      nextType = randomPiece();
      if (collides(board, piece)) {
        setState('over');
        setFinalStats({ score: localScore, lines: localLines, level: localLevel });
        setBest((prev) => {
          if (localScore > prev) {
            localStorage.setItem('yewon_tetris_best', String(localScore));
            return localScore;
          }
          return prev;
        });
        if (localScore > 0) {
          submitGameScore('tetris', localScore, { lines: localLines, level: localLevel })
            .then(() => setRankingKey((k) => k + 1))
            .catch(() => {});
        }
      }
    };

    const lockPiece = () => {
      board = mergePiece(board, piece);
      const { board: cleared, cleared: n } = clearLines(board);
      board = cleared;
      if (n > 0) {
        localLines += n;
        localScore += (SCORE_PER_LINE[n] ?? 0) * localLevel;
        localLevel = Math.floor(localLines / 10) + 1;
        setScore(localScore);
        setLines(localLines);
        setLevel(localLevel);
      }
      spawnNext();
    };

    const softDrop = () => {
      const moved = { ...piece, y: piece.y + 1 };
      if (collides(board, moved)) {
        lockPiece();
      } else {
        piece = moved;
      }
    };

    const hardDrop = () => {
      while (!collides(board, { ...piece, y: piece.y + 1 })) {
        piece.y++;
        localScore += 2;
      }
      setScore(localScore);
      lockPiece();
    };

    const tryMove = (dx: number) => {
      const moved = { ...piece, x: piece.x + dx };
      if (!collides(board, moved)) piece = moved;
    };

    const tryRotate = () => {
      const rotated = { ...piece, rot: (piece.rot + 1) % 4 };
      // 벽 킥 시도
      for (const kick of [0, -1, 1, -2, 2]) {
        const test = { ...rotated, x: rotated.x + kick };
        if (!collides(board, test)) {
          piece = test;
          return;
        }
      }
    };

    const tick = (t: number) => {
      if (stateRef.current === 'playing') {
        if (!lastTime) lastTime = t;
        const delta = t - lastTime;
        lastTime = t;
        dropCounter += delta;
        if (dropCounter > getDropInterval()) {
          dropCounter = 0;
          softDrop();
        }
      } else {
        lastTime = 0;
      }

      drawBoard();
      drawNext();

      if (stateRef.current === 'ready') {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, BOARD_W, BOARD_H);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 22px Pretendard, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('시작하려면 클릭', BOARD_W / 2, BOARD_H / 2 - 16);
        ctx.font = '12px Pretendard, sans-serif';
        ctx.fillText('← → 이동 / ↓ 소프트드롭', BOARD_W / 2, BOARD_H / 2 + 12);
        ctx.fillText('↑ 회전 / Space 하드드롭', BOARD_W / 2, BOARD_H / 2 + 32);
      }

      if (stateRef.current === 'over') {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, BOARD_W, BOARD_H);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 26px Pretendard, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Game Over', BOARD_W / 2, BOARD_H / 2 - 20);
        ctx.font = '14px Pretendard, sans-serif';
        ctx.fillText(`점수 ${localScore}`, BOARD_W / 2, BOARD_H / 2 + 6);
        ctx.font = '12px Pretendard, sans-serif';
        ctx.fillText('클릭해서 다시 시작', BOARD_W / 2, BOARD_H / 2 + 32);
      }

      rafId = requestAnimationFrame(tick);
    };

    const handleKey = (e: KeyboardEvent) => {
      if (stateRef.current !== 'playing') return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' '].includes(e.key)) {
        e.preventDefault();
      }
      if (e.key === 'ArrowLeft') tryMove(-1);
      else if (e.key === 'ArrowRight') tryMove(1);
      else if (e.key === 'ArrowDown') softDrop();
      else if (e.key === 'ArrowUp') tryRotate();
      else if (e.key === ' ') hardDrop();
    };

    const handleClick = () => {
      if (stateRef.current === 'ready' || stateRef.current === 'over') {
        reset();
        setState('playing');
      }
    };

    window.addEventListener('keydown', handleKey);
    canvas.addEventListener('click', handleClick);
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', handleKey);
      canvas.removeEventListener('click', handleClick);
    };
  }, []);

  return (
    <section className={s.wrapper}>
      <header className={s.header}>
        <h2 className={s.title}>
          <span style={{ fontFamily: 'Tossface' }}>&#x1F9E9;</span> 테트리스
        </h2>
      </header>

      <div className={s.body}>
        <canvas
          ref={canvasRef}
          width={BOARD_W}
          height={BOARD_H}
          className={s.canvas}
        />
        <aside className={s.sidebar}>
          <div className={s.stat}>
            <span className={s.statLabel}>점수</span>
            <span className={s.statValue}>{score}</span>
          </div>
          <div className={s.stat}>
            <span className={s.statLabel}>최고</span>
            <span className={s.statValue}>{best}</span>
          </div>
          <div className={s.stat}>
            <span className={s.statLabel}>라인</span>
            <span className={s.statValue}>{lines}</span>
          </div>
          <div className={s.stat}>
            <span className={s.statLabel}>레벨</span>
            <span className={s.statValue}>{level}</span>
          </div>
          <div className={s.nextBox}>
            <span className={s.statLabel}>NEXT</span>
            <canvas ref={nextCanvasRef} width={100} height={80} className={s.nextCanvas} />
          </div>
          <div className={s.controls}>
            <div><kbd>←→</kbd> 이동</div>
            <div><kbd>↓</kbd> 소프트드롭</div>
            <div><kbd>↑</kbd> 회전</div>
            <div><kbd>Space</kbd> 하드드롭</div>
          </div>
        </aside>
      </div>

      {state === 'over' && (
        <div className={s.gameOverPanel}>
          <div className={s.finalStats}>
            <div className={s.finalStatItem}>
              <span className={s.finalStatLabel}>점수</span>
              <span className={s.finalStatValue}>{finalStats.score.toLocaleString('ko-KR')}</span>
            </div>
            <div className={s.finalStatItem}>
              <span className={s.finalStatLabel}>라인</span>
              <span className={s.finalStatValue}>{finalStats.lines}</span>
            </div>
            <div className={s.finalStatItem}>
              <span className={s.finalStatLabel}>레벨</span>
              <span className={s.finalStatValue}>{finalStats.level}</span>
            </div>
          </div>
          <GameRanking
            key={rankingKey}
            game="tetris"
            title="테트리스 랭킹 TOP 10"
            highlightUserId={user?.id}
          />
        </div>
      )}
    </section>
  );
}
