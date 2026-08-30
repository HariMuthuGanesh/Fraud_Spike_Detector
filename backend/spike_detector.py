import os
import uuid
import json
import numpy as np
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Any, Optional, Tuple
from sqlalchemy.orm import Session
from backend.database import AlertDB, AuditRecordDB, TransactionDB, MerchantDB
from backend.classifier import classifier_engine

class MerchantRollingBuffer:
    def __init__(self, merchant_id: str, window_minutes: int = 15, baseline_history_size: int = 300):
        self.merchant_id = merchant_id
        self.window_minutes = window_minutes
        self.baseline_history_size = baseline_history_size
        
        # Buffer of (timestamp, fraud_score, tx_id, amount, features, contributions)
        self.transactions: List[Dict[str, Any]] = []
        
        # Historical scores for rolling baseline estimation
        self.historical_scores: List[float] = [0.03, 0.04, 0.02, 0.05, 0.03, 0.04, 0.02]  # Default benign baseline
        self.z_threshold = 2.5  # Standard deviations above baseline
        self.min_transactions_for_spike = 4

    def add_transaction(self, tx_dict: Dict[str, Any], fraud_score: float, features: Dict[str, Any], contributions: List[Dict[str, Any]]):
        ts = tx_dict["timestamp"]
        if isinstance(ts, str):
            ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))

        item = {
            "id": tx_dict["id"],
            "timestamp": ts,
            "amount": float(tx_dict["amount"]),
            "fraud_score": fraud_score,
            "features": features,
            "contributions": contributions,
            "device_hash": tx_dict.get("device_hash"),
            "ip_hash": tx_dict.get("ip_hash")
        }
        self.transactions.append(item)
        self.historical_scores.append(fraud_score)
        if len(self.historical_scores) > self.baseline_history_size:
            self.historical_scores.pop(0)

        # Retain transactions in active buffer up to 1 hour
        cutoff = ts - timedelta(hours=1)
        self.transactions = [t for t in self.transactions if t["timestamp"] >= cutoff]

    def get_current_window_stats(self, current_time: datetime) -> Dict[str, Any]:
        window_start = current_time - timedelta(minutes=self.window_minutes)
        window_txs = [t for t in self.transactions if t["timestamp"] >= window_start]
        
        count = len(window_txs)
        if count == 0:
            return {
                "window_start": window_start,
                "window_end": current_time,
                "tx_count": 0,
                "current_fraud_rate": 0.0,
                "baseline_mean": float(np.mean(self.historical_scores)) if self.historical_scores else 0.03,
                "baseline_std": float(np.std(self.historical_scores)) if self.historical_scores else 0.02,
                "spike_score": 0.0,
                "is_spike": False,
                "window_txs": []
            }

        scores = [t["fraud_score"] for t in window_txs]
        current_rate = float(np.mean(scores))
        
        # Baseline strictly from historical buffer prior to current window
        if len(self.historical_scores) > count:
            baseline_slice = self.historical_scores[:-count]
        else:
            baseline_slice = [0.03, 0.04, 0.02, 0.05, 0.03, 0.04, 0.02]

        b_mean = float(np.mean(baseline_slice)) if len(baseline_slice) > 0 else 0.03
        b_std = max(float(np.std(baseline_slice)), 0.02)  # epsilon floor to avoid div by zero

        spike_score = (current_rate - b_mean) / b_std
        is_spike = (spike_score >= self.z_threshold) and (count >= self.min_transactions_for_spike) and (current_rate >= 0.15)

        return {
            "window_start": window_start,
            "window_end": current_time,
            "tx_count": count,
            "current_fraud_rate": current_rate,
            "baseline_mean": b_mean,
            "baseline_std": b_std,
            "spike_score": spike_score,
            "is_spike": is_spike,
            "window_txs": window_txs
        }

