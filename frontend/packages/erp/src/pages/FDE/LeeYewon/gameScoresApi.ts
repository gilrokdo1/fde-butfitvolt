/** 미니게임천국 — 점수 기록 / 랭킹 조회 API 헬퍼 */

export type GameId = 'plane' | 'tetris';

export interface GameScore {
  user_id: number;
  user_name: string;
  user_photo?: string | null;
  score: number;
  meta?: Record<string, unknown> | null;
  created_at: string;
  game?: string; // "all" 조회 시 존재
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem('auth_token') || '';
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `요청 실패 (${res.status})`);
  }
  return res.json();
}

export async function submitGameScore(
  game: GameId,
  score: number,
  meta?: Record<string, unknown>,
): Promise<void> {
  await request('/fde-api/yewon/games/scores', {
    method: 'POST',
    body: JSON.stringify({ game, score, meta }),
  });
}

export async function fetchTopScores(game: GameId, limit = 10): Promise<GameScore[]> {
  return request<GameScore[]>(`/fde-api/yewon/games/scores/${game}?limit=${limit}`);
}

export async function fetchAllTopScores(): Promise<GameScore[]> {
  return request<GameScore[]>(`/fde-api/yewon/games/scores/all`);
}
