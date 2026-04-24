import { useState } from 'react';
import s from './LandlordSettlement.module.css';
import RevenueRaw from './RevenueRaw';

const TABS = [
  { id: 'dashboard', label: '매출보고 대시보드' },
  { id: 'raw', label: '매출내역 raw' },
];

export default function LandlordSettlement() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className={s.wrapper}>
      <div className={s.tabs}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`${s.tab} ${activeTab === tab.id ? s.activeTab : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={s.content}>
        {activeTab === 'dashboard' && (
          <iframe
            src="/sales-dashboard.html"
            className={s.frame}
            title="매출보고 대시보드"
          />
        )}
        {activeTab === 'raw' && <RevenueRaw />}
      </div>
    </div>
  );
}
