import time
import uuid
import random
import threading
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
from backend.database import SessionLocal, TransactionDB
from backend.spike_detector import spike_detector_service
from backend.consent import consent_service

class StreamSimulator:
    def __init__(self):
        self.is_running = False
        self.interval_seconds = 1.0  # Time between tx generation ticks
        self.thread: Optional[threading.Thread] = None
        self.lock = threading.Lock()
        self.current_sim_time = datetime.now(timezone.utc)
        self.burst_queue: List[Dict[str, Any]] = []
        self.recent_stream_events: List[Dict[str, Any]] = []
        self.merchants = ["merch_apex_retail", "merch_solis_pay", "merch_lunar_travel"]
        self.devices = [f"dev_{random.randint(1000, 9999)}" for _ in range(30)]
        self.ips = [f"192.168.1.{random.randint(10, 250)}" for _ in range(25)]

    def generate_single_transaction(self, merchant_id: str, force_fraud: bool = False) -> Dict[str, Any]:
        self.current_sim_time += timedelta(seconds=random.randint(10, 45))
        tx_id = f"tx_{uuid.uuid4().hex[:10]}"
        
        if force_fraud:
            amount = round(random.uniform(280.0, 950.0), 2)
            payment_method = random.choice(["CARD", "NETBANKING"])
            device = random.choice(self.devices[:3])  # concentrated device
            ip = random.choice(self.ips[:2])          # concentrated IP
            is_actual = True
        else:
            is_actual = random.random() < 0.03  # 3% baseline random noise
            if merchant_id == "merch_apex_retail":
                amount = round(random.gauss(85.0, 25.0), 2)
            elif merchant_id == "merch_solis_pay":
                amount = round(random.gauss(45.0, 15.0), 2)
            else:
                amount = round(random.gauss(240.0, 60.0), 2)
            amount = max(amount, 5.0)
            payment_method = random.choice(["CARD", "UPI", "NETBANKING", "WALLET"])
            device = random.choice(self.devices)
            ip = random.choice(self.ips)

        return {
            "id": tx_id,
            "merchant_id": merchant_id,
            "timestamp": self.current_sim_time,
            "amount": amount,
            "payment_method": payment_method,
            "device_hash": device,
            "ip_hash": ip,
            "is_actual_fraud": is_actual
        }

    def trigger_fraud_burst(self, merchant_id: str, count: int = 8):
        """
        Injects a rapid burst of coordinated fraud transactions
        to trigger a genuine statistical spike alert in the spike detector.
        """
        target_device = f"dev_attacker_{random.randint(100, 999)}"
        target_ip = f"10.0.99.{random.randint(10, 50)}"
        
        with self.lock:
            for _ in range(count):
                self.current_sim_time += timedelta(seconds=random.randint(5, 20))
                tx = {
                    "id": f"tx_{uuid.uuid4().hex[:10]}",
                    "merchant_id": merchant_id,
                    "timestamp": self.current_sim_time,
                    "amount": round(random.uniform(400.0, 1200.0), 2),
                    "payment_method": "CARD",
                    "device_hash": target_device,
                    "ip_hash": target_ip,
                    "is_actual_fraud": True
                }
                self.burst_queue.append(tx)

    def process_and_store_tx(self, tx_dict: Dict[str, Any]) -> Dict[str, Any]:
        db = SessionLocal()
        try:
            fraud_score, is_spike, alert_id, current_rate, baseline_rate = (
                spike_detector_service.process_transaction(db, tx_dict)
            )

            # Route consent sharing queue
            queue_status = "NOT_ALERT"
            if is_spike and alert_id:
                queue_status = consent_service.route_shared_signal(db, tx_dict["merchant_id"], alert_id)

            # Persist transaction
            tx_db = TransactionDB(
                id=tx_dict["id"],
                merchant_id=tx_dict["merchant_id"],
                timestamp=tx_dict["timestamp"],
                amount=tx_dict["amount"],
                payment_method=tx_dict["payment_method"],
                device_hash=tx_dict["device_hash"],
                ip_hash=tx_dict["ip_hash"],
                fraud_score=round(fraud_score, 4),
                is_actual_fraud=tx_dict.get("is_actual_fraud", False),
                features_json=""
            )
            db.add(tx_db)
            db.commit()

            event_summary = {
                "transaction_id": tx_dict["id"],
                "merchant_id": tx_dict["merchant_id"],
                "timestamp": tx_dict["timestamp"].isoformat(),
                "amount": tx_dict["amount"],
                "fraud_score": round(fraud_score, 4),
                "is_spike_detected": is_spike,
                "alert_id": alert_id,
                "merchant_rolling_fraud_rate": round(current_rate, 4),
                "merchant_baseline_fraud_rate": round(baseline_rate, 4),
                "consent_shared_queue_status": queue_status
            }

            with self.lock:
                self.recent_stream_events.append(event_summary)
                if len(self.recent_stream_events) > 50:
                    self.recent_stream_events.pop(0)

            return event_summary
        finally:
            db.close()

    def _simulation_loop(self):
        while self.is_running:
            tx = None
            with self.lock:
                if self.burst_queue:
                    tx = self.burst_queue.pop(0)
            
            if not tx:
                m_id = random.choice(self.merchants)
                tx = self.generate_single_transaction(m_id, force_fraud=False)

            self.process_and_store_tx(tx)
            time.sleep(self.interval_seconds)

    def start(self, speed_seconds: float = 1.0):
        if not self.is_running:
            self.interval_seconds = max(0.1, speed_seconds)
            self.is_running = True
            self.thread = threading.Thread(target=self._simulation_loop, daemon=True)
            self.thread.start()

    def stop(self):
        self.is_running = False
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=1.0)

    def step(self, merchant_id: Optional[str] = None) -> Dict[str, Any]:
        tx = None
        with self.lock:
            if self.burst_queue:
                tx = self.burst_queue.pop(0)
        
        if not tx:
            m_id = merchant_id or random.choice(self.merchants)
            tx = self.generate_single_transaction(m_id, force_fraud=False)

        return self.process_and_store_tx(tx)

    def reset_stream(self):
        with self.lock:
            self.burst_queue.clear()
            self.recent_stream_events.clear()
            self.current_sim_time = datetime.now(timezone.utc)

simulator = StreamSimulator()
