import React, { useEffect, useState, useCallback } from 'react';
import { getShipments, getShipmentCount, exportShipmentsCsv, deleteShipment } from '../api/client';

export default function ShipmentHistory() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [filters, setFilters] = useState({
    start_date: '', end_date: '', customer: '', part_number: '', sales_person: '',
  });
  const [cancellingId, setCancellingId] = useState(null);
  const [cancelResult, setCancelResult] = useState(null);

  const load = useCallback(async () => {
    try {
      const params = { page, page_size: pageSize };
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const [dataRes, countRes] = await Promise.all([
        getShipments(params),
        getShipmentCount(params),
      ]);
      setItems(dataRes.data);
      setTotal(countRes.data.count);
    } catch { setItems([]); setTotal(0); }
  }, [page, pageSize, filters]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / pageSize);

  const handleExportCsv = async () => {
    try {
      const params = {};
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const res = await exportShipmentsCsv(params);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'shipments.csv';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {}
  };

  const handleCancel = async (id) => {
    if (!window.confirm('이 출고 건을 취소하시겠습니까?\n재고가 자동으로 복원됩니다.')) return;
    setCancellingId(id);
    setCancelResult(null);
    try {
      const res = await deleteShipment(id);
      setCancelResult(res.data);
      load();
    } catch (err) {
      alert(err.response?.data?.detail || '출고 취소 중 오류');
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div>
      <h1 className="page-title">📋 출고 이력</h1>

      {cancelResult && (
        <div className="fifo-result" style={{ marginBottom: 16 }}>
          <h4>✅ 출고 취소 완료 — 재고 복원됨</h4>
          <p style={{ fontSize: 13, marginBottom: 8 }}>
            {cancelResult.part_number} | {cancelResult.quantity}개 복원
          </p>
          {cancelResult.restored_lots && cancelResult.restored_lots.map((r, i) => (
            <div key={i} className="fifo-row">
              <span>로트 #{r.datecode_id}</span>
              <span>복원: <b>{r.restored_qty}개</b></span>
            </div>
          ))}
          <button className="btn btn-sm btn-outline" style={{ marginTop: 8 }}
            onClick={() => setCancelResult(null)}>닫기</button>
        </div>
      )}

      <div className="table-container">
        <div className="table-toolbar">
          <input type="date" value={filters.start_date}
            onChange={e => { setFilters(f => ({ ...f, start_date: e.target.value })); setPage(1); }} />
          <input type="date" value={filters.end_date}
            onChange={e => { setFilters(f => ({ ...f, end_date: e.target.value })); setPage(1); }} />
          <input placeholder="고객명" value={filters.customer}
            onChange={e => { setFilters(f => ({ ...f, customer: e.target.value })); setPage(1); }} />
          <input placeholder="Part#" value={filters.part_number}
            onChange={e => { setFilters(f => ({ ...f, part_number: e.target.value })); setPage(1); }} />
          <input placeholder="담당SALES" value={filters.sales_person}
            onChange={e => { setFilters(f => ({ ...f, sales_person: e.target.value })); setPage(1); }} />
          <div className="spacer" />
          <button className="btn btn-sm btn-success" onClick={handleExportCsv}>CSV 다운로드</button>
          <span style={{ fontSize: 13, color: '#888' }}>총 {total.toLocaleString()}건</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>No.</th>
                <th>출고일</th>
                <th>고객</th>
                <th>Part#</th>
                <th>수량</th>
                <th>담당SALES</th>
                <th>LOT번호</th>
                <th>DATECODE</th>
                <th>취소</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r, i) => (
                <tr key={r.id}>
                  <td>{(page - 1) * pageSize + i + 1}</td>
                  <td>{r.ship_date}</td>
                  <td>{r.customer}</td>
                  <td style={{ fontWeight: 600 }}>{r.part_number}</td>
                  <td style={{ textAlign: 'right' }}>{(r.quantity || 0).toLocaleString()}</td>
                  <td>{r.sales_person}</td>
                  <td>{r.lot_number}</td>
                  <td>{r.datecode}</td>
                  <td>
                    <button
                      className="btn btn-sm btn-danger"
                      disabled={cancellingId === r.id}
                      onClick={() => handleCancel(r.id)}
                      style={{ padding: '3px 8px', fontSize: 11 }}
                    >
                      {cancellingId === r.id ? '...' : '취소'}
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>출고 이력이 없습니다</td></tr>
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
