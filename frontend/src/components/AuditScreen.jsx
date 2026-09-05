import React, { useState } from 'react';
import { 
  FileText, 
  Layers, 
  Sliders, 
  CheckCircle, 
  AlertOctagon, 
  Copy, 
  Download, 
  Sparkles,
  ShieldCheck,
  Clock,
  ArrowRight
} from 'lucide-react';

export default function AuditScreen({ 
  auditData, 
  recentAlerts, 
  selectedAlertId, 
  onSelectAlert 
}) {
  // Counterfactual Interactive Sandbox state
  const [cfRatio, setCfRatio] = useState(1.2);
  const [cfHour, setCfHour] = useState(14);
  const [cfType, setCfType] = useState('PAYMENT');
  const [copied, setCopied] = useState(false);

  // Compute live counterfactual decision
  const cfIsNight = cfHour >= 23 || cfHour <= 5;
  const cfIsHighRiskType = cfType === 'TRANSFER' || cfType === 'CASH_OUT';
  const cfScoreEstimate = (
    (Math.min(cfRatio, 10.0) / 10.0) * 0.35 + 
    (cfIsNight ? 0.25 : 0.0) + 
    (cfIsHighRiskType ? 0.35 : 0.05)
  );
  const cfWouldTrigger = cfScoreEstimate >= 0.35;

  const topFeatures = auditData?.top_features || [
    {
      feature_name: "Deviation from Merchant Average Amount",
      raw_feature_name: "amount_to_baseline_ratio",
      contribution_score: 0.3245,
      value: 14.8,
      plain_description: "Significant ticket deviation: Amount is 14.8x higher than this merchant's historical baseline average."
    },
    {
      feature_name: "Off-Hours Activity Window",
      raw_feature_name: "is_night_hour",
      contribution_score: 0.2104,
      value: 1.0,
      plain_description: "Off-hours timing: Transaction executed during off-business night hours (03:00 UTC)."
    },
    {
      feature_name: "Transaction Instrument Type",
      raw_feature_name: "tx_type_code",
      contribution_score: 0.1850,
      value: 1.0,
      plain_description: "High-risk PaySim transfer/cashout profile vector."
    }
  ];

  const handleCopyArtifact = () => {
    const artifactText = JSON.stringify({
      alert_id: selectedAlertId,
      timestamp: new Date().toISOString(),
      model_version: auditData?.model_version || "v2.0-paysim-rf",
      plain_explanation: auditData?.plain_explanation,
      top_features: topFeatures,
      counterfactual_note: auditData?.counterfactual_note
    }, null, 2);

    navigator.clipboard.writeText(artifactText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="screen-container">
      
      {/* Alert Selector Bar */}
      {recentAlerts && recentAlerts.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '4px' }}>
          <span style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>
            Select Incident:
          </span>
          {recentAlerts.map(al => (
            <button
              key={al.id}
              onClick={() => onSelectAlert(al.id)}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontFamily: 'var(--font-mono)',
                fontWeight: '600',
                cursor: 'pointer',
                border: selectedAlertId === al.id ? '1px solid var(--blue-cobalt)' : '1px solid var(--border-subtle)',
                background: selectedAlertId === al.id ? 'var(--blue-tint)' : 'var(--bg-surface)',
                color: selectedAlertId === al.id ? 'var(--blue-cobalt)' : 'var(--text-secondary)'
              }}
            >
              {al.id} (Z={al.spike_score ? Number(al.spike_score).toFixed(1) : '2.8'}σ)
            </button>
          ))}
        </div>
      )}

      {/* Incident RCA Banner */}
      <div className="audit-banner">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span className="audit-banner-tag">IMMUTABLE FORENSIC AUDIT TRAIL</span>
            <h1 className="audit-banner-title">
              Root-Cause Attribution: {selectedAlertId || 'Incident alt_849204bc'}
            </h1>
            <p className="audit-banner-desc">
              {auditData?.plain_explanation || 
                "Abnormal statistical burst: Off-hours transaction ticket sizes deviated by over 14.8x from this merchant's baseline distribution, pushing the 15-minute moving window fraud rate beyond the +2.5σ safety threshold."
              }
            </p>
          </div>

          <button 
            className="btn" 
            onClick={handleCopyArtifact}
            style={{ background: 'rgba(255,255,255,0.1)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.2)', flexShrink: 0 }}
          >
            {copied ? <CheckCircle size={14} color="#34d399" /> : <Copy size={14} />}
            <span>{copied ? 'Copied to Clipboard' : 'Copy Audit Artifact'}</span>
          </button>
        </div>

        <div style={{ display: 'flex', gap: '20px', marginTop: '16px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '12px', fontSize: '0.78rem', color: 'var(--navy-muted)', fontFamily: 'var(--font-mono)' }}>
          <span>MODEL: {auditData?.model_version || 'v2.0-paysim-rf'}</span>
          <span>EVALUATION: SINGLETON CLASSIFIER</span>
          <span>STATUS: AUDIT RECORD PERSISTED</span>
        </div>
      </div>

      {/* Two Column Layout: Feature Attribution & Interactive Counterfactual Lab */}
      <div className="audit-layout">
        
        {/* Left Column: Feature Attribution Waterfall */}
        <div className="card-panel">
          <div className="card-panel-header">
            <div className="panel-title">
              <Layers size={18} color="var(--blue-cobalt)" />
              <span>Tree-Level Feature Contribution Waterfall</span>
            </div>
            <span className="panel-meta">TOP DRIVERS</span>
          </div>

          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
            Random Forest Gini importance & feature value divergence relative to merchant baseline distribution.
          </p>

          <div className="attribution-list">
            {topFeatures.map((feat, idx) => {
              const scorePct = Math.min(Math.round(feat.contribution_score * 100), 100);
              return (
                <div key={idx} className="attribution-row">
                  <div className="attribution-top">
                    <span className="feat-name">{feat.feature_name}</span>
                    <span className="feat-score">+{scorePct}% Impact</span>
                  </div>

                  <div className="feat-bar-bg">
                    <div 
                      className="feat-bar-fill" 
                      style={{ width: `${Math.max(scorePct, 15)}%` }}
                    ></div>
                  </div>

                  <p className="feat-desc">{feat.plain_description}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Interactive Live Counterfactual Sandbox */}
        <div className="counterfactual-box">
          <div className="card-panel-header">
            <div className="panel-title">
              <Sliders size={18} color="var(--accent-purple)" />
              <span>Interactive Counterfactual Sandbox</span>
            </div>
            <span className="panel-meta">WHAT-IF ANALYSIS</span>
          </div>

          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
            Simulate how altering transaction parameters changes the model's decision boundary.
          </p>

          {/* Slider 1: Ticket Ratio */}
          <div className="slider-group">
            <div className="slider-label-row">
              <span>Ticket Size to Baseline Ratio:</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--blue-cobalt)' }}>
                {cfRatio.toFixed(1)}x Average
              </span>
            </div>
            <input 
              type="range" 
              min="0.5" 
              max="20.0" 
              step="0.5" 
              value={cfRatio} 
              onChange={(e) => setCfRatio(parseFloat(e.target.value))}
              className="range-slider"
            />
          </div>

          {/* Slider 2: Execution Hour */}
          <div className="slider-group">
            <div className="slider-label-row">
              <span>Transaction Execution Hour:</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--blue-cobalt)' }}>
                {cfHour.toString().padStart(2, '0')}:00 UTC {cfIsNight ? '(Off-Hours Night)' : '(Business Hours)'}
              </span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="23" 
              step="1" 
              value={cfHour} 
              onChange={(e) => setCfHour(parseInt(e.target.value))}
              className="range-slider"
            />
          </div>

          {/* Payment Method Selector */}
          <div className="slider-group">
            <div className="slider-label-row">
              <span>Payment Instrument:</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginTop: '6px' }}>
              {['PAYMENT', 'TRANSFER', 'CASH_OUT', 'DEBIT'].map(t => (
                <button
                  key={t}
                  onClick={() => setCfType(t)}
                  style={{
                    padding: '8px 4px',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: '700',
                    cursor: 'pointer',
                    border: cfType === t ? '1px solid var(--blue-cobalt)' : '1px solid var(--border-subtle)',
                    background: cfType === t ? 'var(--blue-tint)' : 'var(--bg-subtle)',
                    color: cfType === t ? 'var(--blue-cobalt)' : 'var(--text-secondary)'
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Counterfactual Result Pill */}
          <div className={`decision-result-pill ${cfWouldTrigger ? 'triggered' : 'safe'}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {cfWouldTrigger ? <AlertOctagon size={18} /> : <CheckCircle size={18} />}
              <span>
                {cfWouldTrigger ? 'Counterfactual: FRAUD SPIKE TRIGGERED' : 'Counterfactual: TRANSACTION ACCEPTED (SAFE)'}
              </span>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
              Score: {(cfScoreEstimate * 100).toFixed(0)}%
            </span>
          </div>

          {/* Explanation Text */}
          <div style={{ marginTop: '16px', padding: '12px 14px', background: 'var(--bg-subtle)', borderRadius: '6px', fontSize: '0.78rem', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
            <strong>Counterfactual Rule: </strong> 
            {auditData?.counterfactual_note || 
              "If the transaction ticket size had been within 1.5x of the merchant's historical baseline during daytime business hours, the anomaly score would drop below 0.12, and no alert would have been raised."
            }
          </div>

        </div>

      </div>

    </div>
  );
}
