# 🛡️ Fraud-Spike Detector (RiskShield)
### Razorpay AI Buildathon — Track 02: AI Risk Manager

An explainable, defense-only fraud-spike detection system that monitors a merchant's transaction stream in real-time, identifies statistically abnormal risk surges ($+2.5\sigma$ z-score), and provides transparent decision explanations, counterfactual guidance, and strict opt-in consent controls for cross-merchant intelligence.

---

## 🌟 Key Highlights & Design Principles

1. **Trained on Real PaySim Benchmark Data**: The machine learning classifier is trained on real PaySim financial transaction data, grouped by merchant using `nameDest` (`M`-prefixed accounts), using genuine PaySim features (`amount`, ratio to merchant historical average, hour of day, night-time indicator, and transaction type).
2. **Unified Single-Model Architecture**: Live transaction scoring and offline evaluation harness share the exact same trained model instance (`classifier_engine`), guaranteeing that all reported metrics accurately reflect production behavior.
3. **Window-Level Spike Evaluation**: Rather than scoring transactions in isolation, the evaluation harness benchmarks spike detection at the rolling time-window level ($Z \ge 2.5\sigma$). True positive, false positive, and false negative windows are matched against independent ground-truth spike episodes built strictly from actual fraud labels.
4. **Mandatory Explainability**: Every flagged alert includes a plain-language audit trail, feature contribution weights (Tree-path attribution), and counterfactual guidance ("What would have prevented this alert?").
5. **Opt-in Consent Governance**: Gated signal sharing defaults to **OFF** (`Isolated`). Single-merchant protection is guaranteed at 100% capacity regardless of consent status.
6. **Strictly Defense-Only**: Engineered solely for defensive risk monitoring; no offensive or probing vectors.

---

## 📊 Dataset & Simulation Architecture Distinction

To maintain strict scientific honesty and operational clarity:
- **Training & Evaluation (`backend/classifier.py`, `backend/eval_harness.py`)**: Use real/canonical PaySim transaction records. Transactions are grouped by merchant account (`nameDest`), and features are strictly derived from real fields without fabricated device or IP vectors.
- **Interactive Live Demo (`backend/simulator.py`)**: An interactive demo stream generator modeled on PaySim's transaction amount distributions and coordinated fraud-burst characteristics, enabling live interactive play, pause, single-stepping, and attack burst injection on the dashboard.

---

## 🏗️ Architecture & Component Flow

```mermaid
graph TD
    A["Live Stream Generator / PaySim Feed"] --> B["Feature Extractor (Amount, Ratio, Hour, Type)"]
    B --> C["ML Fraud Classifier (PaySim RF)"]
    C --> D["Rolling Window Statistical Spike Detector"]
    D -->|"Z >= 2.5σ Anomaly"| E["Alert & Explainable Audit Generator"]
    E --> F["Consent Layer Gating"]
    F -->|"Opt-In Default OFF"| G["Cross-Merchant Shared Queue"]
    F -->|"Protected"| H["Dashboard API & SQLite Store"]
    H --> I["Interactive React Web Dashboard"]
```

- **Feature Engineering** (`backend/classifier.py`): Computes transaction ticket deviation from merchant average amount, step-derived hour of day, off-hours night flag, and instrument type code.
- **ML Classifier** (`backend/classifier.py`): Random Forest classifier generating calibrated probability $P(\text{fraud})$ and feature attribution scores.
- **Spike Detector** (`backend/spike_detector.py`): In-memory rolling-window buffer per merchant tracking short-term fraud rates against a moving baseline.
- **Consent Governance** (`backend/consent.py`): Enforces opt-in policies with immutable audit logging.
- **Evaluation Harness** (`backend/eval_harness.py`): Evaluates window-level spike precision/recall across chronological splits and calculates operational investigation costs.
- **Stream Simulator** (`backend/simulator.py`): Stand-in for real-time live ingestion feeds with play/pause, single-step, and coordinated attack burst injection.

---

## 🖥️ User Interface (4 Dedicated Screens)

1. **Dashboard Summary**: Real-time fraud rates, $+2.5\sigma$ threshold canvas chart, live transaction ingestion ticker, and recent alerts.
2. **Alert Detail & Audit Trail**: Visual feature contribution bars, raw window statistics, and plain-English counterfactual explanations.
3. **Consent Controls**: Opt-in toggle with protection guarantees and full history logs.
4. **Time-Split Metrics**: Verified window-level generalization metrics, false-positive dollar cost, and comparative benchmarks.

---

## 🚀 Quickstart Guide

### 1. Install Dependencies
```bash
pip install -r requirements.txt
cd frontend && npm install && npm run build && cd ..
```

### 2. Run Test Suite
```bash
python -m pytest -v tests/
```

### 3. Start the Server
```bash
uvicorn backend.app:app --host 127.0.0.1 --port 8000 --reload
```

Open **`http://127.0.0.1:8000`** in your browser to view the interactive dashboard.

---

## 📡 API Contract

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/ingest` | Feed a transaction into the real-time scoring and spike detection pipeline |
| `GET` | `/merchants/{id}/alerts` | List all historical alerts for a merchant (newest first) |
| `GET` | `/alerts/{id}/audit` | Human-readable explanation, feature weights, and counterfactuals |
| `GET` | `/merchants/{id}/consent` | Retrieve current consent status and audit history |
| `POST` | `/merchants/{id}/consent` | Update cross-merchant signal sharing toggle |
| `GET` | `/merchants/{id}/metrics` | Window-level time-split evaluation metrics and false-positive cost accounting |
| `GET` | `/dashboard/summary` | Aggregate dashboard state for demo presentation |
| `POST` | `/simulator/start` | Start live transaction stream replay |
| `POST` | `/simulator/burst` | Inject high-velocity coordinated fraud burst |

---

## 📂 Project Structure

```
├── backend/
│   ├── app.py                            # FastAPI routes and static delivery
│   ├── classifier.py                     # PaySim ML model & tree-path explainability
│   ├── consent.py                        # Consent governance & audit logging
│   ├── database.py                       # SQLAlchemy models & SQLite setup
│   ├── eval_harness.py                   # Window-level time-split evaluation harness
│   ├── schemas.py                        # Pydantic request/response schemas
│   ├── simulator.py                      # Interactive demo stream generator
│   └── spike_detector.py                 # Sliding window buffer & Z-score spike detector
├── frontend/                             # React + Vite White & Dark Blue UI
│   ├── src/
│   │   ├── components/                   # Sidebar, Dashboard, Audit, Consent, Metrics
│   │   ├── App.jsx                       # State orchestration
│   │   └── index.css                     # Design tokens & styles
├── tests/
│   └── test_system.py                    # 8 passing pytest unit and system integration tests
└── docs/
    ├── RUNNING_AND_DATASET_GUIDE.md      # Full execution and dataset guide
    ├── SYSTEM_IMPLEMENTATION_MANUAL.md   # Comprehensive implementation manual
    └── architecture_diagram.html         # Interactive architecture diagram
```
