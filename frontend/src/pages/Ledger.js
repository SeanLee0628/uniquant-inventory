import React, { useEffect, useState, useCallback } from 'react';
import { getLedger, exportLedgerExcel } from '../api/client';

export default function Ledger() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('end_balance');
  const [sortDir, setSortDir] = useState('desc');
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = { page, page_size: pageSize, search: search || undefined, sort_by: sortBy, sort_dir: sortDir };
      const res = await getLedger(params);
      setItems(res.data.items);
      setTotal(res.data.total);
    } catch { setItems([]); setTotal(0); }
  }, [page, pageSize, search, sortBy, sortDir]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / pageSize);
  const fmt = (n) => n != null && n !== 0 ? n.toLocaleString() : '';
  const fmtD = (n) => n != null ? n.toLocaleString() : '-';

  const handleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
    setPage(1);
  };
  const si = (col) => sortBy !== col ? '' : (sortDir === 'asc' ? ' \u25B2' : ' \u25BC');

  const th = { padding: '3px 4px', whiteSpace: 'nowrap', fontSize: 9, textAlign: 'center', borderBottom: '1px solid #bbb', borderRight: '1px solid #ddd' };
  const tdR = { textAlign: 'right', padding: '2px 3px', fontSize: 10, borderRight: '1px solid #eee' };
  const tdL = { padding: '2px 3px', fontSize: 10, borderRight: '1px solid #eee' };
  const B = (c) => ({ borderLeft: `2px solid ${c}` });

  // 4컬럼 헤더 반복: 수량 / Credit(차감) / 수량 / 금액(Credit)
  const sub4 = (bg, bl) => (
    <>
      <th style={{ ...th, background: bg, ...(bl ? B(bl) : {}) }}>수량</th>
      <th style={{ ...th, background: bg }}>Credit(차감)</th>
      <th style={{ ...th, background: bg }}>수량</th>
      <th style={{ ...th, background: bg }}>금액(Credit)</th>
    </>
  );

  // 4컬럼 데이터: qty, deduct, qty, credit
  const td4 = (qty, deduct, credit, bl, color) => (
    <>
      <td style={{ ...tdR, ...(bl ? B(bl) : {}), color: color || '' }}>{fmt(qty)}</td>
      <td style={{ ...tdR, color: '#888', fontSize: 9 }}>{fmtD(deduct)}</td>
      <td style={{ ...tdR, color: color || '' }}>{fmt(qty)}</td>
      <td style={{ ...tdR, color: '#888', fontSize: 9 }}>{fmt(credit)}</td>
    </>
  );

  return (
    <div>
      <h1 className="page-title" style={{ letterSpacing: 8, marginBottom: 4 }}>상 품 수 불 명 세 서</h1>

      <div className="table-container">
        <div className="table-toolbar">
          <input placeholder="검색 (Part#, FAMILY, VENDER, 고객)"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          <div className="spacer" />
          <button className="btn btn-sm btn-success" disabled={exporting} onClick={async () => {
            setExporting(true);
            try {
              const res = await exportLedgerExcel();
              const url = window.URL.createObjectURL(new Blob([res.data]));
              const a = document.createElement('a'); a.href = url;
              a.download = 'ledger_export.xlsx'; a.click();
              window.URL.revokeObjectURL(url);
            } catch { alert('내보내기 오류'); }
            setExporting(false);
          }}>{exporting ? '다운로드 중...' : '엑셀 내보내기'}</button>
          <span style={{ fontSize: 13, color: '#888' }}>총 {total.toLocaleString()}건</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ fontSize: 10, borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              {/* 대분류 */}
              <tr style={{ background: '#e8eaf6' }}>
                <th rowSpan={4} style={{ ...th, cursor: 'pointer' }} onClick={() => handleSort('part_number')}>DESCRIP{si('part_number')}</th>
                <th rowSpan={4} style={{ ...th, cursor: 'pointer' }} onClick={() => handleSort('vender')}>제조사{si('vender')}</th>
                <th rowSpan={4} style={th}>매입처</th>
                <th colSpan={16} style={{ ...th, background: '#c8e6c9', ...B('#4caf50') }}>입고</th>
                <th rowSpan={4} style={{ ...th, background: '#fff9c4', ...B('#fbc02d') }}>평균단가</th>
                <th colSpan={12} style={{ ...th, background: '#ffcdd2', ...B('#e53935') }}>당기출고</th>
                <th colSpan={4} style={{ ...th, background: '#bbdefb', ...B('#1e88e5') }}>기말재고</th>
              </tr>
              {/* 중분류 */}
              <tr style={{ background: '#f5f5f5' }}>
                <th colSpan={4} style={{ ...th, background: '#e8f5e9', ...B('#4caf50') }}>전기이월</th>
                <th colSpan={4} style={{ ...th, background: '#e8f5e9' }}>전월까지 누적입고</th>
                <th colSpan={4} style={{ ...th, background: '#e8f5e9' }}>당월입고</th>
                <th colSpan={4} style={{ ...th, background: '#e8f5e9' }}>(기초합산) 당기입고 계</th>
                <th colSpan={4} style={{ ...th, background: '#fce4ec', ...B('#e53935') }}>전월까지 누적출고</th>
                <th colSpan={4} style={{ ...th, background: '#fce4ec' }}>당월출고</th>
                <th colSpan={4} style={{ ...th, background: '#fce4ec' }}>매출누계</th>
                <th colSpan={4} style={{ ...th, background: '#e3f2fd', ...B('#1e88e5') }}></th>
              </tr>
              {/* 소분류: 수량/Credit(차감)/수량/금액(Credit) 반복 */}
              <tr style={{ fontSize: 8, background: '#fafafa' }}>
                {sub4('#e8f5e9', '#4caf50')}
                {sub4('#e8f5e9')}
                {sub4('#e8f5e9')}
                {sub4('#e8f5e9')}
                {sub4('#fce4ec', '#e53935')}
                {sub4('#fce4ec')}
                {sub4('#fce4ec')}
                {sub4('#e3f2fd', '#1e88e5')}
              </tr>
            </thead>
            <tbody>
              {items.map(row => (
                <tr key={row.part_number} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ ...tdL, fontWeight: 600 }}>
                    {row.part_number}
                    {row.family && <span style={{ fontSize: 8, color: '#aaa', marginLeft: 2 }}>{row.family}</span>}
                  </td>
                  <td style={tdL}>{row.vender}</td>
                  <td style={tdL}>{row.customer || ''}</td>
                  {/* 전기이월 */}
                  {td4(row.carry_forward, row.carry_forward_deduct, row.carry_forward_credit, '#c8e6c9')}
                  {/* 전월까지 누적입고 */}
                  {td4(row.cum_in_prev, row.cum_in_prev_deduct, row.cum_in_prev_credit)}
                  {/* 당월입고 */}
                  {td4(row.cur_in, row.cur_in_deduct, row.cur_in_credit, null, '#2e7d32')}
                  {/* 당기입고 계 */}
                  {td4(row.in_grand, row.in_grand_deduct, row.in_grand_credit)}
                  {/* 평균단가 */}
                  <td style={{ ...tdR, ...B('#fff176'), background: '#fffde7', fontSize: 9 }}>
                    {row.avg_price_krw > 0 ? '\u20A9' + row.avg_price_krw.toLocaleString() : ''}
                  </td>
                  {/* 전월까지 누적출고 */}
                  {td4(row.cum_out_prev, row.cum_out_prev_deduct, row.cum_out_prev_credit, '#ffcdd2')}
                  {/* 당월출고 */}
                  {td4(row.cur_out, row.cur_out_deduct, row.cur_out_credit, null, '#c62828')}
                  {/* 매출누계 */}
                  {td4(row.cum_out_total, row.cum_out_total_deduct, row.cum_out_total_credit)}
                  {/* 기말재고 */}
                  {td4(row.end_balance, row.end_balance_deduct, row.end_balance_credit, '#bbdefb')}
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={36} style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>데이터가 없습니다</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="pagination">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>&laquo; 이전</button>
            <span>{page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>다음 &raquo;</button>
          </div>
        )}
      </div>
    </div>
  );
}
