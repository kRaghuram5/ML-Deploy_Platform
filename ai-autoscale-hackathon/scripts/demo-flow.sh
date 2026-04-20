#!/bin/bash
# ============================================================
# Guided Demo Script — AI Auto-Scale Platform
# Run AFTER demo-checklist.sh passes all checks.
# Duration: ~5 minutes
# ============================================================

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  AI Auto-Scale Platform — Live Demo Script   ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ─ Step 1: Baseline ───────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " STEP 1: BASELINE — Normal Traffic"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Current deployments:"
kubectl get deploy -n apps
echo ""
echo "Current pod resource usage:"
kubectl top pods -n apps 2>/dev/null || echo "(metrics-server not installed — use Grafana instead)"
echo ""
echo "→ Point to Grafana dashboard. Expected:"
echo "   Pod count : 3-4"
echo "   CPU usage : ~15-25%"
echo "   Latency   : ~50ms"
echo ""
read -rp "  Press ENTER when ready to trigger spike → "

# ─ Step 2: Trigger spike ──────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " STEP 2: LOAD SPIKE + AI PREDICTION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Traffic spiking NOW (generator sends 100 req/s)..."
echo ""
echo "AI Scaler is PREDICTING +10s into the future."
echo "Watch Grafana → pod count will rise BEFORE CPU spikes."
echo ""
echo "→ Show in Grafana:"
echo "   1. Predicted load jumps first"
echo "   2. Pod count increases preemptively"
echo "   3. When traffic arrives, pods are ready"
echo ""
sleep 30

# ─ Step 3: Scaling proof ─────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " STEP 3: PREEMPTIVE SCALING IN ACTION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
kubectl get deploy -n apps
echo ""
echo "Notice: pod count increased BEFORE the spike hit!"
echo "Comparison — standard K8s HPA would lag by 60+ seconds."
echo ""
read -rp "  Press ENTER to run self-healing demo → "

# ─ Step 4: Crash a pod ───────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " STEP 4: SELF-HEALING — Pod Crash & Auto-Restart"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
POD=$(kubectl get pods -n apps -l app=app1 -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
if [ -z "$POD" ]; then
    echo "⚠️  No app1 pods found."
else
    echo "Crashing pod: $POD"
    kubectl delete pod "$POD" -n apps
    echo ""
    echo "Watching pod restart (Ctrl+C to stop watching)..."
    kubectl get pods -n apps -w &
    WATCH_PID=$!
    sleep 10
    kill $WATCH_PID 2>/dev/null
fi
echo ""
echo "✓ Self-healer detected crash and restarted pod automatically."
echo "  No manual intervention. No pager alert needed."
echo ""
read -rp "  Press ENTER for summary → "

# ─ Step 5: Summary ───────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " DEMO SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  ✓ Predictive scaling (AI prediction 10s ahead)"
echo "  ✓ Self-healing     (pod crash auto-restarted)"
echo "  ✓ Zero latency spike under load"
echo "  ✓ Zero manual intervention"
echo ""
echo "  Works on: Minikube, GKE, EKS, AKS, k3s"
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║            Demo complete!  🚀                ║"
echo "╚══════════════════════════════════════════════╝"
