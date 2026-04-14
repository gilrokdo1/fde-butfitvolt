import { useEffect, useState } from 'react';
import { getRanking, getGithubStats, getCommits, getDailyScores, type MemberRanking, type GithubStat, type CommitEntry, type DailyScoreEntry } from '../../api/fde';
import { MENU_CONFIG } from '../../config/menuConfig';
import s from './FDE1.module.css';

const MEMBER_MENU = MENU_CONFIG.filter((m) => m.image);

const MEMBER_COLORS: Record<string, string> = {
  '도길록':  '#5B5FC7',
  '김동하':  '#E86343',
  '김소연':  '#48B678',
  '김영신':  '#F5A623',
  '박민규':  '#9B59B6',
  '이예원':  '#E91E8C',
  '최지희':  '#FF5722',
  '최치환':  '#607D8B',
};

function getMemberImage(name: string): string | undefined {
  return MEMBER_MENU.find((m) => m.label === name)?.image;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

function formatEvaluated(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}.${d.getDate()} 평가`;
}

function todayYMD(): string {
  // KST(Asia/Seoul) 기준 오늘 날짜
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return parts; // YYYY-MM-DD
}

function catmullRomPath(points: [number, number][]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return '';
  const p = points;
  let d = `M ${p[0]![0]},${p[0]![1]}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i]!;
    const p1 = p[i]!;
    const p2 = p[i + 1]!;
    const p3 = p[i + 2] ?? p2;
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

function parseYMD(ymd: string): [number, number, number] {
  const parts = ymd.split('-').map(Number);
  return [parts[0] ?? 1970, parts[1] ?? 1, parts[2] ?? 1];
}

