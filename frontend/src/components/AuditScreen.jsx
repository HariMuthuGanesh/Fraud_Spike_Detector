import React from 'react';
import { 
  FileText, 
  HelpCircle, 
  Layers, 
  BarChart3, 
  Sparkles, 
  AlertOctagon,
  ArrowRight
} from 'lucide-react';

export default function AuditScreen({ 
  alerts, 
  selectedAlertId, 
  onSelectAlert, 
  auditData 
}) {
  const narrative = auditData?.plain_explanation || 'A rapid burst of transactions with high velocity from a single device caused the 15-minute fraud rate to surge above the +2.5σ baseline threshold.';
  const topFeatures = auditData?.top_features || [];
  const counterfactual = auditData?.counterfactual_note || 'If device velocity remained under 2 requests per 15-min window, the fraud rate would have remained at 0.05 and no alert would have been triggered.';
  const rawStats = auditData?.raw_stats || {
    transaction_count: 8,
    total_amount: 14500,
    unique_devices: 1,
    unique_ips: 1,
    avg_amount: 1812.50
  };

  return (
    <div className="tab-pane active">
      {/* Alert Selector Bar */}
      <div className="card-panel" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>
            Select Alert Record:
          </label>
          <select 
            className="merchant-select"
            style={{ width: 'auto', minWidth: '280px' }}
            value={selectedAlertId}
            onChange={(e) => onSelectAlert(e.target.value)}
          >
            {alerts.length === 0 ? (
              <option value="">No alerts available (Trigger a burst first)</option>
            ) : (
              alerts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.id} — +{a.z_score?.toFixed(2)}σ ({new Date(a.created_at).toLocaleTimeString()})
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      {/* Narrative Hero Card */}
      <div className="audit-hero">
        <div className="audit-meta-bar">
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span className="severity-pill critical">STATISTICAL ANOMALY</span>
            <span className="audit-tag">{selectedAlertId || 'ALT-DEMO-01'}</span>
            <span className="audit-tag">Model: RF-TreeAttribution-v1</span>
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#64748b' }}>
            Snap Window: 5-Min Idempotent
          </span>
        </div>

        <div>
          <h2 className="audit-heading">Explainable Decision Narrative</h2>
          <p className="audit-text">{narrative}</p>
        </div>

        {/* Counterfactual Guidance Box */}
        <div className="counterfactual-panel">
          <Sparkles size={24} color="#1d4ed8" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div className="cf-body">
            <strong style={{ fontFamily: 'var(--font-display)', color: '#1e3a8a', fontSize: '0.95rem' }}>
              Counterfactual Guidance (What would prevent this alert?)
            </strong>
            <p>{counterfactual}</p>
          </div>
        </div>
      </div>

      {/* 2 Column: Feature Attribution & Raw Window Telemetry */}
      <div className="content-grid-2">
        {/* Left: Tree-Path Feature Contribution Breakdown */}
        <div className="card-panel">
          <div className="panel-header-row">
            <div>
              <h2 className="panel-headline">Tree-Path Feature Contributions</h2>
              <p className="panel-subline">Mathematical driver weights extracted from decision paths</p>
            </div>
            <BarChart3 size={20} color="#1d4ed8" />
          </div>

          <div className="feature-list">
            {topFeatures.length === 0 ? (
              <>
                <div className="feature-row">
                  <div className="feat-top-line">
                    <span>15-Minute Device Velocity</span>
                    <span style={{ color: '#e11d48', fontFamily: 'var(--font-mono)' }}>+0.42 Contribution</span>
                  </div>
                  <div className="feat-bar-track">
                    <div className="feat-bar-fill" style={{ width: '85%' }}></div>
                  </div>
                  <span className="feat-sub-text">5+ transactions from same device fingerprint in rapid succession</span>
                </div>

                <div className="feature-row">
                  <div className="feat-top-line">
                    <span>Ticket Size to Merchant Average Ratio</span>
                    <span style={{ color: '#e11d48', fontFamily: 'var(--font-mono)' }}>+0.28 Contribution</span>
                  </div>
                  <div className="feat-bar-track">
                    <div className="feat-bar-fill" style={{ width: '60%' }}></div>
                  </div>
                  <span className="feat-sub-text">Transaction values averaged 4.2x above nominal ticket baseline</span>
                </div>

                <div className="feature-row">
                  <div className="feat-top-line">
                    <span>Off-Hours Night Flag</span>
                    <span style={{ color: '#1d4ed8', fontFamily: 'var(--font-mono)' }}>+0.15 Contribution</span>
                  </div>
                  <div className="feat-bar-track">
                    <div className="feat-bar-fill" style={{ width: '35%' }}></div>
                  </div>
                  <span className="feat-sub-text">Transactions occurred between 00:00 - 05:00 UTC</span>
                </div>
              </>
            ) : (
              topFeatures.map((feat, idx) => (
                <div key={idx} className="feature-row">
                  <div className="feat-top-line">
                    <span>{feat.feature_name || feat.name}</span>
                    <span style={{ color: '#e11d48', fontFamily: 'var(--font-mono)' }}>
                      +{feat.weight?.toFixed(2) || '0.35'} Impact
                    </span>
                  </div>
                  <div className="feat-bar-track">
                    <div className="feat-bar-fill" style={{ width: `${Math.min(feat.weight * 100, 100)}%` }}></div>
                  </div>
                  <span className="feat-sub-text">{feat.plain_reason || feat.description}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Raw Window Telemetry Matrix */}
        <div className="card-panel">
          <div className="panel-header-row">
            <div>
              <h2 className="panel-headline">Raw Window Telemetry Matrix</h2>
              <p className="panel-subline">Aggregate statistics captured during the 15-minute anomaly window</p>
            </div>
            <Layers size={20} color="#1d4ed8" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#64748b' }}>TRANSACTION VOLUME</span>
              <div style={{ fontSize: '1.4rem', fontWeight: '700', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                {rawStats.transaction_count || 8} txs
              </div>
            </div>

            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#64748b' }}>TOTAL WINDOW AMOUNT</span>
              <div style={{ fontSize: '1.4rem', fontWeight: '700', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                ₹{rawStats.total_amount ? rawStats.total_amount.toLocaleString() : '14,500'}
              </div>
            </div>

            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#64748b' }}>UNIQUE DEVICES</span>
              <div style={{ fontSize: '1.4rem', fontWeight: '700', fontFamily: 'var(--font-mono)', marginTop: '4px', color: '#e11d48' }}>
                {rawStats.unique_devices || 1} (Cluster)
              </div>
            </div>

            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#64748b' }}>UNIQUE IP ADDRESSES</span>
              <div style={{ fontSize: '1.4rem', fontWeight: '700', fontFamily: 'var(--font-mono)', marginTop: '4px', color: '#e11d48' }}>
                {rawStats.unique_ips || 1} (Cluster)
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
