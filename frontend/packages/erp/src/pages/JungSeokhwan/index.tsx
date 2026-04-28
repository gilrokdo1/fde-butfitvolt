import s from './JungSeokhwan.module.css';

export default function JungSeokhwanHome() {
  return (
    <div className={s.container}>
      <header className={s.header}>
        <div>
          <h1 className={s.title}>P&L 시뮬레이터</h1>
          <p className={s.team}>BG 신도림·가산·상도·정석환</p>
        </div>
      </header>
    </div>
  );
}