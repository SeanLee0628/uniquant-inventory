import React, { useState, useEffect } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import ShipmentForm from './pages/ShipmentForm';
import ShipmentHistory from './pages/ShipmentHistory';
import Upload from './pages/Upload';
import Export from './pages/Export';
import Datecode from './pages/Datecode';
import Chat from './pages/Chat';
import { getDashboardSummary, getMoqAlerts } from './api/client';

const pages = {
  dashboard: Dashboard,
  inventory: Inventory,
  datecode: Datecode,
  shipment: ShipmentForm,
  history: ShipmentHistory,
  upload: Upload,
  export: Export,
  chat: Chat,
};

export default function App() {
  const [activePage, setActivePage] = useState('shipment');
  const [urgentCount, setUrgentCount] = useState(0);
  const [moqCount, setMoqCount] = useState(0);

  useEffect(() => {
    getDashboardSummary()
      .then(r => setUrgentCount(r.data.urgent_count))
      .catch(() => {});
    getMoqAlerts()
      .then(r => setMoqCount(r.data.length))
      .catch(() => {});
  }, [activePage]);

  const PageComponent = pages[activePage] || Dashboard;

  return (
    <div className="app-layout">
      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
        urgentCount={urgentCount}
        moqCount={moqCount}
      />
      <main className="main-content">
        <PageComponent />
      </main>
    </div>
  );
}
