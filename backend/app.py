import os
import json
import traceback
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, Depends, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session

from backend.database import get_db, init_db, MerchantDB, TransactionDB, AlertDB, AuditRecordDB, DeadLetterDB
from backend.schemas import (
    TransactionIngestRequest, IngestResponse, AuditRecordResponse,
    AlertSummaryResponse, ConsentUpdateRequest, ConsentResponse,
    MerchantMetricsResponse, DashboardSummaryResponse
)
from backend.spike_detector import spike_detector_service
from backend.consent import consent_service
from backend.eval_harness import eval_harness
from backend.simulator import simulator

app = FastAPI(
    title="Fraud-Spike Detector API",
    description="Track 02 (AI Risk Manager) - Explainable, defense-only fraud-spike detector with opt-in consent controls",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database
init_db()

@app.get("/healthz")
def health_check():
    return {"status": "ok", "service": "Fraud-Spike Detector"}

@app.post("/ingest", response_model=IngestResponse)
def ingest_transaction(payload: TransactionIngestRequest, db: Session = Depends(get_db)):
    """
    Feeds one transaction into the pipeline.
    Called by the simulator or an external ingestion stream.
    """
    try:
        tx_dict = payload.model_dump()
        
        # Check if merchant exists; if not, create on the fly
        merchant = db.query(MerchantDB).filter(MerchantDB.id == payload.merchant_id).first()
        if not merchant:
            merchant = MerchantDB(id=payload.merchant_id, name=f"Merchant {payload.merchant_id}", consent_flag=False)
            db.add(merchant)
            db.commit()

        # Score & process through spike detector
        fraud_score, is_spike, alert_id, current_rate, baseline_rate = (
            spike_detector_service.process_transaction(db, tx_dict)
        )

        # Gate consent for cross-merchant shared pool
        queue_status = "NOT_ALERT"
        if is_spike and alert_id:
            queue_status = consent_service.route_shared_signal(db, payload.merchant_id, alert_id)

        # Persist transaction
        tx_db = TransactionDB(
            id=payload.id,
            merchant_id=payload.merchant_id,
            timestamp=payload.timestamp,
            amount=payload.amount,
            payment_method=payload.payment_method,
            device_hash=payload.device_hash,
            ip_hash=payload.ip_hash,
            fraud_score=round(fraud_score, 4),
            is_actual_fraud=payload.is_actual_fraud or False,
            features_json=""
        )
        db.add(tx_db)
        db.commit()

        return IngestResponse(
            status="SUCCESS",
            transaction_id=payload.id,
            fraud_score=round(fraud_score, 4),
            is_spike_detected=is_spike,
            alert_id=alert_id,
            merchant_rolling_fraud_rate=round(current_rate, 4),
            merchant_baseline_fraud_rate=round(baseline_rate, 4),
            consent_shared_queue_status=queue_status
        )
    except Exception as e:
        # Route malformed or failed payload to dead-letter queue
        dl = DeadLetterDB(
            payload=str(payload.model_dump() if hasattr(payload, "model_dump") else payload),
            error_message=traceback.format_exc(),
            timestamp=datetime.now(timezone.utc)
        )
        db.add(dl)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Transaction routed to dead-letter queue due to error: {str(e)}"
        )

@app.get("/merchants/{merchant_id}/alerts", response_model=List[AlertSummaryResponse])
def list_merchant_alerts(merchant_id: str, limit: int = 50, db: Session = Depends(get_db)):
    """
    Lists alerts for a specific merchant, ordered newest first.
    """
    alerts = (
        db.query(AlertDB)
        .filter(AlertDB.merchant_id == merchant_id)
        .order_by(AlertDB.created_at.desc())
        .limit(limit)
        .all()
    )

    response = []
    for a in alerts:
        reason = "Abnormal statistical fraud rate surge"
        if a.audit_record:
            reason = a.audit_record.plain_explanation[:120] + "..."
        response.append(
            AlertSummaryResponse(
                id=a.id,
                merchant_id=a.merchant_id,
                window_start=a.window_start,
                window_end=a.window_end,
                spike_score=a.spike_score,
                threshold=a.threshold,
                current_fraud_rate=a.current_fraud_rate,
                baseline_fraud_rate=a.baseline_fraud_rate,
                severity=a.severity,
                status=a.status,
                one_line_reason=reason,
                created_at=a.created_at
            )
        )
    return response

@app.get("/alerts/{alert_id}/audit", response_model=AuditRecordResponse)
def get_alert_audit(alert_id: str, db: Session = Depends(get_db)):
    """
    Returns the human-readable explanation and audit trail for a specific alert.
    """
    alert = db.query(AlertDB).filter(AlertDB.id == alert_id).first()
    if not alert or not alert.audit_record:
        raise HTTPException(status_code=404, detail="Alert or audit record not found")

    audit = alert.audit_record
    top_features = json.loads(audit.top_features_json)
    raw_stats = json.loads(audit.raw_window_stats_json)

    return AuditRecordResponse(
        alert_id=alert.id,
        merchant_id=alert.merchant_id,
        window_start=alert.window_start,
        window_end=alert.window_end,
        spike_score=alert.spike_score,
        threshold=alert.threshold,
        current_fraud_rate=alert.current_fraud_rate,
        baseline_fraud_rate=alert.baseline_fraud_rate,
        top_features=top_features,
        plain_explanation=audit.plain_explanation,
        counterfactual_note=audit.counterfactual_note,
        raw_window_stats=raw_stats,
        model_version=audit.model_version,
        created_at=audit.created_at
    )

