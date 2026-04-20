import subprocess
import requests
import time
from typing import Optional

GCLOUD = "/Users/likhithmr/Desktop/Cloud/google-cloud-sdk/bin/gcloud"
FIREBASE_PROJECT = "cloud2026-f6912"
GCP_PROJECT = "cloud2026-492918"
FIRESTORE_BASE = (
    f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT}"
    "/databases/(default)/documents"
)
MONITORING_BASE = (
    f"https://monitoring.googleapis.com/v3/projects/{GCP_PROJECT}/timeSeries"
)

_token_cache: dict = {"token": "", "expires_at": 0}


def _get_token() -> str:
    """Cache gcloud access token for 50 mins to avoid subprocess overhead."""
    now = time.time()
    if now < _token_cache["expires_at"] and _token_cache["token"]:
        return _token_cache["token"]

    result = subprocess.run(
        [GCLOUD, "auth", "print-access-token"],
        capture_output=True, text=True
    )
    token = result.stdout.strip()
    _token_cache["token"] = token
    _token_cache["expires_at"] = now + 50 * 60  # 50 minutes
    return token


def _to_fs(v):
    """Convert Python value to Firestore value object."""
    if isinstance(v, bool):
        return {"booleanValue": v}
    if isinstance(v, int):
        return {"integerValue": str(v)}
    if isinstance(v, float):
        return {"doubleValue": v}
    if isinstance(v, list):
        return {"arrayValue": {"values": [_to_fs(i) for i in v]}}
    if v is None:
        return {"nullValue": None}
    return {"stringValue": str(v)}


def _from_fs(value_obj: dict):
    """Convert a single Firestore value object to Python."""
    if "stringValue" in value_obj:
        return value_obj["stringValue"]
    if "integerValue" in value_obj:
        return int(value_obj["integerValue"])
    if "doubleValue" in value_obj:
        return value_obj["doubleValue"]
    if "booleanValue" in value_obj:
        return value_obj["booleanValue"]
    if "arrayValue" in value_obj:
        return [_from_fs(v) for v in value_obj["arrayValue"].get("values", [])]
    if "nullValue" in value_obj:
        return None
    return None


# ── Firestore helpers ────────────────────────────────────────────────────────

def save_deployment(data: dict) -> bool:
    """Write/overwrite a deployed model record in Firestore."""
    try:
        token = _get_token()
        model_id = data["model_id"]
        url = f"{FIRESTORE_BASE}/deployedModels/{model_id}"
        fields = {k: _to_fs(v) for k, v in data.items()}
        r = requests.patch(
            url,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"fields": fields},
            timeout=10,
        )
        return r.status_code in (200, 201)
    except Exception:
        return False  # Non-fatal — deployment still succeeded


# ── GCP Cloud Monitoring helpers ─────────────────────────────────────────────

def _hours_ago_rfc3339(hours: float) -> str:
    t = time.time() - hours * 3600
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t))


def _now_rfc3339() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def get_metrics(service_name: str, hours: float = 1.0) -> dict:
    """Pull request_count, latency, and instance_count from Cloud Monitoring."""
    token = _get_token()
    headers = {"Authorization": f"Bearer {token}"}
    base_filter = (
        f'resource.type="cloud_run_revision" '
        f'AND resource.labels.service_name="{service_name}"'
    )
    start = _hours_ago_rfc3339(hours)
    end = _now_rfc3339()

    def fetch(metric_type: str, aligner: str, reducer: str, extra_filter: str = "") -> list:
        params = {
            "filter": f'{base_filter} AND metric.type="{metric_type}"' + (
                f" AND {extra_filter}" if extra_filter else ""
            ),
            "interval.startTime": start,
            "interval.endTime": end,
            "aggregation.alignmentPeriod": "60s",
            "aggregation.perSeriesAligner": aligner,
            "aggregation.crossSeriesReducer": reducer,
            "aggregation.groupByFields": "resource.labels.service_name",
        }
        try:
            r = requests.get(MONITORING_BASE, headers=headers, params=params, timeout=15)
            if r.status_code != 200:
                return []
            series = r.json().get("timeSeries", [])
            if not series:
                return []
            points = series[0].get("points", [])
            result = []
            for p in sorted(points, key=lambda x: x["interval"]["startTime"]):
                t = p["interval"]["startTime"][:16].replace("T", " ")
                v = p["value"]
                val = (
                    v.get("int64Value") or v.get("doubleValue") or
                    v.get("distributionValue", {}).get("mean", 0)
                )
                try:
                    val = float(val)
                except (TypeError, ValueError):
                    val = 0.0
                result.append({"time": t, "value": round(val, 2)})
            return result
        except Exception:
            return []

    return {
        "request_count": fetch(
            "run.googleapis.com/request_count",
            "ALIGN_RATE", "REDUCE_SUM"
        ),
        "latency": fetch(
            "run.googleapis.com/request_latencies",
            "ALIGN_PERCENTILE_99", "REDUCE_MEAN"
        ),
        "instance_count": fetch(
            "run.googleapis.com/container/instance_count",
            "ALIGN_MEAN", "REDUCE_MAX"
        ),
    }
