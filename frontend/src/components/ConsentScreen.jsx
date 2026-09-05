import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  EyeOff, 
  Share2, 
  CheckCircle, 
  Clock, 
  Key, 
  FileText,
  AlertCircle
} from 'lucide-react';

export default function ConsentScreen({ 
  consentData, 
  selectedMerchant, 
  onToggleConsent 
}) {
  const isOptedIn = consentData?.consent_flag || false;
  const history = consentData?.audit_history || [];
  const [reasonInput, setReasonInput] = useState('');
  const [updating, setUpdating] = useState(false);

  const handleToggle = async () => {
    setUpdating(true);
    await onToggleConsent(!isOptedIn, reasonInput || `Merchant ${!isOptedIn ? 'opt-in' : 'opt-out'} toggle`);
    setReasonInput('');
    setUpdating(false);
  };

  return (
    <div className="screen-container">
      
      {/* Top Banner */}
      <div className="audit-banner" style={{ background: 'linear-gradient(135deg, #064e3b 0%, #065f46 100%)' }}>
        <span className="audit-banner-tag" style={{ color: '#a7f3d0' }}>PRIVACY & DATA PERIMETER CONTROLS</span>
        <h1 className="audit-banner-title">
          Merchant Opt-In Consent Governance
        </h1>
        <p className="audit-banner-desc" style={{ color: '#d1fae5' }}>
          Enforces strict merchant privacy autonomy. When Opt-In is OFF, all detection algorithms run entirely within your local enclave and zero data is shared. When Opt-In is ON, anonymized cryptographic signals help defend the entire ecosystem.
        </p>
      </div>

      {/* Main Governance Control Panel */}
      <div className="consent-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: '700' }}>
              Network Intelligence Signal Sharing: {selectedMerchant}
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Current Status: <strong>{isOptedIn ? 'OPTED-IN (ANONYMIZED SHARING ACTIVE)' : 'ISOLATED (LOCAL AUDIT ONLY)'}</strong>
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: isOptedIn ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>
              {isOptedIn ? 'SHARING ENABLED' : 'SHARING DISABLED'}
            </span>

            <label className="toggle-switch">
              <input 
                type="checkbox" 
                checked={isOptedIn} 
                onChange={handleToggle}
                disabled={updating}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </div>

        {/* Protection Guarantee Notice */}
        <div style={{ display: 'flex', gap: '12px', background: 'var(--accent-emerald-bg)', border: '1px solid var(--accent-emerald-border)', borderRadius: 'var(--radius-sm)', padding: '14px 18px', marginTop: '18px' }}>
          <ShieldCheck size={20} color="var(--accent-emerald)" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <div style={{ fontWeight: '700', fontSize: '0.88rem', color: '#065f46' }}>
              Single-Merchant Protection Guarantee
            </div>
            <p style={{ fontSize: '0.8rem', color: '#047857', marginTop: '2px', lineHeight: '1.4' }}>
              Your merchant fraud-spike detection operates with 100% full fidelity regardless of your sharing choice. Opting out will never degrade your own fraud protection.
            </p>
          </div>
        </div>
      </div>

      {/* Two Column Grid: Anonymization Proof & Interactive Network Topology */}
      <div className="audit-layout" style={{ marginBottom: '24px' }}>
        
        {/* Left Column: Cryptographic Anonymization Proof */}
        <div className="card-panel">
          <div className="card-panel-header">
            <div className="panel-title">
              <Lock size={18} color="var(--blue-cobalt)" />
              <span>Zero-PII Cryptographic Proof</span>
            </div>
            <span className="panel-meta">SHA-256 HASHED</span>
          </div>

          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
            Comparison of what stays within your local enclave versus the anonymized pulse sent to the shared pool.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ background: '#090e17', color: '#f8fafc', padding: '12px', borderRadius: '6px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
              <div style={{ color: '#f43f5e', fontWeight: '700', marginBottom: '6px' }}>
                [LOCAL ONLY - NEVER SHARED]
              </div>
              <div>Customer PII: REDACTED</div>
              <div>Card PAN: REDACTED</div>
              <div>Raw IP: 192.168.1.104</div>
              <div>Raw Device: iPhone_15_A2849</div>
              <div>Merchant Name: {selectedMerchant}</div>
            </div>

            <div style={{ background: '#090e17', color: '#f8fafc', padding: '12px', borderRadius: '6px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
              <div style={{ color: '#34d399', fontWeight: '700', marginBottom: '6px' }}>
                [SHARED NETWORK SIGNAL]
              </div>
              <div>ip_hash: e3b0c44298fc...</div>
              <div>dev_hash: 7d8f3a9b1c02...</div>
              <div>spike_delta: +2.8σ</div>
              <div>fraud_vector: TRANSFER</div>
              <div>origin_merchant: ANONYMOUS</div>
            </div>
          </div>
        </div>

        {/* Right Column: Immutable Consent Audit Log */}
        <div className="card-panel">
          <div className="card-panel-header">
            <div className="panel-title">
              <Clock size={18} color="var(--accent-purple)" />
              <span>Immutable Consent Change Trail</span>
            </div>
            <span className="panel-meta">{history.length} ENTRIES</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
            {history && history.length > 0 ? (
              history.map((log, i) => (
                <div key={i} style={{ padding: '8px 12px', background: 'var(--bg-subtle)', borderRadius: '6px', border: '1px solid var(--border-subtle)', fontSize: '0.78rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '600' }}>
                    <span>Changed to: {log.new_state ? 'OPT-IN (SHARED)' : 'OPT-OUT (ISOLATED)'}</span>
                    <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: '2px' }}>
                    Reason: {log.reason || 'User initiated setting update'}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                No prior consent changes recorded. Default initial state is Active.
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
