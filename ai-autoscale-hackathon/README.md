# AI Auto-Scaling Platform

> **Build a Kubernetes cluster with AI-powered auto-scaling and self-healing on your laptop — zero cloud cost.**

---

## 📁 Project Structure

```
ai-autoscale-hackathon/
├── k8s-manifests/
│   ├── dummy-apps.yaml          ← Phase 1: 3 nginx deployments + services
│   ├── prometheus.yaml          ← Phase 2: Prometheus metrics collection
│   ├── grafana.yaml             ← Phase 2: Grafana dashboard
│   ├── load-generator-job.yaml  ← Phase 3: Synthetic traffic Kubernetes Job
│   ├── scaler-deployment.yaml   ← Phase 4: AI autoscaler pod + RBAC
│   └── self-healer.yaml         ← Phase 5: Self-healing pod + RBAC
├── scaler/
│   ├── threshold-scaler.py      ← Phase 3: Reactive CPU-based scaler
│   ├── ai-scaler.py             ← Phase 4: Predictive LSTM scaler
│   └── self-healer.py           ← Phase 5: Pod crash detector & restarter
├── ml-model/
│   └── load-predictor.py        ← Phase 4: LSTM model trainer/predictor
├── load-generator/
│   └── generator.py             ← Local traffic generator
├── scripts/
│   ├── demo-checklist.sh        ← Pre-demo health check
│   └── demo-flow.sh             ← Guided 5-minute demo script
└── README.md
```

---

## 🚀 Quick Start (Full Setup)

### Prerequisites
```bash
# Install on macOS
brew install minikube kubectl
# Docker Desktop must be running

# Python packages
pip3 install prometheus-client kubernetes pandas numpy scikit-learn requests
```

### Step 1 — Start Minikube
```bash
minikube start \
  --cpus=4 \
  --memory=6144 \
  --driver=docker \
  --profile=autoscale-demo

minikube status  # should say Running
```

### Step 2 — Create Namespaces
```bash
kubectl create namespace monitoring
kubectl create namespace apps
```

### Step 3 — Deploy Everything
```bash
# Phase 1: Core Apps
kubectl apply -f k8s-manifests/dummy-apps.yaml
kubectl get pods -n apps -w   # wait for Running

# Phase 2: Monitoring Stack
kubectl apply -f k8s-manifests/prometheus.yaml
kubectl apply -f k8s-manifests/grafana.yaml
kubectl get pods -n monitoring -w

# Phase 3: Load Generator
kubectl apply -f k8s-manifests/load-generator-job.yaml
kubectl logs -n apps -f job/load-generator

# Phase 4: AI Autoscaler
kubectl apply -f k8s-manifests/scaler-deployment.yaml
kubectl logs -n apps -f deployment/ai-autoscaler

# Phase 5: Self-Healer
kubectl apply -f k8s-manifests/self-healer.yaml
kubectl logs -n apps -f deployment/self-healer
```

### Step 4 — Open Dashboards
```bash
# Terminal 1
kubectl port-forward -n monitoring svc/prometheus 9090:9090

# Terminal 2
kubectl port-forward -n monitoring svc/grafana 3000:3000
```

- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3000 (login: admin / admin)

---

## 🧪 Test Each Component Manually

### Test: Scaling Works
```bash
kubectl scale deployment app1 -n apps --replicas=5
kubectl get pods -n apps -w
```

### Test: Self-Healing Works
```bash
# Get a pod name
kubectl get pods -n apps -l app=app1

# Kill it
kubectl delete pod app1-<HASH> -n apps

# Watch it restart
kubectl get pods -n apps -w
```

### Test: AI Prediction Locally
```bash
cd ml-model
pip3 install numpy scikit-learn requests
python3 load-predictor.py
```

### Test: Threshold Scaler Locally
```bash
cd scaler
# Make sure your kubeconfig points to minikube
kubectl config use-context autoscale-demo
python3 threshold-scaler.py
```

### Test: AI Scaler Locally
```bash
cd scaler
python3 ai-scaler.py
```

### Test: Self-Healer Locally
```bash
cd scaler
python3 self-healer.py
```

---

## 🎬 Demo Day

```bash
# Pre-demo check
chmod +x scripts/*.sh
./scripts/demo-checklist.sh

# Run guided demo (5 minutes)
./scripts/demo-flow.sh
```

---

## 📊 Key Prometheus Queries (for Grafana)

```promql
# Pod count per deployment
count(kube_pod_labels{namespace="apps"}) by (deployment)

# CPU usage
rate(container_cpu_usage_seconds_total{namespace="apps"}[1m]) * 100

# Memory usage (MB)
container_memory_usage_bytes{namespace="apps"} / 1024 / 1024

# Request rate
rate(http_requests_total{namespace="apps"}[1m])

# Pod restart count
increase(kube_pod_container_status_restarts_total{namespace="apps"}[1h])
```

---

## 🔧 Troubleshooting

| Problem | Fix |
|---|---|
| `minikube start` fails | `minikube delete --profile=autoscale-demo` then retry with `--memory=8192` |
| Pods stuck in Pending | `kubectl describe pod <name> -n apps` — usually resource limits |
| Prometheus shows no data | Check ConfigMap scrape annotations on pods |
| AI scaler won't train | Runs `ml-model/load-predictor.py` first — check if sklearn is installed |
| Grafana shows no data | Reconfigure data source, click "Save & Test" |

---

## 🏆 Demo Pitch Points

1. **Problem**: Standard K8s HPA reacts after latency spikes (lags 60+ sec)
2. **Solution**: LSTM predicts load 10 seconds ahead → preemptive scaling
3. **Self-Healing**: Automatic crash detection, zero human intervention  
4. **Cost savings**: Aggressive scale-down when idle, scale-up only when predicted
5. **Production-ready**: Works on GKE, EKS, AKS unchanged
