"""
AI layer — uses google.genai (current SDK, replacing deprecated google.generativeai).
"""
import json
import os
import urllib.request
import urllib.error
from typing import Any, Dict

class AILayerUnavailable(Exception):
    pass

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = "llama-3.3-70b-versatile"

def _extract_json(text: str) -> Dict[str, Any]:
    payload = text.strip()
    if payload.startswith("```"):
        lines = payload.splitlines()
        inner = lines[1:] if lines[0].startswith("```") else lines
        if inner and inner[-1].strip() == "```":
            inner = inner[:-1]
        payload = "\n".join(inner).strip()
    try:
        return json.loads(payload)
    except Exception:
        return {"raw": text, "error": "Could not parse JSON from model output"}


def _ask(prompt: str, max_tokens: int = 1000) -> str:
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (MLOps Platform Suite Client)"
    }
    data = {
        "model": GROQ_MODEL,
        "messages": [
            {"role": "system", "content": "You are a highly capable MLOps AI assistant. When providing JSON, output strict valid JSON only without markdown formatting."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.2,
        "max_tokens": max_tokens
    }
    
    req = urllib.request.Request(url, headers=headers, data=json.dumps(data).encode("utf-8"))
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode("utf-8"))
            return result["choices"][0]["message"]["content"].strip()
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode()
        err_str = f"HTTP {e.code}: {err_msg}".upper()
        if "429" in err_str or "RATE" in err_str or "LIMIT" in err_str:
            raise Exception("429 RESOURCE_EXHAUSTED Groq Rate Limit")
        raise Exception(f"Groq API Error: {err_msg}")
    except Exception as e:
        raise Exception(f"Groq API Error: {str(e)}")


def _ask_json(prompt: str, max_tokens: int = 1000) -> Dict[str, Any]:
    return _extract_json(_ask(prompt, max_tokens))


def generate_api_docs(inspection: dict) -> Dict[str, Any]:
    prompt = f"""You are a technical writer for an ML API platform.

Model type: {inspection.get('model_type')}
Task type: {inspection.get('task_type')}
Input features: {inspection.get('feature_names') or inspection.get('input_count')}
Output: {inspection.get('output_type')}
Classes (if classification): {inspection.get('classes')}

Return strict JSON only (no markdown fences):
{{
  "title": "Short API title",
  "description": "2-sentence plain English description for developers",
  "input_description": "One sentence about inputs",
  "output_description": "One sentence about the response",
  "example_use_case": "One realistic use case",
  "warnings": "Known limitations or caveats"
}}"""
    return _ask_json(prompt, max_tokens=900)


def generate_input_schema(inspection: dict) -> Dict[str, Any]:
    feature_names = inspection.get("feature_names") or [
        f"feature_{i}" for i in range(inspection.get("input_count", 4))
    ]
    model_type = inspection.get("model_type", "")
    task_type = inspection.get("task_type", "regression")
    prompt = f"""A {model_type} sklearn model for {task_type} has features: {feature_names}

Return strict JSON only (no markdown). For each feature:
{{
  "feature_name": {{
    "example": <realistic numeric value>,
    "description": "<what this feature likely represents>",
    "typical_range": "<e.g. 0-100>"
  }}
}}"""
    return _ask_json(prompt, max_tokens=700)


def generate_model_card(inspection: dict, api_docs: dict) -> str:
    prompt = f"""Write a concise ML model card in markdown, under 300 words.
Sections: ## Overview, ## Inputs, ## Outputs, ## Example Use Case, ## Limitations.

Model: {inspection.get('model_type')}
Task: {inspection.get('task_type')}
Features: {inspection.get('feature_names') or inspection.get('input_count')} inputs
Output: {inspection.get('output_type')}
API description: {api_docs.get('description', '')}"""
    return _ask(prompt, max_tokens=700)


def explain_security_findings(findings: list) -> str:
    """
    Explains security findings in plain English for the developer.
    Tells them exactly what each secret is, why it's dangerous, and how to fix it.
    """
    findings_text = "\n".join([
        f"- {f['secret_type']} (severity: {f['severity']}) found in {f['source']} line {f['line']}: {f['description']}"
        for f in findings
    ])

    prompt = f"""
A security scan of a machine learning model file found these potential secrets:

{findings_text}

Write a short plain-English security report (under 150 words) for a developer. Include:
1. What was found and why it's dangerous (1 sentence each)
2. The immediate risk if this model were deployed publicly
3. Exactly how to fix it (e.g., use environment variables, use a secrets manager)

Be direct and serious but not alarmist. Write as if you're a senior security engineer reviewing their code.
"""
    try:
        return _ask(prompt, max_tokens=400)
    except Exception as e:
        err_str = str(e).upper()
        return f"Security Analysis Unavailable: {str(e)[:150]}"


def generate_incident_summary(model_id: str, stats: dict, recent_logs: list) -> dict:
    """
    CD-6 core: Analyzes model logs and produces a structured incident report.
    Returns severity score, 3-line summary, probable root cause, recommended action.
    """
    anomalies_text = "\n".join([
        f"- [{a['severity'].upper()}] {a['message']}"
        for a in stats.get("anomalies", [])
    ]) or "None detected"

    # Summarize recent log patterns
    status_codes = [str(l.get("status_code", 200)) for l in recent_logs[-20:]]
    latencies = [l.get("latency_ms", 0) for l in recent_logs[-20:] if l.get("latency_ms")]
    predictions = [str(l.get("prediction", "")) for l in recent_logs[-20:] if l.get("prediction")]

    prompt = f"""
You are an ML platform monitoring system. Analyze these runtime metrics for model ID: {model_id}

METRICS:
- Total requests: {stats.get("total_requests", 0)}
- Error rate: {stats.get("error_rate", 0)}%
- Average latency: {stats.get("avg_latency_ms", 0)}ms
- P95 latency: {stats.get("p95_latency_ms", 0)}ms
- Requests in last 5 min: {stats.get("predictions_last_5min", 0)}
- Unique prediction values seen: {stats.get("unique_prediction_values", [])}

ANOMALIES DETECTED:
{anomalies_text}

RECENT STATUS CODES (last 20): {status_codes}
RECENT LATENCIES (last 20, ms): {latencies}
RECENT PREDICTIONS (last 20): {predictions}

Respond in strict JSON only (no markdown fences). If you cannot parse perfectly, fall back to valid JSON structure.
{{
  "severity_score": <integer 1-5, where 5 is critical outage>,
  "severity_label": "<one of: Healthy, Watch, Degraded, Incident, Critical>",
  "summary": "<exactly 3 sentences: what is happening, what the data shows, what the impact is>",
  "probable_root_cause": "<one sentence — most likely technical reason>",
  "recommended_action": "<one concrete action to take right now>",
  "all_clear": <boolean>
}}
"""
    try:
        data = _ask_json(prompt, max_tokens=500)
        # Ensure fallback defaults if Gemini hallucinated dict keys
        return {
            "severity_score": data.get("severity_score", 1),
            "severity_label": data.get("severity_label", "Healthy"),
            "summary": data.get("summary", "Analysis completed."),
            "probable_root_cause": data.get("probable_root_cause", "N/A"),
            "recommended_action": data.get("recommended_action", "N/A"),
            "all_clear": data.get("all_clear", True)
        }
    except Exception as e:
        return {
            "severity_score": 1,
            "severity_label": "Unknown",
            "summary": f"Incident Analysis Unavailable: {str(e)[:150]}",
            "probable_root_cause": "N/A",
            "recommended_action": "Review logs manually",
            "all_clear": True
        }


def generate_cost_recommendation(cost_report: dict) -> dict:
    """
    CD-3 core: Analyzes cost data and gives specific, actionable recommendations.
    """
    anomalies_text = "\n".join([
        f"- [{a['severity'].upper()}] {a['message']}"
        for a in cost_report.get("anomalies", [])
    ]) or "None"

    prompt = f"""
You are a cloud cost optimization expert. Analyze this Cloud Run model deployment cost report.

Model ID: {cost_report.get("model_id")}
Total requests served: {cost_report.get("total_requests")}
Session cost so far: ${cost_report.get("session_cost_usd", 0):.6f}
Projected monthly cost: ${cost_report.get("monthly_estimate_usd", 0):.4f}
Cost per request: ${cost_report.get("cost_per_request_usd", 0):.8f}
Requests per hour: {cost_report.get("requests_per_hour")}
Deployed for: {cost_report.get("elapsed_hours")} hours

Cost anomalies flagged:
{anomalies_text}

Respond in strict JSON only (no markdown fences):
{{
  "verdict": "<one of: Efficient, Monitor, Optimize, Alert>",
  "monthly_projection_usd": {cost_report.get("monthly_estimate_usd", 0)},
  "headline": "<one sentence: the main cost story>",
  "explanation": "<2 sentences: what is driving the cost and whether it is reasonable>",
  "top_recommendation": "<one specific, concrete action>"
}}
"""
    try:
        data = _ask_json(prompt, max_tokens=400)
        return {
            "verdict": data.get("verdict", "Monitor"),
            "monthly_projection_usd": data.get("monthly_projection_usd", 0.0),
            "headline": data.get("headline", "Cost analysis complete"),
            "explanation": data.get("explanation", ""),
            "top_recommendation": data.get("top_recommendation", "Review GCP Cloud Run logs.")
        }
    except Exception as e:
        return {
            "verdict": "Monitor",
            "monthly_projection_usd": cost_report.get("monthly_estimate_usd", 0.0),
            "headline": "Cost recommendation unavailable",
            "explanation": f"The AI engine returned an error: {str(e)[:100]}",
            "top_recommendation": "Check GCP Cloud Run dashboard for optimization tips."
        }


def explain_prediction(inspection: dict, inputs: dict, prediction: Any) -> str:
    """
    XAI core: Analyzes a specific prediction result based on inputs and model metadata.
    """
    model_type = inspection.get("model_type", "unknown model")
    task_type = inspection.get("task_type", "unknown task")
    features = inspection.get("feature_names") or list(inputs.keys())
    
    prompt = f"""
Wait! You are an MLOps Explainable AI (XAI) engine. 
Model: {model_type} ({task_type})
Features: {features}

INPUT DATA FOR THIS PREDICTION:
{json.dumps(inputs, indent=2)}

RESULT: {prediction}

Explain this specific result to a developer in 2-3 sentences. 
- Be specific about which numerical values in the input likely pushed it towards this result.
- Use a professional yet helpful tone.
- Do not mention that you are an AI.
- Focus on feature importance "post-hoc". 

Start with '✦ Analysis:'
"""
    try:
        return _ask(prompt, max_tokens=300)
    except Exception as e:
        return f"AI Reasoning Unavailable: {str(e)[:100]}..."
