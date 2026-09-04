import os
import math
import joblib
import numpy as np
import pandas as pd
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Tuple, Optional
from sklearn.ensemble import RandomForestClassifier

MODEL_DIR = os.path.join(os.path.dirname(__file__), "artifacts")
os.makedirs(MODEL_DIR, exist_ok=True)
MODEL_PATH = os.path.join(MODEL_DIR, "fraud_classifier.joblib")

# Option (a): Real PaySim feature set without fabricated device/IP fields
FEATURE_NAMES = [
    "amount",
    "amount_to_baseline_ratio",
    "hour_of_day",
    "is_night_hour",
    "tx_type_code"
]

# Mapping for PaySim types and live simulator aliases
PAYMENT_TYPES_MAP = {
    # Canonical PaySim types
    "PAYMENT": 0,
    "TRANSFER": 1,
    "CASH_OUT": 2,
    "DEBIT": 3,
    "CASH_IN": 4,
    # Live simulator UI aliases
    "CARD": 0,
    "UPI": 0,
    "NETBANKING": 1,
    "WALLET": 4,
    "OTHER": 0
}

def find_paysim_csv_path() -> Optional[str]:
    """Search for real Kaggle PaySim CSV dataset file across common local paths."""
    env_path = os.environ.get("PAYSIM_DATA_PATH")
    if env_path and os.path.exists(env_path):
        return env_path
    
    candidates = [
        "PS_20174392719_1491204439457_log.csv",
        "paysim.csv",
        os.path.join("data", "PS_20174392719_1491204439457_log.csv"),
        os.path.join("data", "paysim.csv"),
        os.path.join("backend", "data", "PS_20174392719_1491204439457_log.csv"),
        os.path.join("backend", "data", "paysim.csv"),
        os.path.join(os.path.dirname(__file__), "data", "PS_20174392719_1491204439457_log.csv"),
        os.path.join(os.path.dirname(__file__), "data", "paysim.csv"),
    ]
    for c in candidates:
        if os.path.exists(c):
            return os.path.abspath(c)
    return None

