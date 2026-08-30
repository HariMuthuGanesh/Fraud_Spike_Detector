import os
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from backend.database import MerchantDB, ConsentLogDB

class ConsentService:
    def __init__(self):
        # Simulated cross-merchant shared pool stats for monitoring
        self.shared_queue_stats = {
            "total_signals_queued": 0,
            "total_signals_isolated_due_to_opt_out": 0
        }

    def get_merchant_consent(self, db: Session, merchant_id: str) -> Dict[str, Any]:
        merchant = db.query(MerchantDB).filter(MerchantDB.id == merchant_id).first()
        if not merchant:
            raise ValueError(f"Merchant {merchant_id} not found")

        logs = (
            db.query(ConsentLogDB)
            .filter(ConsentLogDB.merchant_id == merchant_id)
            .order_by(ConsentLogDB.timestamp.desc())
            .all()
        )

        history = [
            {
                "id": log.id,
                "previous_state": log.previous_state,
                "new_state": log.new_state,
                "reason": log.reason,
                "timestamp": log.timestamp
            }
            for log in logs
        ]

        last_updated = logs[0].timestamp if logs else merchant.created_at

        return {
            "merchant_id": merchant.id,
            "merchant_name": merchant.name,
            "consent_flag": merchant.consent_flag,
            "protection_active": True,  # Invariant: Detection is NEVER disabled by consent choice
            "shared_signals_enabled": merchant.consent_flag,
            "last_updated": last_updated,
            "audit_history": history,
            "pool_metrics": self.shared_queue_stats
        }

    def update_merchant_consent(
        self, db: Session, merchant_id: str, new_flag: bool, reason: Optional[str] = None
    ) -> Dict[str, Any]:
        merchant = db.query(MerchantDB).filter(MerchantDB.id == merchant_id).first()
        if not merchant:
            raise ValueError(f"Merchant {merchant_id} not found")

        prev_state = merchant.consent_flag
        if prev_state != new_flag:
            merchant.consent_flag = new_flag
            log = ConsentLogDB(
                merchant_id=merchant_id,
                previous_state=prev_state,
                new_state=new_flag,
                reason=reason or f"Consent changed to {'ENABLED' if new_flag else 'DISABLED'} by merchant admin",
                timestamp=datetime.now(timezone.utc)
            )
            db.add(log)
            db.commit()
            db.refresh(merchant)

        return self.get_merchant_consent(db, merchant_id)

    def route_shared_signal(self, db: Session, merchant_id: str, alert_id: str) -> str:
        """
        Gates queuing of alert/transaction signals into any cross-merchant or pooled model.
        Default: OFF (Isolated).
        """
        merchant = db.query(MerchantDB).filter(MerchantDB.id == merchant_id).first()
        if merchant and merchant.consent_flag:
            self.shared_queue_stats["total_signals_queued"] += 1
            return "QUEUED_FOR_SHARED_NETWORK_SIGNAL"
        else:
            self.shared_queue_stats["total_signals_isolated_due_to_opt_out"] += 1
            return "ISOLATED_SINGLE_MERCHANT_ONLY (Opt-out default preserved)"

consent_service = ConsentService()
