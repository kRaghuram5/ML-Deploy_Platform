import os
import subprocess
from typing import Dict, Generator, Optional

GCP_PROJECT = os.getenv("GCP_PROJECT_ID", "")
GCP_REGION  = os.getenv("GCP_REGION", "us-central1")
GCLOUD      = os.getenv(
    "GCLOUD_PATH",
    "/Users/likhithmr/Desktop/Cloud/google-cloud-sdk/bin/gcloud"
)


def _run(cmd: list, cwd: Optional[str] = None) -> subprocess.CompletedProcess:
    env = os.environ.copy()
    # Add common paths and gcloud path to ensure docker and gcloud are found
    common_paths = "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
    env["PATH"] = f"{os.path.dirname(GCLOUD)}:{common_paths}:{env.get('PATH', '')}"
    
    # Try to use system python for gcloud to avoid incompatibilities with newer venv types/pydantic
    if os.path.exists("/usr/bin/python3"):
        env["CLOUDSDK_PYTHON"] = "/usr/bin/python3"
    
    # Keep BuildKit ON (supports --platform), but do NOT set DOCKER_BUILDKIT=0
    env.pop("DOCKER_BUILDKIT", None)
    return subprocess.run(cmd, capture_output=True, text=True, cwd=cwd, env=env)


def build_and_deploy(model_id: str, build_dir: str) -> Generator[Dict, None, None]:
    if not GCP_PROJECT:
        yield {"step": "deploying", "status": "error",
               "message": "GCP_PROJECT_ID not set in backend/.env"}
        return

    image_name   = f"gcr.io/{GCP_PROJECT}/model-{model_id}:latest"
    service_name = f"model-{model_id}"

    yield {"step": "analyzing",  "status": "done", "message": "Analysed model metadata"}
    yield {"step": "generating", "status": "done", "message": "Generated Dockerfile & API wrapper"}

    # ── Docker build ────────────────────────────────────────────────────────
    # --platform linux/amd64  → Cloud Run is always x86-64 (Mac is ARM64)
    # --provenance=false       → stops BuildKit creating an attestation
    #                            manifest that causes "already exists" conflict
    # --no-cache               → always clean build
    yield {"step": "building", "status": "running",
           "message": "Building Docker image (linux/amd64)..."}
    res = _run([
        "docker", "build",
        "--platform", "linux/amd64",
        "--provenance=false",
        "--no-cache",
        "-t", image_name,
        build_dir,
    ])
    if res.returncode != 0:
        yield {"step": "building", "status": "error",
               "message": (res.stderr or res.stdout)[-900:]}
        return
    yield {"step": "building", "status": "done", "message": "Docker image built (amd64) ✓"}

    # ── Docker push ─────────────────────────────────────────────────────────
    yield {"step": "pushing", "status": "running", "message": "Pushing image to gcr.io..."}
    res = _run(["docker", "push", image_name])
    if res.returncode != 0:
        yield {"step": "pushing", "status": "error",
               "message": (res.stderr or res.stdout)[-900:]}
        return
    yield {"step": "pushing", "status": "done", "message": "Image pushed to gcr.io ✓"}

    # ── Cloud Run deploy ────────────────────────────────────────────────────
    yield {"step": "deploying", "status": "running", "message": "Deploying to Cloud Run..."}
    res = _run([
        GCLOUD, "run", "deploy", service_name,
        "--image",    image_name,
        "--platform", "managed",
        "--region",   GCP_REGION,
        "--allow-unauthenticated",
        "--port",     "8080",
        "--memory",   "512Mi",
        "--cpu",      "1",
        "--timeout",  "300",
        "--project",  GCP_PROJECT,
        "--format",   "value(status.url)",
        "--quiet",
    ])
    if res.returncode != 0:
        yield {"step": "deploying", "status": "error",
               "message": (res.stderr or res.stdout)[-900:]}
        return

    endpoint_url = res.stdout.strip()
    if not endpoint_url:
        res2 = _run([
            GCLOUD, "run", "services", "describe", service_name,
            "--region", GCP_REGION,
            "--format", "value(status.url)",
            "--project", GCP_PROJECT,
        ])
        endpoint_url = res2.stdout.strip()

    yield {
        "step": "live",
        "status": "done",
        "message": "Model API is live! 🚀",
        "endpoint": endpoint_url,
        "service_name": service_name,
    }
