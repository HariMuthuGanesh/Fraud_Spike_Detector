import os
import json
import uuid
import numpy as np
import pandas as pd
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Tuple, Optional
from sqlalchemy.orm import Session
from backend.database import SessionLocal, EvalRunDB, init_db
from backend.classifier import FraudClassifierEngine, FEATURE_NAMES

def generate_time_split_eval_dataset(n_samples: int = 10000) -> pd.DataFrame:
    np.random.seed(1337)
    start_time = datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    
    timestamps = [start_time + timedelta(minutes=int(i * 3.5)) for i in range(n_samples)]
    
    # 95% legit, 5% fraud
    n_legit = int(n_samples * 0.95)
    n_fraud = n_samples - n_legit
    
    labels = np.array([0] * n_legit + [1] * n_fraud)
    np.random.shuffle(labels)
    
    amounts = []
    ratios = []
    hours = []
    is_nights = []
    v15ms = []
    v1hs = []
    methods = []
    
    for idx, is_fr in enumerate(labels):
        ts = timestamps[idx]
        h = ts.hour
        hours.append(float(h))
        is_n = 1.0 if (h >= 23 or h <= 5) else 0.0
        is_nights.append(is_n)
        
        if is_fr == 0:
            amt = float(np.random.gamma(shape=3.0, scale=20.0) + 10.0)
            rat = amt / 60.0
            p1 = np.array([0.92, 0.06, 0.02]); p1 /= p1.sum()
            p2 = np.array([0.88, 0.08, 0.03, 0.01]); p2 /= p2.sum()
            p3 = np.array([0.50, 0.35, 0.10, 0.05]); p3 /= p3.sum()
            v15 = float(np.random.choice([1, 2, 3], p=p1))
            v1 = float(np.random.choice([1, 2, 3, 4], p=p2))
            meth = float(np.random.choice([0, 1, 2, 3], p=p3))
        else:
            amt = float(np.random.gamma(shape=7.0, scale=45.0) + 40.0)
            rat = amt / 60.0
            p1 = np.array([0.15, 0.35, 0.35, 0.15]); p1 /= p1.sum()
            p2 = np.array([0.10, 0.40, 0.35, 0.15]); p2 /= p2.sum()
            p3 = np.array([0.65, 0.20, 0.10, 0.05]); p3 /= p3.sum()
            v15 = float(np.random.choice([2, 3, 4, 6], p=p1))
            v1 = float(np.random.choice([3, 5, 8, 12], p=p2))
            meth = float(np.random.choice([0, 1, 2, 3], p=p3))

        amounts.append(amt)
        ratios.append(rat)
        v15ms.append(v15)
        v1hs.append(v1)
        methods.append(meth)

    df = pd.DataFrame({
        "timestamp": timestamps,
        "amount": amounts,
        "amount_to_baseline_ratio": ratios,
        "hour_of_day": hours,
        "is_night_hour": is_nights,
        "velocity_15m_device": v15ms,
        "velocity_1h_ip": v1hs,
        "payment_method_code": methods,
        "is_actual_fraud": labels
    })
    
    # Sort strictly by time
    df = df.sort_values("timestamp").reset_index(drop=True)
    return df

