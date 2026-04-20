#!/usr/bin/env python3
"""
Threshold-based horizontal pod autoscaler (Phase 3 — reactive).
Queries Prometheus for CPU metrics, scales deployments up/down.
Proves the plumbing works before adding AI prediction.

Usage in cluster: Deployed via k8s-manifests/scaler-deployment.yaml
Usage locally (for dev): python3 threshold-scaler.py
"""

import os
import time
import requests
from kubernetes import client, config
from datetime import datetime

# ─── Configuration ────────────────────────────────────────────────────────────
PROMETHEUS_URL    = os.getenv('PROMETHEUS_URL', 'http://prometheus.monitoring:9090')
NAMESPACE         = os.getenv('NAMESPACE', 'apps')
DEPLOYMENTS       = ['app1', 'app2', 'app3']
SCALE_UP_THRESHOLD   = 50   # CPU % to trigger scale up
SCALE_DOWN_THRESHOLD = 20   # CPU % to trigger scale down
MIN_REPLICAS      = 1
MAX_REPLICAS      = 8
SCALE_UP_AMOUNT   = 2   # Add 2 pods at a time
SCALE_DOWN_AMOUNT = 1   # Remove 1 pod at a time
CHECK_INTERVAL    = 10  # Seconds between checks
# ──────────────────────────────────────────────────────────────────────────────

# Load K8s config: in-cluster when running as pod, local kubeconfig for dev
try:
    config.load_incluster_config()
    print("✓ Loaded in-cluster Kubernetes config")
except config.ConfigException:
    config.load_kube_config()
    print("✓ Loaded local kubeconfig (dev mode)")

v1_apps = client.AppsV1Api()


def log(msg):
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{ts}] {msg}", flush=True)


def query_prometheus(query: str) -> dict:
    """Query Prometheus for metrics."""
    try:
        response = requests.get(
            f"{PROMETHEUS_URL}/api/v1/query",
            params={'query': query},
            timeout=5
        )
        response.raise_for_status()
        return response.json()
    except Exception as e:
        log(f"❌ Prometheus query failed: {e}")
        return {'data': {'result': []}}


def get_deployment_cpu(deployment: str) -> float:
    """Get average CPU usage for a deployment (0-100 scale)."""
    query = (
        f'rate(container_cpu_usage_seconds_total{{'
        f'namespace="{NAMESPACE}",pod=~"{deployment}-.*"'
        f'}}[1m]) * 100'
    )
    result = query_prometheus(query)
    if not result['data']['result']:
        return 0.0
    values = [float(item['value'][1]) for item in result['data']['result']]
    return sum(values) / len(values) if values else 0.0


def get_deployment_replicas(deployment: str) -> int:
    """Get current replica count."""
    try:
        dep = v1_apps.read_namespaced_deployment(deployment, NAMESPACE)
        return dep.spec.replicas or 0
    except Exception as e:
        log(f"❌ Failed to read deployment {deployment}: {e}")
        return 0


def scale_deployment(deployment: str, new_replicas: int):
    """Scale deployment to desired replica count."""
    try:
        dep = v1_apps.read_namespaced_deployment(deployment, NAMESPACE)
        dep.spec.replicas = new_replicas
        v1_apps.patch_namespaced_deployment(deployment, NAMESPACE, dep)
        log(f"✓ Scaled {deployment} to {new_replicas} replicas")
    except Exception as e:
        log(f"❌ Failed to scale {deployment}: {e}")


def make_scaling_decision(deployment: str, cpu_usage: float, current_replicas: int):
    """Decide whether to scale up, down, or keep steady."""
    if cpu_usage > SCALE_UP_THRESHOLD:
        new_replicas = min(current_replicas + SCALE_UP_AMOUNT, MAX_REPLICAS)
        if new_replicas > current_replicas:
            log(f"📈 {deployment} CPU {cpu_usage:.1f}% > {SCALE_UP_THRESHOLD}% | Scale: {current_replicas} → {new_replicas}")
            scale_deployment(deployment, new_replicas)
    elif cpu_usage < SCALE_DOWN_THRESHOLD:
        new_replicas = max(current_replicas - SCALE_DOWN_AMOUNT, MIN_REPLICAS)
        if new_replicas < current_replicas:
            log(f"📉 {deployment} CPU {cpu_usage:.1f}% < {SCALE_DOWN_THRESHOLD}% | Scale: {current_replicas} → {new_replicas}")
            scale_deployment(deployment, new_replicas)
    else:
        log(f"➡️  {deployment} CPU {cpu_usage:.1f}% (steady) | Replicas: {current_replicas}")


def main():
    log("🤖 Threshold-based scaler started (Phase 3 — Reactive)")
    log(f"   Scale up if CPU > {SCALE_UP_THRESHOLD}%")
    log(f"   Scale down if CPU < {SCALE_DOWN_THRESHOLD}%")
    log(f"   Min: {MIN_REPLICAS} | Max: {MAX_REPLICAS} | Check every: {CHECK_INTERVAL}s")
    
    try:
        while True:
            log("─" * 60)
            for deployment in DEPLOYMENTS:
                cpu     = get_deployment_cpu(deployment)
                replicas = get_deployment_replicas(deployment)
                make_scaling_decision(deployment, cpu, replicas)
            
            time.sleep(CHECK_INTERVAL)
    
    except KeyboardInterrupt:
        log("✓ Scaler stopped")
    except Exception as e:
        log(f"❌ Fatal error: {e}")


if __name__ == '__main__':
    main()
