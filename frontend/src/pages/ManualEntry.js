import React, { useState, useEffect } from 'react';
import { createManualEntry, getRecentEntries } from '../api/client';

const emptyForm = {
  inbound_date: new Date().toISOString().slice(0, 10),
  sr_number: '',
  part_number: '',
  quantity: '',
  datecode: '',
  sales_person: '',
  customer: '',
};

export default function ManualEntry() {
  const [form, setForm] = useState({ ...emptyForm });
  const [autoDate, setAutoDate] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [recent, setRecent] = useState([]);

  const loadRecent = () => {
    getRecentEntries().then(r => setRecent(r.data)).catch(() => {});
  };

  useEffect(() => { loadRecent(); }, []);

  const handleChange = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
  };

  const toggleAutoDate = () => {
    const next = !autoDate;
    setAutoDate(next);
    if (next) setForm(f => ({ ...f, inbound_date: new Date().toISOString().slice(0, 10) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!form.part_number.trim()) { setError('Part#는 필수입니다.'); return; }
    const qty = parseInt(form.quantity, 10);
    if (isNaN(qty) || qty <= 0) { setError('수량은 1 이상이어야 합니다.'); return; }
    if (!form.inbound_date) { setError('입고날짜를 입력해주세요.'); return; }

    setLoading(true);
    try {
      const res = await createManualEntry({ ...form, quantity: qty });
      setSuccess(`${res.data.message} (ID: ${res.data.id})`);
      setForm({ ...emptyForm, inbound_date: autoDate ? new Date().toISOString().slice(0, 10) : '' });
      loadRecent();
    } catch (err) {
      setError(err.response?.data?.detail || '등록 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">Datecode 수동 입력</h1>

      <div className="form-card">
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>입고날짜 *</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="date" value={form.inbound_date}
                  disabled={autoDate}
                  onChange={e => handleChange('inbound_date', e.target.value)}
                  style={autoDate ? { opacity: 0.7 } : {}} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={autoDate} onChange={toggleAutoDate} />
                  오늘
                </label>
              </div>
            </div>
            <div className="form-group">
              <label>SR#</label>
              <input value={form.sr_number} placeholder="SR 번호"
                onChange={e => handleChange('sr_number', e.target.value)} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Part# *</label>
              <input value={form.part_number} placeholder="Part# 입력"
                onChange={e => handleChange('part_number', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Q'ty *</label>
              <input type="number" min="1" value={form.quantity} placeholder="수량"
                onChange={e => handleChange('quantity', e.target.value)} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Datecode</label>
              <input value={form.datecode} placeholder="예: 202538 (YYYYWW)"
                onChange={e => handleChange('datecode', e.target.value)} />
            </div>
            <div className="form-group">
              <label>담당 Sales</label>
              <input value={form.sales_person} placeholder="담당자명"
                onChange={e => handleChange('sales_person', e.target.value)} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Customer</label>
              <input value={form.customer} placeholder="고객명"
                onChange={e => handleChange('customer', e.target.value)} />
            </div>
            <div className="form-group" />
          </div>

          {error && <div style={{ color: '#ff4757', marginBottom: 16, fontWeight: 600 }}>{error}</div>}
          {success && <div style={{ color: '#2e7d32', marginBottom: 16, fontWeight: 600 }}>{success}</div>}

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? '등록 중...' : '입고 등록'}
          </button>
        </form>
      </div>

      {recent.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ marginBottom: 12 }}>최근 입력 내역</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>입고일</th>
                  <th>SR#</th>
                  <th>Part#</th>
                  <th>Q'ty</th>
                  <th>Datecode</th>
                  <th>Sales</th>
                  <th>Customer</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(r => (
                  <tr key={r.id}>
                    <td>{r.inbound_date}</td>
                    <td>{r.sr_number}</td>
                    <td style={{ fontWeight: 600 }}>{r.part_number}</td>
                    <td style={{ textAlign: 'right' }}>{(r.quantity || 0).toLocaleString()}</td>
                    <td>{r.datecode}</td>
                    <td>{r.sales_person}</td>
                    <td>{r.customer}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