function addDays(ymd: string, n: number): string {
  const [y, m, d] = parseYMD(ymd);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function diffDays(a: string, b: string): number {
  const [ay, am, ad] = parseYMD(a);
  const [by, bm, bd] = parseYMD(b);
  const da = new Date(ay, am - 1, ad).getTime();
  const db = new Date(by, bm - 1, bd).getTime();
  return Math.round((db - da) / 86400000);
}

function DailyScoreChart({ entries }: { entries: DailyScoreEntry[] }) {
  if (entries.length === 0) {
    return <div className={s.chartEmpty}>아직 평가 데이터가 없습니다</div>;
  }

  const today = todayYMD();
  const START_DATE = '2026-04-14';
  const minDate = START_DATE;
  const totalDays = Math.max(1, diffDays(minDate, today));
  const dates: string[] = [];
  for (let i = 0; i <= totalDays; i++) dates.push(addDays(minDate, i));

  const byMember = new Map<string, Map<string, number>>();
  for (const e of entries) {
    if (e.avg_score == null) continue;
    if (e.date < minDate || e.date > today) continue;
    if (!byMember.has(e.member_name)) byMember.set(e.member_name, new Map());
    byMember.get(e.member_name)!.set(e.date, e.avg_score);
  }

  const width = 880;
  const height = 240;
  const padL = 32;
  const padR = 12;
  const padT = 12;
  const padB = 28;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const xOf = (date: string) => {
    if (dates.length === 1) return padL + innerW / 2;
    return padL + (diffDays(minDate, date) / totalDays) * innerW;
  };
  const maxScore = Math.max(
    1,
    ...Array.from(byMember.values()).flatMap((m) => Array.from(m.values())),
  );
  // 10단위로 올림해서 여유 있게
  const yMax = Math.max(10, Math.ceil(maxScore / 10) * 10);

  const yOf = (v: number) => padT + innerH - (v / yMax) * innerH;

  const tickStep = yMax <= 20 ? 5 : yMax <= 50 ? 10 : 25;
  const yTicks: number[] = [];
  for (let t = 0; t <= yMax; t += tickStep) yTicks.push(t);

  // X tick 간격 자동 (라벨 겹침 방지)
  const maxLabels = 12;
  const step = Math.max(1, Math.ceil(dates.length / maxLabels));
  const xLabelDates = dates.filter((_, i) => i % step === 0 || i === dates.length - 1);

  return (
    <div className={s.chartWrap}>
      <svg viewBox={`0 0 ${width} ${height}`} className={s.chartSvg} preserveAspectRatio="none">
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={width - padR} y1={yOf(t)} y2={yOf(t)} stroke="#e5e7eb" strokeWidth={1} />
            <text x={padL - 6} y={yOf(t) + 3} fontSize={10} textAnchor="end" fill="#9ca3af">{t}</text>
          </g>
        ))}
        {xLabelDates.map((d) => {
          const [, m, day] = d.split('-');
          return (
            <text key={d} x={xOf(d)} y={height - 10} fontSize={10} textAnchor="middle" fill="#9ca3af">
              {Number(m)}/{Number(day)}
            </text>
          );
        })}
        {Array.from(byMember.entries()).map(([name, pts]) => {
          const color = MEMBER_COLORS[name] ?? '#9ca3af';
          const sorted = Array.from(pts.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
          const coords: [number, number][] = sorted.map(([d, v]) => [xOf(d), yOf(v)]);
          const pathD = catmullRomPath(coords);
          return (
            <g key={name}>
              {pathD && (
                <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              )}
              {sorted.map(([d, v]) => (
                <circle key={d} cx={xOf(d)} cy={yOf(v)} r={3} fill={color}>
                  <title>{name} · {d} · {v}점</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      <div className={s.chartLegend}>
        {Array.from(byMember.keys()).sort().map((name) => (
          <span key={name} className={s.legendItem}>
            <span className={s.legendDot} style={{ background: MEMBER_COLORS[name] ?? '#9ca3af' }} />
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function FDE1() {
  const [ranking, setRanking] = useState<MemberRanking[]>([]);
  const [githubStats, setGithubStats] = useState<GithubStat[]>([]);
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [dailyScores, setDailyScores] = useState<DailyScoreEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ranking' | 'git'>('ranking');

  useEffect(() => {
    Promise.all([
      getRanking().then((r) => setRanking(r.data.ranking)),
      getGithubStats().then((r) => setGithubStats(r.data.stats)),
      getCommits().then((r) => setCommits(r.data.commits)),
      getDailyScores().then((r) => setDailyScores(r.data.daily_scores)),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const getGithub = (name: string) => githubStats.find((g) => g.member_name === name);

  if (loading) {
    return <div className={s.container}><p className={s.loading}>로딩 중...</p></div>;
  }

  const gitPanel = (
    <div className={s.gitPanel}>
      <h2 className={s.panelTitle}>Git 히스토리</h2>
      <div className={s.commitList}>
        {commits.length === 0 && (
          <p className={s.emptyMsg}>커밋 데이터를 불러오는 중...</p>
        )}
        {commits.map((c) => {
          const color = c.member_name ? (MEMBER_COLORS[c.member_name] ?? '#9ca3af') : '#9ca3af';
          const commitImage = c.member_name ? getMemberImage(c.member_name) : undefined;
          return (
            <div key={c.sha} className={s.commitItem}>
              <div className={s.commitDot} style={{ background: color }} />
              <div className={s.commitBody}>
                <div className={s.commitMeta}>
                  {c.member_name && (
                    <>
                      {commitImage ? (
                        <img src={commitImage} alt={c.member_name} className={s.commitAvatar} />
                      ) : (
                        <span className={s.commitAvatarFallback} style={{ background: color }}>
                          {c.member_name[0]}
                        </span>
                      )}
                      <span className={s.commitAuthor} style={{ color }}>
                        {c.member_name}
                      </span>
                    </>
                  )}
                  {!c.member_name && c.author_login && (
                    <span className={s.commitAuthor} style={{ color: '#9ca3af' }}>
                      @{c.author_login}
                    </span>
                  )}
                  <span className={s.commitDate}>{formatDate(c.date)}</span>
                </div>
                <p className={s.commitMessage}>{c.message}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const rankingPanel = (
    <div className={s.rankingPanel}>
      <h2 className={s.panelTitle}>문제해결 점수 랭킹</h2>
      <div className={s.rankingList}>
        {ranking.map((member) => {
          const gh = getGithub(member.member_name);
          const image = getMemberImage(member.member_name);
          const color = MEMBER_COLORS[member.member_name] ?? '#5B5FC7';
          const isTop3 = member.rank <= 3;

          return (
            <div
              key={member.member_name}
              className={`${s.rankItem} ${isTop3 ? s.topRank : ''}`}
              style={isTop3 ? { borderColor: color } : undefined}
            >
              {/* 상단: 순위 + 아바타 + 이름 + 점수 */}
              <div className={s.cardTop}>
                <span className={s.rank} style={isTop3 ? { color } : undefined}>
                  #{member.rank}
                </span>
                {image ? (
                  <img src={image} alt={member.member_name} className={s.avatar} />
                ) : (
                  <div className={s.avatarFallback} style={{ background: color }}>
                    {member.member_name[0]}
                  </div>
                )}
                <div className={s.nameBlock}>
                  <span className={s.name}>{member.member_name}</span>
                  {member.evaluated_at && (
                    <span className={s.evaluatedAt}>{formatEvaluated(member.evaluated_at)}</span>
                  )}
                </div>
                <span className={s.score} style={{ color }}>{member.problem_score}점</span>
              </div>

              {/* 중간: 통계 뱃지 */}
              <div className={s.badges}>
                <span className={s.badge}>방문 {member.visit_count}</span>
                {gh && gh.pr_count > 0 && (
                  <span className={s.badge}>PR {gh.pr_count}</span>
                )}
                {gh && gh.commit_count > 0 && (
                  <span className={s.badge}>커밋 {gh.commit_count}</span>
                )}
                {(!gh || (gh.pr_count === 0 && gh.commit_count === 0)) && (
                  <span className={s.badgeEmpty}>GitHub 활동 없음</span>
                )}
              </div>

              {/* 하단: 에이전트 평가 문장 */}
              {member.score_reason ? (
                <p className={s.reason}>"{member.score_reason}"</p>
              ) : (
                <p className={s.reasonEmpty}>아직 평가가 없습니다</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className={s.container}>
      <div className={s.header}>
        <h1 className={s.title}>FDE 1기</h1>
      </div>

      {/* 일별 점수 그래프 */}
      <div className={s.chartCard}>
        <h2 className={s.chartTitle}>일별 점수 추이</h2>
        <DailyScoreChart entries={dailyScores} />
      </div>

      {/* 모바일 탭 */}
      <div className={s.tabs}>
        <button
          className={`${s.tab} ${activeTab === 'ranking' ? s.tabActive : ''}`}
          onClick={() => setActiveTab('ranking')}
        >
          랭킹
        </button>
        <button
          className={`${s.tab} ${activeTab === 'git' ? s.tabActive : ''}`}
          onClick={() => setActiveTab('git')}
        >
          Git 히스토리
        </button>
      </div>

      {/* 데스크탑: 좌우 분할 */}
      <div className={s.splitLayout}>
        {rankingPanel}
        {gitPanel}
      </div>

      {/* 모바일: 탭 전환 */}
      <div className={s.mobileContent}>
        {activeTab === 'ranking' ? rankingPanel : gitPanel}
      </div>
    </div>
  );
}
