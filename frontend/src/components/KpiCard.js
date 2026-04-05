import React from 'react';

export default function KpiCard({ label, value, sub, urgent }) {
  return (
    <div className={`kpi-card${urgent ? ' urgent' : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}
