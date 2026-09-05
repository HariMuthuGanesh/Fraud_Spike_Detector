import React, { useEffect, useRef, useState } from 'react';
import { 
  AlertTriangle, 
  Activity, 
  ShieldCheck, 
  Zap, 
  ArrowUpRight, 
  Layers,
  TrendingUp,
  Cpu,
  Clock,
  ExternalLink,
  ChevronRight
} from 'lucide-react';

export default function DashboardScreen({ 
  dashboardData, 
  streamEvents, 
  onInspectAlert 
}) {
  const canvasRef = useRef(null);
  const [selectedTx, setSelectedTx] = useState(null);

  const kpis = dashboardData?.kpis || {
    current_fraud_rate: 0.038,
    baseline_fraud_rate: 0.032,
    threshold_rate: 0.15,
    active_alerts_count: 0,
    consent_status: 'LOCAL_AUDIT_ONLY'
  };

  const alerts = dashboardData?.recent_alerts || [];
  const points = dashboardData?.time_series_points || [];
  const isSpikeActive = kpis.current_fraud_rate >= kpis.threshold_rate || kpis.active_alerts_count > 0;

  // Calculate approximate Z-Score
  const baselineMean = kpis.baseline_fraud_rate || 0.03;
  const baselineStd = 0.018;
  const currentZScore = Math.max(0, (kpis.current_fraud_rate - baselineMean) / baselineStd);

  // Render Canvas Threat Velocity Waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // Clear
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    // Subtle Grid lines
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    for (let y = 30; y < h - 20; y += 40) {
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(w - 20, y);
      ctx.stroke();
    }

    // Draw 2.5σ Anomaly Threshold line
    const thresholdY = h - (0.42 * (h - 60)) - 30;
    ctx.save();
    ctx.strokeStyle = '#e11d48';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(40, thresholdY);
    ctx.lineTo(w - 20, thresholdY);
    ctx.stroke();

    ctx.fillStyle = '#be123c';
    ctx.font = 'bold 10px JetBrains Mono, monospace';
    ctx.fillText('+2.5σ SPIKE THRESHOLD (Z >= 2.5)', w - 210, thresholdY - 6);
    ctx.restore();

    if (!points || points.length === 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px Plus Jakarta Sans, sans-serif';
      ctx.fillText('Awaiting live transaction telemetry stream...', w / 2 - 120, h / 2);
      return;
    }

    // Map points to canvas coordinates
    const stepX = (w - 70) / Math.max(points.length - 1, 1);
    const coords = points.map((p, i) => {
      const x = 45 + (i * stepX);
      const normalizedScore = Math.min(Math.max(p.fraud_score, 0), 1);
      const y = h - 30 - (normalizedScore * (h - 60));
      return { x, y, score: p.fraud_score, raw: p };
    });

    // Glowing Gradient Area
    ctx.beginPath();
    ctx.moveTo(coords[0].x, h - 30);
    coords.forEach(pt => ctx.lineTo(pt.x, pt.y));
    ctx.lineTo(coords[coords.length - 1].x, h - 30);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(37, 99, 235, 0.22)');
    grad.addColorStop(0.6, 'rgba(6, 182, 212, 0.08)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Primary Waveform Line
    ctx.beginPath();
    ctx.moveTo(coords[0].x, coords[0].y);
    coords.forEach(pt => ctx.lineTo(pt.x, pt.y));
    ctx.strokeStyle = '#1d4ed8';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // High anomaly marker points
    coords.forEach(pt => {
      if (pt.score >= 0.35) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#e11d48';
        ctx.shadowColor = 'rgba(225, 29, 72, 0.6)';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }
    });

  }, [points]);

  return (
    <div className="screen-container">
      
      {/* Top Row: Live Radar KPIs */}
      <div className="kpi-grid">
        
        {/* KPI 1: 15-Min Window Fraud Rate */}
        <div className={`kpi-card ${isSpikeActive ? 'alert-active' : ''}`}>
          <div className="kpi-header">
            <span className="kpi-title">Window Fraud Rate</span>
            <div className={`kpi-icon ${isSpikeActive ? 'rose' : 'blue'}`}>
              <Activity size={16} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">{(kpis.current_fraud_rate * 100).toFixed(1)}%</span>
            <span className={`kpi-pill ${isSpikeActive ? 'danger' : 'normal'}`}>
              {isSpikeActive ? 'SURGE DETECTED' : 'NOMINAL'}
            </span>
          </div>
          <div className="kpi-subtext">
            15-min rolling mean vs {(kpis.baseline_fraud_rate * 100).toFixed(1)}% baseline
          </div>
        </div>

        {/* KPI 2: Statistical Z-Score Deviation */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Anomaly Z-Score</span>
            <div className="kpi-icon amber">
              <TrendingUp size={16} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value" style={{ color: currentZScore >= 2.5 ? '#e11d48' : '#090e17' }}>
              {currentZScore.toFixed(2)}σ
            </span>
            <span className={`kpi-pill ${currentZScore >= 2.5 ? 'danger' : 'normal'}`}>
              {currentZScore >= 2.5 ? 'BREACH (Z >= 2.5)' : 'SAFE'}
            </span>
          </div>
          <div className="kpi-subtext">
            Threshold at 2.50σ historical variance floor
          </div>
        </div>

        {/* KPI 3: Active Spike Incidents */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Active Spike Alerts</span>
            <div className={`kpi-icon ${alerts.length > 0 ? 'rose' : 'emerald'}`}>
              <AlertTriangle size={16} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">{alerts.length}</span>
            <span className={`kpi-pill ${alerts.length > 0 ? 'danger' : 'normal'}`}>
              {alerts.length > 0 ? 'ACTION REQUIRED' : 'ZERO INCIDENTS'}
            </span>
          </div>
          <div className="kpi-subtext">
            Full tree-attribution RCA available for each
          </div>
        </div>

        {/* KPI 4: Privacy & Consent Posture */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Consent Perimeter</span>
            <div className="kpi-icon emerald">
              <ShieldCheck size={16} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value" style={{ fontSize: '1.25rem' }}>
              {kpis.consent_status === 'SHARED_NETWORK_SIGNAL' ? 'ECOSYSTEM POOL' : 'LOCAL AUDIT ONLY'}
            </span>
          </div>
          <div className="kpi-subtext">
            {kpis.consent_status === 'SHARED_NETWORK_SIGNAL' 
              ? 'Anonymized signal shared to pool' 
              : 'Zero external sharing (strict isolation)'}
          </div>
        </div>

      </div>

      {/* Middle Row: Threat Velocity Waveform & Live Transaction Stream */}
      <div className="telemetry-dashboard-grid">
        
        {/* Left Column: Live Waveform Chart */}
        <div className="card-panel">
          <div className="card-panel-header">
            <div className="panel-title">
              <Cpu size={18} color="var(--blue-cobalt)" />
              <span>Real-Time Fraud Probability Waveform</span>
            </div>
            <div className="panel-meta">
              WINDOW: 15 MIN SLIDING | STEP RATE: 1.0s
            </div>
          </div>

          <div className="canvas-chart-wrapper">
            <canvas 
              ref={canvasRef} 
              width={780} 
              height={240} 
              className="canvas-chart"
            />
          </div>
        </div>

        {/* Right Column: Live Stream Ticker */}
        <div className="card-panel">
          <div className="card-panel-header">
            <div className="panel-title">
              <Activity size={18} color="var(--accent-emerald)" />
              <span>Live Ingestion Stream</span>
            </div>
            <span className="status-dot"></span>
          </div>

          <div className="stream-list">
            {streamEvents && streamEvents.length > 0 ? (
              streamEvents.slice().reverse().map((ev, idx) => {
                const isHigh = ev.fraud_score >= 0.35;
                return (
                  <div 
                    key={ev.transaction_id || idx} 
                    className={`stream-item ${isHigh ? 'fraud' : ''}`}
                    onClick={() => setSelectedTx(ev)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="stream-meta">
                      <span className="tx-id">{ev.transaction_id.slice(-8)}</span>
                      <span className="tx-method">{ev.payment_method || 'CARD'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="tx-amount">₹{Number(ev.amount || 0).toLocaleString()}</span>
                      <span className={`score-badge ${isHigh ? 'high' : 'low'}`}>
                        {(ev.fraud_score * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                Streaming live transactions... Use Top Controls to inject burst.
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Bottom Section: Active Spike Incident Deck */}
      <div className="incidents-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: '700' }}>
              Detected Spike Incidents ({alerts.length})
            </h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Alerts triggered when 15-minute moving fraud rate exceeds +2.5σ historical baseline.
            </p>
          </div>
        </div>

        {alerts.length > 0 ? (
          <div className="incident-card-list">
            {alerts.map((al) => (
              <div 
                key={al.id} 
                className="incident-card"
                onClick={() => onInspectAlert(al.id)}
              >
                <div className="incident-header">
                  <span className="incident-id">{al.id}</span>
                  <span className="severity-tag critical">
                    Z = {al.spike_score ? Number(al.spike_score).toFixed(1) : '2.8'}σ
                  </span>
                </div>

                <div className="incident-reason">
                  {al.one_line_reason || 'Abnormal ticket deviation and off-hours velocity burst.'}
                </div>

                <div className="incident-footer">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={12} />
                    <span>{new Date(al.created_at).toLocaleTimeString()} UTC</span>
                  </div>
                  <span className="action-link">
                    Open RCA <ChevronRight size={13} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            <ShieldCheck size={28} color="var(--accent-emerald)" style={{ margin: '0 auto 8px', display: 'block' }} />
            No active spike alerts detected. System is operating safely within baseline tolerances.
          </div>
        )}
      </div>

    </div>
  );
}
