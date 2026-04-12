import React, { useState, useRef, useEffect } from 'react';
import { uploadBulk, createManualEntry, getTodayEntries } from '../api/client';

export default function Upload() {
  const [dragover, setDragover] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [error, setError] = useState('');
  const [uploadType, setUploadType] = useState('bulk');
  const fileRef = useRef(null);

  // 수기입력 상태
  const [manualForm, setManualForm] = useState({
    inbound_date: new Date().toISOString().slice(0, 10),
    sr_number: '', part_number: '', quantity: '', datecode: '', sales_person: '', customer: '',
  });
  const [autoDate, setAutoDate] = useState(true);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualSuccess, setManualSuccess] = useState('');
  const [manualError, setManualError] = useState('');
  const [todayEntries, setTodayEntries] = useState([]);

  const loadToday = () => { getTodayEntries().then(r => setTodayEntries(r.data)).catch(() => {}); };
  useEffect(() => { if (uploadType === 'manual') loadToday(); }, [uploadType]);

  const handleManualChange = (field, value) => setManualForm(f => ({ ...f, [field]: value }));

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    setManualError(''); setManualSuccess('');
    if (!manualForm.part_number.trim()) { setManualError('Part#는 필수입니다.'); return; }
    const qty = parseInt(manualForm.quantity, 10);
    if (isNaN(qty) || qty <= 0) { setManualError('수량은 1 이상이어야 합니다.'); return; }
    if (!manualForm.inbound_date) { setManualError('입고날짜를 입력해주세요.'); return; }
    setManualLoading(true);
    try {
      const res = await createManualEntry({ ...manualForm, quantity: qty });
      setManualSuccess(`${res.data.message} (ID: ${res.data.id})`);
      setManualForm(f => ({
        inbound_date: autoDate ? new Date().toISOString().slice(0, 10) : f.inbound_date,
        sr_number: '', part_number: '', quantity: '', datecode: '', sales_person: '', customer: '',
      }));
      loadToday();
    } catch (err) { setManualError(err.response?.data?.detail || '등록 중 오류'); }
    finally { setManualLoading(false); }
  };

  const resetResults = () => { setBulkResult(null); setError(''); setManualSuccess(''); setManualError(''); };

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setError('엑셀 파일(.xlsx)만 업로드 가능합니다.');
      return;
    }
    resetResults();
    setUploading(true);
    try {
      const res = await uploadBulk(file, true);
      setBulkResult(res.data);
    } catch (err) { setError(err.response?.data?.detail || '업로드 중 오류가 발생했습니다.'); }
    finally { setUploading(false); }
  };

  const onDrop = (e) => { e.preventDefault(); setDragover(false); handleFile(e.dataTransfer.files[0]); };

  return (
    <div>
      <h1 className="page-title">데이터 업로드</h1>

      <div style={{ marginBottom: 20, display: 'flex', gap: 12 }}>
        <button className={'btn btn-sm ' + (uploadType === 'bulk' ? 'btn-primary' : 'btn-outline')}
          onClick={() => { setUploadType('bulk'); resetResults(); }}>
          대량업로드
        </button>
        <button className={'btn btn-sm ' + (uploadType === 'manual' ? 'btn-primary' : 'btn-outline')}
          onClick={() => { setUploadType('manual'); resetResults(); }}>
          Datecode 추가
        </button>
      </div>

      {uploadType === 'bulk' ? (
        <>
          <div
            className={'dropzone' + (dragover ? ' dragover' : '')}
            onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
            onDragLeave={() => setDragover(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
          >
            <div className="icon">📦</div>
            <p>{uploading ? '업로드 중... (대용량은 1~2분 소요)' : '엑셀 파일을 드래그 앤 드롭하세요'}</p>
            <p className="hint">.xlsx 파일 | Mar inventory · DATECODE · Shipping 시트를 자동 감지하여 한번에 처리합니다</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
              onChange={e => { handleFile(e.target.files[0]); e.target.value = ''; }} />
          </div>

          {error && <div style={{ color: '#ff4757', marginTop: 16, fontWeight: 600 }}>{error}</div>}

          {bulkResult && (
            <div className="upload-results">
              {bulkResult.master && (
                <div className="result-card">
                  <h4>Mar inventory</h4>
                  <div className="result-stats">
                    <div className="result-stat"><div className="num">{bulkResult.master.total}</div><div className="label">총 품목</div></div>
                    <div className="result-stat"><div className="num" style={{ color: '#2e7d32' }}>{bulkResult.master.inserted}</div><div className="label">등록</div></div>
                    <div className="result-stat"><div className="num">{bulkResult.master.has_stock}</div><div className="label">재고보유</div></div>
                    <div className="result-stat"><div className="num" style={{ color: '#6c63ff' }}>{bulkResult.master.daily || 0}</div><div className="label">일별입출고</div></div>
                    <div className="result-stat"><div className="num" style={{ color: '#ff4757' }}>{bulkResult.master.errors}</div><div className="label">오류</div></div>
                  </div>
                </div>
              )}

              {bulkResult.datecode && bulkResult.datecode.length > 0 && bulkResult.datecode.map((r, i) => (
                <div key={i} className="result-card">
                  <h4>DATECODE — {r.sales_team}</h4>
                  <div className="result-stats">
                    <div className="result-stat"><div className="num">{r.total}</div><div className="label">총 건수</div></div>
                    <div className="result-stat"><div className="num" style={{ color: '#2e7d32' }}>{r.available}</div><div className="label">사용가능</div></div>
                    <div className="result-stat"><div className="num" style={{ color: '#666' }}>{r.completed}</div><div className="label">완료</div></div>
                    <div className="result-stat"><div className="num" style={{ color: '#c62828' }}>{r.critical}</div><div className="label">긴급(2년+)</div></div>
                    <div className="result-stat"><div className="num" style={{ color: '#ff4757' }}>{r.errors}</div><div className="label">오류</div></div>
                  </div>
                </div>
              ))}

              {bulkResult.shipping && (
                <div className="result-card">
                  <h4>Shipping management</h4>
                  <div className="result-stats">
                    <div className="result-stat"><div className="num">{bulkResult.shipping.total.toLocaleString()}</div><div className="label">총 건수</div></div>
                    <div className="result-stat"><div className="num" style={{ color: '#2e7d32' }}>{bulkResult.shipping.inserted.toLocaleString()}</div><div className="label">등록</div></div>
                    <div className="result-stat"><div className="num" style={{ color: '#ff4757' }}>{bulkResult.shipping.errors.toLocaleString()}</div><div className="label">오류</div></div>
                  </div>
                </div>
              )}

              {!bulkResult.master && (!bulkResult.datecode || bulkResult.datecode.length === 0) && !bulkResult.shipping && (
                <div style={{ color: '#8892a4', padding: 20 }}>감지된 시트가 없습니다. 시트명에 "Mar inventory", "DATECODE", "shipping" 키워드가 포함되어야 합니다.</div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="form-card">
          <form onSubmit={handleManualSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>입고날짜 *</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="date" value={manualForm.inbound_date}
                    disabled={autoDate}
                    onChange={e => handleManualChange('inbound_date', e.target.value)}
                    style={autoDate ? { opacity: 0.7 } : {}} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <input type="checkbox" checked={autoDate} onChange={() => {
                      const next = !autoDate;
                      setAutoDate(next);
                      if (next) setManualForm(f => ({ ...f, inbound_date: new Date().toISOString().slice(0, 10) }));
                    }} />
                    오늘
                  </label>
                </div>
              </div>
              <div className="form-group">
                <label>SR#</label>
                <input value={manualForm.sr_number} placeholder="SR 번호"
                  onChange={e => handleManualChange('sr_number', e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Part# *</label>
                <input value={manualForm.part_number} placeholder="Part# 입력"
                  onChange={e => handleManualChange('part_number', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Q'ty *</label>
                <input type="number" min="1" value={manualForm.quantity} placeholder="수량"
                  onChange={e => handleManualChange('quantity', e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Datecode</label>
                <input value={manualForm.datecode} placeholder="예: 202538 (YYYYWW)"
                  onChange={e => handleManualChange('datecode', e.target.value)} />
              </div>
              <div className="form-group">
                <label>담당 Sales</label>
                <input value={manualForm.sales_person} placeholder="담당자명"
                  onChange={e => handleManualChange('sales_person', e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Customer</label>
                <input value={manualForm.customer} placeholder="고객명"
                  onChange={e => handleManualChange('customer', e.target.value)} />
              </div>
              <div className="form-group" />
            </div>
            {manualError && <div style={{ color: '#ff4757', marginBottom: 16, fontWeight: 600 }}>{manualError}</div>}
            {manualSuccess && <div style={{ color: '#2e7d32', marginBottom: 16, fontWeight: 600 }}>{manualSuccess}</div>}
            <button type="submit" className="btn btn-primary" disabled={manualLoading}>
              {manualLoading ? '등록 중...' : '입고 등록'}
            </button>
          </form>

          {todayEntries.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h4 style={{ marginBottom: 8 }}>오늘 입고 내역 ({todayEntries.length}건)</h4>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>SR#</th><th>Part#</th><th>Q'ty</th><th>Datecode</th><th>Sales</th><th>Customer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todayEntries.map(r => (
                      <tr key={r.id}>
                        <td>{r.sr_number || '-'}</td>
                        <td style={{ fontWeight: 600 }}>{r.part_number}</td>
                        <td style={{ textAlign: 'right' }}>{(r.quantity || 0).toLocaleString()}</td>
                        <td>{r.datecode || '-'}</td>
                        <td>{r.sales_person || '-'}</td>
                        <td>{r.customer || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
