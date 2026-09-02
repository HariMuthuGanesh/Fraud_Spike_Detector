# RiskShield: Fraud-Spike Detector & Telemetry Engine
## System Implementation Manual & Technical Architecture Document
**Submission for:** Razorpay AI Buildathon — Track 02 (AI Risk Manager)  
**Repository:** [https://github.com/HariMuthuGanesh/Fraud_Spike_Detector.git](https://github.com/HariMuthuGanesh/Fraud_Spike_Detector.git)  
**Interactive Architecture Visualization:** [`docs/architecture_diagram.html`](file:///d:/RazorPay/docs/architecture_diagram.html)

---

## 1. Executive Summary & Problem Understanding

### 1.1 The Track Objective
Modern online commerce risk systems traditionally score transactions as isolated independent events. While per-transaction classifiers catch gross individual anomalies, organized attack rings execute coordinated, distributed fraud campaigns where individual transactions appear moderately benign but collectively surge to catastrophic rates within a single merchant's account.

Track 02 challenges builders to create a working **detector, verifier, or auto-responder** for merchant loss with:
1. **Measured precision and recall** on a strictly held-out test set.
2. **Honest reporting of false-positive costs**.
3. **Strictly defense-only design** (no offensive or exploitative capabilities).

### 1.2 The Vulcan Benchmark & Our Strategic Differentiation
Razorpay's production system, **Vulcan** (launched ~Aug 2026), uses a transformer foundation model trained across network-wide cross-merchant data (~3 trillion points across 4 billion payments). While Vulcan achieves high detection power through cross-merchant correlation, it suffers from several open criticisms:

| Dimension | Razorpay Vulcan | RiskShield (Our Implementation) |
| :--- | :--- | :--- |
| **Evaluation Split** | Undisclosed / Optimistic random split | **Strict chronological time-based train/test split** (no lookahead bias) |
| **Alert Explainability** | Closed probability output without attribution | **Plain-language audit trail with Tree-path SHAP feature contributions** |
| **Consent & Sharing** | Forced cross-merchant data pooling | **Strictly opt-in (Default: Isolated single-merchant)** |
| **Merchant Protection** | Tied to data pooling | **100% full capacity local protection active regardless of consent** |
| **False Positive Cost** | Hidden / Unreported | **Explicitly calculated dollar impact ($14.50 per false positive unit)** |
| **Counterfactual Guidance**| None | **Clear counterfactual statement explaining what would prevent the alert** |

---

## 2. End-to-End System Architecture

The system is organized into **6 decoupled, production-grade layers**:

```mermaid
graph TD
    subgraph Layer 1: Ingestion & Replay
        A[Live Simulator / PaySim Stream] -->|POST /ingest| B[FastAPI Gateway]
        B -->|Malformed Payload| C[DeadLetterDB]
    end

    subgraph Layer 2: Feature Engineering
        B -->|Valid Transaction| D[FeatureExtractor]
        D -->|15m Device Velocity| E[Feature Vector]
        D -->|1h IP Concentration| E
        D -->|Ticket Size Deviation| E
        D -->|Off-Hour Night Flag| E
    end

    subgraph Layer 3: ML Scoring & Explainability
        E --> F[FraudClassifierEngine]
        F -->|P(fraud) Probability| G[Scored Event]
        F -->|Tree Decision Paths| H[Feature Attribution Weights]
    end

    subgraph Layer 4: Sliding Window & Statistical Spike Detection
        G --> I[MerchantRollingBuffer]
        I -->|15-min Moving Window| J[SpikeDetectorService]
        I -->|300-tx Clean Baseline| J
        J -->|Z >= 2.5σ Anomaly| K[AlertDB & AuditRecordDB]
    end

    subgraph Layer 5: Privacy & Consent Governance
        K --> L[ConsentService]
        L -->|Opt-In = True| M[Shared Signal Queue]
        L -->|Opt-In = False (Default)| N[Single-Merchant Isolated Store]
    end

    subgraph Layer 6: API & Telemetry UI
        N --> O[REST API Endpoints]
        O --> P[4-Screen Telemetry Dashboard]
        Q[Time-Split Evaluation Harness] --> P
    end
```

---

## 3. Mathematical Formulations & Statistical Engine

### 3.1 Moving Window Fraud Rate & Z-Score Deviation
For a given merchant $m$ at current timestamp $t$, the detector evaluates a short-term sliding window $W_t = [t - 15\text{ min}, t]$ containing $N_w$ transactions:

$$\bar{f}_w = \frac{1}{N_w} \sum_{i \in W_t} P(\text{fraud}_i)$$

The merchant's historical baseline parameters $\mu_B$ (mean fraud probability) and $\sigma_B$ (standard deviation) are maintained over a longer historical buffer $B$ (up to 300 clean transactions prior to the active window):

$$\mu_B = \frac{1}{|B|} \sum_{j \in B} P(\text{fraud}_j), \quad \sigma_B = \max\left(\sqrt{\frac{1}{|B|} \sum_{j \in B} (P(\text{fraud}_j) - \mu_B)^2}, \epsilon\right)$$

Where $\epsilon = 0.02$ serves as a variance floor to prevent division-by-zero during completely benign periods.

The statistical anomaly score $Z$ is calculated as:

$$Z = \frac{\bar{f}_w - \mu_B}{\sigma_B}$$

An alert is triggered if and only if all three conditions are satisfied:
1. $Z \ge \theta_{\text{threshold}}$ (where default $\theta = 2.5\sigma$).
2. $N_w \ge N_{\text{min}}$ (minimum transaction threshold, default $N_{\text{min}} = 4$).
3. $\bar{f}_w \ge f_{\text{min\_floor}}$ (nominal risk floor, default $0.15$).

### 3.2 Baseline Contamination Guard
To prevent a rapid burst of high-fraud transactions from artificially inflating the baseline $\mu_B$ and $\sigma_B$ (which would mask the spike), the system takes the historical slice strictly *prior* to the current window:
```python
if len(self.historical_scores) > count:
    baseline_slice = self.historical_scores[:-count]
else:
    baseline_slice = [0.03, 0.04, 0.02, 0.05, 0.03, 0.04, 0.02]
```

### 3.3 False-Positive Cost Formulation
In risk operations, false alarms induce operational overhead (manual reviews) and merchant friction (declined legitimate customers / checkout cart drop-offs). The evaluation harness explicitly models false-positive cost:

$$\text{Cost}_{\text{FP}} = \text{Count}_{\text{FP}} \times (C_{\text{review}} + C_{\text{friction}})$$

Where $C_{\text{review}} = \$4.50$ (analyst review time) and $C_{\text{friction}} = \$10.00$ (margin loss from customer friction), yielding $\$14.50$ per false-positive unit.

---

## 4. Component Deep Dive

### 4.1 Ingestion & API Gateway ([`backend/app.py`](file:///d:/RazorPay/backend/app.py))
- **`POST /ingest`**: Entry point for live transactions. Validates payloads against Pydantic schema, automatically registers novel merchants, scores transactions, updates buffers, routes alerts, and returns immediate risk telemetry.
- **Dead-Letter Isolation**: Any malformed payload is intercepted in a `try...except` block and persisted into `DeadLetterDB` without crashing the ingestion stream.

### 4.2 Feature Extractor & ML Classifier ([`backend/classifier.py`](file:///d:/RazorPay/backend/classifier.py))
- **`FeatureExtractor`**:
  - `amount_to_baseline_ratio`: $\text{amount} / \mu_{\text{merchant\_amount}}$.
  - `velocity_15m_device`: Count of transactions from the same `device_hash` in past 15 minutes.
  - `velocity_1h_ip`: Count of transactions from the same `ip_hash` in past 1 hour.
  - `is_night_hour`: Binary flag ($1$ if hour $\in [23, 0, 1, 2, 3, 4, 5]$ else $0$).
- **`FraudClassifierEngine`**:
  - Random Forest Classifier (60 estimators, max depth 7, balanced class weights).
  - Feature path attribution converts mathematical weights into human-readable descriptions (e.g. *"Unusually high velocity: 5 transactions attempted from the same device in 15 minutes"*).

### 4.3 Spike Detector Engine ([`backend/spike_detector.py`](file:///d:/RazorPay/backend/spike_detector.py))
- **`MerchantRollingBuffer`**: Manages sliding transaction states in memory for fast $O(1)$ updates and sliding window queries.
- **`SpikeDetectorService`**:
  - Computes moving Z-scores.
  - Generates immutable `AlertDB` and `AuditRecordDB` entries.
  - **Idempotency**: Snaps window timestamps to 5-minute boundaries `(merchant_id, window_start, window_end)` to prevent duplicate alerts during retries or replayed feeds.
  - **Counterfactual Generator**: Synthesizes exact behavioral conditions that would have prevented the alert (e.g. *"If device velocity had remained under 2 requests per 15-min window, the fraud rate would have stayed at 0.06 and no alert would have fired"*).

### 4.4 Consent Governance Layer ([`backend/consent.py`](file:///d:/RazorPay/backend/consent.py))
- Controls whether anonymized anomaly vectors are queued for cross-merchant intelligence models.
- **Invariant**: `consent_flag` defaults to `False` (Isolated). Single-merchant fraud detection runs with 100% capacity at all times regardless of setting.
- Maintains an immutable audit history of all setting updates in `ConsentLogDB`.

### 4.5 Stream Simulator ([`backend/simulator.py`](file:///d:/RazorPay/backend/simulator.py))
- Threaded background worker replaying continuous transactions for multiple merchants.
- **Controls**: `start`, `stop`, `step`, `reset`, and **`inject_burst`** (queues 8+ coordinated high-ticket transactions from a single device/IP to demonstrate a live spike trigger for judges).

### 4.6 Offline Evaluation Harness ([`backend/eval_harness.py`](file:///d:/RazorPay/backend/eval_harness.py))
- Generates 8,000+ time-ordered transaction series.
- Applies a strict chronological split ($70\%$ train on historical dates, $30\%$ test on future dates).
- Computes Precision, Recall, FPR, Confusion Matrix (TP, FP, TN, FN), and dollar costs.

---

## 5. Knowledge Graph Analysis (`/graphify`)

The `/graphify` knowledge graph extraction over the codebase revealed **141 nodes, 303 edges, and 12 distinct community hubs**:

```
Community 0: Database Schema & System Tests (AlertDB, MerchantDB, TransactionDB)
Community 1: Frontend Dashboard & Reactive UI (initApp, drawFraudChart, telemetry)
Community 2: ML Classifier & Feature Engineering (FeatureExtractor, FraudClassifierEngine)
Community 3: Spike Detector & Rolling Buffers (MerchantRollingBuffer, SpikeDetectorService)
Community 4: Stream Simulator & Attack Replay (StreamSimulator, trigger_fraud_burst)
Community 5: Simulator & Consent Endpoints (inject_fraud_burst, update_consent)
Community 6: Time-Split Evaluation Harness (EvaluationHarness, EvalRunDB)
Community 7: Audit & Status Endpoints (get_alert_audit, get_consent, health_check)
Community 8: Transaction Ingestion & Data Schemas (ingest_transaction, schemas)
Community 9: Consent Governance & Sharing Layer (ConsentService, route_shared_signal)
Community 10: Dashboard Summary & Alert Endpoints (get_dashboard_summary, list_alerts)
Community 11: Merchant Metrics Endpoint (get_metrics)
```

### Top 5 God Nodes (Core Architectural Hubs)
1. **`StreamSimulator`** (11 edges): Bridge connecting transaction replay to the ingestion pipeline.
2. **`refreshDashboard()`** (11 edges): Frontend state manager polling real-time telemetry.
3. **`MerchantDB`** (10 edges): Central entity anchoring transactions, alerts, and consent logs.
4. **`AlertDB`** (10 edges): Hub linking sliding window spikes to explainable audit records.
5. **`ingest_transaction()`** (9 edges): Core ingestion gateway orchestrating classifier and buffer evaluation.

---

## 6. Frontend Telemetry Dashboard UI

The client interface is built with **Vanilla CSS & modern JavaScript** using a **Tactical Fintech Telemetry** aesthetic (Deep Cyber Obsidian `#060911`, Cobalt Blue `#3b82f6`, Pulse Emerald `#10b981`, and Anomaly Crimson `#f43f5e`).

### Screen Breakdown
1. **Screen 1: Merchant Risk Overview**
   - Live KPI cards: Current 15-min fraud rate, 300-tx baseline mean, $+2.5\sigma$ spike threshold, and consent isolation state.
   - Interactive HTML5 Canvas Scope plotting transaction probabilities with a glowing $+2.5\sigma$ dashed threshold line.
   - Live transaction ingestion feed ticker with real-time risk scores and spike flags.
   - Recent alerts table with direct deep-links to audit reports.
   - Live simulator controls (`Run`, `Pause`, `Step`, `↺ Reset`, `⚡ Inject Fraud Burst`).

2. **Screen 2: Alert Detail & Audit Report**
   - Plain-English narrative summary of the spike event.
   - Visual feature attribution weight bars showing Tree-path SHAP impacts.
   - Raw window telemetry box (transaction volume, unique devices, unique IPs, Z-score).
   - Counterfactual Decision Box providing actionable guidance on what would prevent the alert.

3. **Screen 3: Consent Controls**
   - Merchant opt-in toggle for pooled network intelligence (Default: OFF).
   - Single-merchant defense guarantee badges.
   - Immutable audit changelog table recording all setting modifications.

4. **Screen 4: Time-Split Evaluation Metrics**
   - Verified held-out Precision and Recall numbers.
   - False-positive rate and dollar friction cost calculation.
   - Visible evaluation temporal cutoff date (`2026-01-01 00:00:00 UTC`).
   - Side-by-side methodological comparison table against Vulcan.

---

## 7. REST API Reference

| Endpoint | Method | Request Payload | Response Summary |
| :--- | :--- | :--- | :--- |
| `/ingest` | `POST` | `{ id, merchant_id, timestamp, amount, payment_method, device_hash, ip_hash }` | `{ status, fraud_score, is_spike_detected, alert_id, current_rate, baseline_rate }` |
| `/merchants/{id}/alerts` | `GET` | — | `List[AlertSummaryResponse]` (newest first) |
| `/alerts/{id}/audit` | `GET` | — | `{ alert_id, top_features, plain_explanation, counterfactual_note, raw_stats }` |
| `/merchants/{id}/consent` | `GET` | — | `{ merchant_id, consent_flag, protection_active, audit_history }` |
| `/merchants/{id}/consent` | `POST` | `{ consent_flag: bool, reason: str }` | `{ merchant_id, consent_flag, audit_history }` |
| `/merchants/{id}/metrics` | `GET` | — | `{ precision, recall, false_positive_rate, false_positive_cost, split_date }` |
| `/dashboard/summary` | `GET` | `?merchant_id=str` | Full aggregate state for dashboard rendering |
| `/simulator/burst` | `POST` | `?merchant_id=str&count=8` | Injects coordinated fraud burst for live judge demonstration |

---

## 8. Verification & Test Suite

The test suite validates all functional layers, invariants, and API contracts:

```powershell
python -m pytest -v tests/
```

```
tests/test_system.py::test_healthz PASSED                                [ 14%]
tests/test_system.py::test_classifier_scoring_and_attribution PASSED     [ 28%]
tests/test_system.py::test_ingest_and_spike_detection_flow PASSED        [ 42%]
tests/test_system.py::test_consent_layer_invariants PASSED               [ 57%]
tests/test_system.py::test_time_split_metrics_endpoint PASSED            [ 71%]
tests/test_system.py::test_dashboard_summary_endpoint PASSED             [ 85%]
tests/test_system.py::test_simulator_controls PASSED                     [100%]
============================== 7 passed in 5.20s ==============================
```

---

## 9. Judges Pitch & Q&A Strategy

### Q1: "How does this system scale to real production volume?"
> *"At hackathon scale, we run a single-process FastAPI engine with in-memory rolling buffers. In production, the `StreamSimulator` is swapped for a partitioned Kafka/Kinesis topic keyed by `merchant_id`. The feature extraction and Random Forest scoring workers scale horizontally as stateless consumers, writing to a distributed sliding-window buffer (Redis sliding sorted sets or Apache Flink) that executes the exact $+2.5\sigma$ Z-score thresholding logic."*

### Q2: "Isn't cross-merchant detection inherently stronger than single-merchant?"
> *"Cross-merchant correlation is genuinely powerful for detecting multi-merchant card testing. We acknowledge that trade-off directly. However, black-box systems like Vulcan force data sharing without merchant consent and provide zero explainability. RiskShield proves you can achieve robust single-merchant defense with complete transparency, plain-language audit trails, and strict opt-in consent controls."*

### Q3: "Why use a time-based train/test split instead of a random split?"
> *"Random train/test splits cause temporal leakage (lookahead bias) where future transactions bleed into training data, producing deceptively high test scores. A time-based split is the only honest way to test whether a risk engine can detect a future attack spike it has never encountered before."*
