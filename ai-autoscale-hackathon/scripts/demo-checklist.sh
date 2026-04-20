#!/bin/bash
# ============================================================
# Pre-Demo Checklist — Run this RIGHT BEFORE your presentation
# Usage: ./demo-checklist.sh
# ============================================================
set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }

echo ""
echo "========================================"
echo "  AI Auto-Scale Platform — Demo Check"
echo "========================================"
echo ""

# 1. Kubernetes cluster
echo "[ Infrastructure ]"
if kubectl cluster-info > /dev/null 2>&1; then
    pass "Kubernetes cluster reachable"
else
    fail "Cluster NOT reachable — run: minikube start --profile=autoscale-demo --cpus=4 --memory=6144"
    exit 1
fi

# 2. App pods
RUNNING=$(kubectl get pods -n apps --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l | tr -d ' ')
if [ "$RUNNING" -gt 0 ]; then
    pass "Apps running ($RUNNING pods)"
else
    fail "No app pods running — run: kubectl apply -f k8s-manifests/dummy-apps.yaml"
fi

# 3. Prometheus
PROM=$(kubectl get pods -n monitoring -l app=prometheus --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l | tr -d ' ')
if [ "$PROM" -gt 0 ]; then
    pass "Prometheus running"
else
    fail "Prometheus NOT running — run: kubectl apply -f k8s-manifests/prometheus.yaml"
fi

# 4. Grafana
GRA=$(kubectl get pods -n monitoring -l app=grafana --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l | tr -d ' ')
if [ "$GRA" -gt 0 ]; then
    pass "Grafana running"
else
    fail "Grafana NOT running — run: kubectl apply -f k8s-manifests/grafana.yaml"
fi

# 5. AI Autoscaler
AI=$(kubectl get pods -n apps -l app=ai-autoscaler --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l | tr -d ' ')
if [ "$AI" -gt 0 ]; then
    pass "AI Autoscaler running"
else
    fail "AI Autoscaler NOT running — run: kubectl apply -f k8s-manifests/scaler-deployment.yaml"
fi

# 6. Self-Healer
SH=$(kubectl get pods -n apps -l app=self-healer --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l | tr -d ' ')
if [ "$SH" -gt 0 ]; then
    pass "Self-Healer running"
else
    warn "Self-Healer not running — run: kubectl apply -f k8s-manifests/self-healer.yaml"
fi

# 7. Load Generator
LG=$(kubectl get pods -n apps -l job-name=load-generator --no-headers 2>/dev/null | wc -l | tr -d ' ')
if [ "$LG" -gt 0 ]; then
    pass "Load generator active"
else
    warn "Load generator not running — run: kubectl apply -f k8s-manifests/load-generator-job.yaml"
fi

echo ""
echo "[ Port-Forwards (open in new terminals) ]"
echo "  Prometheus : kubectl port-forward -n monitoring svc/prometheus 9090:9090"
echo "  Grafana    : kubectl port-forward -n monitoring svc/grafana 3000:3000"
echo "  App1       : kubectl port-forward -n apps svc/app1 8080:80"
echo ""
echo "[ Access URLs ]"
echo "  Prometheus : http://localhost:9090"
echo "  Grafana    : http://localhost:3000  (admin/admin)"
echo ""
echo "========================================"
echo "  System ready for demo!"
echo "========================================"
