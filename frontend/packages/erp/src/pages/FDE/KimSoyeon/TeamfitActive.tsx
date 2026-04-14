import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getTeamfitActive } from '../../../api/fde';
import s from './TeamfitActive.module.css';

function toDateInput(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function TeamfitActive() {
  const [date, setDate] = useState(toDateInput(new Date()));

  const { data, isLoading, isError } = useQuery({
    queryKey: ['teamfit-active', date],
    queryFn: () => getTeamfitActive(date).then((r) => r.data),
  });

  return (
    <div className={s.container}>
      <div className={s.header}>
        <div>
          <h1 className={s.title}>팀버핏 유효회원</h1>
          <p className={s.subtitle}>지점별 · 일별 유효회원 현황</p>
        </div>
        <input
          type="date"
          className={s.datePicker}
          value={date}
          max={toDateInput(new Date())}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {isLoading && <p className={s.state}>불러오는 중...</p>}
      {isError && <p className={s.stateError}>데이터를 불러오지 못했습니다.</p>}

      {data && (
        <>
          <div className={s.totalBadge}>
            전체 <strong>{data.total.toLocaleString()}</strong>명
          </div>

          <table className={s.table}>
            <thead>
              <tr>
                <th>지점</th>
                <th>유효회원</th>
                <th>비율</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((row) => (
                <tr key={row.지점}>
                  <td>{row.지점}</td>
                  <td className={s.count}>{row.유효회원수.toLocaleString()}명</td>
                  <td>
                    <div className={s.barWrap}>
                      <div
                        className={s.bar}
                        style={{ width: `${(row.유효회원수 / (data.data[0]?.유효회원수 ?? 1)) * 100}%` }}
                      />
                      <span className={s.pct}>
                        {data.total > 0
                          ? ((row.유효회원수 / data.total) * 100).toFixed(1)
                          : 0}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
