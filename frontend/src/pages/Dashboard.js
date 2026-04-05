import React, { useEffect, useState } from 'react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import KpiCard from '../components/KpiCard';
import {
  getDashboardSummary, getVendorValue, getAvailability,
  getTrend, getDatecodeDist,
} from '../api/client';

const PIE_COLORS = ['#6c63ff', '#ff6b6b', '#feca57', '#48dbfb', '#1dd1a1', '#ff9ff3', '#54a0ff', '#5f27cd'];
const DC_COLORS = {
  '2019': '#c62828', '2020': '#d84315', '2021': '#ef6c00',
  '2022': '#f9a825', '2023': '#2e7d32', '2024': '#1565c0',
  '2025': '#6c63ff', '2026': '#00897b',
};

function fmtKRW(v) {
  if (v >= 1e8) return '₩' + (v / 1e8).toFixed(1) + '억';
  if (v >= 1e4) return '₩' + (v / 1e4).toFixed(0) + '만';
  return '₩' + v.toLocaleString();
}

function fmtQty(v) {
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K';
  return v.toLocaleString();
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [trend, setTrend] = useState([]);
  const [dcDist, setDcDist] = useState([]);
  useEffect(() => {
    getDashboardSummary().then(r => setSummary(r.data)).catch(() => {});
    getVendorValue().then(r => setVendors(r.data)).catch(() => {});
    getAvailability().then(r => setAvailability(r.data)).catch(() => {});
    getTrend().then(r => setTrend(r.data)).catch(() => {});
    getDatecodeDist().then(r => setDcDist(r.data)).catch(() => {});
  }, []);

  if (!summary) return <div className="page-title">대시보드 로딩 중...</div>;

  return (
    <div>
      <h1 className="page-title">📊 대시보드</h1>

      {/* KPI 카드 */}
      <div className="kpi-grid">
        <KpiCard label="총 재고 금액" value={fmtKRW(summary.total_amount_krw)} />
        <KpiCard label="이번 달 출고" value={fmtQty(summary.monthly_outbound) + '개'} />
        <KpiCard label="긴급 재고" value={summary.urgent_count + '건'} sub="DATECODE 2년 초과" urgent />
        <KpiCard label="노후 재고 금액" value={fmtKRW(summary.urgent_amount_krw)} sub="DATECODE 2년 초과" urgent />
      </div>

      <div className="charts-grid">
        {/* DATECODE 연도별 분포 */}
        <div className="chart-card">
          <h3>📅 DATECODE 연도별 재고 분포</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={dcDist}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => v.toLocaleString() + '개'} />
              <Bar dataKey="quantity" name="수량">
                {dcDist.map((entry, i) => (
                  <Cell key={i} fill={DC_COLORS[entry.year] || '#6c63ff'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 월간 출고 추이 */}
        <div className="chart-card">
          <h3>📈 월간 출고 추이</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => v.toLocaleString() + '개'} />
              <Bar dataKey="outbound" name="출고수량" fill="#ff6b6b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 벤더별 금액 */}
        <div className="chart-card">
          <h3>💰 벤더(SR#)별 재고 금액</h3>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={vendors} dataKey="amount_krw" nameKey="vender"
                cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                {vendors.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => fmtKRW(v)} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '0 8px' }}>
            {(() => {
              const totalKrw = vendors.reduce((s, v) => s + (v.amount_krw || 0), 0);
              return vendors.map((v, i) => {
                const pct = totalKrw > 0 ? ((v.amount_krw || 0) / totalKrw * 100).toFixed(1) : '0';
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, minWidth: 100 }}>{v.vender}</span>
                    <div style={{ flex: 1, height: 6, background: '#eee', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: pct + '%', height: '100%', background: PIE_COLORS[i % PIE_COLORS.length], borderRadius: 3 }} />
                    </div>
                    <span style={{ color: '#555', whiteSpace: 'nowrap', minWidth: 70, textAlign: 'right', fontSize: 11 }}>{fmtKRW(v.amount_krw)}</span>
                    <span style={{ color: '#999', whiteSpace: 'nowrap', minWidth: 40, textAlign: 'right', fontSize: 11 }}>{pct}%</span>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* FAMILY별 재고수량 */}
        <div className="chart-card">
          <h3>📊 FAMILY별 재고수량</h3>
          <ResponsiveContainer width="100%" height={Math.max(280, availability.slice(0, 10).length * 36 + 40)}>
            <BarChart data={availability.slice(0, 10)} layout="vertical" margin={{ left: 110, top: 5, bottom: 5, right: 20 }} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="family" width={105} tick={{ fontSize: 10 }} interval={0} />
              <Tooltip formatter={(v) => v.toLocaleString() + '개'} />
              <Bar dataKey="total_qty" name="재고수량" fill="#6c63ff" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
