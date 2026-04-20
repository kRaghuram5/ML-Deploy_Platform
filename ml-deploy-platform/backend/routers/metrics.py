from fastapi import APIRouter, Query
from core.db import get_metrics

router = APIRouter()

@router.get("/{service_name}")
def fetch_metrics(service_name: str, range: str = Query("1h", regex="^(1h|6h|24h|7d)$")):
    """Fetch time-series metrics from Google Cloud Monitoring for a given service."""
    hours = 1.0
    if range == "6h":
        hours = 6.0
    elif range == "24h":
        hours = 24.0
    elif range == "7d":
        hours = 24.0 * 7

    # Since get_metrics is synchronous but can take ~1-2s, 
    # it's usually fine to define as def instead of async def here.
    return get_metrics(service_name, hours=hours)