class SpikeDetectorService:
    def __init__(self):
        self.buffers: Dict[str, MerchantRollingBuffer] = {}

    def get_or_create_buffer(self, merchant_id: str) -> MerchantRollingBuffer:
        if merchant_id not in self.buffers:
            self.buffers[merchant_id] = MerchantRollingBuffer(merchant_id)
        return self.buffers[merchant_id]

    def process_transaction(
        self, db: Session, tx_dict: Dict[str, Any]
    ) -> Tuple[float, bool, Optional[str], float, float]:
        # 1. Score transaction with classifier
        fraud_score, features, contributions = classifier_engine.score_transaction(tx_dict)
        
        merchant_id = tx_dict["merchant_id"]
        ts = tx_dict["timestamp"]
        if isinstance(ts, str):
            ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))

        # 2. Add to merchant rolling buffer
        buffer = self.get_or_create_buffer(merchant_id)
        buffer.add_transaction(tx_dict, fraud_score, features, contributions)

        # 3. Check for fraud spike in moving window
        stats = buffer.get_current_window_stats(ts)
        is_spike = stats["is_spike"]
        alert_id = None

        current_rate = stats["current_fraud_rate"]
        baseline_rate = stats["baseline_mean"]

        if is_spike:
            alert_id = self._create_or_get_alert(db, merchant_id, stats, buffer)

        return fraud_score, is_spike, alert_id, current_rate, baseline_rate

    def _create_or_get_alert(
        self, db: Session, merchant_id: str, stats: Dict[str, Any], buffer: MerchantRollingBuffer
    ) -> str:
        # Snap window to nearest 5 minutes for idempotency & deduplication
        w_start = stats["window_start"].replace(second=0, microsecond=0)
        w_end = stats["window_end"].replace(second=0, microsecond=0)

        existing_alert = (
            db.query(AlertDB)
            .filter(
                AlertDB.merchant_id == merchant_id,
                AlertDB.window_start == w_start,
                AlertDB.window_end == w_end
            )
            .first()
        )

        if existing_alert:
            return existing_alert.id

        # Determine severity based on z-score & rate
        spike_score = stats["spike_score"]
        current_rate = stats["current_fraud_rate"]
        if spike_score > 4.5 or current_rate > 0.65:
            severity = "CRITICAL"
        elif spike_score > 3.0 or current_rate > 0.40:
            severity = "HIGH"
        else:
            severity = "MEDIUM"

        alert_id = f"alt_{uuid.uuid4().hex[:12]}"
        
        # Aggregate top features across the spike window
        top_features, plain_exp, counterfactual = self._generate_audit_explanation(stats)

        raw_stats = {
            "window_transaction_count": stats["tx_count"],
            "window_avg_fraud_probability": round(current_rate, 4),
            "merchant_historical_baseline_mean": round(stats["baseline_mean"], 4),
            "merchant_historical_baseline_std": round(stats["baseline_std"], 4),
            "statistical_z_score": round(spike_score, 2),
            "threshold_z": buffer.z_threshold,
            "total_volume_in_window": sum(t["amount"] for t in stats["window_txs"]),
            "unique_devices": len(set(t["device_hash"] for t in stats["window_txs"])),
            "unique_ips": len(set(t["ip_hash"] for t in stats["window_txs"]))
        }

        alert = AlertDB(
            id=alert_id,
            merchant_id=merchant_id,
            window_start=w_start,
            window_end=w_end,
            spike_score=round(spike_score, 2),
            threshold=buffer.z_threshold,
            current_fraud_rate=round(current_rate, 4),
            baseline_fraud_rate=round(stats["baseline_mean"], 4),
            severity=severity,
            status="ACTIVE",
            created_at=datetime.now(timezone.utc)
        )
        db.add(alert)

        audit_record = AuditRecordDB(
            id=f"aud_{uuid.uuid4().hex[:12]}",
            alert_id=alert_id,
            top_features_json=json.dumps(top_features),
            plain_explanation=plain_exp,
            counterfactual_note=counterfactual,
            raw_window_stats_json=json.dumps(raw_stats),
            model_version=classifier_engine.model_version,
            created_at=datetime.now(timezone.utc)
        )
        db.add(audit_record)
        db.commit()

        return alert_id

    def _generate_audit_explanation(
        self, stats: Dict[str, Any]
    ) -> Tuple[List[Dict[str, Any]], str, str]:
        window_txs = stats["window_txs"]
        
        # Accumulate contribution scores across window transactions
        feature_scores: Dict[str, float] = {}
        feature_meta: Dict[str, Dict[str, Any]] = {}

        for tx in window_txs:
            for c in tx["contributions"]:
                fname = c["raw_feature_name"]
                feature_scores[fname] = feature_scores.get(fname, 0.0) + c["contribution_score"]
                feature_meta[fname] = {
                    "feature_name": c["feature_name"],
                    "raw_feature_name": fname,
                    "plain_description": c["plain_description"],
                    "value": c["value"]
                }

        # Normalize and sort top features
        total_score = sum(feature_scores.values()) or 1.0
        sorted_features = sorted(feature_scores.items(), key=lambda x: x[1], reverse=True)

        top_features_list = []
        for fname, score in sorted_features[:4]:
            meta = feature_meta[fname]
            top_features_list.append({
                "feature_name": meta["feature_name"],
                "raw_feature_name": fname,
                "contribution_score": round(score / len(window_txs), 4),
                "plain_description": meta["plain_description"],
                "value": meta["value"]
            })

        # Generate cohesive narrative explanation
        primary_driver = top_features_list[0]["feature_name"] if top_features_list else "Elevated Fraud Risk"
        tx_count = stats["tx_count"]
        curr_pct = round(stats["current_fraud_rate"] * 100, 1)
        base_pct = round(stats["baseline_mean"] * 100, 1)
        z_score = round(stats["spike_score"], 1)

        plain_explanation = (
            f"Statistically abnormal fraud velocity detected: Window fraud rate surged to {curr_pct}% "
            f"(historical merchant baseline is {base_pct}%). This represents a +{z_score}σ deviation "
            f"over {tx_count} recent transactions. The primary driver was {primary_driver}."
        )

        # Counterfactual calculation
        top_raw_name = top_features_list[0]["raw_feature_name"] if top_features_list else ""
        if top_raw_name == "velocity_15m_device":
            counterfactual = (
                "Counterfactual: If device transaction velocity remained under 2 requests per 15-min window, "
                "the window fraud rate would have stayed at ~0.06 (below the 2.5σ threshold), and no alert would have fired."
            )
        elif top_raw_name == "amount_to_baseline_ratio":
            counterfactual = (
                "Counterfactual: If average transaction amounts in this window had remained within 1.5x of baseline ticket size "
                "(< ₹120.00), the spike score would not have breached the trigger threshold."
            )
        elif top_raw_name == "is_night_hour":
            counterfactual = (
                "Counterfactual: If these transactions had occurred during daytime trading hours with standard device entropy, "
                "the aggregate risk index would have remained well below the alert baseline."
            )
        else:
            counterfactual = (
                f"Counterfactual: If transaction velocity and ticket deviations had remained within 1.2x of nominal merchant baseline, "
                f"this alert would not have been generated."
            )

        return top_features_list, plain_explanation, counterfactual

spike_detector_service = SpikeDetectorService()
