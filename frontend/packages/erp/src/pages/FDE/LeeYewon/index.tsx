import s from './LeeYewon.module.css';
import Lotto from './Lotto';

export default function LeeYewonHome() {
  return (
    <div className={s.container}>
      <h1 className={s.title}>이예원</h1>
      <p className={s.team}>BG운영지원팀</p>
      <Lotto />
    </div>
  );
}