def load_or_generate_paysim_dataframe(max_rows: Optional[int] = 50000) -> pd.DataFrame:
    """
    Loads PaySim transaction data.
    If a real PaySim CSV is present on disk (PS_20174392719_1491204439457_log.csv), loads it directly.
    Otherwise, generates a canonical PaySim-structured dataset with 'M'-prefixed merchant accounts,
    step-based hours, amount deviations, and transaction types.
    """
    csv_path = find_paysim_csv_path()
    if csv_path:
        # Load from real PaySim CSV
        df = pd.read_csv(csv_path, nrows=max_rows)
        # Ensure standard column names
        df = df.rename(columns={
            "isFraud": "is_actual_fraud",
            "nameDest": "merchant_id"
        })
        # Group transactions by merchant: PaySim destinations prefixed with 'M' are merchants
        is_merchant = df["merchant_id"].astype(str).str.startswith("M")
        if is_merchant.any():
            df = df[is_merchant].copy()
        
        # Calculate merchant historical average amount
        merchant_means = df.groupby("merchant_id")["amount"].transform("mean")
        df["amount_to_baseline_ratio"] = df["amount"] / np.maximum(merchant_means, 1.0)
        
        # Step-derived hour of day (1 step = 1 hour)
        df["hour_of_day"] = (df["step"] % 24).astype(float)
        df["is_night_hour"] = df["hour_of_day"].apply(lambda h: 1.0 if (h >= 23 or h <= 5) else 0.0)
        
        # Transaction type encoding
        df["tx_type_code"] = df["type"].astype(str).str.upper().map(PAYMENT_TYPES_MAP).fillna(0.0)
        
        if "is_actual_fraud" not in df.columns and "isFraud" in df.columns:
            df["is_actual_fraud"] = df["isFraud"]
        df["is_actual_fraud"] = df["is_actual_fraud"].astype(int)
        
        # Synthetic timestamp for step continuity
        base_time = datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
        df["timestamp"] = df["step"].apply(lambda s: base_time + timedelta(hours=float(s)))
        
        return df.sort_values("step").reset_index(drop=True)

    # Fallback to PaySim-structured generator if raw 500MB Kaggle CSV is not yet downloaded
    np.random.seed(42)
    n_samples = max_rows or 10000
    n_merchants = 25
    merchants = [f"M{100000000 + i}" for i in range(n_merchants)]
    merchant_baselines = {m: float(np.random.uniform(35.0, 300.0)) for m in merchants}
    
    steps = np.sort(np.random.randint(1, 744, size=n_samples))
    assigned_merchants = np.random.choice(merchants, size=n_samples)
    
    # 96% legit, 4% fraud
    n_legit = int(n_samples * 0.96)
    n_fraud = n_samples - n_legit
    labels = np.array([0] * n_legit + [1] * n_fraud)
    np.random.shuffle(labels)
    
    types = []
    amounts = []
    ratios = []
    hours = []
    is_nights = []
    type_codes = []
    
    for idx, is_fr in enumerate(labels):
        s = int(steps[idx])
        h = float(s % 24)
        is_n = 1.0 if (h >= 23 or h <= 5) else 0.0
        m = assigned_merchants[idx]
        m_base = merchant_baselines[m]
        
        if is_fr == 0:
            tx_type = np.random.choice(["PAYMENT", "TRANSFER", "CASH_OUT", "DEBIT", "CASH_IN"], p=[0.45, 0.20, 0.25, 0.05, 0.05])
            amt = float(np.random.gamma(shape=3.0, scale=m_base / 3.0) + 5.0)
        else:
            tx_type = np.random.choice(["TRANSFER", "CASH_OUT", "PAYMENT"], p=[0.55, 0.35, 0.10])
            amt = float(np.random.gamma(shape=6.0, scale=m_base * 0.8) + m_base * 1.5)
            
        amt = round(amt, 2)
        ratio = round(amt / max(m_base, 1.0), 3)
        
        types.append(tx_type)
        amounts.append(amt)
        ratios.append(ratio)
        hours.append(h)
        is_nights.append(is_n)
        type_codes.append(float(PAYMENT_TYPES_MAP.get(tx_type, 0)))

    base_time = datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    timestamps = [base_time + timedelta(hours=float(s), minutes=float((idx % 60))) for idx, s in enumerate(steps)]

    df = pd.DataFrame({
        "step": steps,
        "timestamp": timestamps,
        "merchant_id": assigned_merchants,
        "nameOrig": [f"C{1000000 + i}" for i in range(n_samples)],
        "type": types,
        "amount": amounts,
        "amount_to_baseline_ratio": ratios,
        "hour_of_day": hours,
        "is_night_hour": is_nights,
        "tx_type_code": type_codes,
        "is_actual_fraud": labels
    })
    
    return df.sort_values("step").reset_index(drop=True)

class FeatureExtractor:
    def __init__(self):
        # Merchant baseline statistics tracking for amount ratios
        self.merchant_amount_stats: Dict[str, Dict[str, float]] = {
            "merch_apex_retail": {"mean": 85.0, "std": 35.0},
            "merch_solis_pay": {"mean": 45.0, "std": 20.0},
            "merch_lunar_travel": {"mean": 240.0, "std": 90.0},
        }

    def update_merchant_baseline(self, merchant_id: str, mean_amt: float, std_amt: float):
        self.merchant_amount_stats[merchant_id] = {"mean": mean_amt, "std": std_amt}

    def extract(self, tx_dict: Dict[str, Any]) -> Tuple[Dict[str, float], np.ndarray]:
        ts = tx_dict["timestamp"]
        if isinstance(ts, str):
            ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))

        amount = float(tx_dict["amount"])
        merchant_id = tx_dict["merchant_id"]
        method = str(tx_dict.get("payment_method") or tx_dict.get("type", "CARD")).upper()

        # Step-derived or timestamp-derived hour
        if "step" in tx_dict:
            hour = float(tx_dict["step"] % 24)
        else:
            hour = float(ts.hour)
            
        is_night = 1.0 if (hour >= 23 or hour <= 5) else 0.0
        
        # Baseline amount ratio relative to merchant's historical average
        m_stats = self.merchant_amount_stats.get(merchant_id, {"mean": 60.0, "std": 30.0})
        amount_ratio = amount / max(m_stats["mean"], 1.0)
        
        method_code = float(PAYMENT_TYPES_MAP.get(method, PAYMENT_TYPES_MAP["OTHER"]))

        feature_map = {
            "amount": amount,
            "amount_to_baseline_ratio": amount_ratio,
            "hour_of_day": hour,
            "is_night_hour": is_night,
            "tx_type_code": method_code
        }

        feature_vector = np.array([feature_map[name] for name in FEATURE_NAMES], dtype=np.float32)
        return feature_map, feature_vector

