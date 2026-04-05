import React, { useState } from 'react';
import { exportInventoryExcel, getWeeklyReport, getAnomalies } from '../api/client';

export default function Export() {
  const [downloading, setDownloading] = useState(false);

  // 주간 리포트
  const [reportLoading, setReportLoading] = useState(false);
  const [reportText, setReportText] = useState('');
  const [reportError, setReportError] = useState('');

  // 이상 탐지
  const [anomalyLoading, setAnomalyLoading] = useState(false);
  const [anomalyText, setAnomalyText] = useState('');
  const [anomalyError, setAnomalyError] = useState('');

  const handleExport = async () => {
    setDownloading(true);
    try {
      const res = await exportInventoryExcel();
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'inventory_export.xlsx';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('내보내기 중 오류가 발생했습니다.');
    } finally {
      setDownloading(false);
    }
  };

  const handleReport = async () => {
    setReportLoading(true);
    setReportError('');
    setReportText('');
    try {
      const res = await getWeeklyReport();
      setReportText(res.data.report);
    } catch (err) {
      setReportError(err.response?.data?.detail || '리포트 생성 중 오류가 발생했습니다.');
    } finally {
      setReportLoading(false);
    }
  };

  const handleAnomalies = async () => {
    setAnomalyLoading(true);
    setAnomalyError('');
    setAnomalyText('');
    try {
      const res = await getAnomalies();
      setAnomalyText(res.data.analysis);
    } catch (err) {
      setAnomalyError(err.response?.data?.detail || '이상 탐지 중 오류가 발생했습니다.');
    } finally {
      setAnomalyLoading(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">🔍 재고 인사이트</h1>

      {/* AI 주간 리포트 */}
      <div className="insight-card">
        <div className="insight-header">
          <div>
            <h3>📋 AI 주간 리포트</h3>
            <p className="insight-desc">AI가 이번 주 재고 데이터를 분석하여 경영진 보고용 리포트를 자동 생성합니다.</p>
          </div>
          <button className="btn btn-primary" onClick={handleReport} disabled={reportLoading}>
            {reportLoading ? '분석 중...' : '리포트 생성'}
          </button>
        </div>
        {reportError && <div className="insight-error">{reportError}</div>}
        {reportLoading && (
          <div className="insight-loading">
            <div className="loading-dots"><span></span><span></span><span></span></div>
            AI가 데이터를 분석하고 있습니다... (10~20초 소요)
          </div>
        )}
        {reportText && (
          <div className="insight-content">
            <pre>{reportText}</pre>
            <button className="btn btn-sm btn-outline" style={{ marginTop: 12 }}
              onClick={() => { navigator.clipboard.writeText(reportText); }}>
              📋 클립보드 복사
            </button>
          </div>
        )}
      </div>

      {/* AI 이상 탐지 */}
      <div className="insight-card">
        <div className="insight-header">
          <div>
            <h3>⚠️ AI 이상 탐지</h3>
            <p className="insight-desc">평소 패턴과 다른 이상 상황을 AI가 자동으로 감지합니다. 출고 급증, 장기 미출고, 노후 임박 등을 분석합니다.</p>
          </div>
          <button className="btn btn-danger" onClick={handleAnomalies} disabled={anomalyLoading}>
            {anomalyLoading ? '탐지 중...' : '이상 탐지 실행'}
          </button>
        </div>
        {anomalyError && <div className="insight-error">{anomalyError}</div>}
        {anomalyLoading && (
          <div className="insight-loading">
            <div className="loading-dots"><span></span><span></span><span></span></div>
            패턴 분석 중... (10~20초 소요)
          </div>
        )}
        {anomalyText && (
          <div className="insight-content anomaly">
            <pre>{anomalyText}</pre>
            <button className="btn btn-sm btn-outline" style={{ marginTop: 12 }}
              onClick={() => { navigator.clipboard.writeText(anomalyText); }}>
              📋 클립보드 복사
            </button>
          </div>
        )}
      </div>

      {/* 엑셀 내보내기 */}
      <div className="insight-card">
        <div className="insight-header">
          <div>
            <h3>📥 Mar inventory 엑셀 내보내기</h3>
            <p className="insight-desc">기존 엑셀과 동일한 92열 양식으로 다운로드합니다. (A~S 마스터 + T~AA DC연도 + AB~AD 총입출고 + AE~CN 일별 입출고 31일×2)</p>
          </div>
          <button className="btn btn-success" onClick={handleExport} disabled={downloading}>
            {downloading ? '다운로드 중...' : 'Mar inventory 다운로드'}
          </button>
        </div>
      </div>
    </div>
  );
}
