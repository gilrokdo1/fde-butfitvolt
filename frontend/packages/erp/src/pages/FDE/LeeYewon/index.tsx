import s from './LeeYewon.module.css';

export default function LeeYewonHome() {
  return (
    <div className={s.container}>
      <h1 className={s.title}>이예원</h1>
      <p className={s.team}>BG운영지원팀</p>
      <div className={s.placeholder}>
        <span style={{ fontFamily: 'Tossface', fontSize: 48 }}>&#x1F680;</span>
        <p>여기에 내 기능을 만들어보세요!</p>
        <p className={s.hint}>이 파일을 수정하거나, 이 폴더에 새 페이지를 추가하세요.</p>
      </div>
    </div>
  );
}
