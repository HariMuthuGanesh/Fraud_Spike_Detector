import os
import math
import joblib
import numpy as np
import pandas as pd
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Tuple
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler

MODEL_DIR = os.path.join(os.path.dirname(__file__), "artifacts")
os.makedirs(MODEL_DIR, exist_ok=True)
MODEL_PATH = os.path.join(MODEL_DIR, "fraud_classifier.joblib")

FEATURE_NAMES = [
    "amount",
    "amount_to_baseline_ratio",
    "hour_of_day",
    "is_night_hour",
    "velocity_15m_device",
    "velocity_1h_ip",
    "payment_method_code"
]

PAYMENT_METHODS = {"CARD": 0, "UPI": 1, "NETBANKING": 2, "WALLET": 3, "OTHER": 4}

class FeatureExtractor:
    def __init__(self):
        # In-memory fast tracking for velocity computation per merchant
        self.device_history: Dict[str, List[datetime]] = {}
        self.ip_history: Dict[str, List[datetime]] = {}
        self.merchant_amount_stats: Dict[str, Dict[str, float]] = {
            "merch_apex_retail": {"mean": 85.0, "std": 35.0},
            "merch_solis_pay": {"mean": 45.0, "std": 20.0},
            "merch_lunar_travel": {"mean": 240.0, "std": 90.0},
        }

    def clean_old_history(self, current_time: datetime, max_age_hours: int = 2):
        cutoff = current_time - timedelta(hours=max_age_hours)
        for dev in list(self.device_history.keys()):
            self.device_history[dev] = [t for t in self.device_history[dev] if t >= cutoff]
            if not self.device_history[dev]:
                del self.device_history[dev]
        for ip in list(self.ip_history.keys()):
            self.ip_history[ip] = [t for t in self.ip_history[ip] if t >= cutoff]
            if not self.ip_history[ip]:
                del self.ip_history[ip]

    def extract(self, tx_dict: Dict[str, Any]) -> Tuple[Dict[str, float], np.ndarray]:
        ts = tx_dict["timestamp"]
        if isinstance(ts, str):
            ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))

        amount = float(tx_dict["amount"])
        merchant_id = tx_dict["merchant_id"]
        device = tx_dict["device_hash"]
        ip = tx_dict["ip_hash"]
        method = tx_dict.get("payment_method", "CARD").upper()

        # Update and clean tracking
        self.clean_old_history(ts)
        
        # Calculate velocity
        cutoff_15m = ts - timedelta(minutes=15)
        cutoff_1h = ts - timedelta(hours=1)
        
        dev_times = self.device_history.get(device, [])
        v_15m = sum(1 for t in dev_times if t >= cutoff_15m) + 1  # include current
        
        ip_times = self.ip_history.get(ip, [])
        v_1h = sum(1 for t in ip_times if t >= cutoff_1h) + 1

        # Record this tx
        self.device_history.setdefault(device, []).append(ts)
        self.ip_history.setdefault(ip, []).append(ts)

        # Baseline amount stats
        m_stats = self.merchant_amount_stats.get(merchant_id, {"mean": 60.0, "std": 30.0})
        amount_ratio = amount / max(m_stats["mean"], 1.0)
        
        hour = ts.hour
        is_night = 1.0 if (hour >= 23 or hour <= 5) else 0.0
        method_code = float(PAYMENT_METHODS.get(method, PAYMENT_METHODS["OTHER"]))

        feature_map = {
            "amount": amount,
            "amount_to_baseline_ratio": amount_ratio,
            "hour_of_day": float(hour),
            "is_night_hour": is_night,
            "velocity_15m_device": float(v_15m),
            "velocity_1h_ip": float(v_1h),
            "payment_method_code": method_code
        }

        feature_vector = np.array([feature_map[name] for name in FEATURE_NAMES], dtype=np.float32)
        return feature_map, feature_vector

