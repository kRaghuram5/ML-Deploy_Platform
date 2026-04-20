from fastapi import APIRouter
from core.cost_tracker import get_cost_report, get_all_models_cost_summary, record_request
from core.ai_layer import generate_cost_recommendation

router = APIRouter()

@router.get("/{model_id}")
async def model_cost(model_id: str):
    """Get cost report for a single model."""
    report = get_cost_report(model_id)
    return report

@router.get("/{model_id}/recommend")
async def cost_recommendation(model_id: str):
    """Ask AI to analyze cost data and give a recommendation."""
    report = get_cost_report(model_id)
    recommendation = generate_cost_recommendation(report)
    return {
        "cost_report": report,
        "recommendation": recommendation
    }

@router.post("/{model_id}/record")
async def record_cost_event(model_id: str, body: dict):
    """Record a request for cost tracking. Called alongside log recording."""
    latency_ms = body.get("latency_ms", 200)
    record_request(model_id, latency_ms)
    return {"ok": True}

@router.get("/platform/summary")
async def platform_summary(model_ids: str = ""):
    """Get cost summary across all models. Pass comma-separated model IDs."""
    ids = [m.strip() for m in model_ids.split(",") if m.strip()]
    return get_all_models_cost_summary(ids)
