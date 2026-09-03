import React, { useEffect, useRef } from 'react';
import { 
  AlertTriangle, 
  Activity, 
  ShieldCheck, 
  Zap, 
  ArrowUpRight, 
  Layers 
} from 'lucide-react';

export default function DashboardScreen({ 
  dashboardData, 
  streamEvents, 
  onInspectAlert 
}) {
  const canvasRef = useRef(null);

  const kpis = dashboardData?.kpis || {
    current_fraud_rate: 0.042,
    baseline_fraud_rate: 0.035,
    threshold_rate: 0.125,
    active_alerts_count: 0,
    consent_status: 'ISOLATED'
  };

  const alerts = dashboardData?.recent_alerts || [];
  const points = dashboardData?.time_series_points || [];
  const isSpikeActive = kpis.current_fraud_rate >= kpis.threshold_rate;

  // Render Canvas Chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // Clear background
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    // Subtle Grid lines
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    for (let y = 30; y < h; y += 40) {
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(w - 20, y);
      ctx.stroke();
    }

    // Draw 2.5σ Threshold line
    const thresholdY = h - (0.45 * (h - 60)) - 30;
    ctx.save();
    ctx.strokeStyle = '#e11d48';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(40, thresholdY);
    ctx.lineTo(w - 20, thresholdY);
    ctx.stroke();

    ctx.fillStyle = '#be123c';
    ctx.font = 'bold 10px JetBrains Mono';
    ctx.fillText('+2.5σ Anomaly Threshold', w - 160, thresholdY - 6);
    ctx.restore();

    if (!points || points.length === 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px Plus Jakarta Sans';
      ctx.fillText('Awaiting transaction stream points...', w / 2 - 110, h / 2);
      return;
    }

    // Map points to canvas coordinates
    const stepX = (w - 70) / Math.max(points.length - 1, 1);
    const coords = points.map((p, i) => {
      const x = 45 + (i * stepX);
      const normalizedScore = Math.min(Math.max(p.fraud_score, 0), 1);
      const y = h - 30 - (normalizedScore * (h - 60));
      return { x, y, score: p.fraud_score };
    });

    // Area under curve with soft Cobalt Blue gradient
    ctx.beginPath();
    ctx.moveTo(coords[0].x, h - 30);
    coords.forEach(pt => ctx.lineTo(pt.x, pt.y));
    ctx.lineTo(coords[coords.length - 1].x, h - 30);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(29, 78, 216, 0.16)');
    grad.addColorStop(1, 'rgba(29, 78, 216, 0.0)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Primary Line Stroke - Dark Navy / Deep Cobalt Blue
    ctx.beginPath();
    ctx.moveTo(coords[0].x, coords[0].y);
    coords.forEach(pt => ctx.lineTo(pt.x, pt.y));
    ctx.strokeStyle = '#1d4ed8';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Point dots
    coords.forEach(pt => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.score > 0.4 ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = pt.score > 0.4 ? '#e11d48' : '#1d4ed8';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }, [points]);

  return (
    <div className="tab-pane active">
      {/* KPI Cards Grid */}
      <div className="kpi-grid">
        {/* Card 1: 15-min Moving Fraud Rate */}
        <div className={`kpi-card ${isSpikeActive ? 'spike-danger' : ''}`}>
          <div className="kpi-header">
            <span className="kpi-title">15m Window Fraud Rate</span>
            <span className={`kpi-badge ${isSpikeActive ? 'spike' : 'nom'}`}>
              {isSpikeActive ? 'SPIKE DETECTED' : 'NOMINAL'}
            </span>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">{(kpis.current_fraud_rate * 100).toFixed(1)}%</span>
            <span className="kpi-trend">vs { (kpis.baseline_fraud_rate * 100).toFixed(1) }% base</span>
          </div>
          <p className="kpi-subtext">Moving fraud probability over last 15 mins</p>
        </div>

        {/* Card 2: 300-tx Historical Baseline */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Historical Baseline (μ)</span>
            <span className="kpi-badge info">300-Tx Buffer</span>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">{(kpis.baseline_fraud_rate * 100).toFixed(1)}%</span>
            <span className="kpi-trend">Protected from bursts</span>
          </div>
          <p className="kpi-subtext">Clean baseline isolated from current spike</p>
        </div>

        {/* Card 3: +2.5σ Threshold */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">+2.5σ Spike Threshold</span>
            <span className="kpi-badge nom">Z ≥ 2.50</span>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">{(kpis.threshold_rate * 100).toFixed(1)}%</span>
            <span className="kpi-trend">Trigger Boundary</span>
          </div>
          <p className="kpi-subtext">Statistical alert trigger line for this merchant</p>
        </div>

        {/* Card 4: Consent Isolation Status */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Consent Mode</span>
            <span className="kpi-badge info">{kpis.consent_status}</span>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value" style={{ fontSize: '1.45rem', textTransform: 'capitalize' }}>
              {kpis.consent_status === 'OPTED_IN' ? 'Shared Network' : '100% Isolated'}
            </span>
          </div>
          <p className="kpi-subtext">Single-merchant defense always fully active</p>
        </div>
      </div>

      {/* Two Column Grid: Chart & Ingestion Stream */}
      <div className="content-grid-2">
        {/* Left: Sparkline Radar Scope */}
        <div className="card-panel">
          <div className="panel-header-row">
            <div>
              <h2 className="panel-headline">Real-Time Risk Rate Scope</h2>
              <p className="panel-subline">Sliding fraud score telemetry plotted against statistical baseline</p>
            </div>
            <div className="chart-legend-box">
              <div className="legend-chip">
                <span className="dot-indicator blue"></span>
                <span>Fraud Probability</span>
              </div>
              <div className="legend-chip">
                <span className="dot-indicator red"></span>
                <span>+2.5σ Threshold</span>
              </div>
            </div>
          </div>

          <div className="chart-box">
            <canvas ref={canvasRef} width="640" height="230" style={{ width: '100%', height: '100%' }}></canvas>
          </div>
        </div>

        {/* Right: Live Ingestion Feed Ticker */}
        <div className="card-panel">
          <div className="panel-header-row">
            <div>
              <h2 className="panel-headline">Live Ingestion Stream Feed</h2>
              <p className="panel-subline">Real-time transactions evaluated by the feature extractor & classifier</p>
            </div>
            <div className="legend-chip" style={{ color: '#059669', fontWeight: 'bold' }}>
              <span className="status-dot"></span>
              <span>LIVE</span>
            </div>
          </div>

          <div className="feed-ticker">
            {streamEvents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                Awaiting live transaction feed... Click <strong>Run</strong> or <strong>Step</strong> above.
              </div>
            ) : (
              streamEvents.map((evt, idx) => (
                <div 
                  key={evt.id || idx} 
                  className={`ticker-item ${evt.is_spike_detected ? 'burst-spike' : ''}`}
                >
                  <div>
                    <span className="tx-mono-id">{evt.id || `tx_${idx}`}</span>
                    <span style={{ marginLeft: '10px', color: '#64748b', fontSize: '0.8rem' }}>
                      ₹{evt.amount?.toFixed(2)} • {evt.payment_method || 'CARD'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span className={`tx-score-tag ${evt.fraud_score > 0.4 ? 'risk' : 'safe'}`}>
                      P: {evt.fraud_score?.toFixed(3)}
                    </span>
                    {evt.is_spike_detected && (
                      <span className="severity-pill critical">SPIKE</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Flagged Spike Alerts Table */}
      <div className="card-panel">
        <div className="panel-header-row">
          <div>
            <h2 className="panel-headline">Recent Flagged Spike Alerts</h2>
            <p className="panel-subline">Statistically verified anomalies captured on this merchant account</p>
          </div>
        </div>

        <div className="table-scroll">
          <table className="modern-table">
            <thead>
              <tr>
                <th>Alert ID</th>
                <th>Trigger Time (UTC)</th>
                <th>Window Fraud Rate</th>
                <th>Baseline Rate</th>
                <th>Z-Score Deviation</th>
                <th>Severity</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {alerts.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                    No spike alerts detected yet. Click <strong>⚡ Inject Fraud Burst</strong> to trigger a live demonstration spike!
                  </td>
                </tr>
              ) : (
                alerts.map((alt) => (
                  <tr key={alt.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: '600', color: 'var(--blue-primary)' }}>
                      {alt.id}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>
                      {new Date(alt.created_at).toLocaleString()}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: '700', color: '#e11d48' }}>
                      {(alt.window_fraud_rate * 100).toFixed(1)}%
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>
                      {(alt.baseline_fraud_rate * 100).toFixed(1)}%
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: '700' }}>
                      +{alt.z_score?.toFixed(2)}σ
                    </td>
                    <td>
                      <span className={`severity-pill ${alt.severity?.toLowerCase()}`}>
                        {alt.severity}
                      </span>
                    </td>
                    <td>
                      <button 
                        className="audit-action-btn"
                        onClick={() => onInspectAlert(alt.id)}
                      >
                        Audit Report <ArrowUpRight size={14} />
                      </button>
                    </td>
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