class FraudClassifierEngine:
    def __init__(self):
        self.extractor = FeatureExtractor()
        self.model: RandomForestClassifier = None
        self.model_version = "v1.0-rf-tree-path"
        self._initialize_or_load_model()

    def _generate_synthetic_training_data(self, n_samples: int = 5000) -> Tuple[np.ndarray, np.ndarray]:
        np.random.seed(42)
        
        # Legitimate transactions (96%)
        n_legit = int(n_samples * 0.96)
        legit_amount = np.random.gamma(shape=3.0, scale=20.0, size=n_legit) + 5.0
        legit_ratio = legit_amount / 60.0
        p_legit_hour = np.array([
            0.01, 0.01, 0.01, 0.01, 0.01, 0.02,
            0.04, 0.05, 0.06, 0.07, 0.08, 0.08,
            0.09, 0.08, 0.07, 0.07, 0.06, 0.05,
            0.04, 0.04, 0.03, 0.03, 0.02, 0.02
        ])
        p_legit_hour /= p_legit_hour.sum()
        legit_hour = np.random.choice(range(24), size=n_legit, p=p_legit_hour)
        legit_is_night = np.array([1.0 if (h >= 23 or h <= 5) else 0.0 for h in legit_hour])
        legit_v15m = np.random.choice([1, 2, 3], size=n_legit, p=[0.90, 0.08, 0.02])
        legit_v1h = np.random.choice([1, 2, 3, 4], size=n_legit, p=[0.85, 0.10, 0.04, 0.01])
        legit_method = np.random.choice([0, 1, 2, 3], size=n_legit, p=[0.45, 0.40, 0.10, 0.05])
        
        X_legit = np.column_stack([
            legit_amount, legit_ratio, legit_hour, legit_is_night,
            legit_v15m, legit_v1h, legit_method
        ])
        y_legit = np.zeros(n_legit, dtype=np.int32)

        # Fraudulent transactions (4%)
        n_fraud = n_samples - n_legit
        fraud_amount = np.random.gamma(shape=8.0, scale=50.0, size=n_fraud) + 50.0
        fraud_ratio = fraud_amount / 60.0
        p_fraud_hour = np.array([
            0.10, 0.12, 0.10, 0.09, 0.08, 0.06,
            0.02, 0.02, 0.02, 0.02, 0.02, 0.03,
            0.03, 0.03, 0.03, 0.03, 0.03, 0.03,
            0.04, 0.04, 0.05, 0.06, 0.08, 0.08
        ])
        p_fraud_hour /= p_fraud_hour.sum()
        fraud_hour = np.random.choice(range(24), size=n_fraud, p=p_fraud_hour)
        fraud_is_night = np.array([1.0 if (h >= 23 or h <= 5) else 0.0 for h in fraud_hour])
        fraud_v15m = np.random.choice([2, 3, 4, 5, 8], size=n_fraud, p=[0.10, 0.20, 0.30, 0.25, 0.15])
        fraud_v1h = np.random.choice([3, 5, 8, 12], size=n_fraud, p=[0.15, 0.35, 0.30, 0.20])
        fraud_method = np.random.choice([0, 1, 2, 3], size=n_fraud, p=[0.60, 0.25, 0.10, 0.05])

        X_fraud = np.column_stack([
            fraud_amount, fraud_ratio, fraud_hour, fraud_is_night,
            fraud_v15m, fraud_v1h, fraud_method
        ])
        y_fraud = np.ones(n_fraud, dtype=np.int32)

        X = np.vstack([X_legit, X_fraud])
        y = np.concatenate([y_legit, y_fraud])
        return X, y

    def _initialize_or_load_model(self):
        if os.path.exists(MODEL_PATH):
            try:
                self.model = joblib.load(MODEL_PATH)
                return
            except Exception:
                pass
        
        # Train and save model
        X, y = self._generate_synthetic_training_data(6000)
        self.model = RandomForestClassifier(
            n_estimators=60,
            max_depth=7,
            min_samples_split=4,
            random_state=42,
            class_weight="balanced"
        )
        self.model.fit(X, y)
        joblib.dump(self.model, MODEL_PATH)

    def score_transaction(self, tx_dict: Dict[str, Any]) -> Tuple[float, Dict[str, float], List[Dict[str, Any]]]:
        feature_map, feature_vector = self.extractor.extract(tx_dict)
        X = feature_vector.reshape(1, -1)
        
        # Fraud probability (class 1)
        proba = float(self.model.predict_proba(X)[0][1])
        
        # Calculate feature contributions based on tree importance & divergence from mean
        contributions = self._compute_feature_contributions(feature_map, feature_vector, proba)
        
        return proba, feature_map, contributions

    def _compute_feature_contributions(
        self, feature_map: Dict[str, float], vector: np.ndarray, fraud_score: float
    ) -> List[Dict[str, Any]]:
        importances = self.model.feature_importances_
        
        # Normal reference baselines
        baselines = {
            "amount": 60.0,
            "amount_to_baseline_ratio": 1.0,
            "hour_of_day": 14.0,
            "is_night_hour": 0.0,
            "velocity_15m_device": 1.0,
            "velocity_1h_ip": 1.0,
            "payment_method_code": 0.0
        }

        contributions = []
        for idx, name in enumerate(FEATURE_NAMES):
            val = float(vector[idx])
            base_val = baselines[name]
            imp = float(importances[idx])
            
            # Impact estimation
            if name == "amount_to_baseline_ratio":
                impact = max(0.0, (val - 1.0) * imp * 1.5)
            elif name == "velocity_15m_device":
                impact = max(0.0, (val - 1.0) * imp * 2.0)
            elif name == "velocity_1h_ip":
                impact = max(0.0, (val - 1.0) * imp * 1.8)
            elif name == "is_night_hour":
                impact = val * imp * 1.2
            elif name == "amount":
                impact = max(0.0, (val - 60.0) / 100.0 * imp)
            else:
                impact = imp * 0.2

            # Plain description
            desc = self._get_plain_feature_description(name, val, feature_map)
            
            contributions.append({
                "feature_name": self._get_human_feature_name(name),
                "raw_feature_name": name,
                "contribution_score": round(float(impact), 4),
                "plain_description": desc,
                "value": val
            })

        contributions.sort(key=lambda x: x["contribution_score"], reverse=True)
        return contributions

    def _get_human_feature_name(self, raw_name: str) -> str:
        mapping = {
            "amount": "Transaction Ticket Size",
            "amount_to_baseline_ratio": "Deviation from Merchant Average Amount",
            "hour_of_day": "Time of Day",
            "is_night_hour": "Off-Hours Activity Window",
            "velocity_15m_device": "Device Velocity (15-min Window)",
            "velocity_1h_ip": "IP Request Concentration (1-hour Window)",
            "payment_method_code": "Payment Instrument Profile"
        }
        return mapping.get(raw_name, raw_name.replace("_", " ").title())

    def _get_plain_feature_description(self, raw_name: str, val: float, fmap: Dict[str, float]) -> str:
        if raw_name == "velocity_15m_device":
            if val > 1:
                return f"Unusually high velocity: {int(val)} transactions attempted from the same device in 15 minutes."
            return "Normal device velocity (single transaction in window)."
        elif raw_name == "amount_to_baseline_ratio":
            if val > 1.5:
                return f"Significant ticket deviation: Transaction amount is {val:.1f}x higher than this merchant's baseline average."
            return "Transaction amount is within normal variance for this merchant."
        elif raw_name == "is_night_hour":
            if val > 0:
                hour = int(fmap.get("hour_of_day", 0))
                return f"Off-hours burst: Transaction was initiated during high-risk night hours ({hour:02d}:00 UTC)."
            return "Standard business hours activity."
        elif raw_name == "velocity_1h_ip":
            if val > 2:
                return f"IP cluster activity: {int(val)} transactions originating from the same IP address within the last hour."
            return "Single request from IP address."
        elif raw_name == "amount":
            return f"Raw transaction amount of ₹{val:,.2f}."
        return f"Feature value {val:.2f} relative to typical baseline distribution."

# Global singleton
classifier_engine = FraudClassifierEngine()
