#!/usr/bin/env python3
"""
Self-healing system (Phase 5).
Detects failed/unhealthy pods and restarts them.
Also detects cascading failures (>50% pods unhealthy).

Usage in cluster: Deployed via k8s-manifests/self-healer.yaml
Usage locally    : python3 self-healer.py
"""

import os
import time
import sys
from datetime import datetime

# Kubernetes — graceful fallback for local dev
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
    v1      = client.CoreV1Api()
    v1_apps = client.AppsV1Api()
except ImportError:
    KUBE_AVAILABLE = False
    v1 = v1_apps = None
    print("⚠️  kubernetes package not available — running in simulation mode")

# ─── Configuration ────────────────────────────────────────────────────────────
NAMESPACE          = os.getenv('NAMESPACE', 'apps')
CHECK_INTERVAL     = 5   # seconds between health checks
CRASH_THRESHOLD    = 3   # max restarts before escalating to alert
CASCADE_DETECTION  = True
# ──────────────────────────────────────────────────────────────────────────────


def log(msg):
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{ts}] {msg}", flush=True)


def get_all_pods() -> list:
    if not KUBE_AVAILABLE:
        return []
    try:
        return v1.list_namespaced_pod(NAMESPACE).items
    except Exception as e:
        log(f"❌ Failed to list pods: {e}")
        return []


def is_pod_healthy(pod) -> bool:
    """Return True only if pod is Running and all containers are Ready."""
    if pod.status.phase != 'Running':
        return False
    if pod.status.container_statuses:
        for cs in pod.status.container_statuses:
            if not cs.ready:
                return False
            if cs.state.terminated:
                return False
    return True


def restart_pod(pod_name: str):
    """Delete pod — ReplicaSet controller will immediately recreate it."""
    if not KUBE_AVAILABLE:
        log(f"  [DRY-RUN] Would delete pod {pod_name}")
        return
    try:
        v1.delete_namespaced_pod(pod_name, NAMESPACE)
        log(f"🔄 Restarted pod: {pod_name}")
    except Exception as e:
        log(f"❌ Failed to restart {pod_name}: {e}")


def detect_cascading_failures(pods: list) -> bool:
    if not CASCADE_DETECTION:
        return False
    unhealthy = sum(1 for p in pods if not is_pod_healthy(p))
    total     = len(pods)
    if total > 0 and (unhealthy / total) > 0.5:
        log(f"⚠️  CASCADING FAILURE: {unhealthy}/{total} pods unhealthy!")
        log("⚠️  Possible cause: bad deployment, OOM, resource exhaustion.")
        return True
    return False


def main():
    log("🔧 Self-healing system started (Phase 5)")
    log(f"   Namespace        : {NAMESPACE}")
    log(f"   Check interval   : {CHECK_INTERVAL}s")
    log(f"   Crash threshold  : {CRASH_THRESHOLD} restarts → alert")
    log(f"   Cascade detection: {'ON' if CASCADE_DETECTION else 'OFF'}")
    
    if not KUBE_AVAILABLE:
        log("⚠️  Kubernetes not available — no K8s connectivity.")
        log("   Install with: pip install kubernetes")
        log("   Then point KUBECONFIG at your cluster.")
    
    pod_restart_count: dict[str, int] = {}
    
    try:
        while True:
            pods = get_all_pods()
            
            if detect_cascading_failures(pods):
                log("🚨 System-wide issue detected — manual investigation recommended!")
            
            for pod in pods:
                pod_name = pod.metadata.name
                
                if not is_pod_healthy(pod):
                    pod_restart_count.setdefault(pod_name, 0)
                    pod_restart_count[pod_name] += 1
                    count = pod_restart_count[pod_name]
                    
                    if count <= CRASH_THRESHOLD:
                        log(f"💥 Unhealthy pod: {pod_name} (restart #{count})")
                        restart_pod(pod_name)
                    else:
                        log(f"🚨 Pod repeatedly failing: {pod_name} (>{CRASH_THRESHOLD} restarts) — check for OOM or crash loop")
                
                else:
                    # Pod is healthy — clear its count if it had issues
                    if pod_restart_count.get(pod_name, 0) > 0:
                        log(f"✅ Pod recovered: {pod_name}")
                    pod_restart_count.pop(pod_name, None)
            
            if not pods and KUBE_AVAILABLE:
                log(f"ℹ️  No pods found in namespace '{NAMESPACE}'")
            
            time.sleep(CHECK_INTERVAL)
    
    except KeyboardInterrupt:
        log("✓ Self-healer stopped")
    except Exception as e:
        log(f"❌ Fatal error: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
