import React, { useEffect, useState, useCallback } from 'react';
import { getInventory, getUrgentInventory, getDailyInventory } from '../api/client';

const urgencyLabel = { normal: '정상', warning: '주의', critical: '긴급' };
const urgencyTooltip = {
  normal: '정상: DATECODE 기준 1년 미만 경과',
  warning: '주의: DATECODE 기준 1~2년 경과',
  critical: '긴급: DATECODE 기준 2년 초과',
};

export default function Inventory() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [filters, setFilters] = useState({
    search: '', status: '', urgency: '', sales_team: '',
    sort_by: 'di.id', sort_dir: 'desc',
  });
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [dailyData, setDailyData] = useState(null);
  const [dailyMonth, setDailyMonth] = useState('');

  const load = useCallback(async () => {
    try {
      const params = { page, page_size: pageSize, ...filters };
      Object.keys(params).forEach(k => { if (!params[k]) delete params[k]; });
      const res = urgentOnly
        ? await getUrgentInventory({ page, page_size: pageSize })
        : await getInventory(params);
      setItems(res.data.items);
      setTotal(res.data.total);
    } catch { setItems([]); setTotal(0); }
  }, [page, pageSize, filters, urgentOnly]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / pageSize);

  const handleSort = (col) => {
    setFilters(f => ({
      ...f, sort_by: col,
      sort_dir: f.sort_by === col && f.sort_dir === 'asc' ? 'desc' : 'asc',
    }));
    setPage(1);
  };

  const sortIcon = (col) => {
    if (filters.sort_by !== col) return '';
    return filters.sort_dir === 'asc' ? ' ▲' : ' ▼';
  };

  const toggleDaily = async (id, partNumber) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDailyData(null);
      return;
    }
    setExpandedId(id);
    try {
      const res = await getDailyInventory(partNumber);
      setDailyData(res.data);
      setDailyMonth(res.data.year_month);
    } catch { setDailyData(null); }
  };

  const changeDailyMonth = async (partNumber, ym) => {
    setDailyMonth(ym);
    try {
      const res = await getDailyInventory(partNumber, ym);
      setDailyData(res.data);
    } catch {}
  };

  return (
    <div>
      <h1 className="page-title">📦 재고 현황</h1>

      <div className="table-container">
        <div className="table-toolbar">
          <input placeholder="검색 (Part#, SR#, 고객, FAMILY, VENDER)"
            value={filters.search}
            onChange={e => { setFilters(f => ({ ...f, search: e.target.value })); setPage(1); }} />
          <select value={filters.sales_team} onChange={e => { setFilters(f => ({ ...f, sales_team: e.target.value })); setPage(1); }}>
            <option value="">전체 영업실</option>
            <option value="영업1실">영업1실</option>
            <option value="영업2실">영업2실</option>
          </select>
          <select value={filters.status} onChange={e => { setFilters(f => ({ ...f, status: e.target.value })); setPage(1); }}>
            <option value="">전체 상태</option>
            <option value="사용가능">사용가능</option>
            <option value="완료">완료</option>
            <option value="대기">대기</option>
          </select>
          <select value={filters.urgency} onChange={e => { setFilters(f => ({ ...f, urgency: e.target.value })); setPage(1); setUrgentOnly(false); }}>
            <option value="">전체 노후도</option>
            <option value="normal">정상</option>
            <option value="warning">주의</option>
            <option value="critical">긴급</option>
          </select>
          <button className={'btn btn-sm ' + (urgentOnly ? 'btn-danger' : 'btn-outline')}
            onClick={() => { setUrgentOnly(!urgentOnly); setPage(1); }}>
            🔴 긴급만 보기
          </button>
          <div className="spacer" />
          <span style={{ fontSize: 13, color: '#888' }}>총 {total.toLocaleString()}건</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th onClick={() => handleSort('di.part_number')}>Part#{sortIcon('di.part_number')}</th>
                <th>FAMILY</th>
                <th>VENDER</th>
                <th onClick={() => handleSort('di.datecode')}>DATECODE{sortIcon('di.datecode')}</th>
                <th onClick={() => handleSort('di.actual_stock')}>실재고{sortIcon('di.actual_stock')}</th>
                <th>총입고</th>
                <th>총출고</th>
                <th>전월이월</th>
                <th onClick={() => handleSort('di.days_elapsed')}>경과일{sortIcon('di.days_elapsed')}</th>
                <th>MOBIS ID</th>
                <th>MOQ</th>
                <th>보관</th>
                <th>상태</th>
                <th onClick={() => handleSort('di.amount_krw')}>금액(KRW){sortIcon('di.amount_krw')}</th>
                <th onClick={() => handleSort('di.urgency')}>노후도{sortIcon('di.urgency')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map(row => (
                <React.Fragment key={row.id}>
                  <tr className={'urgency-' + row.urgency}
                      style={{ cursor: 'pointer' }}
                      onClick={() => toggleDaily(row.id, row.part_number)}>
                    <td style={{ fontWeight: 600 }}>
                      {expandedId === row.id ? '▼ ' : '▶ '}{row.part_number}
                    </td>
                    <td>{row.family}</td>
                    <td>{row.vender}</td>
                    <td>{row.datecode}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{row.actual_stock.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{row.total_inbound ? row.total_inbound.toLocaleString() : '-'}</td>
                    <td style={{ textAlign: 'right' }}>{row.total_outbound ? row.total_outbound.toLocaleString() : '-'}</td>
                    <td style={{ textAlign: 'right' }}>{row.prev_month_balance ? row.prev_month_balance.toLocaleString() : '-'}</td>
                    <td style={{ textAlign: 'right' }}>{row.days_elapsed.toLocaleString()}일</td>
                    <td style={{ fontSize: 11 }}>{row.mobis_id}</td>
                    <td style={{ textAlign: 'right' }}>{row.moq ? row.moq.toLocaleString() : '-'}</td>
                    <td>{row.site}</td>
                    <td><span className={'status-badge ' + row.status}>{row.status}</span></td>
                    <td style={{ textAlign: 'right' }}>{row.amount_krw ? '₩' + row.amount_krw.toLocaleString() : '-'}</td>
                    <td><span className={'urgency-tag ' + row.urgency} title={urgencyTooltip[row.urgency]}>{urgencyLabel[row.urgency]}</span></td>
                  </tr>
                  {expandedId === row.id && dailyData && (
                    <tr>
                      <td colSpan={15} style={{ padding: 0 }}>
                        <div className="daily-panel">
                          <div className="daily-header">
                            <h4>📅 {row.part_number} — 일별 입출고</h4>
                            {dailyData.available_months && dailyData.available_months.length > 0 && (
                              <select value={dailyMonth}
                                onChange={e => changeDailyMonth(row.part_number, e.target.value)}
                                style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ddd', fontSize: 12 }}>
                                {dailyData.available_months.map(m => (
                                  <option key={m} value={m}>{m}</option>
                                ))}
                              </select>
                            )}
                          </div>
                          {dailyData.days.length === 0 ? (
                            <p style={{ color: '#888', fontSize: 12, padding: '8px 0' }}>해당 월 데이터 없음</p>
                          ) : (
                            <div className="daily-grid">
                              <div className="daily-row daily-row-header">
                                <span className="daily-label"></span>
                                {Array.from({length: 31}, (_, i) => (
                                  <span key={i} className="daily-cell daily-cell-header">{i + 1}</span>
                                ))}
                              </div>
                              <div className="daily-row daily-row-in">
                                <span className="daily-label">입고</span>
                                {Array.from({length: 31}, (_, i) => {
                                  const d = dailyData.days.find(x => x.day === i + 1);
                                  const v = d ? d.inbound : 0;
                                  return <span key={i} className={'daily-cell' + (v > 0 ? ' has-value in' : '')}>{v > 0 ? v.toLocaleString() : ''}</span>;
                                })}
                              </div>
                              <div className="daily-row daily-row-out">
                                <span className="daily-label">출고</span>
                                {Array.from({length: 31}, (_, i) => {
                                  const d = dailyData.days.find(x => x.day === i + 1);
                                  const v = d ? d.outbound : 0;
                                  return <span key={i} className={'daily-cell' + (v > 0 ? ' has-value out' : '')}>{v > 0 ? v.toLocaleString() : ''}</span>;
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={15} style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>데이터가 없습니다</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="pagination">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>« 이전</button>
            <span>{page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>다음 »</button>
          </div>
        )}
      </div>
    </div>
  );
}
