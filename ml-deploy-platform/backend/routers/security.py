from fastapi import APIRouter
from core.secrets_scanner import run_full_security_scan
from core.ai_layer import explain_security_findings

router = APIRouter()

# In-memory store for scan results keyed by model_id
scan_results: dict = {}

@router.post("/scan/{model_id}")
async def scan_model(model_id: str, body: dict):
    """
    Run full security scan on uploaded model + generated wrapper.
    Called automatically during upload flow before deployment starts.
    """
    filepath = body.get("filepath", "")
    generated_app = body.get("generated_app", "")

    result = run_full_security_scan(filepath, generated_app)

    # If findings exist, get Gemini to explain them in plain English
    if result["findings"]:
        result["ai_explanation"] = explain_security_findings(result["findings"])
    else:
        result["ai_explanation"] = None

    scan_results[model_id] = result
    return result

@router.get("/scan/{model_id}")
async def get_scan_result(model_id: str):
    return scan_results.get(model_id, {"status": "NOT_SCANNED"})
