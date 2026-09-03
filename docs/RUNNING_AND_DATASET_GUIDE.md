# RiskShield: Operations, Execution & Dataset Guide
## Complete Guide to Running the System & Dataset Architecture
**Submission for:** Razorpay AI Buildathon — Track 02 (AI Risk Manager)  
**Repository:** [https://github.com/HariMuthuGanesh/Fraud_Spike_Detector.git](https://github.com/HariMuthuGanesh/Fraud_Spike_Detector.git)

---

## 1. Dataset Architecture & Specifications

### 1.1 Dataset Schema & Entity Fields
The pipeline operates on time-ordered transaction streams modeled after public financial fraud benchmarks (**Kaggle PaySim** and **IEEE-CIS Fraud Detection**):

| Field Name | Type | Description | Example / Range |
| :--- | :--- | :--- | :--- |
| `id` | `String` | Unique transaction identifier | `"tx_a8f9c2d10e"` |
| `merchant_id` | `String` | Target merchant identifier | `"merch_apex_retail"` |
| `timestamp` | `DateTime (ISO 8601)` | Transaction execution timestamp (UTC) | `"2026-09-03T11:30:00Z"` |
| `amount` | `Float` | Transaction monetary value | `85.50` (in currency units) |
| `payment_method` | `String` | Payment instrument used | `CARD`, `UPI`, `NETBANKING`, `WALLET` |
| `device_hash` | `String` | Cryptographic hash of client device fingerprint | `"dev_8291"` |
| `ip_hash` | `String` | Hashed client IP address / subnet identifier | `"192.168.1.45"` |
| `is_actual_fraud` | `Boolean` | Ground-truth label (used for evaluation) | `True` / `False` |

---

### 1.2 Data Behavioral Distributions (Legitimate vs. Fraudulent Bursts)

The engine models two distinct statistical behaviors:

#### A. Legitimate Background Traffic (96% nominal baseline)
- **Amount Distribution:** Gamma distribution ($\alpha=3.0, \beta=20.0$) centered around the merchant's nominal average ($\approx ₹45 - ₹240$).
- **Temporal Profile:** Standard daytime business hours ($08:00 - 22:00$ peak, $<3\%$ between $00:00 - 05:00$).
- **Device & IP Entropy:** High entropy (single transaction per device/IP within 15-minute rolling windows).
- **Payment Distribution:** Balanced across UPI ($40\%$), Credit/Debit Card ($45\%$), and NetBanking ($10\%$).

#### B. Coordinated Fraud Burst Traffic (4% anomaly surges)
- **Amount Distribution:** Gamma distribution ($\alpha=8.0, \beta=50.0$) with large ticket deviations ($3x - 10x$ above merchant baseline average).
- **Temporal Profile:** Significant skew toward off-hours night windows ($00:00 - 05:00$ UTC).
- **Device & IP Concentration:** Low entropy (rapid bursts of $4 - 15$ attempts originating from the same device or subnet within $15$ minutes).
- **Payment Distribution:** Heavy card testing skew ($65\%$ Card).

---

### 1.3 Built-in Dataset Generators vs. External CSV Ingestion

The codebase provides two ways to supply data:

1. **Built-in Stand-in Generator (`backend/simulator.py` & `backend/eval_harness.py`):**
   - Self-contained, lightweight generators producing realistic continuous transaction streams without requiring multi-gigabyte CSV downloads.
   - **Training Set:** $6,000$ synthetic transactions used to pre-fit the Random Forest model.
   - **Evaluation Set:** $8,000+$ time-ordered transactions evaluated across a strict chronological cutoff date (`2026-01-01 00:00:00 UTC`).

2. **Ingesting External Real CSV Datasets (PaySim / IEEE-CIS):**
   - Real CSV files (e.g. `PS_20174392719_1491204439457_log.csv`) can be streamed line-by-line into the system using the REST API (`POST /ingest`).

---

## 2. Step-by-Step Guide to Running the Program

### Step 1: Prerequisites & Environment Setup
Ensure you have **Python 3.10+** installed:
```powershell
python --version
```

*(Optional but recommended)* Create and activate a virtual environment:
```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

---

### Step 2: Install Dependencies
Install all required packages from `requirements.txt`:
```powershell
pip install -r requirements.txt
```

Packages installed:
- `fastapi` & `uvicorn`: High-performance asynchronous API server.
- `sqlalchemy`: Lightweight SQLite ORM layer.
- `scikit-learn`, `numpy`, `pandas`, `scipy`: Machine learning, feature engineering, and statistical anomaly detection.
- `pydantic`: Schema validation and type enforcement.
- `pytest`: Automated testing harness.

---

### Step 3: Run the Automated Test Suite
Verify that all 7 unit and integration tests pass:
```powershell
python -m pytest -v tests/
```
Expected output:
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

### Step 4: Run Offline Time-Split Evaluation Harness
To inspect the chronological generalization benchmark numbers directly in the terminal:
```powershell
python backend/eval_harness.py
```
This runs the time-based evaluation, computes Precision/Recall, calculates false-positive operational costs, and populates the database with verified benchmarks.

---

### Step 5: Start the Web Application & Server
Launch the FastAPI backend server (which automatically serves the frontend at the root URL):
```powershell
uvicorn backend.app:app --host 127.0.0.1 --port 8000 --reload
```

Output:
```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
INFO:     Application startup complete.
```

---

## 3. How to Use the Interactive Dashboard

Open **`http://127.0.0.1:8000`** in any web browser.

### A. Live Simulator Controls (Top Header)
- **`▶ Run` / `⏸ Pause`:** Starts/stops continuous background stream replay (generates transactions across active merchants).
- **`Step`:** Ingests a single transaction for step-by-step observation.
- **`⚡ Inject Fraud Burst`:** **(Best for Live Demos)** Immediately queues 8 high-velocity, coordinated fraudulent transactions to trigger a real $+2.5\sigma$ statistical spike alert!
- **`↺ Reset`:** Clears in-memory sliding buffers and resets the transaction stream.

### B. Screen 1: Dashboard Summary
- **Merchant Switcher:** Switch between *Apex Direct Electronics*, *Solis Digital Services*, and *Lunar Global Travel*.
- **Live Canvas Scope:** Real-time sparkline plotting incoming transaction risk probabilities alongside the glowing red dashed **$+2.5\sigma$ Spike Threshold Line**.
- **Live Ingestion Feed:** Real-time ticker showing incoming transaction IDs, ticket sizes, calculated risk probabilities, and consent routing status.
- **Recent Alerts Table:** Displays flagged spikes with severity badges (`CRITICAL`, `HIGH`, `MEDIUM`). Clicking **`Audit →`** opens the complete explainability view.

### C. Screen 2: Alert Audit Trail & Explainability Inspector
- **Explainable Decision Narrative:** Human-readable breakdown of the statistical deviation (e.g. *"Window fraud rate surged to 72.4% vs baseline 3.5%, a +4.2σ deviation over 8 transactions"*).
- **Feature Attribution Bars:** Tree-path contribution scores visualizing why the model flagged the transactions.
- **Counterfactual Box:** Clear explanation of what conditions would have prevented the alert (e.g. *"If device velocity remained under 2 requests per 15-min window, no alert would have fired"*).
- **Raw Window Telemetry:** Ticket volume, transaction count, unique devices, and unique IP counts.

### D. Screen 3: Consent Governance
- **Opt-In Toggle:** Toggle whether anonymized anomaly vectors are shared with the cross-merchant intelligence pool (Default: **OFF / Isolated**).
- **Protection Guarantee:** Explicit assurance that single-merchant detection remains 100% active regardless of toggle state.
- **Audit Changelog:** Immutable table logging all setting changes with timestamps and reasons.

### E. Screen 4: Time-Split Generalization Metrics
- **Honest Benchmark Card:** Shows held-out Precision, Recall, False-Positive Rate, and Estimated FP dollar friction cost.
- **Split Date:** Displays the exact chronological cutoff date (`2026-01-01 00:00:00 UTC`).
- **Vulcan Contrast Matrix:** Side-by-side comparison table contrasting our transparent auditability against black-box claims.

---

## 4. Direct API Testing (cURL / PowerShell)

You can also interact directly with the backend API via HTTP requests:

### 1. Ingest a Single Transaction (`POST /ingest`)
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8000/ingest" -Method Post -ContentType "application/json" -Body '{
  "id": "tx_manual_demo_01",
  "merchant_id": "merch_apex_retail",
  "timestamp": "2026-09-03T11:45:00Z",
  "amount": 950.00,
  "payment_method": "CARD",
  "device_hash": "dev_attacker_99",
  "ip_hash": "10.0.99.1"
}'
```

### 2. List Alerts for a Merchant (`GET /merchants/{id}/alerts`)
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8000/merchants/merch_apex_retail/alerts"
```

### 3. Retrieve Audit Record for an Alert (`GET /alerts/{alert_id}/audit`)
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8000/alerts/alt_example_id/audit"
```

### 4. Toggle Consent Setting (`POST /merchants/{id}/consent`)
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8000/merchants/merch_apex_retail/consent" -Method Post -ContentType "application/json" -Body '{
  "consent_flag": true,
  "reason": "Merchant opt-in to shared network intelligence"
}'
```

---

## 5. Troubleshooting & FAQ

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **Port 8000 in use** | Another process is occupying port 8000 | Run `uvicorn backend.app:app --port 8080` or kill the occupying PID. |
| **Reset Database** | Need to wipe test data and start fresh | Delete `fraud_detector.db` and restart uvicorn (it re-initializes tables and seeds default merchants). |
| **ModuleNotFoundError** | Running python from outside project root | Ensure your current working directory is `d:\RazorPay` before running uvicorn/pytest. |
