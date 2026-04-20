import time
import random
from collections import defaultdict, deque
from typing import Dict, List

# In-memory log store — keyed by model_id
# Each entry: {timestamp, status_code, latency_ms, prediction, input_size, error}
_logs: Dict[str, deque] = defaultdict(lambda: deque(maxlen=500))

# Anomaly event store — keyed by model_id
_incidents: Dict[str, List] = defaultdict(list)


def record_prediction_log(model_id: str, log_entry: dict):
    """Called every time a prediction is made via the platform's test console."""
    entry = {
        "timestamp": time.time(),
        "ts_human": time.strftime("%H:%M:%S"),
        **log_entry
    }
    _logs[model_id].append(entry)


def get_logs(model_id: str, limit: int = 100) -> List[dict]:
    return list(_logs[model_id])[-limit:]


def get_stats(model_id: str) -> dict:
    """Compute live stats from recent logs."""
    logs = list(_logs[model_id])
    if not logs:
        return {
            "total_requests": 0,
            "error_rate": 0.0,
            "avg_latency_ms": 0,
            "p95_latency_ms": 0,
            "predictions_last_5min": 0,
            "unique_prediction_values": [],
            "anomalies": []
        }

    now = time.time()
    recent = [l for l in logs if now - l["timestamp"] < 300]  # last 5 min
    errors = [l for l in logs if l.get("status_code", 200) >= 400]
    latencies = [l["latency_ms"] for l in logs if "latency_ms" in l]
    predictions = [str(l.get("prediction", "")) for l in logs if "prediction" in l]

    # Sort latencies for p95
    sorted_lat = sorted(latencies)
    p95 = sorted_lat[int(len(sorted_lat) * 0.95)] if sorted_lat else 0

    # Detect anomalies
    anomalies = detect_anomalies(logs, errors, latencies, predictions)

    return {
        "total_requests": len(logs),
        "error_rate": round(len(errors) / max(len(logs), 1) * 100, 1),
        "avg_latency_ms": round(sum(latencies) / max(len(latencies), 1)),
        "p95_latency_ms": round(p95),
        "predictions_last_5min": len(recent),
        "unique_prediction_values": list(set(predictions))[:10],
        "anomalies": anomalies
    }


def detect_anomalies(logs, errors, latencies, predictions) -> List[dict]:
    """Rule-based anomaly detection on log data."""
    anomalies = []

    # Anomaly 1: Error rate > 20%
    error_rate = len(errors) / max(len(logs), 1)
    if error_rate > 0.2:
        anomalies.append({
            "type": "high_error_rate",
            "severity": "critical",
            "message": f"Error rate is {round(error_rate*100,1)}% — {len(errors)} of {len(logs)} requests failed",
            "metric": round(error_rate * 100, 1)
        })

    # Anomaly 2: All predictions same class (model stuck)
    if predictions and len(set(predictions)) == 1 and len(predictions) > 10:
        anomalies.append({
            "type": "stuck_predictions",
            "severity": "high",
            "message": f"Model returning identical prediction '{predictions[0]}' for all {len(predictions)} requests — possible model failure",
            "metric": len(predictions)
        })

    # Anomaly 3: Latency spike — avg > 2000ms
    if latencies:
        avg_lat = sum(latencies) / len(latencies)
        if avg_lat > 2000:
            anomalies.append({
                "type": "high_latency",
                "severity": "high",
                "message": f"Average response time is {round(avg_lat)}ms — model may be overloaded or cold-starting",
                "metric": round(avg_lat)
            })

    # Anomaly 4: Sudden traffic spike — last 1 min vs avg
    now = time.time()
    last_1min = [l for l in logs if now - l["timestamp"] < 60]
    if len(logs) > 20:
        baseline = len(logs) / max((logs[-1]["timestamp"] - logs[0]["timestamp"]) / 60, 1)
        if len(last_1min) > baseline * 3:
            anomalies.append({
                "type": "traffic_spike",
                "severity": "medium",
                "message": f"Traffic spike: {len(last_1min)} requests in last minute vs baseline of {round(baseline)}/min",
                "metric": len(last_1min)
            })

    return anomalies


    return anomalies
