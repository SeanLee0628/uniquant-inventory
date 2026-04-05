import React, { useEffect, useState, useCallback } from 'react';
import { getInventory } from '../api/client';

const urgencyLabel = { normal: '정상', warning: '주의', critical: '긴급' };
const urgencyTooltip = {
  normal: '정상: DATECODE 기준 1년 미만 경과',
  warning: '주의: DATECODE 기준 1~2년 경과',
  critical: '긴급: DATECODE 기준 2년 초과',
};

export default function Datecode() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [team, setTeam] = useState('영업1실');
  const [filters, setFilters] = useState({
    search: '', status: '', urgency: '',
    sort_by: 'di.id', sort_dir: 'desc',
  });

  const load = useCallback(async () => {
    try {
      const params = {
        page, page_size: pageSize, sales_team: team,
        ...filters,
      };
      Object.keys(params).forEach(k => { if (!params[k]) delete params[k]; });
      const res = await getInventory(params);
      setItems(res.data.items);
      setTotal(res.data.total);
    } catch { setItems([]); setTotal(0); }
  }, [page, pageSize, team, filters]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / pageSize);

  const handleSort = (col) => {
    setFilters(f => ({
      ...f,
      sort_by: col,
      sort_dir: f.sort_by === col && f.sort_dir === 'asc' ? 'desc' : 'asc',
    }));
    setPage(1);
  };

  const sortIcon = (col) => {
    if (filters.sort_by !== col) return '';
    return filters.sort_dir === 'asc' ? ' ▲' : ' ▼';
  };

  return (
    <div>
      <h1 className="page-title">📄 DATECODE 원장</h1>

      {/* 영업실 탭 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['영업1실', '영업2실'].map(t => (
          <button key={t}
            className={'btn btn-sm ' + (team === t ? 'btn-primary' : 'btn-outline')}
            onClick={() => { setTeam(t); setPage(1); }}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="table-container">
        <div className="table-toolbar">
          <input
            placeholder="검색 (Part#, SR#, 고객, SALES)"
            value={filters.search}
            onChange={e => { setFilters(f => ({ ...f, search: e.target.value })); setPage(1); }}
          />
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
          <span style={{ fontSize: 13, color: '#888' }}>{team} | 총 {total.toLocaleString()}건</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th onClick={() => handleSort('di.inbound_date')}>입고일{sortIcon('di.inbound_date')}</th>
                <th>SR#</th>
                <th onClick={() => handleSort('di.part_number')}>PART#{sortIcon('di.part_number')}</th>
                <th>입고수량</th>
                <th onClick={() => handleSort('di.datecode')}>DATECODE{sortIcon('di.datecode')}</th>
                <th>담당SALES</th>
                <th>CUSTOMER</th>
                <th onClick={() => handleSort('di.actual_stock')}>실재고{sortIcon('di.actual_stock')}</th>
                <th>출고일</th>
                <th>출고고객</th>
                <th>출고수량</th>
                <th>상태</th>
                <th>단가(USD)</th>
                <th>금액(USD)</th>
                <th>환율</th>
                <th onClick={() => handleSort('di.amount_krw')}>금액(KRW){sortIcon('di.amount_krw')}</th>
                <th onClick={() => handleSort('di.days_elapsed')}>경과일{sortIcon('di.days_elapsed')}</th>
                <th>노후도</th>
              </tr>
            </thead>
            <tbody>
              {items.map(row => (
                <tr key={row.id} className={'urgency-' + row.urgency}>
                  <td>{row.inbound_date}</td>
                  <td>{row.sr_number}</td>
                  <td style={{ fontWeight: 600 }}>{row.part_number}</td>
                  <td style={{ textAlign: 'right' }}>{row.quantity.toLocaleString()}</td>
                  <td>{row.datecode}</td>
                  <td>{row.sales_person}</td>
                  <td>{row.customer}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{row.actual_stock.toLocaleString()}</td>
                  <td>{row.outbound_date || ''}</td>
                  <td>{row.out_customer || ''}</td>
                  <td style={{ textAlign: 'right' }}>{row.out_quantity ? row.out_quantity.toLocaleString() : ''}</td>
                  <td><span className={'status-badge ' + row.status}>{row.status}</span></td>
                  <td style={{ textAlign: 'right' }}>{row.unit_price_usd ? row.unit_price_usd.toFixed(2) : ''}</td>
                  <td style={{ textAlign: 'right' }}>{row.amount_usd ? '$' + row.amount_usd.toLocaleString() : ''}</td>
                  <td style={{ textAlign: 'right' }}>{row.exchange_rate || ''}</td>
                  <td style={{ textAlign: 'right' }}>{row.amount_krw ? '₩' + row.amount_krw.toLocaleString() : ''}</td>
                  <td style={{ textAlign: 'right' }}>{row.days_elapsed.toLocaleString()}일</td>
                  <td><span className={'urgency-tag ' + row.urgency} title={urgencyTooltip[row.urgency]}>{urgencyLabel[row.urgency]}</span></td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={18} style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>데이터가 없습니다</td></tr>
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
