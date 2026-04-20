import os
import shutil
import uuid
from datetime import datetime

from fastapi import APIRouter, File, HTTPException, UploadFile

from core.ai_layer import (
    AILayerUnavailable,
    generate_api_docs,
    generate_input_schema,
    generate_model_card,
    explain_security_findings,
)
from core.inspector import inspect_model
from core.secrets_scanner import run_full_security_scan
from core.generator import generate_app_wrapper

router = APIRouter()
UPLOAD_DIR = "/tmp/ml_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/")
async def upload_model(file: UploadFile = File(...)) -> dict:
    if not file.filename:
        raise HTTPException(status_code=400, detail="File name missing")

    if not file.filename.endswith((".pkl", ".joblib")):
        raise HTTPException(status_code=400, detail="Unsupported file type. Use .pkl or .joblib")

    timestamp = datetime.now().strftime("%H%M")
    model_id = f"{str(uuid.uuid4())[:8]}-{timestamp}"
    model_dir = os.path.join(UPLOAD_DIR, model_id)
    os.makedirs(model_dir, exist_ok=True)

    filepath = os.path.join(model_dir, file.filename)
    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)

    inspection = inspect_model(filepath)
    
    # Run security scan
    generated_app_content = generate_app_wrapper(inspection, model_id)
    security_scan = run_full_security_scan(filepath, generated_app_content)

    if security_scan["findings"]:
        security_scan["ai_explanation"] = explain_security_findings(security_scan["findings"])

    return {
        "model_id": model_id,
        "filename": file.filename,
        "filepath": filepath,
        "inspection": inspection,
        "security_scan": security_scan,
        "status": "uploaded",
    }


@router.post("/analyze/{model_id}")
async def analyze_model(model_id: str, body: dict) -> dict:
    """
    AI analysis — always returns 200. If Gemini is unavailable or quota
    exhausted the response contains empty fields so the frontend can
    continue without AI docs.
    """
    inspection = body.get("inspection", {})

    empty_response = {
        "model_id": model_id,
        "api_docs": {},
        "input_schema": {},
        "model_card": "",
        "ai_available": False,
        "ai_error": None,
    }

    try:
        api_docs = generate_api_docs(inspection)
        input_schema = generate_input_schema(inspection)
        model_card = generate_model_card(inspection, api_docs)
        return {
            "model_id": model_id,
            "api_docs": api_docs,
            "input_schema": input_schema,
            "model_card": model_card,
            "ai_available": True,
            "ai_error": None,
        }
    except AILayerUnavailable as exc:
        empty_response["ai_error"] = f"AI unavailable: {exc}"
        return empty_response
    except Exception as exc:
        # Quota exhausted, network error, etc. — never crash the frontend
        err_str = str(exc)
        if "RESOURCE_EXHAUSTED" in err_str or "429" in err_str:
            empty_response["ai_error"] = "Gemini free-tier quota exhausted. Continuing without AI docs."
        else:
            empty_response["ai_error"] = f"AI analysis failed: {err_str[:200]}"
        return empty_response