@app.get("/merchants/{merchant_id}/consent", response_model=ConsentResponse)
def get_consent(merchant_id: str, db: Session = Depends(get_db)):
    """
    Gets the consent status and audit history for a merchant.
    """
    try:
        return consent_service.get_merchant_consent(db, merchant_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.post("/merchants/{merchant_id}/consent", response_model=ConsentResponse)
def update_consent(merchant_id: str, payload: ConsentUpdateRequest, db: Session = Depends(get_db)):
    """
    Updates the opt-in flag for cross-merchant data sharing.
    """
    try:
        return consent_service.update_merchant_consent(db, merchant_id, payload.consent_flag, payload.reason)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.get("/merchants/{merchant_id}/metrics", response_model=MerchantMetricsResponse)
def get_metrics(merchant_id: str, db: Session = Depends(get_db)):
    """
    Returns held-out precision, recall, and false-positive cost based on time-split testing.
    """
    data = eval_harness.get_latest_or_compute_metrics(db, merchant_id)
    return MerchantMetricsResponse(
        merchant_id=merchant_id,
        split_date=data["split_date"],
        precision=data["precision"],
        recall=data["recall"],
        false_positive_rate=data["false_positive_rate"],
        false_positive_cost_estimate=data["false_positive_cost_estimate"],
        total_test_samples=data["total_test_samples"],
        comparison_vs_vulcan=data["comparison_vs_vulcan"],
        evaluated_at=data["evaluated_at"]
    )

@app.get("/dashboard/summary", response_model=DashboardSummaryResponse)
def get_dashboard_summary(merchant_id: Optional[str] = None, db: Session = Depends(get_db)):
    """
    Aggregate view for the demo dashboard.
    """
    merchants = db.query(MerchantDB).all()
    all_merch_list = [{"id": m.id, "name": m.name, "consent_flag": m.consent_flag} for m in merchants]
    
    selected_id = merchant_id or (all_merch_list[0]["id"] if all_merch_list else "merch_apex_retail")
    merchant = db.query(MerchantDB).filter(MerchantDB.id == selected_id).first()
    if not merchant and all_merch_list:
        merchant = merchants[0]
        selected_id = merchant.id

    # Get buffer stats for selected merchant
    buf = spike_detector_service.get_or_create_buffer(selected_id)
    current_time = datetime.now(timezone.utc)
    stats = buf.get_current_window_stats(current_time)

    # Recent alerts for selected merchant
    alerts = (
        db.query(AlertDB)
        .filter(AlertDB.merchant_id == selected_id)
        .order_by(AlertDB.created_at.desc())
        .limit(10)
        .all()
    )

    alert_responses = []
    for a in alerts:
        reason = "Abnormal statistical fraud rate surge"
        if a.audit_record:
            reason = a.audit_record.plain_explanation[:120] + "..."
        alert_responses.append(
            AlertSummaryResponse(
                id=a.id,
                merchant_id=a.merchant_id,
                window_start=a.window_start,
                window_end=a.window_end,
                spike_score=a.spike_score,
                threshold=a.threshold,
                current_fraud_rate=a.current_fraud_rate,
                baseline_fraud_rate=a.baseline_fraud_rate,
                severity=a.severity,
                status=a.status,
                one_line_reason=reason,
                created_at=a.created_at
            )
        )

    # Time series data points from recent buffer transactions
    time_series = []
    for tx in buf.transactions[-25:]:
        time_series.append({
            "timestamp": tx["timestamp"].strftime("%H:%M:%S"),
            "fraud_score": round(tx["fraud_score"], 3),
            "amount": tx["amount"]
        })

    return DashboardSummaryResponse(
        merchant_id=merchant.id if merchant else selected_id,
        merchant_name=merchant.name if merchant else "Demo Merchant",
        consent_flag=merchant.consent_flag if merchant else False,
        current_fraud_rate=round(stats["current_fraud_rate"], 4),
        baseline_fraud_rate=round(stats["baseline_mean"], 4),
        spike_threshold=buf.z_threshold,
        is_in_spike_state=stats["is_spike"],
        total_transactions_window=stats["tx_count"],
        active_alerts_count=len([a for a in alerts if a.status == "ACTIVE"]),
        recent_alerts=alert_responses,
        time_series_points=time_series,
        all_merchants=all_merch_list
    )

# --- Simulator Endpoints ---
@app.post("/simulator/start")
def start_simulator(speed_seconds: float = Query(1.0, ge=0.1, le=10.0)):
    simulator.start(speed_seconds)
    return {"status": "RUNNING", "interval_seconds": simulator.interval_seconds}

@app.post("/simulator/stop")
def stop_simulator():
    simulator.stop()
    return {"status": "STOPPED"}

@app.post("/simulator/step")
def step_simulator(merchant_id: Optional[str] = None):
    res = simulator.step(merchant_id)
    return {"status": "STEPPED", "event": res}

@app.post("/simulator/burst")
def inject_fraud_burst(merchant_id: str, count: int = Query(8, ge=3, le=25)):
    simulator.trigger_fraud_burst(merchant_id, count)
    return {
        "status": "BURST_QUEUED",
        "merchant_id": merchant_id,
        "burst_count": count,
        "message": f"Queued {count} high-velocity fraud transactions for {merchant_id}. Watch the spike detector trigger!"
    }

@app.get("/simulator/status")
def simulator_status():
    return {
        "is_running": simulator.is_running,
        "interval_seconds": simulator.interval_seconds,
        "queued_burst_items": len(simulator.burst_queue),
        "recent_events": simulator.recent_stream_events[-15:]
    }

@app.post("/simulator/reset")
def reset_simulator(db: Session = Depends(get_db)):
    simulator.stop()
    simulator.reset_stream()
    # Reset in-memory buffers
    spike_detector_service.buffers.clear()
    return {"status": "RESET_COMPLETE"}

# --- Static Frontend Delivery ---
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
if os.path.exists(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

    @app.get("/")
    def serve_index():
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))
