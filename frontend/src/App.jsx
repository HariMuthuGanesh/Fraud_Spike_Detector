import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import TopHeader from './components/TopHeader';
import DashboardScreen from './components/DashboardScreen';
import AuditScreen from './components/AuditScreen';
import ConsentScreen from './components/ConsentScreen';
import MetricsScreen from './components/MetricsScreen';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedMerchant, setSelectedMerchant] = useState('merch_apex_retail');
  const [isSimulatorRunning, setIsSimulatorRunning] = useState(false);
  
  const [dashboardData, setDashboardData] = useState(null);
  const [streamEvents, setStreamEvents] = useState([]);
  const [selectedAlertId, setSelectedAlertId] = useState('');
  const [auditData, setAuditData] = useState(null);
  const [consentData, setConsentData] = useState(null);
  const [metricsData, setMetricsData] = useState(null);

  // Fetch Dashboard Summary
  const fetchDashboardData = async () => {
    try {
      const res = await fetch(`/dashboard/summary?merchant_id=${selectedMerchant}`);
      if (res.ok) {
        const data = await res.json();
        setDashboardData(data);
        if (data.recent_alerts && data.recent_alerts.length > 0 && !selectedAlertId) {
          setSelectedAlertId(data.recent_alerts[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch dashboard summary', err);
    }
  };

  // Fetch Simulator Status & Stream Events
  const fetchSimulatorStatus = async () => {
    try {
      const res = await fetch('/simulator/status');
      if (res.ok) {
        const data = await res.json();
        setIsSimulatorRunning(data.is_running);
        if (data.recent_events) {
          setStreamEvents(data.recent_events);
        }
      }
    } catch (err) {
      console.error('Failed to fetch simulator status', err);
    }
  };

  // Fetch Audit Record
  const fetchAuditData = async (alertId) => {
    if (!alertId) return;
    try {
      const res = await fetch(`/alerts/${alertId}/audit`);
      if (res.ok) {
        const data = await res.json();
        setAuditData(data);
      }
    } catch (err) {
      console.error('Failed to fetch audit data', err);
    }
  };

  // Fetch Consent Info
  const fetchConsentData = async () => {
    try {
      const res = await fetch(`/merchants/${selectedMerchant}/consent`);
      if (res.ok) {
        const data = await res.json();
        setConsentData(data);
      }
    } catch (err) {
      console.error('Failed to fetch consent data', err);
    }
  };

  // Fetch Metrics Info
  const fetchMetricsData = async () => {
    try {
      const res = await fetch(`/merchants/${selectedMerchant}/metrics`);
      if (res.ok) {
        const data = await res.json();
        setMetricsData(data);
      }
    } catch (err) {
      console.error('Failed to fetch metrics', err);
    }
  };

  // Polling loop
  useEffect(() => {
    fetchDashboardData();
    fetchSimulatorStatus();
    fetchConsentData();
    fetchMetricsData();

    const interval = setInterval(() => {
      fetchDashboardData();
      fetchSimulatorStatus();
    }, 1500);

    return () => clearInterval(interval);
  }, [selectedMerchant]);

  // When selectedAlertId changes, load audit
  useEffect(() => {
    if (selectedAlertId) {
      fetchAuditData(selectedAlertId);
    }
  }, [selectedAlertId]);

  // Simulator Handlers
  const handleToggleSimulator = async () => {
    try {
      if (isSimulatorRunning) {
        await fetch('/simulator/stop', { method: 'POST' });
        setIsSimulatorRunning(false);
      } else {
        await fetch('/simulator/start?speed_seconds=1.0', { method: 'POST' });
        setIsSimulatorRunning(true);
      }
      fetchSimulatorStatus();
    } catch (err) {
      console.error('Failed to toggle simulator', err);
    }
  };

  const handleStepSimulator = async () => {
    try {
      await fetch(`/simulator/step?merchant_id=${selectedMerchant}`, { method: 'POST' });
      fetchDashboardData();
      fetchSimulatorStatus();
    } catch (err) {
      console.error('Failed to step simulator', err);
    }
  };

  const handleInjectBurst = async () => {
    try {
      await fetch(`/simulator/burst?merchant_id=${selectedMerchant}&count=8`, { method: 'POST' });
      fetchDashboardData();
      fetchSimulatorStatus();
    } catch (err) {
      console.error('Failed to inject burst', err);
    }
  };

  const handleResetSimulator = async () => {
    try {
      await fetch('/simulator/reset', { method: 'POST' });
      fetchDashboardData();
      fetchSimulatorStatus();
    } catch (err) {
      console.error('Failed to reset simulator', err);
    }
  };

  const handleInspectAlert = (alertId) => {
    setSelectedAlertId(alertId);
    setActiveTab('audit');
    fetchAuditData(alertId);
  };

  const handleToggleConsent = async (newFlag) => {
    try {
      const res = await fetch(`/merchants/${selectedMerchant}/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consent_flag: newFlag,
          reason: newFlag 
            ? 'Merchant enabled cross-merchant signal sharing' 
            : 'Merchant reverted to 100% single-merchant isolation'
        })
      });
      if (res.ok) {
        fetchConsentData();
        fetchDashboardData();
      }
    } catch (err) {
      console.error('Failed to update consent', err);
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        selectedMerchant={selectedMerchant}
        setSelectedMerchant={setSelectedMerchant}
        protectionActive={true}
      />

      {/* Main Viewport */}
      <main className="main-viewport">
        <TopHeader
          activeTab={activeTab}
          isSimulatorRunning={isSimulatorRunning}
          onToggleSimulator={handleToggleSimulator}
          onStepSimulator={handleStepSimulator}
          onInjectBurst={handleInjectBurst}
          onResetSimulator={handleResetSimulator}
        />

        {activeTab === 'dashboard' && (
          <DashboardScreen
            dashboardData={dashboardData}
            streamEvents={streamEvents}
            onInspectAlert={handleInspectAlert}
          />
        )}

        {activeTab === 'audit' && (
          <AuditScreen
            alerts={dashboardData?.recent_alerts || []}
            selectedAlertId={selectedAlertId}
            onSelectAlert={setSelectedAlertId}
            auditData={auditData}
          />
        )}

        {activeTab === 'consent' && (
          <ConsentScreen
            consentData={consentData}
            onToggleConsent={handleToggleConsent}
          />
        )}

        {activeTab === 'metrics' && (
          <MetricsScreen
            metricsData={metricsData}
          />
        )}
      </main>
    </div>
  );
}
