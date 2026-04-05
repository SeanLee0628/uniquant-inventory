import React, { useState, useRef, useEffect } from 'react';
import { searchParts, getPartStock, createShipment } from '../api/client';

export default function ShipmentForm() {
  const [form, setForm] = useState({
    ship_date: new Date().toISOString().slice(0, 10),
    customer: '', part_number: '', quantity: '',
    sales_person: '', lot_number: '', datecode: '',
  });
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [stock, setStock] = useState(null);
  const [partInfo, setPartInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const sugRef = useRef(null);

  const handlePartChange = async (val) => {
    setForm(f => ({ ...f, part_number: val }));
    setStock(null);
    setPartInfo(null);
    setResult(null);
    if (val.length >= 2) {
      try {
        const res = await searchParts(val);
        setSuggestions(res.data);
        setShowSuggestions(true);
      } catch { setSuggestions([]); }
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const selectPart = async (pn) => {
    setForm(f => ({ ...f, part_number: pn }));
    setShowSuggestions(false);
    try {
      const res = await getPartStock(pn);
      setStock(res.data.available_stock);
      setPartInfo(res.data);
    } catch { setStock(null); setPartInfo(null); }
  };

  useEffect(() => {
    const handler = (e) => {
      if (sugRef.current && !sugRef.current.contains(e.target)) setShowSuggestions(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const closeSuggestions = () => setShowSuggestions(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);
    if (!form.part_number || !form.quantity || !form.customer) {
      setError('필수 필드를 입력해주세요.');
      return;
    }
    const qty = parseInt(form.quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      setError('수량은 1 이상이어야 합니다.');
      return;
    }
    if (stock !== null && qty > stock) {
      setError('출고수량(' + qty + ')이 가용재고(' + stock + ')를 초과합니다.');
      return;
    }
    setLoading(true);
    try {
      const res = await createShipment({ ...form, quantity: qty });
      setResult(res.data);
      try {
        const sRes = await getPartStock(form.part_number);
        setStock(sRes.data.available_stock);
        setPartInfo(sRes.data);
      } catch {}
    } catch (err) {
      setError(err.response?.data?.detail || '출고 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const isOverStock = stock !== null && parseInt(form.quantity, 10) > stock;

  return (
    <div>
      <h1 className="page-title">🚚 출고 입력</h1>

      <div className="form-card">
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>출고일자 *</label>
              <input type="date" value={form.ship_date}
                onFocus={closeSuggestions}
                onChange={e => setForm(f => ({ ...f, ship_date: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>고객명 *</label>
              <input value={form.customer} placeholder="고객명 입력"
                onFocus={closeSuggestions}
                onChange={e => setForm(f => ({ ...f, customer: e.target.value }))} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group" style={{ position: 'relative' }} ref={sugRef}>
              <label>Part# * (자동완성)</label>
              <input value={form.part_number} placeholder="Part# 입력"
                onChange={e => handlePartChange(e.target.value)}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)} />
              {showSuggestions && suggestions.length > 0 && (
                <div className="autocomplete-list">
                  {suggestions.map(s => (
                    <div key={s} onClick={() => selectPart(s)}>{s}</div>
                  ))}
                </div>
              )}
              {stock !== null && (
                <div className={'stock-display ' + (isOverStock ? 'warn' : 'ok')}>
                  가용재고: {stock.toLocaleString()}개
                </div>
              )}
            </div>
            <div className="form-group">
              <label>출고수량 *</label>
              <input type="number" min="1" value={form.quantity} placeholder="수량"
                onFocus={closeSuggestions}
                onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
              {isOverStock && (
                <div className="stock-display warn">⚠️ 가용재고 초과!</div>
              )}
            </div>
          </div>

          {/* 품목 상세 정보 */}
          {partInfo && partInfo.family && (
            <div className="part-info-bar">
              <span><b>FAMILY:</b> {partInfo.family}</span>
              <span><b>VENDER:</b> {partInfo.vender}</span>
              <span><b>현재고:</b> {(partInfo.current_qty || 0).toLocaleString()}</span>
              <span><b>MOQ:</b> {(partInfo.moq || 0).toLocaleString()}</span>
              {partInfo.customer && <span><b>고객:</b> {partInfo.customer}</span>}
              {partInfo.site && <span><b>보관:</b> {partInfo.site}</span>}
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label>담당 SALES</label>
              <input value={form.sales_person}
                onFocus={closeSuggestions}
                onChange={e => setForm(f => ({ ...f, sales_person: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>LOT 번호</label>
              <input value={form.lot_number}
                onFocus={closeSuggestions}
                onChange={e => setForm(f => ({ ...f, lot_number: e.target.value }))} />
            </div>
          </div>

          {error && <div style={{ color: '#ff4757', marginBottom: 16, fontWeight: 600 }}>{error}</div>}

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? '처리 중...' : '출고 등록 (FIFO 자동배정)'}
          </button>
        </form>
      </div>

      {result && (
        <div className="fifo-result">
          <h4>✅ 출고 완료 — FIFO 배정 결과</h4>
          <p style={{ fontSize: 13, marginBottom: 12 }}>
            {result.shipment.part_number} | {result.shipment.quantity}개 | {result.shipment.customer}
          </p>
          {result.allocations.map((a, i) => (
            <div key={i} className="fifo-row">
              <span>DC: <b>{a.datecode}</b></span>
              <span>차감: <b>{a.allocated_qty}개</b></span>
              <span>잔여: {a.remaining_stock}개 {a.remaining_stock === 0 ? '(완료)' : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
