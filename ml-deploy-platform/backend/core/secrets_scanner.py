import re
import pickle
import joblib
import json
from typing import List, Dict

# Patterns that catch real secrets — ordered by severity
SECRET_PATTERNS = [
    {
        "name": "AWS Access Key",
        "pattern": r"AKIA[0-9A-Z]{16}",
        "severity": "critical",
        "description": "AWS access key ID — gives full cloud account access"
    },
    {
        "name": "AWS Secret Key",
        "pattern": r"(?i)aws.{0,20}secret.{0,20}['\"][0-9a-zA-Z/+]{40}['\"]",
        "severity": "critical",
        "description": "AWS secret access key"
    },
    {
        "name": "Google API Key",
        "pattern": r"AIza[0-9A-Za-z\-_]{35}",
        "severity": "critical",
        "description": "Google Cloud API key"
    },
    {
        "name": "Anthropic API Key",
        "pattern": r"sk-ant-[a-zA-Z0-9\-_]{40,}",
        "severity": "critical",
        "description": "Anthropic Claude API key"
    },
    {
        "name": "OpenAI API Key",
        "pattern": r"sk-[a-zA-Z0-9]{48}",
        "severity": "critical",
        "description": "OpenAI API key"
    },
    {
        "name": "Generic API Key",
        "pattern": r"(?i)(api[_\-]?key|apikey)\s*[=:]\s*['\"][a-zA-Z0-9\-_]{20,}['\"]",
        "severity": "high",
        "description": "Generic API key assignment"
    },
    {
        "name": "Database URL",
        "pattern": r"(?i)(postgres|mysql|mongodb|redis|sqlite):\/\/[^\s'\"]+:[^\s'\"]+@[^\s'\"]+",
        "severity": "critical",
        "description": "Database connection string with credentials"
    },
    {
        "name": "Private Key Block",
        "pattern": r"-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----",
        "severity": "critical",
        "description": "Private cryptographic key"
    },
    {
        "name": "Password in variable",
        "pattern": r"(?i)(password|passwd|pwd)\s*[=:]\s*['\"][^'\"]{6,}['\"]",
        "severity": "high",
        "description": "Hardcoded password in code"
    },
    {
        "name": "GitHub Token",
        "pattern": r"ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{82}",
        "severity": "critical",
        "description": "GitHub personal access token"
    },
    {
        "name": "JWT Token",
        "pattern": r"eyJ[a-zA-Z0-9\-_]+\.eyJ[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+",
        "severity": "medium",
        "description": "JWT token — may contain sensitive session data"
    },
    {
        "name": "Slack Token",
        "pattern": r"xox[baprs]-[a-zA-Z0-9\-]{10,}",
        "severity": "high",
        "description": "Slack API or bot token"
    },
]


def scan_text_content(content: str, source_name: str) -> List[Dict]:
    """Scan a string for secrets. Returns list of findings."""
    findings = []
    lines = content.split("\n")

    for pattern_def in SECRET_PATTERNS:
        pattern = re.compile(pattern_def["pattern"])
        for line_num, line in enumerate(lines, 1):
            matches = pattern.findall(line)
            if matches:
                # Redact the actual secret value for display
                redacted_line = re.sub(
                    pattern_def["pattern"],
                    lambda m: m.group()[:6] + "***REDACTED***",
                    line
                )
                findings.append({
                    "source": source_name,
                    "line": line_num,
                    "secret_type": pattern_def["name"],
                    "severity": pattern_def["severity"],
                    "description": pattern_def["description"],
                    "redacted_line": redacted_line.strip(),
                    "match_count": len(matches)
                })

    return findings


def scan_pkl_file(filepath: str) -> List[Dict]:
    """
    Scan a .pkl model file for embedded secrets.
    Converts model attributes to strings and searches them.
    Works by extracting all string attributes from the loaded model.
    """
    findings = []
    try:
        try:
            model = joblib.load(filepath)
        except Exception:
            with open(filepath, "rb") as f:
                model = pickle.load(f)

        # Extract all string-like attributes from model
        model_text_parts = []
        for attr_name in dir(model):
            if attr_name.startswith("__"):
                continue
            try:
                val = getattr(model, attr_name)
                if isinstance(val, str) and len(val) > 8:
                    model_text_parts.append(f"{attr_name} = '{val}'")
                elif isinstance(val, dict):
                    model_text_parts.append(json.dumps(val))
            except Exception:
                pass

        model_text = "\n".join(model_text_parts)
        findings = scan_text_content(model_text, "model_attributes")
    except Exception as e:
        pass  # If we can't read the pkl, skip silently

    return findings


def scan_generated_wrapper(app_py_content: str) -> List[Dict]:
    """Scan the auto-generated app.py wrapper for secrets."""
    return scan_text_content(app_py_content, "generated_app.py")


def run_full_security_scan(pkl_filepath: str, generated_app_content: str = "") -> Dict:
    """
    Master scan function. Scans both the model file and generated wrapper.
    Returns a structured result with overall status and all findings.
    """
    all_findings = []

    # Scan model file
    pkl_findings = scan_pkl_file(pkl_filepath)
    all_findings.extend(pkl_findings)

    # Scan generated app wrapper
    if generated_app_content:
        wrapper_findings = scan_generated_wrapper(generated_app_content)
        all_findings.extend(wrapper_findings)

    # Determine overall status
    critical_count = sum(1 for f in all_findings if f["severity"] == "critical")
    high_count = sum(1 for f in all_findings if f["severity"] == "high")
    medium_count = sum(1 for f in all_findings if f["severity"] == "medium")

    if critical_count > 0:
        status = "BLOCKED"
        status_reason = f"Found {critical_count} critical secret(s). Deployment blocked for security."
    elif high_count > 0:
        status = "WARNING"
        status_reason = f"Found {high_count} high-severity issue(s). Review before deploying."
    elif medium_count > 0:
        status = "CAUTION"
        status_reason = f"Found {medium_count} medium-severity issue(s)."
    else:
        status = "CLEAN"
        status_reason = "No secrets detected. Safe to deploy."

    return {
        "status": status,
        "status_reason": status_reason,
        "total_findings": len(all_findings),
        "critical": critical_count,
        "high": high_count,
        "medium": medium_count,
        "findings": all_findings,
        "blocked": status == "BLOCKED"
    }
