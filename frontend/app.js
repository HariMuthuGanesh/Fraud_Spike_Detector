// Frontend Application State
let activeMerchantId = "merch_apex_retail";
let activeTab = "dashboard";
let isSimulatorRunning = false;
let pollingTimer = null;
let currentSummaryData = null;
let currentAuditData = null;

// Initialize on DOM load
document.addEventListener("DOMContentLoaded", () => {
  initApp();
});

async function initApp() {
  await refreshDashboard();
  await loadEvaluationMetrics();
  startLivePolling();
}

function showTab(tabId) {
  activeTab = tabId;
  document.querySelectorAll(".tab-pane").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(el => el.classList.remove("active"));

  const targetPane = document.getElementById(`tab-${tabId}`);
  const targetNav = document.getElementById(`nav-${tabId}`);
  if (targetPane) targetPane.classList.add("active");
  if (targetNav) targetNav.classList.add("active");

  const titles = {
    dashboard: { title: "Merchant Risk Overview", sub: "Real-time fraud-rate tracking and moving baseline analysis" },
    audit: { title: "Alert Audit & Explainability", sub: "Human-readable decision drivers, attribution weights & counterfactuals" },
    consent: { title: "Consent & Signal Isolation", sub: "Opt-in governance for cross-merchant intelligence models" },
    metrics: { title: "Time-Split Generalization Metrics", sub: "Transparent held-out evaluation & false-positive cost accounting" }
  };

  if (titles[tabId]) {
    document.getElementById("pageTitle").innerText = titles[tabId].title;
    document.getElementById("pageSubtitle").innerText = titles[tabId].sub;
  }

  if (tabId === "consent") {
    loadConsentSettings();
  } else if (tabId === "metrics") {
    loadEvaluationMetrics();
  } else if (tabId === "audit") {
    populateAuditDropdown();
  }
}

async function switchMerchant(merchantId) {
  activeMerchantId = merchantId;
  await refreshDashboard();
  if (activeTab === "consent") {
    await loadConsentSettings();
  } else if (activeTab === "audit") {
    await populateAuditDropdown();
  }
}

// Polling for live dashboard updates
function startLivePolling() {
  if (pollingTimer) clearInterval(pollingTimer);
  pollingTimer = setInterval(async () => {
    if (activeTab === "dashboard") {
      await refreshDashboard(true);
    }
  }, 1200);
}

// Fetch & Update Dashboard Summary
async function refreshDashboard(isSilent = false) {
  try {
    const res = await fetch(`/dashboard/summary?merchant_id=${activeMerchantId}`);
    if (!res.ok) return;
    const data = await res.json();
    currentSummaryData = data;

    renderDashboardSummary(data);
    await syncSimulatorStatus();
  } catch (err) {
    if (!isSilent) console.error("Error refreshing dashboard:", err);
  }
}

function renderDashboardSummary(data) {
  // Metric Cards
  const ratePct = (data.current_fraud_rate * 100).toFixed(1);
  const basePct = (data.baseline_fraud_rate * 100).toFixed(1);

  document.getElementById("currentFraudRate").innerText = `${ratePct}%`;
  document.getElementById("baselineFraudRate").innerText = `${basePct}%`;
  document.getElementById("spikeThresholdVal").innerText = `+${data.spike_threshold.toFixed(1)}σ`;
  document.getElementById("activeSpikeAlerts").innerText = `${data.active_alerts_count} Active Spike${data.active_alerts_count === 1 ? '' : 's'}`;

  // Rate Progress Fill & Status Badge
  const fillWidth = Math.min(Math.max(data.current_fraud_rate * 100, 4), 100);
  const fillElem = document.getElementById("rateProgressFill");
  const badgeElem = document.getElementById("rateStatusBadge");

  fillElem.style.width = `${fillWidth}%`;
  if (data.is_in_spike_state) {
    badgeElem.innerText = "Spike Alert";
    badgeElem.className = "metric-badge spike";
    fillElem.style.background = "linear-gradient(90deg, #f59e0b, #f43f5e)";
  } else {
    badgeElem.innerText = "Nominal";
    badgeElem.className = "metric-badge";
    fillElem.style.background = "linear-gradient(90deg, #3b82f6, #10b981)";
  }

  // Consent Summary Badge
  const consentBadge = document.getElementById("consentSummaryBadge");
  const consentText = document.getElementById("consentStateText");
  if (data.consent_flag) {
    consentBadge.innerText = "Opted-In";
    consentBadge.className = "metric-badge";
    consentText.innerText = "Shared Signal Pool";
  } else {
    consentBadge.innerText = "Opted-Out";
    consentBadge.className = "metric-badge spike";
    consentText.innerText = "Single-Merchant Isolated";
  }

  // Render Alerts Table
  const tbody = document.getElementById("alertsTableBody");
  if (data.recent_alerts && data.recent_alerts.length > 0) {
    tbody.innerHTML = data.recent_alerts.map(a => {
      const timeStr = new Date(a.created_at).toLocaleTimeString();
      const zStr = a.spike_score > 0 ? `+${a.spike_score.toFixed(1)}σ` : `${a.spike_score.toFixed(1)}σ`;
      const sevClass = a.severity.toLowerCase();
      return `
        <tr>
          <td><code style="color:#93c5fd;">${a.id}</code></td>
          <td>${timeStr}</td>
          <td><strong style="color:${a.spike_score >= 2.5 ? '#fda4af' : '#9ca3af'};">${zStr}</strong></td>
          <td>${(a.current_fraud_rate * 100).toFixed(1)}%</td>
          <td><span class="alert-severity-badge ${sevClass}">${a.severity}</span></td>
          <td style="max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${a.one_line_reason}</td>
          <td>
            <button class="control-btn" style="padding:3px 8px; font-size:0.75rem;" onclick="inspectAlert('${a.id}')">Audit →</button>
          </td>
        </tr>
      `;
    }).join("");
  } else {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-table-msg">No alerts triggered yet. Click "⚡ Inject Fraud Burst" to simulate an attack spike.</td></tr>`;
  }

  // Draw Time Series Chart on Canvas
  drawFraudChart(data.time_series_points || []);
}

