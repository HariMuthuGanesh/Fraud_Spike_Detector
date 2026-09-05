import React, { useState } from 'react';
import { Play, Pause, StepForward, Zap, RotateCcw, Activity, ShieldAlert, Cpu } from 'lucide-react';

export default function TopHeader({ 
  activeTab, 
  isSimulatorRunning, 
  onToggleSimulator, 
  onStepSimulator, 
  onInjectBurst, 
  onResetSimulator,
  selectedMerchant
}) {
  const [burstType, setBurstType] = useState('CREDENTIAL_STUFFING');

  const getTabTitle = () => {
    switch (activeTab) {
      case 'dashboard':
        return {
          title: 'Risk Command Center & Live Telemetry',
          desc: 'Sliding-window fraud rate tracking, dynamic Z-score anomaly detection, and instant incident triage'
        };
      case 'audit':
        return {
          title: 'Forensic Explainability Lab & RCA Studio',
          desc: 'Tree-path feature attribution, interactive counterfactual simulator, and immutable merchant defense reports'
        };
      case 'consent':
        return {
          title: 'Privacy Governance & Network Defense Mesh',
          desc: 'Merchant-governed opt-in signal routing with zero-knowledge cryptographic anonymization guarantees'
        };
      case 'metrics':
        return {
          title: 'Scientific Evaluation & Vulcan Comparison Deck',
          desc: 'Rigorous 70/30 chronological time-split validation, window confusion matrix, and friction cost ROI accounting'
        };
      default:
        return { title: 'RiskShield Telemetry', desc: 'Real-time autonomous risk defense engine' };
    }
  };

  const { title, desc } = getTabTitle();

  const handleCustomBurst = () => {
    let count = 8;
    if (burstType === 'HIGH_VALUE_TRANSFER') count = 6;
    if (burstType === 'NIGHT_VELOCITY') count = 10;
    onInjectBurst(count);
  };

  return (
    <header className="top-nav">
      <div className="header-left">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h1>{title}</h1>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', background: 'var(--blue-tint)', color: 'var(--blue-cobalt)', border: '1px solid var(--blue-tint-border)', padding: '2px 8px', borderRadius: '4px', fontWeight: '700' }}>
            MERCHANT: {selectedMerchant}
          </span>
        </div>
        <p>{desc}</p>
      </div>

      {/* Simulator Control Dock */}
      <div className="sim-controls-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingRight: '6px', borderRight: '1px solid var(--border-card)' }}>
          <span className="status-dot"></span>
          <span className="sim-tag">
            {isSimulatorRunning ? 'STREAM LIVE' : 'STREAM PAUSED'}
          </span>
        </div>

        <div className="sim-buttons">
          <button 
            className={`sim-btn ${isSimulatorRunning ? 'running' : 'idle'}`}
            onClick={onToggleSimulator}
            title={isSimulatorRunning ? "Pause live incoming stream" : "Start continuous live stream"}
          >
            {isSimulatorRunning ? <Pause size={14} /> : <Play size={14} />}
            {isSimulatorRunning ? 'Pause' : 'Stream'}
          </button>

          <button 
            className="sim-btn" 
            onClick={onStepSimulator}
            title="Step forward by 1 transaction"
          >
            <StepForward size={14} />
            Step
          </button>

          <button 
            className="sim-btn burst" 
            onClick={handleCustomBurst}
            title="Inject simulated attack burst"
          >
            <Zap size={14} />
            Inject Spike Attack
          </button>

          <button 
            className="sim-btn" 
            onClick={onResetSimulator}
            title="Reset telemetry buffer"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>
    </header>
  );
}
