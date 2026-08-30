from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class TransactionIngestRequest(BaseModel):
    id: str = Field(..., description="Unique transaction ID")
    merchant_id: str = Field(..., description="Merchant identifier")
    timestamp: datetime = Field(..., description="Transaction ISO timestamp")
    amount: float = Field(..., gt=0, description="Transaction amount in currency units")
    payment_method: str = Field(..., description="e.g. CARD, UPI, NETBANKING, WALLET")
    device_hash: str = Field(..., description="Device fingerprint hash")
    ip_hash: str = Field(..., description="Hashed client IP address")
    is_actual_fraud: Optional[bool] = Field(default=False, description="Ground truth if known during simulation")

class IngestResponse(BaseModel):
    status: str
    transaction_id: str
    fraud_score: float
    is_spike_detected: bool
    alert_id: Optional[str] = None
    merchant_rolling_fraud_rate: float
    merchant_baseline_fraud_rate: float
    consent_shared_queue_status: str

class TopFeatureContribution(BaseModel):
    feature_name: str
    raw_feature_name: str
    contribution_score: float
    plain_description: str
    value: Any

class AuditRecordResponse(BaseModel):
    alert_id: str
    merchant_id: str
    window_start: datetime
    window_end: datetime
    spike_score: float
    threshold: float
    current_fraud_rate: float
    baseline_fraud_rate: float
    top_features: List[TopFeatureContribution]
    plain_explanation: str
    counterfactual_note: str
    raw_window_stats: Dict[str, Any]
    model_version: str
    created_at: datetime

class AlertSummaryResponse(BaseModel):
    id: str
    merchant_id: str
    window_start: datetime
    window_end: datetime
    spike_score: float
    threshold: float
    current_fraud_rate: float
    baseline_fraud_rate: float
    severity: str
    status: str
    one_line_reason: str
    created_at: datetime

class ConsentUpdateRequest(BaseModel):
    consent_flag: bool
    reason: Optional[str] = "Updated via merchant settings"

class ConsentResponse(BaseModel):
    merchant_id: str
    consent_flag: bool
    protection_active: bool = True
    shared_signals_enabled: bool
    last_updated: datetime
    audit_history: List[Dict[str, Any]]

class MerchantMetricsResponse(BaseModel):
    merchant_id: str
    split_date: str
    precision: float
    recall: float
    false_positive_rate: float
    false_positive_cost_estimate: float
    total_test_samples: int
    comparison_vs_vulcan: Dict[str, Any]
    evaluated_at: datetime

class DashboardSummaryResponse(BaseModel):
    merchant_id: str
    merchant_name: str
    consent_flag: bool
    current_fraud_rate: float
    baseline_fraud_rate: float
    spike_threshold: float
    is_in_spike_state: bool
    total_transactions_window: int
    active_alerts_count: int
    recent_alerts: List[AlertSummaryResponse]
    time_series_points: List[Dict[str, Any]]
    all_merchants: List[Dict[str, Any]]
