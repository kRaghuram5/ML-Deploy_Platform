import time
from collections import defaultdict
from typing import Dict, List

# Cloud Run pricing (as of 2024 — use approximate values)
# These are the real GCP Cloud Run pricing tiers
CLOUD_RUN_PRICING = {
    "cpu_per_vcpu_second": 0.00002400,   # $0.000024 per vCPU-second
    "memory_per_gb_second": 0.00000250,  # $0.0000025 per GB-second
    "request_per_million": 0.40,         # $0.40 per million requests
    "free_tier_requests": 2_000_000,     # 2M requests/month free
    "free_tier_cpu_seconds": 180_000,    # 180,000 vCPU-seconds/month free
}

# Per-model usage tracking
_usage: Dict[str, dict] = defaultdict(lambda: {
    "total_requests": 0,
    "total_cpu_seconds": 0.0,
    "total_memory_gb_seconds": 0.0,
    "hourly_requests": defaultdict(int),  # hour_key → count
    "deployed_at": time.time(),
    "monthly_estimate_usd": 0.0
})


def record_request(model_id: str, latency_ms: float, cpu_vcpu: float = 0.167,
                   memory_gb: float = 0.256):
    """
    Record a single prediction request for cost tracking.
    Default: 1/6 vCPU (smallest Cloud Run config), 256MB memory.
    """
    usage = _usage[model_id]
    duration_sec = latency_ms / 1000.0

    usage["total_requests"] += 1
    usage["total_cpu_seconds"] += duration_sec * cpu_vcpu
    usage["total_memory_gb_seconds"] += duration_sec * memory_gb

    hour_key = time.strftime("%Y-%m-%d-%H")
    usage["hourly_requests"][hour_key] += 1

    # Recalculate monthly estimate (extrapolate from current rate)
    usage["monthly_estimate_usd"] = calculate_monthly_estimate(model_id)


def calculate_monthly_estimate(model_id: str) -> float:
    """Extrapolate current usage to a full month."""
    usage = _usage[model_id]
    elapsed_hours = max((time.time() - usage["deployed_at"]) / 3600, 0.1)
    hours_in_month = 720

    # Scale factor: how many months is this usage rate
    scale = hours_in_month / elapsed_hours

    projected_requests = usage["total_requests"] * scale
    projected_cpu_sec = usage["total_cpu_seconds"] * scale
    projected_mem_sec = usage["total_memory_gb_seconds"] * scale

    # Apply free tier
    billable_requests = max(projected_requests - CLOUD_RUN_PRICING["free_tier_requests"], 0)
    billable_cpu = max(projected_cpu_sec - CLOUD_RUN_PRICING["free_tier_cpu_seconds"], 0)

    cost = (
        (billable_requests / 1_000_000) * CLOUD_RUN_PRICING["request_per_million"] +
        billable_cpu * CLOUD_RUN_PRICING["cpu_per_vcpu_second"] +
        projected_mem_sec * CLOUD_RUN_PRICING["memory_per_gb_second"]
    )

    return round(cost, 4)


def get_cost_report(model_id: str) -> dict:
    """Full cost report for a model."""
    usage = _usage[model_id]
    elapsed_hours = max((time.time() - usage["deployed_at"]) / 3600, 0.1)

    # Current session cost
    session_cost = (
        usage["total_cpu_seconds"] * CLOUD_RUN_PRICING["cpu_per_vcpu_second"] +
        usage["total_memory_gb_seconds"] * CLOUD_RUN_PRICING["memory_per_gb_second"] +
        (usage["total_requests"] / 1_000_000) * CLOUD_RUN_PRICING["request_per_million"]
    )

    # Hourly trend (last 12 hours)
    hourly_trend = []
    for i in range(12, 0, -1):
        t = time.time() - (i * 3600)
        hour_key = time.strftime("%Y-%m-%d-%H", time.localtime(t))
        hourly_trend.append({
            "hour": time.strftime("%H:00", time.localtime(t)),
            "requests": usage["hourly_requests"].get(hour_key, 0)
        })

    # Anomaly detection
    anomalies = detect_cost_anomalies(model_id, usage, session_cost)

    return {
        "model_id": model_id,
        "total_requests": usage["total_requests"],
        "session_cost_usd": round(session_cost, 6),
        "monthly_estimate_usd": usage["monthly_estimate_usd"],
        "cost_per_request_usd": round(session_cost / max(usage["total_requests"], 1), 8),
        "elapsed_hours": round(elapsed_hours, 2),
        "requests_per_hour": round(usage["total_requests"] / elapsed_hours, 1),
        "hourly_trend": hourly_trend,
        "anomalies": anomalies,
        "pricing_note": "Based on Google Cloud Run standard tier pricing"
    }


def detect_cost_anomalies(model_id: str, usage: dict, session_cost: float) -> List[dict]:
    """Detect cost-related anomalies."""
    anomalies = []

    # Anomaly 1: Monthly estimate > $10
    if usage["monthly_estimate_usd"] > 10:
        anomalies.append({
            "type": "high_monthly_estimate",
            "severity": "warning",
            "message": f"Projected monthly cost is ${usage['monthly_estimate_usd']:.2f} — consider setting request limits",
        })

    # Anomaly 2: Very high request rate
    elapsed_hours = max((time.time() - usage["deployed_at"]) / 3600, 0.1)
    rph = usage["total_requests"] / elapsed_hours
    if rph > 500:
        anomalies.append({
            "type": "high_request_rate",
            "severity": "info",
            "message": f"Model receiving {round(rph)} requests/hour — high traffic for a development deployment",
        })

    # Anomaly 3: Zero requests (idle model wasting standby cost)
    if usage["total_requests"] == 0 and elapsed_hours > 1:
        anomalies.append({
            "type": "idle_model",
            "severity": "info",
            "message": f"Model has been deployed for {round(elapsed_hours, 1)} hours with 0 requests — consider stopping it to save costs",
        })

    return anomalies


def get_all_models_cost_summary(model_ids: List[str]) -> dict:
    """Platform-wide cost summary across all deployed models."""
    total_monthly = sum(
        _usage[mid]["monthly_estimate_usd"] for mid in model_ids
    )
    total_requests = sum(_usage[mid]["total_requests"] for mid in model_ids)

    return {
        "total_models": len(model_ids),
        "total_monthly_estimate_usd": round(total_monthly, 4),
        "total_requests_all_models": total_requests,
        "per_model": [get_cost_report(mid) for mid in model_ids]
    }
