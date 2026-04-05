import React from 'react';

const menuItems = [
  { key: 'shipment', icon: '🚚', label: '출고 입력' },
  { key: 'dashboard', icon: '📊', label: '대시보드' },
  { key: 'inventory', icon: '📦', label: '재고 현황' },
  { key: 'datecode', icon: '📄', label: 'DATECODE' },
  { key: 'history', icon: '📋', label: '출고 이력' },
  { key: 'upload', icon: '⬆️', label: '데이터 업로드' },
  { key: 'export', icon: '🔍', label: '재고 인사이트' },
  { key: 'chat', icon: '🤖', label: 'AI 재고비서' },
];

export default function Sidebar({ activePage, onNavigate, urgentCount }) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>📡 유니퀀트</h2>
        <p className="sidebar-subtitle">스마트 AI 재고관리</p>
      </div>
      <nav className="sidebar-nav">
        {menuItems.map((item) => (
          <button
            key={item.key}
            className={activePage === item.key ? 'active' : ''}
            onClick={() => onNavigate(item.key)}
          >
            <span className="icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* 하단 영역 */}
      <div className="sidebar-bottom">
        {urgentCount > 0 && (
          <div className="urgent-badge" onClick={() => onNavigate('inventory')}>
            🔴 긴급재고: {urgentCount}건
          </div>
        )}
        <div className="sidebar-contact">
          <div className="contact-label">문의</div>
          <div className="contact-name">경영기획팀 이희서 매니저</div>
          <a href="mailto:seanlee@unitrontech.com">seanlee@unitrontech.com</a>
        </div>
      </div>
    </div>
  );
}
