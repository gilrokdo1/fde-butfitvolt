import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import s from './ParkMingyu.module.css';

interface Member {
  회원이름: string;
  연락처: string;
  지점: string;
  카테고리대분류: string;
  카테고리: string;
  상품명: string;
  가격: number;
  시작일: string;
  종료일: string;
  이용상태: string;
  체험정규: string | null;
  출석수: number;
  결제상태: string;
}

interface MembersResponse {
  members: Member[];
  total: number;
  page: number;
  limit: number;
  summary: {
    active_count: number;
    recently_expired: number;
    refund_count: number;
    total: number;
  };
  places: string[];
  categories: string[];
}

const STATUS_COLORS: Record<string, string> = {
  이용중: '#22c55e',
  만료: '#94a3b8',
  완료: '#94a3b8',
  휴회: '#f59e0b',
  환불: '#ef4444',
  휴면: '#8b5cf6',
  해지예약: '#f97316',
  지난: '#94a3b8',
};

function formatDate(d: string | null) {
  if (!d) return '-';
  return d.slice(0, 10);
}

function formatPrice(n: number | null) {
  if (n == null) return '-';
  return n.toLocaleString('ko-KR') + '원';
}

export default function MemberTable() {
  const [place, setPlace] = useState('all');
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('all');
  const [page, setPage] = useState(1);
  const limit = 50;

  const { data, isLoading, isError } = useQuery<MembersResponse>({
    queryKey: ['parkmingyu-members', place, status, category, page],
    queryFn: async () => {
      const res = await api.get('/fde-api/parkmingyu/members', {
        params: { place, status, category, page, limit },
      });
      return res.data;
    },
  });

  const totalPages = data ? Math.ceil(data.total / limit) : 1;

  return (
    <div className={s.container}>
      <div className={s.header}>
        <div>
          <h1 className={s.title}>박민규</h1>
          <p className={s.team}>TB SV — 회원 멤버십 조회</p>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className={s.cards}>
        <div className={s.card}>
          <span className={s.cardLabel}>이용 중</span>
          <span className={s.cardValue} style={{ color: '#22c55e' }}>
            {data ? data.summary.active_count.toLocaleString() : '-'}
          </span>
        </div>
        <div className={s.card}>
          <span className={s.cardLabel}>최근 30일 만료</span>
          <span className={s.cardValue} style={{ color: '#f59e0b' }}>
            {data ? data.summary.recently_expired.toLocaleString() : '-'}
          </span>
        </div>
        <div className={s.card}>
          <span className={s.cardLabel}>환불</span>
          <span className={s.cardValue} style={{ color: '#ef4444' }}>
            {data ? data.summary.refund_count.toLocaleString() : '-'}
          </span>
        </div>
        <div className={s.card}>
          <span className={s.cardLabel}>전체 조회</span>
          <span className={s.cardValue}>
            {data ? data.summary.total.toLocaleString() : '-'}
          </span>
        </div>
      </div>

      {/* 필터 */}
      <div className={s.filters}>
        <select
          className={s.select}
          value={place}
          onChange={(e) => { setPlace(e.target.value); setPage(1); }}
        >
          <option value="all">전체 지점</option>
          {data?.places.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        <select
          className={s.select}
          value={category}
          onChange={(e) => { setCategory(e.target.value); setPage(1); }}
        >
          <option value="all">전체 카테고리</option>
          {data?.categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select
          className={s.select}
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
        >
          <option value="all">전체 상태</option>
          {['이용중', '만료', '완료', '휴회', '환불', '휴면', '해지예약', '지난'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {data && (
          <span className={s.resultCount}>
            총 {data.total.toLocaleString()}건 / {page} / {totalPages} 페이지
          </span>
        )}
      </div>

      {/* 테이블 */}
      <div className={s.tableWrap}>
        {isLoading && <div className={s.state}>불러오는 중...</div>}
        {isError && <div className={s.stateError}>데이터 조회 중 오류가 발생했습니다.</div>}
        {!isLoading && !isError && data && (
          <table className={s.table}>
            <thead>
              <tr>
                <th>회원명</th>
                <th>연락처</th>
                <th>지점</th>
                <th>카테고리</th>
                <th>상품명</th>
                <th>가격</th>
                <th>시작일</th>
                <th>종료일</th>
                <th>이용상태</th>
                <th>구분</th>
                <th>출석수</th>
              </tr>
            </thead>
            <tbody>
              {data.members.map((m, i) => (
                <tr key={i}>
                  <td className={s.nameCell}>{m.회원이름}</td>
                  <td className={s.mono}>{m.연락처}</td>
                  <td>{m.지점}</td>
                  <td>{m.카테고리대분류}</td>
                  <td className={s.productCell}>{m.상품명}</td>
                  <td className={s.mono}>{formatPrice(m.가격)}</td>
                  <td className={s.mono}>{formatDate(m.시작일)}</td>
                  <td className={s.mono}>{formatDate(m.종료일)}</td>
                  <td>
                    <span
                      className={s.badge}
                      style={{ background: (STATUS_COLORS[m.이용상태] ?? '#94a3b8') + '22', color: STATUS_COLORS[m.이용상태] ?? '#94a3b8' }}
                    >
                      {m.이용상태}
                    </span>
                  </td>
                  <td>
                    {m.체험정규 && (
                      <span className={m.체험정규 === '정규' ? s.badgeRegular : s.badgeTrial}>
                        {m.체험정규}
                      </span>
                    )}
                  </td>
                  <td className={s.mono}>{m.출석수 ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 페이지네이션 */}
      {data && totalPages > 1 && (
        <div className={s.pagination}>
          <button className={s.pageBtn} onClick={() => setPage(1)} disabled={page === 1}>{'<<'}</button>
          <button className={s.pageBtn} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>{'<'}</button>
          <span className={s.pageInfo}>{page} / {totalPages}</span>
          <button className={s.pageBtn} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>{'>'}</button>
          <button className={s.pageBtn} onClick={() => setPage(totalPages)} disabled={page === totalPages}>{'>>'}</button>
        </div>
      )}
    </div>
  );
}
