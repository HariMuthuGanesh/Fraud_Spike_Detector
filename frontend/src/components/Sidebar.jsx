import React from 'react';
import { 
  Shield, 
  LayoutDashboard, 
  FileSearch, 
  ShieldCheck, 
  TrendingUp, 
  Activity,
  Layers,
  Sparkles
} from 'lucide-react';

export default function Sidebar({ 
  activeTab, 
  setActiveTab, 
  selectedMerchant, 
  setSelectedMerchant,
  protectionActive,
  activeAlertCount
}) {
  return (
    <aside className="sidebar">
      <div>
        {/* Brand Header */}
        <div className="brand-section">
          <div className="brand-icon">
            <Shield size={20} strokeWidth={2.5} />
          </div>
          <div>
            <div className="brand-title">RiskShield Core</div>
            <div className="brand-subtitle">Track 02 AI Risk Engine</div>
          </div>
        </div>

        {/* Active Merchant Switcher */}
        <div className="merchant-selector-section">
          <label className="selector-label">Scoped Merchant Context</label>
          <select 
            className="merchant-select"
            value={selectedMerchant}
            onChange={(e) => setSelectedMerchant(e.target.value)}
          >
            <option value="merch_apex_retail">Apex Direct Electronics (₹85 avg)</option>
            <option value="merch_solis_pay">Solis Digital Services (₹45 avg)</option>
            <option value="merch_lunar_travel">Lunar Global Travel (₹240 avg)</option>
          </select>
        </div>

        {/* Navigation Menu */}
        <nav className="nav-section">
          <button 
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <LayoutDashboard size={17} />
            <span>Risk Radar & Ops</span>
            {activeAlertCount > 0 && (
              <span className="nav-badge danger">{activeAlertCount} ALERT</span>
            )}
          </button>

          <button 
            className={`nav-item ${activeTab === 'audit' ? 'active' : ''}`}
            onClick={() => setActiveTab('audit')}
          >
            <FileSearch size={17} />
            <span>Forensic Explainability</span>
          </button>

          <button 
            className={`nav-item ${activeTab === 'consent' ? 'active' : ''}`}
            onClick={() => setActiveTab('consent')}
          >
            <ShieldCheck size={17} />
            <span>Privacy & Mesh Pool</span>
            <span className="nav-badge success">OPT-IN</span>
          </button>

          <button 
            className={`nav-item ${activeTab === 'metrics' ? 'active' : ''}`}
            onClick={() => setActiveTab('metrics')}
          >
            <TrendingUp size={17} />
            <span>Time-Split Benchmark</span>
          </button>
        </nav>
      </div>

      {/* Footer Status Beacon */}
      <div className="sidebar-footer">
        <div className="system-status-indicator">
          <span className="status-dot"></span>
          <span style={{ fontWeight: '600', color: '#ffffff' }}>Defense Shield Active</span>
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--navy-muted)', lineHeight: '1.4' }}>
          Sliding Z-score buffer ($Z \ge 2.5$) with PaySim Random Forest attribution.
        </div>
        <div style={{ fontSize: '0.68rem', color: 'var(--blue-sky)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
          v2.0 PaySim RF Engine
        </div>
      </div>
    </aside>
  );
}
