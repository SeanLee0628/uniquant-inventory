import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// 대시보드
export const getDashboardSummary = (config) => api.get('/dashboard/summary', config);
export const getVendorValue = () => api.get('/dashboard/vendor-value');
export const getTrend = () => api.get('/dashboard/trend');
export const getAvailability = () => api.get('/dashboard/availability');
export const getDatecodeDist = () => api.get('/dashboard/datecode-dist');

// 재고
export const getInventory = (params) => api.get('/inventory', { params });
export const getUrgentInventory = (params) => api.get('/inventory/urgent', { params });
export const getMoqAlerts = () => api.get('/inventory/moq-alerts');
export const getPartDetail = (pn) => api.get('/inventory/' + encodeURIComponent(pn));
export const getDailyInventory = (pn, ym) => api.get('/inventory/daily/' + encodeURIComponent(pn), { params: ym ? { year_month: ym } : {} });

// 출고
export const searchParts = (q) => api.get('/parts/search', { params: { q } });
export const getPartStock = (partNumber) => api.get('/parts/stock', { params: { part_number: partNumber } });
export const createShipment = (data) => api.post('/shipment', data);
export const getShipments = (params) => api.get('/shipments', { params });
export const getShipmentCount = (params) => api.get('/shipments/count', { params });
export const deleteAllShipments = () => api.delete('/shipments');
export const deleteShipment = (id) => api.delete('/shipments/' + id);

// 업로드
export const uploadDatecode = (file, overwrite = false) => {
  const form = new FormData();
  form.append('file', file);
  return api.post(`/upload/datecode?overwrite=${overwrite}`, form);
};
export const uploadProductMaster = (file) => {
  const form = new FormData();
  form.append('file', file);
  return api.post('/upload/master', form);
};
export const checkExisting = () => api.get('/upload/check-existing');
export const uploadShipping = (file, overwrite = false) => {
  const form = new FormData();
  form.append('file', file);
  return api.post(`/upload/shipping?overwrite=${overwrite}`, form, { timeout: 120000 });
};

// 내보내기
export const exportInventoryExcel = () =>
  api.get('/export/inventory', { responseType: 'blob' });
export const exportShipmentsCsv = (params) =>
  api.get('/export/shipments-csv', { params, responseType: 'blob' });

// AI 채팅
export const sendChat = (message, history = []) =>
  api.post('/chat', { message, history }, { timeout: 60000 });

// AI 리포트 / 이상 탐지
export const getWeeklyReport = () => api.get('/report/weekly', { timeout: 60000 });
export const getAnomalies = () => api.get('/report/anomalies', { timeout: 60000 });

export default api;
