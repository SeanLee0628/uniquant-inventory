import React, { useEffect, useState, useCallback } from 'react';
import { getInventoryGrouped, getPartLots, exportInventoryExcel } from '../api/client';

const urgencyLabel = { normal: '정상', warning: '주의', critical: '긴급' };
const urgencyTooltip = {
  normal: '정상: DATECODE 기준 1년 미만 경과',
  warning: '주의: DATECODE 기준 1~2년 경과',
  critical: '긴급: DATECODE 기준 2년 초과',
};

function buildLotDaily(row) {
  const days = {};
  if (row.inbound_date) {
    try {
      const d = new Date(row.inbound_date);
      if (!isNaN(d)) {
        const ym = row.inbound_date.substring(0, 7);
        if (!days[ym]) days[ym] = {};
        const day = d.getDate();
        if (!days[ym][day]) days[ym][day] = { inbound: 0, outbound: 0 };
        days[ym][day].inbound += (row.quantity || 0);
      }
    } catch {}
  }
  if (row.outbound_date && row.out_quantity > 0) {
    try {
      const d = new Date(row.outbound_date);
      if (!isNaN(d)) {
        const ym = row.outbound_date.substring(0, 7);
        if (!days[ym]) days[ym] = {};
        const day = d.getDate();
        if (!days[ym][day]) days[ym][day] = { inbound: 0, outbound: 0 };
        days[ym][day].outbound += row.out_quantity;
      }
    } catch {}
  }
  const months = Object.keys(days).sort().reverse();
  return { months, days };
}

