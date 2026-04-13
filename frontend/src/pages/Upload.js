import React, { useState, useRef, useEffect } from 'react';
import { uploadBulk, createManualEntry, getTodayEntries } from '../api/client';

const UPLOAD_PIN = '5850';

export default function Upload() {
  const [dragover, setDragover] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [error, setError] = useState('');
  const [uploadType, setUploadType] = useState('bulk');
  const [authenticated, setAuthenticated] = useState(false);
  const fileRef = useRef(null);

  const checkPin = () => {
    const pin = prompt('이희서 매니저 휴대전화 뒷4자리는?');
    if (pin === UPLOAD_PIN) {
      setAuthenticated(true);
      return true;
    }
    if (pin !== null) alert('비밀번호가 틀렸습니다.');
    return false;
  };

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
    if (!authenticated && !checkPin()) return;
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
    if (!authenticated && !checkPin()) return;
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

      <div style={{ padding: '12px 16px', background: '#fff3e0', borderRadius: 8, marginBottom: 16, fontSize: 13, color: '#e65100', fontWeight: 500 }}>
        데이터 업로드 시, 경영기획팀 이희서 매니저에게 문의 바랍니다.
      </div>

      {uploadType === 'bulk' && (
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
      )}
    </div>
  );
}
