import os
import json
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from sqlalchemy import (
    create_engine, Column, Integer, Float, String, Boolean, DateTime, Text, ForeignKey, Index
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(os.path.dirname(__file__)), "fraud_detector.db"))
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class MerchantDB(Base):
    __tablename__ = "merchants"

    id = Column(String(64), primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    consent_flag = Column(Boolean, default=False, nullable=False)  # Opt-in default: OFF
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    transactions = relationship("TransactionDB", back_populates="merchant")
    alerts = relationship("AlertDB", back_populates="merchant")
    consent_logs = relationship("ConsentLogDB", back_populates="merchant")

class TransactionDB(Base):
    __tablename__ = "transactions"

    id = Column(String(64), primary_key=True, index=True)
    merchant_id = Column(String(64), ForeignKey("merchants.id"), nullable=False, index=True)
    timestamp = Column(DateTime, nullable=False, index=True)
    amount = Column(Float, nullable=False)
    payment_method = Column(String(32), nullable=False)
    device_hash = Column(String(64), nullable=False, index=True)
    ip_hash = Column(String(64), nullable=False, index=True)
    fraud_score = Column(Float, nullable=True)
    is_actual_fraud = Column(Boolean, default=False)
    features_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    merchant = relationship("MerchantDB", back_populates="transactions")

class AlertDB(Base):
    __tablename__ = "alerts"

    id = Column(String(64), primary_key=True, index=True)
    merchant_id = Column(String(64), ForeignKey("merchants.id"), nullable=False, index=True)
    window_start = Column(DateTime, nullable=False)
    window_end = Column(DateTime, nullable=False)
    spike_score = Column(Float, nullable=False)  # Z-score or deviation
    threshold = Column(Float, nullable=False)
    current_fraud_rate = Column(Float, nullable=False)
    baseline_fraud_rate = Column(Float, nullable=False)
    severity = Column(String(16), default="HIGH")  # CRITICAL, HIGH, MEDIUM
    status = Column(String(16), default="ACTIVE")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    merchant = relationship("MerchantDB", back_populates="alerts")
    audit_record = relationship("AuditRecordDB", back_populates="alert", uselist=False, cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_merchant_window", "merchant_id", "window_start", "window_end", unique=True),
    )

class AuditRecordDB(Base):
    __tablename__ = "audit_records"

    id = Column(String(64), primary_key=True, index=True)
    alert_id = Column(String(64), ForeignKey("alerts.id"), nullable=False, unique=True, index=True)
    top_features_json = Column(Text, nullable=False)  # List of {name, raw_name, contribution, description}
    plain_explanation = Column(Text, nullable=False)
    counterfactual_note = Column(Text, nullable=False)
    raw_window_stats_json = Column(Text, nullable=False)
    model_version = Column(String(32), default="v1.0-rf-explain")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    alert = relationship("AlertDB", back_populates="audit_record")

class ConsentLogDB(Base):
    __tablename__ = "consent_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    merchant_id = Column(String(64), ForeignKey("merchants.id"), nullable=False, index=True)
    previous_state = Column(Boolean, nullable=False)
    new_state = Column(Boolean, nullable=False)
    reason = Column(String(255), nullable=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    merchant = relationship("MerchantDB", back_populates="consent_logs")

class EvalRunDB(Base):
    __tablename__ = "eval_runs"

    id = Column(String(64), primary_key=True, index=True)
    merchant_id = Column(String(64), nullable=True, index=True)  # None if global dataset
    split_date = Column(String(32), nullable=False)
    precision = Column(Float, nullable=False)
    recall = Column(Float, nullable=False)
    false_positive_rate = Column(Float, nullable=False)
    false_positive_cost_estimate = Column(Float, nullable=False)
    total_test_samples = Column(Integer, nullable=False)
    baseline_comparison_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class DeadLetterDB(Base):
    __tablename__ = "dead_letters"

    id = Column(Integer, primary_key=True, autoincrement=True)
    payload = Column(Text, nullable=False)
    error_message = Column(Text, nullable=False)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))

def init_db():
    Base.metadata.create_all(bind=engine)
    # Seed default merchants if empty
    db = SessionLocal()
    try:
        default_merchants = [
            {"id": "merch_apex_retail", "name": "Apex Direct Electronics", "consent_flag": False},
            {"id": "merch_solis_pay", "name": "Solis Digital Services", "consent_flag": True},
            {"id": "merch_lunar_travel", "name": "Lunar Global Travel", "consent_flag": False},
        ]
        for m in default_merchants:
            existing = db.query(MerchantDB).filter(MerchantDB.id == m["id"]).first()
            if not existing:
                merchant = MerchantDB(
                    id=m["id"],
                    name=m["name"],
                    consent_flag=m["consent_flag"]
                )
                db.add(merchant)
                # Seed an initial consent log
                log = ConsentLogDB(
                    merchant_id=m["id"],
                    previous_state=False,
                    new_state=m["consent_flag"],
                    reason="Initial account setup"
                )
                db.add(log)
        db.commit()
    finally:
        db.close()
