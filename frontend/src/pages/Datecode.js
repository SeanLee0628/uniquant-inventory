import React, { useEffect, useState, useCallback } from 'react';
import { getInventory, addInbound } from '../api/client';

const urgencyLabel = { normal: '정상', warning: '주의', critical: '긴급' };
const urgencyTooltip = {
  normal: '정상: DATECODE 기준 1년 미만 경과',
  warning: '주의: DATECODE 기준 1~2년 경과',
  critical: '긴급: DATECODE 기준 2년 초과',
};

const emptyForm = {
  inbound_date: new Date().toISOString().slice(0, 10),
  sr_number: '', part_number: '', quantity: '',
  datecode: '', sales_person: '', customer: '',
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

  // 입고 폼
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage('');
    try {
      const payload = {
        ...form,
        sales_team: team,
        quantity: parseInt(form.quantity) || 0,
      };
      await addInbound(payload);
      setMessage(`${form.part_number} ${form.quantity}개 입고 완료`);
      setForm({ ...emptyForm, inbound_date: new Date().toISOString().slice(0, 10) });
      load();
    } catch (err) {
      setMessage(err.response?.data?.detail || '입고 등록 실패');
    } finally {
      setSubmitting(false);
    }
  };

  const updateField = (field, value) => setForm(f => ({ ...f, [field]: value }));

  return (
    <div>
      <h1 className="page-title">DATECODE (입고 추가)</h1>

      {/* 영업실 탭 + 입고 버튼 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        {['영업1실', '영업2실'].map(t => (
          <button key={t}
            className={'btn btn-sm ' + (team === t ? 'btn-primary' : 'btn-outline')}
            onClick={() => { setTeam(t); setPage(1); }}
          >
            {t}
          </button>
        ))}
        <div className="spacer" />
        <button className={'btn btn-sm ' + (showForm ? 'btn-danger' : 'btn-success')}
          onClick={() => { setShowForm(!showForm); setMessage(''); }}>
          {showForm ? '✕ 닫기' : '+ 입고 추가'}
        </button>
      </div>

      {/* 입고 폼 */}
      {showForm && (
        <div className="table-container" style={{ marginBottom: 16, padding: 16 }}>
          <h3 style={{ margin: '0 0 12px' }}>📦 입고 등록 ({team})</h3>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, maxWidth: 500 }}>
              <label>
                <span style={{ fontSize: 12, color: '#666' }}>입고일 *</span>
                <input type="date" value={form.inbound_date} required style={{ width: '100%' }}
                  onChange={e => updateField('inbound_date', e.target.value)} />
              </label>
              <label>
                <span style={{ fontSize: 12, color: '#666' }}>SR#</span>
                <input value={form.sr_number} placeholder="SR#" style={{ width: '100%' }}
                  onChange={e => updateField('sr_number', e.target.value)} />
              </label>
              <label>
                <span style={{ fontSize: 12, color: '#666' }}>Part# *</span>
                <input value={form.part_number} required placeholder="Part#" style={{ width: '100%' }}
                  onChange={e => updateField('part_number', e.target.value)} />
              </label>
              <label>
                <span style={{ fontSize: 12, color: '#666' }}>Q'ty *</span>
                <input type="number" value={form.quantity} required placeholder="Q'ty" min="1" style={{ width: '100%' }}
                  onChange={e => updateField('quantity', e.target.value)} />
              </label>
              <label>
                <span style={{ fontSize: 12, color: '#666' }}>DATECODE</span>
                <input value={form.datecode} placeholder="예: 202614" style={{ width: '100%' }}
                  onChange={e => updateField('datecode', e.target.value)} />
              </label>
              <label>
                <span style={{ fontSize: 12, color: '#666' }}>담당 SALES</span>
                <input value={form.sales_person} placeholder="담당자" style={{ width: '100%' }}
                  onChange={e => updateField('sales_person', e.target.value)} />
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                <span style={{ fontSize: 12, color: '#666' }}>CUSTOMER</span>
                <input value={form.customer} placeholder="고객" style={{ width: '100%' }}
                  onChange={e => updateField('customer', e.target.value)} />
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                <button type="submit" className="btn btn-primary" disabled={submitting}
                  style={{ width: '100%' }}>
                  {submitting ? '등록 중...' : '입고 등록'}
                </button>
              </label>
            </div>
          </form>
          {message && (
            <p style={{ marginTop: 8, fontSize: 13, color: message.includes('실패') ? '#e74c3c' : '#27ae60', fontWeight: 600 }}>
              {message}
            </p>
          )}
        </div>
      )}

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
                <th>REMARK</th>
                <th onClick={() => handleSort('di.actual_stock')}>실재고{sortIcon('di.actual_stock')}</th>
                <th>출고일</th>
                <th>출고고객</th>
                <th>출고PART#</th>
                <th>출고수량</th>
                <th>출고SALES</th>
                <th>출고REMARK</th>
                <th>상태</th>
                <th>단가(USD)</th>
                <th>금액(USD)</th>
                <th>환율</th>
                <th onClick={() => handleSort('di.amount_krw')}>금액(KRW){sortIcon('di.amount_krw')}</th>
                <th title="DATECODE(YYYYWW)를 날짜로 환산">DC환산일</th>
                <th onClick={() => handleSort('di.days_elapsed')} title="오늘 - 데이트코드 환산일: 제조 후 현재까지 경과일수 (노후도)">경과일수(노후){sortIcon('di.days_elapsed')}</th>
                <th title="입고일 - 데이트코드 환산일: 제조 후 입고까지 걸린 일수">경과일수(리드타임)</th>
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
                  <td>{row.remark || ''}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{row.actual_stock.toLocaleString()}</td>
                  <td>{row.outbound_date || ''}</td>
                  <td>{row.out_customer || ''}</td>
                  <td>{row.out_part_number || ''}</td>
                  <td style={{ textAlign: 'right' }}>{row.out_quantity ? row.out_quantity.toLocaleString() : ''}</td>
                  <td>{row.out_sales || ''}</td>
                  <td>{row.out_remark || ''}</td>
                  <td><span className={'status-badge ' + row.status}>{row.status}</span></td>
                  <td style={{ textAlign: 'right' }}>{row.unit_price_usd ? row.unit_price_usd.toFixed(2) : ''}</td>
                  <td style={{ textAlign: 'right' }}>{row.amount_usd ? '$' + row.amount_usd.toLocaleString() : ''}</td>
                  <td style={{ textAlign: 'right' }}>{row.exchange_rate || ''}</td>
                  <td style={{ textAlign: 'right' }}>{row.amount_krw ? '₩' + row.amount_krw.toLocaleString() : ''}</td>
                  <td title="DATECODE → 날짜 환산">{row.datecode_date || '-'}</td>
                  <td style={{ textAlign: 'right' }} title="오늘 - 데이트코드 환산일">{row.days_elapsed.toLocaleString()}일</td>
                  <td style={{ textAlign: 'right' }} title="입고일 - 데이트코드 환산일">{row.lead_time_days != null ? row.lead_time_days.toLocaleString() + '일' : '-'}</td>
                  <td><span className={'urgency-tag ' + row.urgency} title={urgencyTooltip[row.urgency]}>{urgencyLabel[row.urgency]}</span></td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={24} style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>데이터가 없습니다</td></tr>
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