class FraudClassifierEngine:
    """
    Singleton Random Forest fraud classification engine.
    Trained strictly on real/canonical PaySim features (amount, baseline ratio, hour, night, tx type).
    Reused across both live transaction scoring and offline evaluation harness.
    """
    def __init__(self):
        self.extractor = FeatureExtractor()
        self.model: Optional[RandomForestClassifier] = None
        self.model_version = "v2.0-paysim-rf"
        self._initialize_or_load_model()

    def _initialize_or_load_model(self):
        if os.path.exists(MODEL_PATH):
            try:
                self.model = joblib.load(MODEL_PATH)
                return
            except Exception:
                pass
        
        # Train on PaySim dataset
        df = load_or_generate_paysim_dataframe(max_rows=20000)
        X = df[FEATURE_NAMES].values
        y = df["is_actual_fraud"].values

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
        
        # Calculate feature contributions based on tree importance & divergence
        contributions = self._compute_feature_contributions(feature_map, feature_vector, proba)
        
        return proba, feature_map, contributions

    def _compute_feature_contributions(
        self, feature_map: Dict[str, float], vector: np.ndarray, fraud_score: float
    ) -> List[Dict[str, Any]]:
        importances = self.model.feature_importances_
        
        baselines = {
            "amount": 60.0,
            "amount_to_baseline_ratio": 1.0,
            "hour_of_day": 14.0,
            "is_night_hour": 0.0,
            "tx_type_code": 0.0
        }

        contributions = []
        for idx, name in enumerate(FEATURE_NAMES):
            val = float(vector[idx])
            imp = float(importances[idx])
            
            # Impact calculation
            if name == "amount_to_baseline_ratio":
                impact = max(0.0, (val - 1.0) * imp * 2.0)
            elif name == "is_night_hour":
                impact = val * imp * 1.5
            elif name == "amount":
                impact = max(0.0, (val - 60.0) / 100.0 * imp)
            elif name == "tx_type_code":
                impact = imp * (1.5 if val in [1.0, 2.0] else 0.3)
            else:
                impact = imp * 0.2

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
            "hour_of_day": "Hour of Day",
            "is_night_hour": "Off-Hours Activity Window",
            "tx_type_code": "Transaction Instrument Type"
        }
        return mapping.get(raw_name, raw_name.replace("_", " ").title())

    def _get_plain_feature_description(self, raw_name: str, val: float, fmap: Dict[str, float]) -> str:
        if raw_name == "amount_to_baseline_ratio":
            if val > 1.5:
                return f"Significant ticket deviation: Amount is {val:.1f}x higher than this merchant's baseline average."
            return "Transaction amount is within normal variance for this merchant."
        elif raw_name == "is_night_hour":
            if val > 0:
                hour = int(fmap.get("hour_of_day", 0))
                return f"Off-hours timing: Transaction executed during night hours ({hour:02d}:00 UTC)."
            return "Standard business hours activity."
        elif raw_name == "amount":
            return f"Raw transaction ticket size of ₹{val:,.2f}."
        elif raw_name == "tx_type_code":
            if val in [1.0, 2.0]:
                return "High-risk PaySim transfer/cashout profile."
            return "Standard payment profile."
        return f"Feature value {val:.2f} relative to baseline distribution."

# Global singleton classifier instance (shared across live server and eval harness)
classifier_engine = FraudClassifierEngine()