export default function Inventory() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [filters, setFilters] = useState({
    search: '', status: '', urgency: '', sales_team: '',
    sort_by: 'total_stock', sort_dir: 'desc',
  });
  const [exporting, setExporting] = useState(false);

  // Part# 확장
  const [expandedPn, setExpandedPn] = useState(null);
  const [lots, setLots] = useState([]);
  const [lotsTotal, setLotsTotal] = useState(0);
  const [lotsPage, setLotsPage] = useState(1);
  const [lotsLoading, setLotsLoading] = useState(false);

  // 로트 달력 확장
  const [expandedLotId, setExpandedLotId] = useState(null);
  const [lotDaily, setLotDaily] = useState(null);
  const [dailyMonth, setDailyMonth] = useState('');

  const load = useCallback(async () => {
    try {
      const params = { page, page_size: pageSize, ...filters };
      Object.keys(params).forEach(k => { if (!params[k]) delete params[k]; });
      const res = await getInventoryGrouped(params);
      setItems(res.data.items);
      setTotal(res.data.total);
    } catch { setItems([]); setTotal(0); }
  }, [page, pageSize, filters]);

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

  const loadLots = async (partNumber, pg = 1) => {
    setLotsLoading(true);
    try {
      const res = await getPartLots(partNumber, pg, 10);
      setLots(res.data.items);
      setLotsTotal(res.data.total);
      setLotsPage(pg);
    } catch { setLots([]); setLotsTotal(0); }
    setLotsLoading(false);
  };

  const togglePn = async (partNumber) => {
    if (expandedPn === partNumber) {
      setExpandedPn(null);
      setLots([]);
      setExpandedLotId(null);
      setLotDaily(null);
      return;
    }
    setExpandedPn(partNumber);
    setExpandedLotId(null);
    setLotDaily(null);
    loadLots(partNumber, 1);
  };

  const toggleLotDaily = (id, row) => {
    if (expandedLotId === id) {
      setExpandedLotId(null);
      setLotDaily(null);
      return;
    }
    setExpandedLotId(id);
    const data = buildLotDaily(row);
    setLotDaily(data);
    setDailyMonth(data.months[0] || '');
  };

  const lotsTotalPages = Math.ceil(lotsTotal / 10);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await exportInventoryExcel();
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'inventory_export.xlsx';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('내보내기 중 오류가 발생했습니다.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">📦 재고 현황</h1>

      <div className="table-container">
        <div className="table-toolbar">
          <input placeholder="검색 (Part#, 고객, FAMILY, VENDER)"
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
          <select value={filters.urgency} onChange={e => { setFilters(f => ({ ...f, urgency: e.target.value })); setPage(1); }}>
            <option value="">전체 노후도</option>
            <option value="normal">정상</option>
            <option value="warning">주의</option>
            <option value="critical">긴급</option>
          </select>
          <div className="spacer" />
          <button className="btn btn-sm btn-success" onClick={handleExport} disabled={exporting}>
            {exporting ? '다운로드 중...' : '📥 엑셀 내보내기'}
          </button>
          <span style={{ fontSize: 13, color: '#888' }}>총 {total.toLocaleString()}건</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Part#</th>
                <th>FAMILY</th>
                <th>VENDER</th>
                <th>CUSTOMER</th>
                <th>총 실재고</th>
                <th>총 출고</th>
                <th>로트 수</th>
                <th>최대 경과일</th>
                <th>MOQ</th>
                <th>금액(KRW)</th>
                <th>노후도</th>
              </tr>
            </thead>
            <tbody>
              {items.map(row => (
                <React.Fragment key={row.part_number}>
                  {/* Part# 그룹 행 */}
                  <tr className={'urgency-' + row.worst_urgency}
                      style={{ cursor: 'pointer' }}
                      onClick={() => togglePn(row.part_number)}>
                    <td style={{ fontWeight: 600 }}>
                      {expandedPn === row.part_number ? '▼ ' : '▶ '}{row.part_number}
                    </td>
                    <td>{row.family}</td>
                    <td>{row.vender}</td>
                    <td>{row.customer}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{row.total_stock.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{row.total_out_qty ? row.total_out_qty.toLocaleString() : '-'}</td>
                    <td style={{ textAlign: 'center' }}>{row.lot_count}</td>
                    <td style={{ textAlign: 'right' }}>{row.max_days.toLocaleString()}일</td>
                    <td style={{ textAlign: 'right' }}>{row.moq ? row.moq.toLocaleString() : '-'}</td>
                    <td style={{ textAlign: 'right' }}>{row.total_krw ? '₩' + row.total_krw.toLocaleString() : '-'}</td>
                    <td><span className={'urgency-tag ' + row.worst_urgency} title={urgencyTooltip[row.worst_urgency]}>{urgencyLabel[row.worst_urgency]}</span></td>
                  </tr>

                  {/* 로트 목록 (Part# 펼침) */}
                  {expandedPn === row.part_number && (
                    <tr>
                      <td colSpan={11} style={{ padding: 0, background: '#f8f9fa' }}>
                        <div style={{ padding: '8px 12px' }}>
                          <h4 style={{ margin: '0 0 8px' }}>📋 {row.part_number} — DATECODE 로트 ({lotsTotal}건)</h4>
                          {lotsLoading ? (
                            <p style={{ color: '#888' }}>로딩 중...</p>
                          ) : (
                            <>
                              <table style={{ width: '100%' }}>
                                <thead>
                                  <tr>
                                    <th></th>
                                    <th>DATECODE</th>
                                    <th>입고일</th>
                                    <th>실재고</th>
                                    <th>입고수량</th>
                                    <th>출고수량</th>
                                    <th>출고일</th>
                                    <th>출고고객</th>
                                    <th>경과일</th>
                                    <th>상태</th>
                                    <th>금액(KRW)</th>
                                    <th>노후도</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {lots.map(lot => (
                                    <React.Fragment key={lot.id}>
                                      <tr className={'urgency-' + lot.urgency}
                                          style={{ cursor: 'pointer' }}
                                          onClick={(e) => { e.stopPropagation(); toggleLotDaily(lot.id, lot); }}>
                                        <td>{expandedLotId === lot.id ? '▼' : '▶'}</td>
                                        <td>{lot.datecode}</td>
                                        <td>{lot.inbound_date || '-'}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{lot.actual_stock.toLocaleString()}</td>
                                        <td style={{ textAlign: 'right' }}>{lot.quantity ? lot.quantity.toLocaleString() : '-'}</td>
                                        <td style={{ textAlign: 'right' }}>{lot.out_quantity ? lot.out_quantity.toLocaleString() : '-'}</td>
                                        <td>{lot.outbound_date || '-'}</td>
                                        <td>{lot.out_customer || '-'}</td>
                                        <td style={{ textAlign: 'right' }}>{lot.days_elapsed.toLocaleString()}일</td>
                                        <td><span className={'status-badge ' + lot.status}>{lot.status}</span></td>
                                        <td style={{ textAlign: 'right' }}>{lot.amount_krw ? '₩' + lot.amount_krw.toLocaleString() : '-'}</td>
                                        <td><span className={'urgency-tag ' + lot.urgency}>{urgencyLabel[lot.urgency]}</span></td>
                                      </tr>

                                      {/* 달력 (로트 펼침) */}
                                      {expandedLotId === lot.id && lotDaily && (
                                        <tr>
                                          <td colSpan={12} style={{ padding: 0 }}>
                                            <div className="daily-panel">
                                              <div className="daily-header">
                                                <h4>📅 입출고 내역</h4>
                                                {lot.inbound_date && <span style={{ fontSize: 12, color: '#666', marginLeft: 12 }}>
                                                  입고: {lot.inbound_date} ({lot.quantity ? lot.quantity.toLocaleString() : 0}개)
                                                </span>}
                                                {lot.outbound_date && lot.out_quantity > 0 && <span style={{ fontSize: 12, color: '#e74c3c', marginLeft: 12 }}>
                                                  출고: {lot.outbound_date} ({lot.out_quantity.toLocaleString()}개)
                                                </span>}
                                                {lotDaily.months.length > 0 && (
                                                  <select value={dailyMonth}
                                                    onChange={e => setDailyMonth(e.target.value)}
                                                    style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ddd', fontSize: 12, marginLeft: 12 }}>
                                                    {lotDaily.months.map(m => (
                                                      <option key={m} value={m}>{m}</option>
                                                    ))}
                                                  </select>
                                                )}
                                              </div>
                                              {!dailyMonth || !lotDaily.days[dailyMonth] ? (
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
                                                      const d = lotDaily.days[dailyMonth][i + 1];
                                                      const v = d ? d.inbound : 0;
                                                      return <span key={i} className={'daily-cell' + (v > 0 ? ' has-value in' : '')}>{v > 0 ? v.toLocaleString() : ''}</span>;
                                                    })}
                                                  </div>
                                                  <div className="daily-row daily-row-out">
                                                    <span className="daily-label">출고</span>
                                                    {Array.from({length: 31}, (_, i) => {
                                                      const d = lotDaily.days[dailyMonth][i + 1];
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
                                </tbody>
                              </table>
                              {lotsTotalPages > 1 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', fontSize: 13 }}>
                                  <button className="btn btn-sm btn-outline" disabled={lotsPage <= 1}
                                    onClick={(e) => { e.stopPropagation(); loadLots(row.part_number, lotsPage - 1); }}>« 이전</button>
                                  <span>{lotsPage} / {lotsTotalPages} ({lotsTotal}건)</span>
                                  <button className="btn btn-sm btn-outline" disabled={lotsPage >= lotsTotalPages}
                                    onClick={(e) => { e.stopPropagation(); loadLots(row.part_number, lotsPage + 1); }}>다음 »</button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={11} style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>데이터가 없습니다</td></tr>
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
