#!/usr/bin/env python3
"""
AI-powered horizontal pod autoscaler (Phase 4).
Uses LSTM predictions to scale PREEMPTIVELY — before the spike hits.

Usage in cluster: Deployed via k8s-manifests/scaler-deployment.yaml
Usage locally    : python3 ai-scaler.py
"""

import os
import time
import pickle
import sys
import requests
import numpy as np
from datetime import datetime, timedelta

# Load Kubernetes — gracefully handle local dev
try:
    from kubernetes import client, config
    try:
        config.load_incluster_config()
        KUBE_AVAILABLE = True
        print("✓ In-cluster K8s config loaded")
    except Exception:
        config.load_kube_config()
        KUBE_AVAILABLE = True
        print("✓ Local kubeconfig loaded (dev mode)")
    v1_apps = client.AppsV1Api()
except ImportError:
    KUBE_AVAILABLE = False
    v1_apps = None
    print("⚠️  kubernetes package not found — scaling calls will be no-ops (install: pip install kubernetes)")

# ─── Configuration ────────────────────────────────────────────────────────────
PROMETHEUS_URL       = os.getenv('PROMETHEUS_URL', 'http://prometheus.monitoring:9090')
NAMESPACE            = os.getenv('NAMESPACE', 'apps')
DEPLOYMENTS          = ['app1', 'app2', 'app3']
MODEL_PATH           = os.getenv('MODEL_PATH', '/tmp/load_predictor_model.pkl')
SCALER_PATH          = os.getenv('SCALER_PATH', '/tmp/load_predictor_scaler.pkl')
LOOK_BACK_WINDOW     = 60
AI_SCALE_UP_THRESHOLD = 150  # Predicted requests/s that triggers preemptive scale
SCALE_DOWN_THRESHOLD  = 30
MIN_REPLICAS          = 1
MAX_REPLICAS          = 8
CHECK_INTERVAL        = 10   # seconds
# ──────────────────────────────────────────────────────────────────────────────


def log(msg):
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{ts}] {msg}", flush=True)


def query_prometheus_range(query: str, duration_seconds: int) -> list:
    try:
        end_time   = datetime.now()
        start_time = end_time - timedelta(seconds=duration_seconds)
        response   = requests.get(
            f"{PROMETHEUS_URL}/api/v1/query_range",
            params={
                'query' : query,
                'start' : start_time.timestamp(),
                'end'   : end_time.timestamp(),
                'step'  : '1s'
            },
            timeout=10
        )
        if response.status_code != 200:
            return []
        result = response.json()
        if result['data']['result']:
            return [float(val[1]) for val in result['data']['result'][0]['values']]
        return []
    except Exception as e:
        log(f"❌ Prometheus query failed: {e}")
        return []


def get_predicted_load() -> float:
    """Predict load using the trained ML model."""
    try:
        with open(MODEL_PATH, 'rb') as f:
            model = pickle.load(f)
        with open(SCALER_PATH, 'rb') as f:
            scaler = pickle.load(f)
        
        history = query_prometheus_range('rate(http_requests_total[1s])', LOOK_BACK_WINDOW)
        
        if len(history) < 10:
            return 0.0
        
        history_array  = np.array(history)
        history_scaled = scaler.transform(history_array.reshape(-1, 1)).flatten()
        X              = history_scaled[-LOOK_BACK_WINDOW:].reshape(1, -1, 1)
        
        try:
            pred_scaled = model.predict(X, verbose=0)[0][0]  # LSTM
        except (TypeError, AttributeError):
            pred_scaled = model.predict(X.reshape(1, -1))[0]  # linear fallback
        
        pred = scaler.inverse_transform([[pred_scaled]])[0][0]
        return max(0.0, float(pred))
    
    except FileNotFoundError:
        log("⚠️  Model not yet trained. Run ml-model/load-predictor.py first.")
        return 0.0
    except Exception as e:
        log(f"⚠️  Prediction failed ({e}) — falling back to reactive mode")
        return 0.0


def get_current_load() -> float:
    """Get current request rate from Prometheus."""
    try:
        result = requests.get(
            f"{PROMETHEUS_URL}/api/v1/query",
            params={'query': 'rate(http_requests_total[1m])'},
            timeout=5
        ).json()
        if result['data']['result']:
            return float(result['data']['result'][0]['value'][1])
        return 0.0
    except Exception:
        return 0.0


def get_current_replicas(deployment: str) -> int:
    if not KUBE_AVAILABLE:
        return 1
    try:
        dep = v1_apps.read_namespaced_deployment(deployment, NAMESPACE)
        return dep.spec.replicas or 0
    except Exception:
        return 0


def scale_deployment(deployment: str, replicas: int):
    if not KUBE_AVAILABLE:
        log(f"  [DRY-RUN] Would scale {deployment} to {replicas} replicas")
        return
    try:
        dep              = v1_apps.read_namespaced_deployment(deployment, NAMESPACE)
        dep.spec.replicas = replicas
        v1_apps.patch_namespaced_deployment(deployment, NAMESPACE, dep)
        log(f"✓ Scaled {deployment} to {replicas} replicas")
    except Exception as e:
        log(f"❌ Failed to scale {deployment}: {e}")


def main():
    log("🤖 AI-powered autoscaler started (Phase 4 — Predictive)")
    log(f"   Preemptive scale threshold : {AI_SCALE_UP_THRESHOLD} predicted req/s")
    log(f"   Scale down threshold       : {SCALE_DOWN_THRESHOLD} req/s")
    
    # Train model before starting loop
    log("📊 Training load prediction model...")
    ret = os.system(f"python3 {os.path.dirname(os.path.abspath(__file__))}/../ml-model/load-predictor.py")
    if ret != 0:
        log("⚠️  Training script failed — check ml-model/load-predictor.py")
    
    try:
        while True:
            log("─" * 70)
            current_load  = get_current_load()
            predicted_load = get_predicted_load()
            
            log(f"📊 Current: {current_load:.1f} req/s | Predicted (+10s): {predicted_load:.1f} req/s")
            
            for deployment in DEPLOYMENTS:
                current_replicas = get_current_replicas(deployment)
                
                if predicted_load > AI_SCALE_UP_THRESHOLD:
                    new_replicas = min(current_replicas + 2, MAX_REPLICAS)
                    if new_replicas > current_replicas:
                        log(f"🚀 {deployment}: Spike predicted → {current_replicas} → {new_replicas} (PREEMPTIVE)")
                        scale_deployment(deployment, new_replicas)
                
                elif current_load < SCALE_DOWN_THRESHOLD:
                    new_replicas = max(current_replicas - 1, MIN_REPLICAS)
                    if new_replicas < current_replicas:
                        log(f"📉 {deployment}: Load dropping → {current_replicas} → {new_replicas}")
                        scale_deployment(deployment, new_replicas)
                
                else:
                    log(f"➡️  {deployment}: Steady at {current_replicas} replicas")
            
            time.sleep(CHECK_INTERVAL)
    
    except KeyboardInterrupt:
        log("✓ AI scaler stopped")
    except Exception as e:
        log(f"❌ Error: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
