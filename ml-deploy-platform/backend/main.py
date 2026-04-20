from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import upload, deploy, models, security, logs, costs, metrics, live_metrics

app = FastAPI(title="ML Deploy Platform — MLOps Suite")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router, prefix="/api/upload", tags=["upload"])
app.include_router(deploy.router, prefix="/api/deploy", tags=["deploy"])
app.include_router(models.router, prefix="/api/models", tags=["models"])
app.include_router(metrics.router, prefix="/api/metrics", tags=["metrics"])
app.include_router(live_metrics.router, prefix="/api/live-metrics", tags=["live-metrics"])
app.include_router(security.router, prefix="/api/security", tags=["security"])
app.include_router(logs.router, prefix="/api/logs", tags=["logs"])
app.include_router(costs.router, prefix="/api/costs", tags=["costs"])

@app.get("/health")
def health():
    return {"status": "ok", "version": "2.0.0 — MLOps Suite"}
