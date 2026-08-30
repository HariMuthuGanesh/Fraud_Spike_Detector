import os
import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient

from backend.database import Base, engine, SessionLocal, init_db, MerchantDB, AlertDB
from backend.app import app
from backend.classifier import classifier_engine
from backend.spike_detector import spike_detector_service
from backend.consent import consent_service

@pytest.fixture(scope="module")
def client():
    init_db()
    with TestClient(app) as c:
        yield c

def test_healthz(client):
    res = client.get("/healthz")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"

def test_classifier_scoring_and_attribution():
    tx_legit = {
        "id": "tx_legit_001",
        "merchant_id": "merch_apex_retail",
        "timestamp": datetime.now(timezone.utc),
        "amount": 75.0,
        "payment_method": "UPI",
        "device_hash": "dev_normal_1",
        "ip_hash": "192.168.1.10"
    }
    score_legit, features, contribs = classifier_engine.score_transaction(tx_legit)
    assert 0.0 <= score_legit <= 1.0
    assert len(contribs) > 0
    assert "feature_name" in contribs[0]

    # Suspicious transaction with high velocity and huge amount at night
    tx_fraud = {
        "id": "tx_fraud_001",
        "merchant_id": "merch_apex_retail",
        "timestamp": datetime.now(timezone.utc).replace(hour=3),
        "amount": 1250.0,
        "payment_method": "CARD",
        "device_hash": "dev_burst_x",
        "ip_hash": "10.0.0.99"
    }
    # Simulate velocity
    for _ in range(5):
        classifier_engine.score_transaction(tx_fraud)
    score_fraud, _, contribs_fraud = classifier_engine.score_transaction(tx_fraud)
    assert score_fraud > score_legit
    assert any("velocity" in c["raw_feature_name"] or "amount" in c["raw_feature_name"] for c in contribs_fraud)

def test_ingest_and_spike_detection_flow(client):
    # Ingest a burst of fraudulent transactions
    merchant_id = "merch_apex_retail"
    alert_ids = []
    
    for i in range(8):
        tx_payload = {
            "id": f"tx_test_spike_{i}_{datetime.now().timestamp()}",
            "merchant_id": merchant_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "amount": 900.0 + (i * 50),
            "payment_method": "CARD",
            "device_hash": "dev_test_attacker_01",
            "ip_hash": "10.0.99.100",
            "is_actual_fraud": True
        }
        res = client.post("/ingest", json=tx_payload)
        assert res.status_code == 200
        data = res.json()
        if data["is_spike_detected"] and data["alert_id"]:
            alert_ids.append(data["alert_id"])

    assert len(alert_ids) > 0, "Spike detector should have triggered an alert on high-velocity fraud burst"

    # Verify Alert in Merchant Alerts List
    res = client.get(f"/merchants/{merchant_id}/alerts")
    assert res.status_code == 200
    alerts = res.json()
    assert len(alerts) > 0

    # Verify Audit Record
    first_alert_id = alerts[0]["id"]
    res_audit = client.get(f"/alerts/{first_alert_id}/audit")
    assert res_audit.status_code == 200
    audit_data = res_audit.json()
    assert audit_data["alert_id"] == first_alert_id
    assert "counterfactual_note" in audit_data
    assert len(audit_data["top_features"]) > 0
    assert "raw_window_stats" in audit_data

def test_consent_layer_invariants(client):
    merchant_id = "merch_fresh_test_01"
    # Create merchant via ingest
    client.post("/ingest", json={
        "id": f"tx_setup_{datetime.now().timestamp()}",
        "merchant_id": merchant_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "amount": 50.0,
        "payment_method": "UPI",
        "device_hash": "dev_test_init",
        "ip_hash": "127.0.0.1"
    })
    
    # 1. Verify default is False (Opt-Out)
    res = client.get(f"/merchants/{merchant_id}/consent")
    assert res.status_code == 200
    consent_data = res.json()
    assert consent_data["consent_flag"] is False
    assert consent_data["protection_active"] is True

    # 2. Update consent to True
    res_update = client.post(
        f"/merchants/{merchant_id}/consent",
        json={"consent_flag": True, "reason": "Opt-in to network intelligence"}
    )
    assert res_update.status_code == 200
    assert res_update.json()["consent_flag"] is True

    # 3. Check history log exists
    res_check = client.get(f"/merchants/{merchant_id}/consent")
    history = res_check.json()["audit_history"]
    assert len(history) >= 1
    assert history[0]["new_state"] is True

def test_time_split_metrics_endpoint(client):
    res = client.get("/merchants/merch_apex_retail/metrics")
    assert res.status_code == 200
    data = res.json()
    assert "precision" in data
    assert "recall" in data
    assert "false_positive_cost_estimate" in data
    assert "split_date" in data
    assert "comparison_vs_vulcan" in data

def test_dashboard_summary_endpoint(client):
    res = client.get("/dashboard/summary?merchant_id=merch_apex_retail")
    assert res.status_code == 200
    data = res.json()
    assert "current_fraud_rate" in data
    assert "baseline_fraud_rate" in data
    assert "all_merchants" in data
    assert len(data["all_merchants"]) >= 3

def test_simulator_controls(client):
    # Step simulator
    res = client.post("/simulator/step?merchant_id=merch_apex_retail")
    assert res.status_code == 200
    assert res.json()["status"] == "STEPPED"

    # Status check
    res_status = client.get("/simulator/status")
    assert res_status.status_code == 200
    assert "recent_events" in res_status.json()
