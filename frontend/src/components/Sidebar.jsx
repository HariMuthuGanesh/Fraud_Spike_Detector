import React from 'react';
import { 
  Shield, 
  LayoutDashboard, 
  FileSearch, 
  ShieldCheck, 
  TrendingUp, 
  Activity 
} from 'lucide-react';

export default function Sidebar({ 
  activeTab, 
  setActiveTab, 
  selectedMerchant, 
  setSelectedMerchant,
  protectionActive 
}) {
  return (
    <aside className="sidebar">
      {/* Brand Header */}
      <div className="brand-wrapper">
        <div className="brand-icon">
          <Shield size={24} strokeWidth={2.5} />
        </div>
        <div className="brand-text-block">
          <span className="brand-name">RiskShield</span>
          <span className="brand-sub">Track 02 Telemetry</span>
        </div>
      </div>

      {/* Active Merchant Switcher */}
      <div className="merchant-box">
        <label className="merchant-label">Active Merchant</label>
        <select 
          className="merchant-select"
          value={selectedMerchant}
          onChange={(e) => setSelectedMerchant(e.target.value)}
        >
          <option value="merch_apex_retail">Apex Direct Electronics</option>
          <option value="merch_solis_pay">Solis Digital Services</option>
          <option value="merch_lunar_travel">Lunar Global Travel</option>
        </select>
      </div>

      {/* Navigation Menu */}
      <nav className="nav-menu">
        <button 
          className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <LayoutDashboard size={18} />
          Dashboard Summary
        </button>

        <button 
          className={`nav-item ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => setActiveTab('audit')}
        >
          <FileSearch size={18} />
          Alert Audit Trail
        </button>

        <button 
          className={`nav-item ${activeTab === 'consent' ? 'active' : ''}`}
          onClick={() => setActiveTab('consent')}
        >
          <ShieldCheck size={18} />
          Consent Controls
        </button>

        <button 
          className={`nav-item ${activeTab === 'metrics' ? 'active' : ''}`}
          onClick={() => setActiveTab('metrics')}
        >
          <TrendingUp size={18} />
          Time-Split Metrics
        </button>
      </nav>

      {/* Defense Protection Status Beacon */}
      <div className="defense-status-pill">
        <div className="status-header">
          <div className="status-dot"></div>
          <span className="status-badge-text">100% Defense Active</span>
        </div>
        <p className="status-sub-desc">
          Single-merchant sliding z-score isolation active. No external dependencies.
        </p>
      </div>
    </aside>
  );
}
