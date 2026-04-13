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
  const [allItems, setAllItems] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);

  // 컬럼별 필터
  const [colFilters, setColFilters] = useState({});
  const [sortBy, setSortBy] = useState('');
  const [sortDir, setSortDir] = useState('desc');

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

  // 드롭다운 외부 클릭 닫기
  useEffect(() => {
    const handler = () => setOpenFilter(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // 전체 데이터 1회 로드
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getInventoryGrouped({ page: 1, page_size: 9999 });
      setAllItems(res.data.items);
    } catch { setAllItems([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // 컬럼별 필터 적용 (정확 매칭)
  const filteredItems = allItems.filter(row => {
    for (const [col, val] of Object.entries(colFilters)) {
      if (!val) continue;
      if (String(row[col] || '') !== val) return false;
    }
    return true;
  });

  // 정렬
  const sortedItems = [...filteredItems].sort((a, b) => {
    if (!sortBy) return 0;
    let va = a[sortBy], vb = b[sortBy];
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  // 페이지네이션
  const pageSize = 50;
  const [page, setPage] = useState(1);
  const totalPages = Math.ceil(sortedItems.length / pageSize);
  const items = sortedItems.slice((page - 1) * pageSize, page * pageSize);
  const total = sortedItems.length;

  const handleSort = (col) => {
    if (sortBy === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
    setPage(1);
  };

  const sortIcon = (col) => {
    if (sortBy !== col) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  };

  const updateColFilter = (col, val) => {
    setColFilters(f => ({ ...f, [col]: val }));
    setPage(1);
  };

  // 드롭다운 필터
  const [openFilter, setOpenFilter] = useState(null);

  const getUniqueValues = (col) => {
    const vals = new Set();
    allItems.forEach(row => {
      const v = row[col];
      if (v !== null && v !== undefined && v !== '') vals.add(String(v));
    });
    return [...vals].sort();
  };

  const toggleFilter = (col, e) => {
    e.stopPropagation();
    setOpenFilter(openFilter === col ? null : col);
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
          <button className="btn btn-sm btn-outline" onClick={() => { setColFilters({}); setPage(1); }}>필터 초기화</button>
          <div className="spacer" />
          <button className="btn btn-sm btn-success" onClick={handleExport} disabled={exporting}>
            {exporting ? '다운로드 중...' : '엑셀 내보내기'}
          </button>
          <span style={{ fontSize: 13, color: '#888' }}>
            {total < allItems.length ? `${total.toLocaleString()} / ${allItems.length.toLocaleString()}건 (필터)` : `총 ${total.toLocaleString()}건`}
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              {(() => {
                const cols = [
                  { key: 'central', label: 'Central', filter: true },
                  { key: 'sales_team', label: 'Sales team', filter: true },
                  { key: 'vender', label: 'VENDER', filter: true },
                  { key: 'sr_code', label: 'SR#', filter: true },
                  { key: 'family', label: 'FAMILY', filter: true },
                  { key: 'did', label: 'DID#', filter: true },
                  { key: 'part_number', label: 'Part#', sort: true, filter: true },
                  { key: 'mobis_id', label: 'MOBIS ID' },
                  { key: 'unit', label: 'unit', filter: true },
                  { key: 'site', label: 'site', filter: true },
                  { key: 'moq', label: 'MOQ', sort: true },
                  { key: 'package', label: 'Package', filter: true },
                  { key: 'fab', label: 'FAB', filter: true },
                  { key: 'current_qty', label: "Q'ty", sort: true },
                  { key: 'sales_person', label: 'SALES', filter: true },
                  { key: 'customer', label: 'CUSTOMER', filter: true },
                  { key: 'crd', label: 'CRD' },
                  { key: 'booking', label: 'booking', sort: true },
                  { key: 'available_qty', label: 'available', sort: true },
                  { key: 'dc_2019', label: 'DC 2019' },
                  { key: 'dc_2020', label: 'DC 2020' },
                  { key: 'dc_2021', label: 'DC 2021' },
                  { key: 'dc_2022', label: 'DC 2022' },
                  { key: 'dc_2023', label: 'DC 2023' },
                  { key: 'dc_2024', label: 'DC 2024' },
                  { key: 'dc_2025', label: 'DC 2025' },
                  { key: 'dc_2026', label: 'DC 2026' },
                  { key: 'total_inbound', label: '총입고', sort: true },
                  { key: 'total_outbound', label: '총출고', sort: true },
                  { key: 'prev_month_balance', label: '전월' },
                  { key: 'total_stock', label: '실재고', sort: true },
                  { key: 'total_out_qty', label: '출고합' },
                  { key: 'lot_count', label: '로트' },
                  { key: 'max_days', label: '경과일', sort: true },
                  { key: 'total_krw', label: '금액(KRW)', sort: true },
                  { key: 'worst_urgency', label: '노후도', filter: true },
                ];
                return (
                  <tr>
                    {cols.map(col => (
                      <th key={col.key} style={{ position: 'relative', whiteSpace: 'nowrap', cursor: col.sort ? 'pointer' : 'default' }}
                        onClick={col.sort ? () => handleSort(col.key) : undefined}>
                        {col.label}{col.sort ? sortIcon(col.key) : ''}
                        {col.filter && (
                          <span onClick={e => toggleFilter(col.key, e)}
                            style={{ marginLeft: 4, cursor: 'pointer', fontSize: 10, color: colFilters[col.key] ? '#6c63ff' : '#bbb' }}>
                            ▼
                          </span>
                        )}
                        {colFilters[col.key] && (
                          <span style={{ display: 'inline-block', width: 6, height: 6, background: '#6c63ff', borderRadius: '50%', marginLeft: 3, verticalAlign: 'middle' }} />
                        )}
                        {openFilter === col.key && (
                          <div onClick={e => e.stopPropagation()}
                            style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, background: '#fff', border: '1px solid #ddd',
                              borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', minWidth: 160, maxHeight: 300, overflowY: 'auto', padding: 4 }}>
                            <div onClick={() => { updateColFilter(col.key, ''); setOpenFilter(null); }}
                              style={{ padding: '6px 10px', cursor: 'pointer', fontWeight: 600, color: '#6c63ff', borderBottom: '1px solid #eee', fontSize: 12 }}>
                              (전체)
                            </div>
                            {getUniqueValues(col.key).map(v => (
                              <div key={v} onClick={() => { updateColFilter(col.key, v); setOpenFilter(null); }}
                                style={{ padding: '5px 10px', cursor: 'pointer', fontSize: 12, background: colFilters[col.key] === v ? '#f0f0ff' : '#fff' }}
                                onMouseEnter={e => e.target.style.background = '#f5f5f5'}
                                onMouseLeave={e => e.target.style.background = colFilters[col.key] === v ? '#f0f0ff' : '#fff'}>
                                {v}
                              </div>
                            ))}
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                );
              })()}
            </thead>
            <tbody>
              {items.map(row => (
                <React.Fragment key={row.part_number}>
                  {/* Part# 그룹 행 */}
                  <tr className={'urgency-' + row.worst_urgency}
                      style={{ cursor: 'pointer' }}
                      onClick={() => togglePn(row.part_number)}>
                    <td>{row.central || '-'}</td>
                    <td>{row.sales_team || '-'}</td>
                    <td>{row.vender}</td>
                    <td>{row.sr_code || '-'}</td>
                    <td>{row.family}</td>
                    <td>{row.did || '-'}</td>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {expandedPn === row.part_number ? '▼ ' : '▶ '}{row.part_number}
                    </td>
                    <td>{row.mobis_id || '-'}</td>
                    <td>{row.unit || '-'}</td>
                    <td>{row.site || '-'}</td>
                    <td style={{ textAlign: 'right' }}>{row.moq ? row.moq.toLocaleString() : '-'}</td>
                    <td>{row.package || '-'}</td>
                    <td>{row.fab || '-'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{row.current_qty ? row.current_qty.toLocaleString() : '-'}</td>
                    <td>{row.sales_person || '-'}</td>
                    <td>{row.customer}</td>
                    <td>{row.crd || '-'}</td>
                    <td style={{ textAlign: 'right' }}>{row.booking ? row.booking.toLocaleString() : '-'}</td>
                    <td style={{ textAlign: 'right' }}>{row.available_qty ? row.available_qty.toLocaleString() : '-'}</td>
                    <td style={{ textAlign: 'right' }}>{row.dc_2019 || '-'}</td>
                    <td style={{ textAlign: 'right' }}>{row.dc_2020 || '-'}</td>
                    <td style={{ textAlign: 'right' }}>{row.dc_2021 || '-'}</td>
                    <td style={{ textAlign: 'right' }}>{row.dc_2022 || '-'}</td>
                    <td style={{ textAlign: 'right' }}>{row.dc_2023 || '-'}</td>
                    <td style={{ textAlign: 'right' }}>{row.dc_2024 || '-'}</td>
                    <td style={{ textAlign: 'right' }}>{row.dc_2025 || '-'}</td>
                    <td style={{ textAlign: 'right' }}>{row.dc_2026 || '-'}</td>
                    <td style={{ textAlign: 'right' }}>{row.total_inbound ? row.total_inbound.toLocaleString() : '-'}</td>
                    <td style={{ textAlign: 'right' }}>{row.total_outbound ? row.total_outbound.toLocaleString() : '-'}</td>
                    <td style={{ textAlign: 'right' }}>{row.prev_month_balance ? row.prev_month_balance.toLocaleString() : '-'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{row.total_stock.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{row.total_out_qty ? row.total_out_qty.toLocaleString() : '-'}</td>
                    <td style={{ textAlign: 'center' }}>{row.lot_count}</td>
                    <td style={{ textAlign: 'right' }}>{row.max_days.toLocaleString()}일</td>
                    <td style={{ textAlign: 'right' }}>{row.total_krw ? '₩' + row.total_krw.toLocaleString() : '-'}</td>
                    <td><span className={'urgency-tag ' + row.worst_urgency} title={urgencyTooltip[row.worst_urgency]}>{urgencyLabel[row.worst_urgency]}</span></td>
                  </tr>

                  {/* 로트 목록 (Part# 펼침) */}
                  {expandedPn === row.part_number && (
                    <tr>
                      <td colSpan={36} style={{ padding: 0, background: '#f8f9fa' }}>
                        <div style={{ padding: '8px 12px' }}>
                          <h4 style={{ margin: '0 0 8px' }}>DATECODE 로트 ({lotsTotal}건) — 클릭하면 입출고 내역</h4>
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
                                          <td colSpan={36} style={{ padding: 0 }}>
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
                <tr><td colSpan={36} style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>
                  {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                      <div style={{ width: 24, height: 24, border: '3px solid #e0e0e0', borderTopColor: '#6c63ff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      로딩 중...
                      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    </div>
                  ) : '데이터가 없습니다'}
                </td></tr>
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