class EvaluationHarness:
    def __init__(self, cost_per_false_positive: float = 14.50):
        self.cost_per_false_positive = cost_per_false_positive  # Operational + merchant friction estimate in $

    def run_time_based_evaluation(self, db: Session, split_ratio: float = 0.70) -> Dict[str, Any]:
        df = generate_time_split_eval_dataset(8000)
        split_idx = int(len(df) * split_ratio)
        
        train_df = df.iloc[:split_idx]
        test_df = df.iloc[split_idx:].copy()
        
        split_timestamp = df.iloc[split_idx]["timestamp"].isoformat()
        
        # Train model strictly on earlier window
        from sklearn.ensemble import RandomForestClassifier
        X_train = train_df[FEATURE_NAMES].values
        y_train = train_df["is_actual_fraud"].values
        
        clf = RandomForestClassifier(n_estimators=50, max_depth=7, random_state=42, class_weight="balanced")
        clf.fit(X_train, y_train)
        
        # Evaluate on strictly future held-out slice
        X_test = test_df[FEATURE_NAMES].values
        y_test = test_df["is_actual_fraud"].values
        
        y_probs = clf.predict_proba(X_test)[:, 1]
        
        # Threshold at 0.50 for decision
        threshold = 0.50
        y_preds = (y_probs >= threshold).astype(int)
        
        tp = int(np.sum((y_preds == 1) & (y_test == 1)))
        fp = int(np.sum((y_preds == 1) & (y_test == 0)))
        tn = int(np.sum((y_preds == 0) & (y_test == 0)))
        fn = int(np.sum((y_preds == 0) & (y_test == 1)))
        
        precision = float(tp / (tp + fp)) if (tp + fp) > 0 else 0.0
        recall = float(tp / (tp + fn)) if (tp + fn) > 0 else 0.0
        fpr = float(fp / (fp + tn)) if (fp + tn) > 0 else 0.0
        
        fp_cost_estimate = round(fp * self.cost_per_false_positive, 2)
        
        # Comparative benchmark (Simulated Vulcan / Black-box with optimistic random split vs our honest time-split)
        vulcan_comparison = {
            "vulcan_reported_claim": "Catch more fraud with undisclosed metrics & closed audit trail",
            "our_system_advantage": "Full transparency, explainable audit per alert, merchant consent control, verified time-split",
            "metrics_comparison": {
                "time_split_precision": round(precision, 4),
                "time_split_recall": round(recall, 4),
                "false_positive_rate": round(fpr, 4),
                "estimated_fp_friction_cost": f"${fp_cost_estimate:,.2f}",
                "total_investigations_prevented": int(tn),
                "split_cutoff_date": split_timestamp
            }
        }

        eval_record = EvalRunDB(
            id=f"eval_{uuid.uuid4().hex[:12]}",
            merchant_id=None,  # Global benchmark
            split_date=split_timestamp,
            precision=round(precision, 4),
            recall=round(recall, 4),
            false_positive_rate=round(fpr, 4),
            false_positive_cost_estimate=fp_cost_estimate,
            total_test_samples=len(test_df),
            baseline_comparison_json=json.dumps(vulcan_comparison),
            created_at=datetime.now(timezone.utc)
        )
        db.add(eval_record)
        db.commit()

        return {
            "eval_id": eval_record.id,
            "split_date": split_timestamp,
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "false_positive_rate": round(fpr, 4),
            "false_positive_cost_estimate": fp_cost_estimate,
            "total_test_samples": len(test_df),
            "confusion_matrix": {"TP": tp, "FP": fp, "TN": tn, "FN": fn},
            "comparison_vs_vulcan": vulcan_comparison,
            "evaluated_at": eval_record.created_at
        }

    def get_latest_or_compute_metrics(self, db: Session, merchant_id: Optional[str] = None) -> Dict[str, Any]:
        latest = db.query(EvalRunDB).order_by(EvalRunDB.created_at.desc()).first()
        if not latest:
            return self.run_time_based_evaluation(db)
        
        comparison = json.loads(latest.baseline_comparison_json) if latest.baseline_comparison_json else {}
        return {
            "eval_id": latest.id,
            "split_date": latest.split_date,
            "precision": latest.precision,
            "recall": latest.recall,
            "false_positive_rate": latest.false_positive_rate,
            "false_positive_cost_estimate": latest.false_positive_cost_estimate,
            "total_test_samples": latest.total_test_samples,
            "comparison_vs_vulcan": comparison,
            "evaluated_at": latest.created_at
        }

eval_harness = EvaluationHarness()

if __name__ == "__main__":
    init_db()
    db = SessionLocal()
    res = eval_harness.run_time_based_evaluation(db)
    print("Time-Based Offline Evaluation Run:")
    print(json.dumps(res, indent=2, default=str))
    db.close()
