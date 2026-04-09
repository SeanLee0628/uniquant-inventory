import React, { useState, useRef, useEffect } from 'react';
import { searchParts, getPartStock, getPartLotsForShipment, createShipment } from '../api/client';

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

  // 배정 모드
  const [allocMode, setAllocMode] = useState('fifo'); // 'fifo' or 'manual'
  const [dcList, setDcList] = useState([]);
  const [selectedDc, setSelectedDc] = useState(null);

  const handlePartChange = async (val) => {
    setForm(f => ({ ...f, part_number: val }));
    setStock(null);
    setPartInfo(null);
    setResult(null);
    setDcList([]);
    setSelectedDc(null);
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
      // 로트 목록도 로드
      const lotsRes = await getPartLotsForShipment(pn);
      setDcList(lotsRes.data);
    } catch { setStock(null); setPartInfo(null); setDcList([]); }
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
    if (allocMode === 'manual' && !selectedDc) {
      setError('DATECODE를 선택해주세요.');
      return;
    }
    if (allocMode === 'manual' && selectedDc && qty > selectedDc.total_stock) {
      setError(`선택한 DATECODE의 재고(${selectedDc.total_stock.toLocaleString()})를 초과합니다.`);
      return;
    }
    if (allocMode === 'fifo' && stock !== null && qty > stock) {
      setError('출고수량(' + qty + ')이 가용재고(' + stock + ')를 초과합니다.');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        ...form, quantity: qty,
        alloc_mode: allocMode,
        manual_datecode: allocMode === 'manual' && selectedDc ? selectedDc.datecode : null,
      };
      const res = await createShipment(payload);
      setResult(res.data);
      // 재고 갱신
      try {
        const sRes = await getPartStock(form.part_number);
        setStock(sRes.data.available_stock);
        setPartInfo(sRes.data);
        const lotsRes = await getPartLotsForShipment(form.part_number);
        setDcList(lotsRes.data);
        setSelectedDc(null);
      } catch {}
    } catch (err) {
      setError(err.response?.data?.detail || '출고 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const isOverStock = allocMode === 'fifo' && stock !== null && parseInt(form.quantity, 10) > stock;

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

          {/* 배정 모드 선택 */}
          <div style={{ margin: '16px 0', padding: '12px 16px', background: '#f5f5f5', borderRadius: 8 }}>
            <label style={{ fontWeight: 600, marginBottom: 8, display: 'block' }}>출고 배정 방식</label>
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="radio" name="allocMode" value="fifo"
                  checked={allocMode === 'fifo'}
                  onChange={() => { setAllocMode('fifo'); setSelectedDc(null); }} />
                <span>FIFO 자동배정 <span style={{ fontSize: 12, color: '#888' }}>(오래된 DATECODE부터 자동 차감)</span></span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="radio" name="allocMode" value="manual"
                  checked={allocMode === 'manual'}
                  onChange={() => setAllocMode('manual')} />
                <span>DATECODE 명시 <span style={{ fontSize: 12, color: '#888' }}>(특정 로트 선택)</span></span>
              </label>
            </div>

            {allocMode === 'manual' && (
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 13, marginBottom: 4, display: 'block' }}>DATECODE 입력 *</label>
                <input value={selectedDc?.datecode || ''}
                  placeholder="예: 202538"
                  style={{ width: 200, padding: '6px 10px' }}
                  onChange={e => {
                    const v = e.target.value;
                    const match = dcList.find(d => d.datecode === v);
                    setSelectedDc(match || { datecode: v, total_stock: 0 });
                  }} />
                {selectedDc && selectedDc.total_stock > 0 && (
                  <span style={{ marginLeft: 12, color: '#2e7d32', fontWeight: 600 }}>
                    가용재고: {selectedDc.total_stock.toLocaleString()}개
                  </span>
                )}
                {selectedDc && selectedDc.datecode && selectedDc.total_stock === 0 && (
                  <span style={{ marginLeft: 12, color: '#c62828' }}>
                    해당 DATECODE의 재고가 없습니다
                  </span>
                )}
              </div>
            )}
          </div>

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
            {loading ? '처리 중...' : allocMode === 'fifo' ? '출고 등록 (FIFO 자동배정)' : '출고 등록 (DATECODE 명시)'}
          </button>
        </form>
      </div>

      {result && (
        <div className="fifo-result">
          <h4>✅ 출고 완료 — {allocMode === 'fifo' ? 'FIFO 배정' : 'DATECODE 명시'} 결과</h4>
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