// Chart Rendering via Canvas
function drawFraudChart(points) {
  const canvas = document.getElementById("fraudChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  // Clear background
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  // Subtle Grid lines
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  for (let y = 30; y < h; y += 40) {
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(w - 20, y);
    ctx.stroke();
  }

  // Draw 2.5σ Threshold line (red dashed line at ~65% risk or score 0.40)
  const thresholdY = h - (0.45 * (h - 60)) - 30;
  ctx.save();
  ctx.strokeStyle = "#e11d48";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(40, thresholdY);
  ctx.lineTo(w - 20, thresholdY);
  ctx.stroke();
  
  ctx.fillStyle = "#be123c";
  ctx.font = "bold 10px JetBrains Mono";
  ctx.fillText("+2.5σ Anomaly Threshold", w - 160, thresholdY - 6);
  ctx.restore();

  if (!points || points.length === 0) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px Plus Jakarta Sans";
    ctx.fillText("Awaiting transaction stream points...", w / 2 - 110, h / 2);
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
  grad.addColorStop(0, "rgba(12, 86, 219, 0.16)");
  grad.addColorStop(1, "rgba(12, 86, 219, 0.0)");
  ctx.fillStyle = grad;
  ctx.fill();

  // Primary Line Stroke - Razorpay Cobalt
  ctx.beginPath();
  ctx.moveTo(coords[0].x, coords[0].y);
  coords.forEach(pt => ctx.lineTo(pt.x, pt.y));
  ctx.strokeStyle = "#0c56db";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Draw point dots with crisp white borders
  coords.forEach(pt => {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.score > 0.4 ? 4.5 : 3, 0, Math.PI * 2);
    ctx.fillStyle = pt.score > 0.4 ? "#e11d48" : "#0c56db";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
}

// Sync Simulator Status & Ingestion Ticker
async function syncSimulatorStatus() {
  try {
    const res = await fetch("/simulator/status");
    if (!res.ok) return;
    const simData = await res.json();
    isSimulatorRunning = simData.is_running;

    const playBtn = document.getElementById("btnPlay");
    const playIcon = document.getElementById("playIcon");
    if (isSimulatorRunning) {
      playBtn.className = "control-btn play-btn running";
      playIcon.innerText = "⏸ Pause";
    } else {
      playBtn.className = "control-btn play-btn";
      playIcon.innerText = "▶ Run";
    }

    // Render Stream Feed Ticker
    const streamList = document.getElementById("streamList");
    if (simData.recent_events && simData.recent_events.length > 0) {
      streamList.innerHTML = simData.recent_events.slice().reverse().map(ev => {
        const timeStr = new Date(ev.timestamp).toLocaleTimeString();
        const scoreCls = ev.fraud_score > 0.4 ? "high" : "low";
        const isSpike = ev.is_spike_detected;
        return `
          <div class="stream-item ${isSpike ? 'spike' : ''}">
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="stream-tx-id">${ev.transaction_id}</span>
              <span style="color:#6b7280; font-size:0.75rem;">₹${ev.amount}</span>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
              <span class="stream-score ${scoreCls}">Risk: ${ev.fraud_score.toFixed(3)}</span>
              ${isSpike ? '<span class="alert-severity-badge critical">SPIKE</span>' : ''}
              <span style="color:#6b7280; font-size:0.7rem;">${timeStr}</span>
            </div>
          </div>
        `;
      }).join("");
    }
  } catch (err) {
    console.error("Error syncing simulator:", err);
  }
}

// Simulator Actions
async function toggleSimulator() {
  try {
    if (isSimulatorRunning) {
      await fetch("/simulator/stop", { method: "POST" });
    } else {
      await fetch("/simulator/start?speed_seconds=0.8", { method: "POST" });
    }
    await syncSimulatorStatus();
    await refreshDashboard();
  } catch (err) {
    console.error("Toggle simulator failed:", err);
  }
}

async function stepSimulator() {
  try {
    await fetch(`/simulator/step?merchant_id=${activeMerchantId}`, { method: "POST" });
    await refreshDashboard();
  } catch (err) {
    console.error("Step simulator failed:", err);
  }
}

async function triggerFraudBurst() {
  try {
    await fetch(`/simulator/burst?merchant_id=${activeMerchantId}&count=8`, { method: "POST" });
    // If not running, step immediately or start
    if (!isSimulatorRunning) {
      await fetch("/simulator/start?speed_seconds=0.5", { method: "POST" });
    }
    await refreshDashboard();
  } catch (err) {
    console.error("Trigger burst failed:", err);
  }
}

async function resetSimulator() {
  try {
    await fetch("/simulator/reset", { method: "POST" });
    await refreshDashboard();
  } catch (err) {
    console.error("Reset failed:", err);
  }
}

// TAB 2: AUDIT & EXPLAINABILITY
async function populateAuditDropdown() {
  try {
    const res = await fetch(`/merchants/${activeMerchantId}/alerts`);
    if (!res.ok) return;
    const alerts = await res.json();

    const select = document.getElementById("auditAlertSelect");
    select.innerHTML = '<option value="">-- Choose an alert --</option>';

    if (alerts.length > 0) {
      alerts.forEach(a => {
        const time = new Date(a.created_at).toLocaleTimeString();
        select.innerHTML += `<option value="${a.id}">${a.id} (${a.severity} - ${time})</option>`;
      });
      // Auto select first
      select.value = alerts[0].id;
      loadAuditDetail(alerts[0].id);
    } else {
      select.innerHTML = '<option value="">No alerts available for this merchant</option>';
      document.getElementById("auditHeadline").innerText = "No Alerts Flagged";
      document.getElementById("auditNarrative").innerText = "This merchant currently has no anomalous fraud-spike alerts. You can trigger a simulated attack burst from the top bar.";
      document.getElementById("featureContributionsList").innerHTML = "<p style='color:#6b7280; font-size:0.85rem;'>No features to display.</p>";
      document.getElementById("rawStatsList").innerHTML = "";
    }
  } catch (err) {
    console.error("Error populating audit alerts:", err);
  }
}

async function inspectAlert(alertId) {
  showTab("audit");
  const select = document.getElementById("auditAlertSelect");
  await populateAuditDropdown();
  select.value = alertId;
  await loadAuditDetail(alertId);
}

async function loadAuditDetail(alertId) {
  if (!alertId) return;
  try {
    const res = await fetch(`/alerts/${alertId}/audit`);
    if (!res.ok) return;
    const data = await res.json();
    currentAuditData = data;

    // Header & Headline
    document.getElementById("auditAlertId").innerText = data.alert_id;
    document.getElementById("auditModelVer").innerText = `Model: ${data.model_version}`;
    document.getElementById("auditTimestamp").innerText = `${new Date(data.created_at).toUTCString()}`;
    document.getElementById("auditHeadline").innerText = `Statistically abnormal fraud velocity detected (+${data.spike_score.toFixed(1)}σ)`;
    document.getElementById("auditNarrative").innerText = data.plain_explanation;
    document.getElementById("counterfactualText").innerText = data.counterfactual_note;

    // Feature Contributions
    const featList = document.getElementById("featureContributionsList");
    const maxScore = Math.max(...data.top_features.map(f => f.contribution_score), 0.01);
    
    featList.innerHTML = data.top_features.map(f => {
      const barPct = Math.min((f.contribution_score / maxScore) * 100, 100);
      return `
        <div class="feat-item">
          <div class="feat-item-header">
            <span>${f.feature_name}</span>
            <span style="color:#06b6d4; font-family:'JetBrains Mono';">+${f.contribution_score.toFixed(3)} impact</span>
          </div>
          <div class="feat-weight-bar-bg">
            <div class="feat-weight-bar-fill" style="width: ${barPct}%;"></div>
          </div>
          <div class="feat-desc">${f.plain_description}</div>
        </div>
      `;
    }).join("");

    // Raw Window Stats
    const rawList = document.getElementById("rawStatsList");
    const stats = data.raw_window_stats;
    rawList.innerHTML = `
      <div class="stat-box">
        <span class="stat-box-label">Window Tx Count</span>
        <span class="stat-box-val">${stats.window_transaction_count || 0}</span>
      </div>
      <div class="stat-box">
        <span class="stat-box-label">Window Fraud Rate</span>
        <span class="stat-box-val">${((stats.window_avg_fraud_probability || 0) * 100).toFixed(1)}%</span>
      </div>
      <div class="stat-box">
        <span class="stat-box-label">Baseline Mean Rate</span>
        <span class="stat-box-val">${((stats.merchant_historical_baseline_mean || 0) * 100).toFixed(1)}%</span>
      </div>
      <div class="stat-box">
        <span class="stat-box-label">Statistical Z-Score</span>
        <span class="stat-box-val" style="color:#fda4af;">+${stats.statistical_z_score || 0}σ</span>
      </div>
      <div class="stat-box">
        <span class="stat-box-label">Unique Devices in Window</span>
        <span class="stat-box-val">${stats.unique_devices || 1}</span>
      </div>
      <div class="stat-box">
        <span class="stat-box-label">Total Volume in Window</span>
        <span class="stat-box-val">₹${(stats.total_volume_in_window || 0).toLocaleString()}</span>
      </div>
    `;
  } catch (err) {
    console.error("Error loading audit detail:", err);
  }
}

// TAB 3: CONSENT SETTINGS
async function loadConsentSettings() {
  try {
    const res = await fetch(`/merchants/${activeMerchantId}/consent`);
    if (!res.ok) return;
    const data = await res.json();

    document.getElementById("consentToggle").checked = data.consent_flag;

    const tbody = document.getElementById("consentHistoryTableBody");
    if (data.audit_history && data.audit_history.length > 0) {
      tbody.innerHTML = data.audit_history.map(h => {
        const timeStr = new Date(h.timestamp).toLocaleString();
        const prevBadge = h.previous_state ? '<span class="badge-success">OPTED-IN</span>' : '<span style="color:#9ca3af;">OPTED-OUT</span>';
        const newBadge = h.new_state ? '<span class="badge-success">OPTED-IN</span>' : '<span style="color:#9ca3af;">OPTED-OUT</span>';
        return `
          <tr>
            <td>${timeStr}</td>
            <td>${prevBadge}</td>
            <td>${newBadge}</td>
            <td>${h.reason || 'Admin update'}</td>
          </tr>
        `;
      }).join("");
    } else {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-table-msg">No consent updates recorded.</td></tr>`;
    }
  } catch (err) {
    console.error("Error loading consent:", err);
  }
}

async function toggleConsent(checked) {
  try {
    const res = await fetch(`/merchants/${activeMerchantId}/consent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        consent_flag: checked,
        reason: checked ? "Merchant opt-in to shared network signal" : "Merchant opted-out (single merchant isolation)"
      })
    });
    if (res.ok) {
      await loadConsentSettings();
      await refreshDashboard();
    }
  } catch (err) {
    console.error("Failed to update consent:", err);
  }
}

// TAB 4: TIME-SPLIT EVALUATION METRICS
async function loadEvaluationMetrics() {
  try {
    const res = await fetch(`/merchants/${activeMerchantId}/metrics`);
    if (!res.ok) return;
    const data = await res.json();

    document.getElementById("metricPrecision").innerText = `${(data.precision * 100).toFixed(1)}%`;
    document.getElementById("metricRecall").innerText = `${(data.recall * 100).toFixed(1)}%`;
    document.getElementById("metricFPR").innerText = `${(data.false_positive_rate * 100).toFixed(2)}%`;
    document.getElementById("metricFPCost").innerText = `$${data.false_positive_cost_estimate.toLocaleString()}`;
    document.getElementById("evalSplitDate").innerText = `${data.split_date}`;
  } catch (err) {
    console.error("Error loading metrics:", err);
  }
}
