import React, { useState, useRef } from 'react';
import { uploadDatecode, uploadProductMaster, uploadShipping, checkExisting } from '../api/client';

export default function Upload() {
  const [dragover, setDragover] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [uploadType, setUploadType] = useState('datecode');
  const [masterResult, setMasterResult] = useState(null);
  const [shippingResult, setShippingResult] = useState(null);
  const fileRef = useRef(null);

  const resetResults = () => { setResults(null); setMasterResult(null); setShippingResult(null); setError(''); };

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setError('엑셀 파일(.xlsx)만 업로드 가능합니다.');
      return;
    }
    resetResults();

    if (uploadType === 'datecode') {
      try {
        const chk = await checkExisting();
        if (chk.data.exists) { setPendingFile(file); setShowConfirm(true); return; }
      } catch {}
      doUploadDC(file, false);
    } else if (uploadType === 'master') {
      doUploadMaster(file);
    } else {
      doUploadShipping(file);
    }
  };

  const doUploadDC = async (file, overwrite) => {
    setUploading(true); setShowConfirm(false);
    try {
      const res = await uploadDatecode(file, overwrite);
      setResults(res.data);
    } catch (err) { setError(err.response?.data?.detail || '업로드 중 오류'); }
    finally { setUploading(false); setPendingFile(null); }
  };

  const doUploadMaster = async (file) => {
    setUploading(true);
    try {
      const res = await uploadProductMaster(file);
      setMasterResult(res.data);
    } catch (err) { setError(err.response?.data?.detail || '업로드 중 오류'); }
    finally { setUploading(false); }
  };

  const doUploadShipping = async (file) => {
    setUploading(true);
    try {
      const res = await uploadShipping(file, true);
      setShippingResult(res.data);
    } catch (err) { setError(err.response?.data?.detail || '업로드 중 오류'); }
    finally { setUploading(false); }
  };

  const onDrop = (e) => { e.preventDefault(); setDragover(false); handleFile(e.dataTransfer.files[0]); };

  const typeLabels = {
    datecode: { name: 'DATECODE', icon: '📄', hint: '영업1실/영업2실 자동 감지' },
    master: { name: 'Mar inventory', icon: '📊', hint: '헤더 2행, 데이터 3행부터. Part# UPSERT' },
    shipping: { name: 'Shipping management', icon: '🚚', hint: '기존 출고 이력 일괄 임포트 (73,000건+)' },
  };
  const cur = typeLabels[uploadType];

  return (
    <div>
      <h1 className="page-title">⬆️ 데이터 업로드</h1>

      <div style={{ marginBottom: 20, display: 'flex', gap: 12 }}>
        {Object.entries(typeLabels).map(([key, val]) => (
          <button key={key}
            className={'btn btn-sm ' + (uploadType === key ? 'btn-primary' : 'btn-outline')}
            onClick={() => { setUploadType(key); resetResults(); }}
          >
            {val.icon} {val.name}
          </button>
        ))}
      </div>

      <div
        className={'dropzone' + (dragover ? ' dragover' : '')}
        onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
        onDragLeave={() => setDragover(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
      >
        <div className="icon">{cur.icon}</div>
        <p>{uploading ? '업로드 중... (대용량은 1~2분 소요)' : cur.name + ' 파일을 드래그 앤 드롭하세요'}</p>
        <p className="hint">.xlsx 파일 | {cur.hint}</p>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
          onChange={e => handleFile(e.target.files[0])} />
      </div>

      {error && <div style={{ color: '#ff4757', marginTop: 16, fontWeight: 600 }}>{error}</div>}

      {results && (
        <div className="upload-results">
          {results.map((r, i) => (
            <div key={i} className="result-card">
              <h4>✅ {r.sales_team} 업로드 완료</h4>
              <div className="result-stats">
                <div className="result-stat"><div className="num">{r.total}</div><div className="label">총 건수</div></div>
                <div className="result-stat"><div className="num" style={{ color: '#2e7d32' }}>{r.available}</div><div className="label">사용가능</div></div>
                <div className="result-stat"><div className="num" style={{ color: '#666' }}>{r.completed}</div><div className="label">완료</div></div>
                <div className="result-stat"><div className="num" style={{ color: '#ef6c00' }}>{r.waiting}</div><div className="label">대기</div></div>
                <div className="result-stat"><div className="num" style={{ color: '#c62828' }}>{r.critical}</div><div className="label">긴급(2년+)</div></div>
                <div className="result-stat"><div className="num" style={{ color: '#ff4757' }}>{r.errors}</div><div className="label">오류</div></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {masterResult && (
        <div className="upload-results">
          <div className="result-card">
            <h4>✅ Mar inventory 업로드 완료 {masterResult.year_month && '(' + masterResult.year_month + ')'}</h4>
            <div className="result-stats">
              <div className="result-stat"><div className="num">{masterResult.total}</div><div className="label">총 품목</div></div>
              <div className="result-stat"><div className="num" style={{ color: '#2e7d32' }}>{masterResult.inserted}</div><div className="label">신규</div></div>
              <div className="result-stat"><div className="num" style={{ color: '#1565c0' }}>{masterResult.updated}</div><div className="label">업데이트</div></div>
              <div className="result-stat"><div className="num">{masterResult.has_stock}</div><div className="label">재고보유</div></div>
              <div className="result-stat"><div className="num" style={{ color: '#6c63ff' }}>{masterResult.daily_imported || 0}</div><div className="label">일별입출고</div></div>
              <div className="result-stat"><div className="num" style={{ color: '#ff4757' }}>{masterResult.errors}</div><div className="label">오류</div></div>
            </div>
          </div>
        </div>
      )}

      {shippingResult && (
        <div className="upload-results">
          <div className="result-card">
            <h4>✅ 출고 이력 임포트 완료</h4>
            <div className="result-stats">
              <div className="result-stat"><div className="num">{shippingResult.total.toLocaleString()}</div><div className="label">총 건수</div></div>
              <div className="result-stat"><div className="num" style={{ color: '#2e7d32' }}>{shippingResult.inserted.toLocaleString()}</div><div className="label">삽입 성공</div></div>
              <div className="result-stat"><div className="num" style={{ color: '#ff4757' }}>{shippingResult.errors.toLocaleString()}</div><div className="label">오류</div></div>
            </div>
          </div>
        </div>
      )}

      {showConfirm && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>⚠️ 기존 데이터 존재</h3>
            <p>기존에 업로드된 DATECODE 데이터가 있습니다.<br />덮어쓰시겠습니까?</p>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => { setShowConfirm(false); setPendingFile(null); }}>취소</button>
              <button className="btn btn-danger" onClick={() => doUploadDC(pendingFile, true)}>덮어쓰기</button>
              <button className="btn btn-primary" onClick={() => doUploadDC(pendingFile, false)}>추가하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
