import React from 'react';
import { 
  ShieldCheck, 
  Lock, 
  EyeOff, 
  Clock, 
  History, 
  CheckCircle2 
} from 'lucide-react';

export default function ConsentScreen({ 
  consentData, 
  onToggleConsent 
}) {
  const isOptedIn = consentData?.consent_flag || false;
  const auditLogs = consentData?.audit_history || [];

  return (
    <div className="tab-pane active">
      {/* Main Consent Governance Panel */}
      <div className="consent-panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <div className="shield-avatar">
            <ShieldCheck size={32} />
          </div>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.45rem', fontWeight: '700', color: 'var(--navy-deep)' }}>
              Cross-Merchant Signal Sharing Governance
            </h2>
            <p style={{ fontSize: '0.88rem', color: '#64748b' }}>
              Control whether anonymized spike indicators are routed to the pooled network intelligence model.
            </p>
          </div>
        </div>

        {/* Toggle Card */}
        <div className="toggle-card-row">
          <div>
            <span style={{ display: 'block', fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: '700', color: 'var(--navy-deep)' }}>
              Opt-In: Share Anonymized Anomaly Signals with Network
            </span>
            <span style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginTop: '3px' }}>
              {isOptedIn 
                ? 'Active: Anonymized vectors are queued for cross-merchant pooled intelligence.' 
                : 'Isolated: Zero data is shared. Detection runs in 100% single-merchant isolation.'}
            </span>
          </div>

          <label className="switch-toggle">
            <input 
              type="checkbox" 
              checked={isOptedIn}
              onChange={(e) => onToggleConsent(e.target.checked)}
            />
            <span className="switch-slider"></span>
          </label>
        </div>

        {/* Protection Invariants Grid */}
        <div className="guarantees-grid">
          <div className="guarantee-box">
            <Lock size={26} color="#1d4ed8" style={{ flexShrink: 0 }} />
            <div>
              <strong style={{ fontFamily: 'var(--font-display)', fontSize: '0.92rem', color: 'var(--navy-deep)' }}>
                100% Defense Capacity Guarantee
              </strong>
              <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '4px' }}>
                Opting out NEVER degrades your detection capabilities. Sliding z-score baseline protection operates at full capacity locally.
              </p>
            </div>
          </div>

          <div className="guarantee-box">
            <EyeOff size={26} color="#059669" style={{ flexShrink: 0 }} />
            <div>
              <strong style={{ fontFamily: 'var(--font-display)', fontSize: '0.92rem', color: 'var(--navy-deep)' }}>
                Zero PII Exposure
              </strong>
              <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '4px' }}>
                Only mathematical rate deviations and velocity hashes are processed. Card numbers and customer identifiers are never retained.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Immutable Consent Changelog Table */}
      <div className="card-panel">
        <div className="panel-header-row">
          <div>
            <h2 className="panel-headline">Immutable Consent Audit Changelog</h2>
            <p className="panel-subline">Cryptographically timestamped log of all consent changes for compliance audits</p>
          </div>
          <History size={20} color="#1d4ed8" />
        </div>

        <div className="table-scroll">
          <table className="modern-table">
            <thead>
              <tr>
                <th>Timestamp (UTC)</th>
                <th>Previous State</th>
                <th>New State</th>
                <th>Action Reason</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                    No manual changes yet. Initial default: <strong>ISOLATED (Opt-In: OFF)</strong>.
                  </td>
                </tr>
              ) : (
                auditLogs.map((log, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>
                      {new Date(log.timestamp || log.created_at).toLocaleString()}
                    </td>
                    <td>
                      <span className="severity-pill medium">
                        {log.previous_flag ? 'SHARED' : 'ISOLATED'}
                      </span>
                    </td>
                    <td>
                      <span className={`severity-pill ${log.new_flag ? 'high' : 'medium'}`}>
                        {log.new_flag ? 'SHARED (OPTED IN)' : 'ISOLATED'}
                      </span>
                    </td>
                    <td>{log.reason || 'Merchant setting update'}</td>
                    <td style={{ color: '#059669', fontWeight: '700' }}>COMMITTED</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
