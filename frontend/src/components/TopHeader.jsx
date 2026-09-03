import React from 'react';
import { Play, Pause, StepForward, Zap, RotateCcw } from 'lucide-react';

export default function TopHeader({ 
  activeTab, 
  isSimulatorRunning, 
  onToggleSimulator, 
  onStepSimulator, 
  onInjectBurst, 
  onResetSimulator 
}) {
  const getTabTitle = () => {
    switch (activeTab) {
      case 'dashboard':
        return {
          title: 'Merchant Risk & Spike Overview',
          desc: 'Continuous sliding-window fraud rate telemetry & real-time attack anomaly detection'
        };
      case 'audit':
        return {
          title: 'Explainable Alert Audit & Attribution',
          desc: 'Plain-language decision drivers, Tree-path feature contributions & counterfactual analysis'
        };
      case 'consent':
        return {
          title: 'Consent & Privacy Governance',
          desc: 'Opt-in cross-merchant signal sharing controls with single-merchant protection guarantees'
        };
      case 'metrics':
        return {
          title: 'Time-Split Evaluation Benchmark',
          desc: 'Honest chronological train/test split metrics, precision/recall, and false-positive cost accounting'
        };
      default:
        return { title: 'RiskShield Telemetry', desc: 'Real-time defense engine' };
    }
  };

  const { title, desc } = getTabTitle();

  return (
    <header className="top-nav">
      <div className="header-left">
        <h1>{title}</h1>
        <p>{desc}</p>
      </div>

      {/* Simulator Control Bar */}
      <div className="sim-controls-bar">
        <span className="sim-tag">Stream Engine:</span>
        <div className="sim-buttons">
          <button 
            className={`sim-btn ${isSimulatorRunning ? 'running' : 'idle'}`}
            onClick={onToggleSimulator}
          >
            {isSimulatorRunning ? <Pause size={15} /> : <Play size={15} />}
            {isSimulatorRunning ? 'Pause' : 'Run'}
          </button>

          <button className="sim-btn" onClick={onStepSimulator}>
            <StepForward size={15} />
            Step
          </button>

          <button className="sim-btn burst" onClick={onInjectBurst}>
            <Zap size={15} />
            Inject Fraud Burst
          </button>

          <button className="sim-btn" onClick={onResetSimulator}>
            <RotateCcw size={15} />
            Reset
          </button>
        </div>
      </div>
    </header>
  );
}
