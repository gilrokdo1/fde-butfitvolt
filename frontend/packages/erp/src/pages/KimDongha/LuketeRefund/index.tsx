import s from './LuketeRefund.module.css';

export default function LuketeRefund() {
  return (
    <div className={s.container}>
      <iframe
        src="/lukete/"
        className={s.frame}
        title="루케테80 환불 산정 대시보드"
      />
    </div>
  );
}
