from fastapi import APIRouter
from core.log_store import get_logs, get_stats, record_prediction_log
from core.ai_layer import generate_incident_summary, explain_prediction

router = APIRouter()

@router.get("/{model_id}/stats")
async def model_stats(model_id: str):
    """Returns live stats + anomalies for a deployed model."""
    stats = get_stats(model_id)
    return stats

@router.get("/{model_id}/logs")
async def model_logs(model_id: str, limit: int = 50):
    """Returns recent raw log entries."""
    return get_logs(model_id, limit)

@router.post("/{model_id}/record")
async def record_log(model_id: str, entry: dict):
    """Called by TestConsole after every prediction."""
    record_prediction_log(model_id, entry)
    return {"ok": True}

@router.post("/{model_id}/analyze")
async def analyze_logs(model_id: str):
    """
    Trigger AI to analyze current logs and generate incident summary.
    This is the CD-6 core feature.
    """
    stats = get_stats(model_id)
    logs = get_logs(model_id, 50)
    summary = generate_incident_summary(model_id, stats, logs)
    return {
        "stats": stats,
        "incident_summary": summary
    }
@router.post("/{model_id}/explain")
async def explain_api_prediction(model_id: str, body: dict):
    """XAI: Explains a specific prediction based on inputs."""
    inputs = body.get("inputs", {})
    prediction = body.get("prediction")
    
    # In a real system, we'd fetch inspection from DB, but here we expect it in body 
    # for simplicity or fetch it if available in cache.
    inspection = body.get("inspection", {})
    
    explanation = explain_prediction(inspection, inputs, prediction)
    return {"explanation": explanation}
