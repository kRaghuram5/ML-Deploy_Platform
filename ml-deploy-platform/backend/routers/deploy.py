import json
import os
import time

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from core.deployer import build_and_deploy
from core.generator import generate_all_files
from core.db import save_deployment

router = APIRouter()
BUILD_DIR = "/tmp/ml_builds"
os.makedirs(BUILD_DIR, exist_ok=True)


@router.post("/stream/{model_id}")
async def deploy_stream(model_id: str, body: dict) -> StreamingResponse:
    filepath = body.get("filepath")
    inspection = body.get("inspection", {})

    if not filepath:
        raise HTTPException(status_code=400, detail="filepath is required")

    if inspection.get("error"):
        raise HTTPException(status_code=400, detail="Model inspection contains errors")

    if inspection.get("is_supported") is False:
        raise HTTPException(status_code=400, detail=inspection.get("support_reason", "Unsupported model"))

    def event_stream():
        build_dir = os.path.join(BUILD_DIR, model_id)
        try:
            generate_all_files(filepath, inspection, model_id, build_dir)
            for step in build_and_deploy(model_id, build_dir):
                if step.get("step") == "live" and step.get("status") == "done":
                    save_deployment({
                        "model_id": model_id,
                        "model_type": inspection.get("model_type", "unknown"),
                        "task_type": inspection.get("task_type", "unknown"),
                        "filename": os.path.basename(filepath),
                        "endpoint": step.get("endpoint", ""),
                        "service_name": step.get("service_name", ""),
                        "features": inspection.get("feature_names") or [f"feature_{i}" for i in range(inspection.get("input_count", 4))],
                        "deployedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    })
                yield f"data: {json.dumps(step)}\n\n"
        except Exception as exc:
            payload = {"step": "deploying", "status": "error", "message": str(exc)}
            yield f"data: {json.dumps(payload)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
