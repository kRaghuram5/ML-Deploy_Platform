# DC-1: One-Click ML Model Deployment Platform
## Complete Vibe-Coding Build Plan — 16 Hours to a Working Product

> **Your goal:** A data scientist uploads a `.pkl` file → your platform auto-generates a Dockerfile + FastAPI wrapper → deploys it live on Google Cloud Run → returns a working HTTPS API endpoint. All in under 2 minutes. No DevOps knowledge required.

---

## Tech Stack (Decide Before You Start)

| Layer | Technology | Why |
|---|---|---|
| Frontend | React + Tailwind CSS | Fast UI, easy drag-and-drop |
| Backend | Python + FastAPI | Same language as ML ecosystem |
| AI Layer | Anthropic Claude API | Auto schema detection, doc generation |
| Containerization | Docker | Industry standard |
| Cloud Deployment | Google Cloud Run | Serverless, free tier, fast CLI deploy |
| Storage | Local filesystem (hackathon) | Keep it simple |

---

## Project Folder Structure

```
ml-deploy-platform/
├── frontend/                  # React app
│   ├── src/
│   │   ├── components/
│   │   │   ├── UploadZone.jsx
│   │   │   ├── DeployProgress.jsx
│   │   │   ├── EndpointCard.jsx
│   │   │   ├── TestConsole.jsx
│   │   │   └── ModelDashboard.jsx
│   │   ├── App.jsx
│   │   └── main.jsx
│   └── package.json
│
├── backend/                   # FastAPI backend
│   ├── main.py                # Entry point
│   ├── routers/
│   │   ├── upload.py          # File upload handler
│   │   ├── deploy.py          # Deployment pipeline
│   │   └── models.py          # Model management
│   ├── core/
│   │   ├── inspector.py       # Model introspection engine
│   │   ├── generator.py       # Dockerfile + wrapper generator
│   │   ├── deployer.py        # Cloud Run deployment scripts
│   │   └── ai_layer.py        # Claude API integration
│   ├── templates/
│   │   ├── Dockerfile.template
│   │   └── app_wrapper.py.template
│   └── requirements.txt
│
├── sample_models/             # Pre-built demo .pkl files
│   ├── iris_classifier.pkl
│   ├── house_price_regressor.pkl
│   └── spam_detector.pkl
│
└── README.md
```

---

## Pre-requisites — Set Up Before Coding

```bash
# 1. Google Cloud CLI
brew install google-cloud-sdk   # or apt-get
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com

# 2. Docker Desktop — must be running
docker --version

# 3. Python 3.10+
python --version

# 4. Node 18+
node --version

# 5. Anthropic API Key
export ANTHROPIC_API_KEY=your_key_here
```

---

---

# PHASE 1 — Foundation (Hours 0–3)
## Goal: Project runs locally, file upload works end to end

---

### Step 1.1 — Backend Setup

```bash
mkdir ml-deploy-platform && cd ml-deploy-platform
mkdir backend && cd backend
python -m venv venv
source venv/bin/activate
pip install fastapi uvicorn python-multipart scikit-learn joblib numpy pandas anthropic
pip freeze > requirements.txt
```

**`backend/main.py`**
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import upload, deploy, models

app = FastAPI(title="ML Deploy Platform", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router, prefix="/api/upload", tags=["upload"])
app.include_router(deploy.router, prefix="/api/deploy", tags=["deploy"])
app.include_router(models.router, prefix="/api/models", tags=["models"])

@app.get("/health")
def health():
    return {"status": "ok"}
```

```bash
uvicorn main:app --reload --port 8000
# Visit http://localhost:8000/docs — you should see the Swagger UI
```

---

### Step 1.2 — Model Introspection Engine

This is the most critical file in the whole project. It opens the `.pkl` file and figures out everything about it automatically.

**`backend/core/inspector.py`**
```python
import pickle
import joblib
import numpy as np
import traceback
from typing import Dict, Any

def inspect_model(filepath: str) -> Dict[str, Any]:
    """
    Opens a .pkl file and extracts everything we need to know about it.
    Returns a structured dict with model type, input features, output type.
    """
    result = {
        "model_type": "unknown",
        "library": "unknown",
        "input_features": [],
        "input_count": None,
        "output_type": "unknown",
        "task_type": "unknown",   # classification or regression
        "classes": None,
        "feature_names": None,
        "error": None
    }

    try:
        # Try joblib first (scikit-learn standard), then pickle
        try:
            model = joblib.load(filepath)
        except Exception:
            with open(filepath, "rb") as f:
                model = pickle.load(f)

        result["model_type"] = type(model).__name__
        result["library"] = type(model).__module__.split(".")[0]

        # --- Scikit-learn models ---
        if hasattr(model, "n_features_in_"):
            result["input_count"] = int(model.n_features_in_)

        if hasattr(model, "feature_names_in_"):
            result["feature_names"] = list(model.feature_names_in_)
            result["input_features"] = [
                {"name": name, "type": "float"} for name in model.feature_names_in_
            ]
        elif result["input_count"]:
            result["input_features"] = [
                {"name": f"feature_{i}", "type": "float"}
                for i in range(result["input_count"])
            ]

        # Classification vs Regression
        if hasattr(model, "classes_"):
            result["task_type"] = "classification"
            result["classes"] = [str(c) for c in model.classes_]
            result["output_type"] = f"one of {list(model.classes_)}"
        else:
            result["task_type"] = "regression"
            result["output_type"] = "numeric value (float)"

        # Pipeline support
        if hasattr(model, "steps"):
            result["model_type"] = f"Pipeline({model.steps[-1][0]})"

    except Exception as e:
        result["error"] = str(e)
        result["traceback"] = traceback.format_exc()

    return result
```

---

### Step 1.3 — File Upload Router

**`backend/routers/upload.py`**
```python
import os, uuid, shutil
from fastapi import APIRouter, UploadFile, File, HTTPException
from core.inspector import inspect_model

router = APIRouter()
UPLOAD_DIR = "/tmp/ml_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/")
async def upload_model(file: UploadFile = File(...)):
    if not file.filename.endswith((".pkl", ".joblib", ".h5")):
        raise HTTPException(400, "Unsupported file type. Upload .pkl, .joblib, or .h5")

    model_id = str(uuid.uuid4())[:8]
    model_dir = os.path.join(UPLOAD_DIR, model_id)
    os.makedirs(model_dir, exist_ok=True)

    filepath = os.path.join(model_dir, file.filename)
    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Inspect the model immediately after upload
    inspection = inspect_model(filepath)

    return {
        "model_id": model_id,
        "filename": file.filename,
        "filepath": filepath,
        "inspection": inspection,
        "status": "uploaded"
    }
```

---

### Step 1.4 — Frontend Setup

```bash
cd ..
npm create vite@latest frontend -- --template react
cd frontend
npm install
npm install axios react-dropzone lucide-react
npm run dev
# Visit http://localhost:5173
```

**`frontend/src/App.jsx`**
```jsx
import { useState } from 'react'
import UploadZone from './components/UploadZone'
import DeployProgress from './components/DeployProgress'
import EndpointCard from './components/EndpointCard'
import ModelDashboard from './components/ModelDashboard'

export default function App() {
  const [stage, setStage] = useState('upload') // upload | deploying | done
  const [modelData, setModelData] = useState(null)
  const [deployedModels, setDeployedModels] = useState([])

  const handleUploaded = (data) => {
    setModelData(data)
    setStage('deploying')
  }

  const handleDeployed = (endpoint) => {
    const newModel = { ...modelData, endpoint, deployedAt: new Date() }
    setDeployedModels(prev => [newModel, ...prev])
    setModelData(newModel)
    setStage('done')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fa', fontFamily: 'system-ui' }}>
      <header style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '16px 32px' }}>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>
          ModelDeploy — Instant ML APIs
        </h1>
      </header>

      <main style={{ maxWidth: '900px', margin: '40px auto', padding: '0 24px' }}>
        {stage === 'upload' && <UploadZone onUploaded={handleUploaded} />}
        {stage === 'deploying' && (
          <DeployProgress modelData={modelData} onDeployed={handleDeployed} />
        )}
        {stage === 'done' && (
          <EndpointCard modelData={modelData} onReset={() => setStage('upload')} />
        )}
        {deployedModels.length > 0 && (
          <ModelDashboard models={deployedModels} />
        )}
      </main>
    </div>
  )
}
```

**`frontend/src/components/UploadZone.jsx`**
```jsx
import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import axios from 'axios'

export default function UploadZone({ onUploaded }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)

  const onDrop = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0]
    if (!file) return

    setUploading(true)
    setError(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await axios.post('http://localhost:8000/api/upload/', formData)
      onUploaded(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }, [onUploaded])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/octet-stream': ['.pkl', '.joblib', '.h5'] },
    multiple: false
  })

  return (
    <div style={{ textAlign: 'center', padding: '40px 0' }}>
      <h2 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '8px' }}>
        Deploy your ML model in 90 seconds
      </h2>
      <p style={{ color: '#6b7280', marginBottom: '32px' }}>
        Upload a .pkl file — we handle everything else
      </p>

      <div
        {...getRootProps()}
        style={{
          border: `2px dashed ${isDragActive ? '#6366f1' : '#d1d5db'}`,
          borderRadius: '16px',
          padding: '60px 40px',
          cursor: 'pointer',
          background: isDragActive ? '#eef2ff' : '#fff',
          transition: 'all 0.2s'
        }}
      >
        <input {...getInputProps()} />
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📦</div>
        {uploading ? (
          <p style={{ color: '#6366f1' }}>Uploading and analyzing model...</p>
        ) : (
          <>
            <p style={{ fontSize: '18px', fontWeight: 500 }}>
              {isDragActive ? 'Drop it here' : 'Drag & drop your .pkl file'}
            </p>
            <p style={{ color: '#9ca3af', marginTop: '8px' }}>or click to browse</p>
          </>
        )}
      </div>

      {error && (
        <div style={{ marginTop: '16px', color: '#ef4444', background: '#fef2f2',
          padding: '12px', borderRadius: '8px' }}>
          {error}
        </div>
      )}
    </div>
  )
}
```

**Test Phase 1:** Upload one of your sample `.pkl` files. Backend should respond with inspection data. Check the browser network tab — you should see the model type, feature count, task type returned.

---

---

# PHASE 2 — Core Engine (Hours 3–7)
## Goal: Dockerfile + FastAPI wrapper generated automatically

---

### Step 2.1 — Dockerfile & Wrapper Generator

**`backend/core/generator.py`**
```python
import os

DOCKERFILE_TEMPLATE = '''FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY model.pkl .
COPY app.py .

EXPOSE 8080
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
'''

REQUIREMENTS_TEMPLATE = '''fastapi
uvicorn
scikit-learn
joblib
numpy
pandas
'''

def generate_app_wrapper(inspection: dict) -> str:
    """
    Generates a FastAPI app.py that wraps the model.
    Adapts based on inspection results (classification vs regression).
    """
    feature_fields = ""
    example_values = {}

    if inspection.get("feature_names"):
        for fname in inspection["feature_names"]:
            feature_fields += f"    {fname}: float\n"
            example_values[fname] = 1.0
    elif inspection.get("input_count"):
        for i in range(inspection["input_count"]):
            fname = f"feature_{i}"
            feature_fields += f"    {fname}: float\n"
            example_values[fname] = 1.0
    else:
        feature_fields = "    inputs: list\n"

    task_type = inspection.get("task_type", "regression")
    classes = inspection.get("classes", [])

    if task_type == "classification" and classes:
        output_description = f"Predicted class. One of: {classes}"
        predict_logic = """
    prediction = model.predict([list(data.dict().values())])[0]
    probabilities = None
    if hasattr(model, 'predict_proba'):
        probs = model.predict_proba([list(data.dict().values())])[0]
        probabilities = {str(c): round(float(p), 4) for c, p in zip(model.classes_, probs)}
    return {"prediction": str(prediction), "probabilities": probabilities}
"""
    else:
        output_description = "Predicted numeric value"
        predict_logic = """
    prediction = model.predict([list(data.dict().values())])[0]
    return {"prediction": float(prediction)}
"""

    wrapper = f'''import joblib
import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(
    title="ML Model API",
    description="Auto-generated by ModelDeploy Platform",
    version="1.0.0"
)

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

model = joblib.load("model.pkl")

class InputData(BaseModel):
{feature_fields if feature_fields else "    inputs: list"}

@app.get("/")
def root():
    return {{
        "model": "{inspection.get("model_type", "unknown")}",
        "task": "{task_type}",
        "status": "live",
        "docs": "/docs"
    }}

@app.post("/predict")
def predict(data: InputData):{predict_logic}

@app.get("/health")
def health():
    return {{"status": "ok"}}
'''
    return wrapper


def generate_all_files(model_filepath: str, inspection: dict, output_dir: str):
    """
    Creates Dockerfile, app.py, and requirements.txt in output_dir.
    Copies the model file there too.
    """
    import shutil
    os.makedirs(output_dir, exist_ok=True)

    # Copy model
    shutil.copy(model_filepath, os.path.join(output_dir, "model.pkl"))

    # Write Dockerfile
    with open(os.path.join(output_dir, "Dockerfile"), "w") as f:
        f.write(DOCKERFILE_TEMPLATE)

    # Write app.py wrapper
    with open(os.path.join(output_dir, "app.py"), "w") as f:
        f.write(generate_app_wrapper(inspection))

    # Write requirements.txt
    with open(os.path.join(output_dir, "requirements.txt"), "w") as f:
        f.write(REQUIREMENTS_TEMPLATE)

    return {
        "dockerfile": os.path.join(output_dir, "Dockerfile"),
        "app_wrapper": os.path.join(output_dir, "app.py"),
        "requirements": os.path.join(output_dir, "requirements.txt"),
    }
```

---

### Step 2.2 — Cloud Run Deployer

**`backend/core/deployer.py`**
```python
import subprocess
import os
import time
from typing import Generator

GCP_PROJECT = os.getenv("GCP_PROJECT_ID", "your-project-id")
GCP_REGION = os.getenv("GCP_REGION", "us-central1")

def build_and_deploy(model_id: str, build_dir: str) -> Generator[dict, None, None]:
    """
    Streams deployment steps back to the frontend in real time.
    Each step yields a dict with step name and status.
    """
    image_name = f"gcr.io/{GCP_PROJECT}/model-{model_id}:latest"
    service_name = f"model-{model_id}"

    steps = [
        ("analyzing",     "Analyzing model structure..."),
        ("generating",    "Generating Dockerfile and API wrapper..."),
        ("building",      "Building Docker container..."),
        ("pushing",       "Pushing image to container registry..."),
        ("deploying",     "Deploying to Cloud Run..."),
        ("live",          "Deployment complete!"),
    ]

    # Step 1-2 already done before this is called
    yield {"step": "analyzing",  "status": "done",    "message": steps[0][1]}
    yield {"step": "generating", "status": "done",    "message": steps[1][1]}

    # Step 3: Docker build
    yield {"step": "building", "status": "running", "message": steps[2][1]}
    result = subprocess.run(
        ["docker", "build", "-t", image_name, build_dir],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        yield {"step": "building", "status": "error", "message": result.stderr[-500:]}
        return
    yield {"step": "building", "status": "done", "message": "Container built successfully"}

    # Step 4: Push to GCR
    yield {"step": "pushing", "status": "running", "message": steps[3][1]}
    result = subprocess.run(
        ["docker", "push", image_name],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        yield {"step": "pushing", "status": "error", "message": result.stderr[-500:]}
        return
    yield {"step": "pushing", "status": "done", "message": "Image pushed to registry"}

    # Step 5: Deploy to Cloud Run
    yield {"step": "deploying", "status": "running", "message": steps[4][1]}
    result = subprocess.run([
        "gcloud", "run", "deploy", service_name,
        "--image", image_name,
        "--platform", "managed",
        "--region", GCP_REGION,
        "--allow-unauthenticated",
        "--port", "8080",
        "--project", GCP_PROJECT,
        "--format", "value(status.url)"
    ], capture_output=True, text=True)

    if result.returncode != 0:
        yield {"step": "deploying", "status": "error", "message": result.stderr[-500:]}
        return

    endpoint_url = result.stdout.strip()
    if not endpoint_url:
        # Try to get URL from describe
        describe = subprocess.run([
            "gcloud", "run", "services", "describe", service_name,
            "--region", GCP_REGION, "--format", "value(status.url)",
            "--project", GCP_PROJECT
        ], capture_output=True, text=True)
        endpoint_url = describe.stdout.strip()

    yield {
        "step": "live",
        "status": "done",
        "message": "Your model is live!",
        "endpoint": endpoint_url
    }
```

---

### Step 2.3 — Deploy Router with SSE Streaming

**`backend/routers/deploy.py`**
```python
import os, json
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from core.inspector import inspect_model
from core.generator import generate_all_files
from core.deployer import build_and_deploy

router = APIRouter()
BUILD_DIR = "/tmp/ml_builds"

@router.post("/stream/{model_id}")
async def deploy_stream(model_id: str, body: dict):
    """
    Streams deployment progress as Server-Sent Events.
    Frontend listens with EventSource.
    """
    filepath = body.get("filepath")
    inspection = body.get("inspection", {})

    def event_stream():
        build_dir = os.path.join(BUILD_DIR, model_id)

        # Generate files
        generate_all_files(filepath, inspection, build_dir)

        # Stream each deployment step
        for step in build_and_deploy(model_id, build_dir):
            yield f"data: {json.dumps(step)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

---

### Step 2.4 — DeployProgress Frontend Component

**`frontend/src/components/DeployProgress.jsx`**
```jsx
import { useEffect, useState } from 'react'
import axios from 'axios'

const STEPS = [
  { key: 'analyzing',  label: 'Analyzing model structure' },
  { key: 'generating', label: 'Generating Dockerfile & API wrapper' },
  { key: 'building',   label: 'Building Docker container' },
  { key: 'pushing',    label: 'Pushing to container registry' },
  { key: 'deploying',  label: 'Deploying to Cloud Run' },
  { key: 'live',       label: 'Going live!' },
]

const StatusIcon = ({ status }) => {
  if (status === 'done')    return <span style={{ color: '#10b981' }}>✓</span>
  if (status === 'running') return <span style={{ color: '#6366f1' }}>⟳</span>
  if (status === 'error')   return <span style={{ color: '#ef4444' }}>✗</span>
  return <span style={{ color: '#d1d5db' }}>○</span>
}

export default function DeployProgress({ modelData, onDeployed }) {
  const [stepStatus, setStepStatus] = useState({})
  const [currentMessage, setCurrentMessage] = useState('Starting deployment...')
  const [error, setError] = useState(null)
  const elapsed = useElapsed()

  useEffect(() => {
    startDeploy()
  }, [])

  const startDeploy = async () => {
    try {
      const res = await axios.post(
        `http://localhost:8000/api/deploy/stream/${modelData.model_id}`,
        { filepath: modelData.filepath, inspection: modelData.inspection },
        { responseType: 'text' }
      )

      // Parse SSE manually (simple approach for hackathon)
      const lines = res.data.split('\n')
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6))
          setStepStatus(prev => ({ ...prev, [data.step]: data.status }))
          setCurrentMessage(data.message)

          if (data.step === 'live' && data.endpoint) {
            onDeployed(data.endpoint)
          }
          if (data.status === 'error') {
            setError(data.message)
            break
          }
        }
      }
    } catch (err) {
      setError('Deployment failed: ' + err.message)
    }
  }

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '40px 0' }}>
      <h2 style={{ textAlign: 'center', marginBottom: '8px' }}>Deploying your model</h2>
      <p style={{ textAlign: 'center', color: '#6b7280', marginBottom: '40px' }}>
        {currentMessage}
      </p>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px' }}>
        {STEPS.map((step, i) => (
          <div key={step.key} style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '12px 0',
            borderBottom: i < STEPS.length - 1 ? '1px solid #f3f4f6' : 'none'
          }}>
            <StatusIcon status={stepStatus[step.key] || 'pending'} />
            <span style={{
              color: stepStatus[step.key] ? '#111827' : '#9ca3af',
              fontWeight: stepStatus[step.key] === 'running' ? 600 : 400
            }}>
              {step.label}
            </span>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ marginTop: '16px', color: '#ef4444', background: '#fef2f2',
          padding: '12px', borderRadius: '8px', fontSize: '13px' }}>
          Error: {error}
        </div>
      )}
    </div>
  )
}

function useElapsed() {
  const [s, setS] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setS(x => x + 1), 1000)
    return () => clearInterval(t)
  }, [])
  return s
}
```

---

---

# PHASE 3 — AI Layer (Hours 7–11)
## Goal: Claude auto-generates input schema, API docs, model card

---

### Step 3.1 — Claude Integration

**`backend/core/ai_layer.py`**
```python
import anthropic
import json
import os

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

def generate_api_docs(inspection: dict) -> dict:
    """
    Given model inspection data, Claude writes human-readable API documentation.
    """
    prompt = f"""
You are a technical writer. A machine learning model has been uploaded with the following properties:

Model type: {inspection.get("model_type")}
Task type: {inspection.get("task_type")}
Input features: {inspection.get("feature_names") or inspection.get("input_count")}
Output: {inspection.get("output_type")}
Classes (if classification): {inspection.get("classes")}

Generate the following in JSON format (no markdown, raw JSON only):
{{
  "title": "Short API title (what does this model predict?)",
  "description": "2-sentence plain English description of what this API does",
  "input_description": "One sentence explaining what inputs the user needs to provide",
  "output_description": "One sentence explaining what the response means",
  "example_use_case": "One real-world use case for this model",
  "curl_example": "A curl command example hitting POST /predict with sample values",
  "warnings": "Any limitations or important notes about using this model"
}}

Be concise and practical. Write for developers who will integrate this API.
"""

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1000,
        messages=[{"role": "user", "content": prompt}]
    )

    text = message.content[0].text.strip()
    try:
        return json.loads(text)
    except Exception:
        return {"description": text, "error": "Could not parse structured response"}


def generate_input_schema(inspection: dict) -> dict:
    """
    Claude figures out realistic example values for each input feature.
    """
    feature_names = inspection.get("feature_names") or [
        f"feature_{i}" for i in range(inspection.get("input_count", 4))
    ]
    model_type = inspection.get("model_type", "")
    task_type = inspection.get("task_type", "regression")

    prompt = f"""
A {model_type} model for {task_type} has these input features: {feature_names}

Generate realistic example values for each feature in JSON format only (no markdown):
{{
  "feature_name": {{
    "example": <realistic numeric value>,
    "description": "<what this feature likely represents>",
    "typical_range": "<e.g. 0-100 or 0.0-1.0>"
  }},
  ...
}}

Be realistic. If features look like Iris dataset (sepal/petal), use those ranges.
If they look like house prices (bedrooms, sqft), use realistic housing values.
"""

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=800,
        messages=[{"role": "user", "content": prompt}]
    )

    text = message.content[0].text.strip()
    try:
        return json.loads(text)
    except Exception:
        return {name: {"example": 1.0, "description": "Input feature"} for name in feature_names}


def generate_model_card(inspection: dict, api_docs: dict) -> str:
    """
    Generates a markdown model card — a one-page summary of the deployed model.
    """
    prompt = f"""
Write a concise ML model card in markdown format for this deployed model:

Model: {inspection.get("model_type")}
Task: {inspection.get("task_type")}
Features: {inspection.get("feature_names") or inspection.get("input_count")} inputs
Output: {inspection.get("output_type")}
API description: {api_docs.get("description", "")}

Include sections: Overview, Inputs, Outputs, Example Use Case, Limitations.
Keep it under 300 words. Write for a technical audience.
"""

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=600,
        messages=[{"role": "user", "content": prompt}]
    )

    return message.content[0].text
```

---

### Step 3.2 — Add AI Endpoints to Upload Router

Add to `backend/routers/upload.py`:
```python
from core.ai_layer import generate_api_docs, generate_input_schema, generate_model_card

@router.post("/analyze/{model_id}")
async def analyze_model(model_id: str, body: dict):
    """
    After upload, runs AI analysis on the inspection data.
    Called by frontend after upload completes.
    """
    inspection = body.get("inspection", {})

    api_docs = generate_api_docs(inspection)
    input_schema = generate_input_schema(inspection)
    model_card = generate_model_card(inspection, api_docs)

    return {
        "model_id": model_id,
        "api_docs": api_docs,
        "input_schema": input_schema,
        "model_card": model_card
    }
```

---

### Step 3.3 — Show AI Results in Frontend

Update `App.jsx` to call the analyze endpoint after upload:
```jsx
const handleUploaded = async (data) => {
  setModelData(data)

  // Run AI analysis in background
  try {
    const aiRes = await axios.post(
      `http://localhost:8000/api/upload/analyze/${data.model_id}`,
      { inspection: data.inspection }
    )
    setModelData(prev => ({ ...prev, aiAnalysis: aiRes.data }))
  } catch (e) {
    console.warn('AI analysis failed, continuing without it')
  }

  setStage('deploying')
}
```

---

---

# PHASE 4 — Live Test Console + Endpoint Card (Hours 11–13)
## Goal: Judges can test the API right inside your UI

---

### Step 4.1 — EndpointCard Component

**`frontend/src/components/EndpointCard.jsx`**
```jsx
import { useState } from 'react'
import TestConsole from './TestConsole'

export default function EndpointCard({ modelData, onReset }) {
  const [copied, setCopied] = useState(false)
  const endpoint = modelData?.endpoint || 'https://model-xxx.run.app'
  const docs = modelData?.aiAnalysis?.api_docs || {}

  const copy = (text) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto' }}>

      {/* Success Header */}
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <div style={{ fontSize: '48px', marginBottom: '12px' }}>🚀</div>
        <h2 style={{ fontSize: '28px', fontWeight: 700, color: '#10b981' }}>
          Your model is live!
        </h2>
        <p style={{ color: '#6b7280' }}>
          {docs.title || `${modelData?.inspection?.model_type} API`} deployed in under 2 minutes
        </p>
      </div>

      {/* Endpoint URL */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px',
        padding: '20px', marginBottom: '16px' }}>
        <label style={{ fontSize: '12px', color: '#6b7280', display: 'block', marginBottom: '8px' }}>
          YOUR LIVE API ENDPOINT
        </label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <code style={{ flex: 1, background: '#f9fafb', padding: '10px 14px',
            borderRadius: '8px', fontSize: '14px', color: '#111827' }}>
            {endpoint}/predict
          </code>
          <button onClick={() => copy(`${endpoint}/predict`)}
            style={{ padding: '10px 16px', background: '#6366f1', color: '#fff',
              border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* AI-Generated Description */}
      {docs.description && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px',
          padding: '16px', marginBottom: '16px' }}>
          <p style={{ margin: 0, color: '#166534', fontSize: '14px' }}>
            <strong>What this API does:</strong> {docs.description}
          </p>
        </div>
      )}

      {/* Quick Links */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        <a href={`${endpoint}/docs`} target="_blank" rel="noopener noreferrer"
          style={{ padding: '8px 16px', background: '#fff', border: '1px solid #e5e7eb',
            borderRadius: '8px', textDecoration: 'none', color: '#374151', fontSize: '14px' }}>
          📖 API Docs
        </a>
        <a href={`${endpoint}/health`} target="_blank" rel="noopener noreferrer"
          style={{ padding: '8px 16px', background: '#fff', border: '1px solid #e5e7eb',
            borderRadius: '8px', textDecoration: 'none', color: '#374151', fontSize: '14px' }}>
          💚 Health Check
        </a>
        <button onClick={onReset}
          style={{ padding: '8px 16px', background: '#fff', border: '1px solid #e5e7eb',
            borderRadius: '8px', cursor: 'pointer', color: '#374151', fontSize: '14px' }}>
          + Deploy another model
        </button>
      </div>

      {/* Live Test Console */}
      <TestConsole endpoint={endpoint} modelData={modelData} />
    </div>
  )
}
```

---

### Step 4.2 — Live Test Console

**`frontend/src/components/TestConsole.jsx`**
```jsx
import { useState } from 'react'
import axios from 'axios'

export default function TestConsole({ endpoint, modelData }) {
  const inspection = modelData?.inspection || {}
  const inputSchema = modelData?.aiAnalysis?.input_schema || {}
  const featureNames = inspection.feature_names ||
    Array.from({ length: inspection.input_count || 4 }, (_, i) => `feature_${i}`)

  const defaultValues = {}
  featureNames.forEach(name => {
    defaultValues[name] = inputSchema[name]?.example ?? 1.0
  })

  const [inputs, setInputs] = useState(defaultValues)
  const [response, setResponse] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [latency, setLatency] = useState(null)

  const runPrediction = async () => {
    setLoading(true)
    setError(null)
    const start = Date.now()

    try {
      const res = await axios.post(`${endpoint}/predict`, inputs)
      setLatency(Date.now() - start)
      setResponse(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px' }}>
      <h3 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 600 }}>
        Live Test Console
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
        {featureNames.map(name => (
          <div key={name}>
            <label style={{ fontSize: '12px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>
              {name}
              {inputSchema[name]?.description && (
                <span style={{ marginLeft: '4px', color: '#9ca3af' }}>
                  — {inputSchema[name].description}
                </span>
              )}
            </label>
            <input
              type="number"
              step="0.01"
              value={inputs[name]}
              onChange={e => setInputs(prev => ({ ...prev, [name]: parseFloat(e.target.value) || 0 }))}
              style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb',
                borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}
            />
          </div>
        ))}
      </div>

      <button
        onClick={runPrediction}
        disabled={loading}
        style={{ width: '100%', padding: '12px', background: loading ? '#9ca3af' : '#6366f1',
          color: '#fff', border: 'none', borderRadius: '8px', fontSize: '15px',
          fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}
      >
        {loading ? 'Predicting...' : '▶ Run Prediction'}
      </button>

      {response && (
        <div style={{ marginTop: '16px', background: '#f9fafb', borderRadius: '8px', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', color: '#6b7280' }}>Response</span>
            {latency && <span style={{ fontSize: '12px', color: '#10b981' }}>{latency}ms</span>}
          </div>
          <pre style={{ margin: 0, fontSize: '14px', color: '#111827', whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(response, null, 2)}
          </pre>
        </div>
      )}

      {error && (
        <div style={{ marginTop: '16px', background: '#fef2f2', borderRadius: '8px',
          padding: '12px', color: '#ef4444', fontSize: '14px' }}>
          {error}
        </div>
      )}
    </div>
  )
}
```

---

---

# PHASE 5 — Model Dashboard (Hours 13–15)
## Goal: Looks like a real product, not a one-trick demo

---

### Step 5.1 — Model Dashboard Component

**`frontend/src/components/ModelDashboard.jsx`**
```jsx
import { useState } from 'react'

export default function ModelDashboard({ models }) {
  const [selectedModel, setSelectedModel] = useState(null)

  if (models.length === 0) return null

  return (
    <div style={{ marginTop: '48px', paddingTop: '32px', borderTop: '1px solid #e5e7eb' }}>
      <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>
        Deployed Models ({models.length})
      </h3>

      <div style={{ display: 'grid', gap: '12px' }}>
        {models.map((model, i) => (
          <div key={i} style={{
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px',
            padding: '16px 20px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%',
                background: '#10b981', flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 500, fontSize: '15px' }}>
                  {model.inspection?.model_type || 'ML Model'} — {model.filename}
                </div>
                <div style={{ fontSize: '13px', color: '#6b7280' }}>
                  {model.inspection?.task_type} •
                  {model.inspection?.input_count} features •
                  Deployed {new Date(model.deployedAt).toLocaleTimeString()}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <span style={{ padding: '4px 10px', background: '#dcfce7', color: '#166534',
                borderRadius: '20px', fontSize: '12px', fontWeight: 500 }}>
                Live
              </span>
              <a href={`${model.endpoint}/docs`} target="_blank" rel="noopener noreferrer"
                style={{ padding: '6px 12px', background: '#f9fafb', border: '1px solid #e5e7eb',
                  borderRadius: '6px', textDecoration: 'none', color: '#374151', fontSize: '13px' }}>
                Docs ↗
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

---

# PHASE 6 — Final Polish + Demo Prep (Hours 15–16)

---

### Step 6.1 — Create 3 Demo Model Files

Run this Python script to generate your pre-built demo models:

```python
# create_demo_models.py — run this BEFORE the hackathon
import pickle
import joblib
import numpy as np
from sklearn.datasets import load_iris, load_diabetes
from sklearn.ensemble import RandomForestClassifier, GradientBoostingRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
import os

os.makedirs("sample_models", exist_ok=True)

# 1. Iris Flower Classifier
iris = load_iris()
model1 = RandomForestClassifier(n_estimators=100, random_state=42)
model1.fit(iris.data, iris.target)
model1.classes_ = np.array(["Setosa", "Versicolor", "Virginica"])
model1.feature_names_in_ = np.array(["sepal_length", "sepal_width", "petal_length", "petal_width"])
joblib.dump(model1, "sample_models/iris_classifier.pkl")
print("Created iris_classifier.pkl")

# 2. House Price Predictor (fake but realistic)
np.random.seed(42)
X = np.column_stack([
    np.random.randint(1, 6, 500),       # bedrooms
    np.random.randint(500, 4000, 500),   # sqft
    np.random.randint(1, 4, 500),        # bathrooms
    np.random.randint(1960, 2023, 500),  # year_built
    np.random.randint(0, 50, 500),       # distance_to_city_km
])
y = (X[:,0] * 50000 + X[:,1] * 200 + X[:,2] * 30000
     + (X[:,3] - 1960) * 1000 - X[:,4] * 3000 + np.random.normal(0, 20000, 500))

model2 = GradientBoostingRegressor(n_estimators=100, random_state=42)
model2.fit(X, y)
model2.feature_names_in_ = np.array([
    "bedrooms", "sqft", "bathrooms", "year_built", "distance_to_city_km"
])
joblib.dump(model2, "sample_models/house_price_predictor.pkl")
print("Created house_price_predictor.pkl")

# 3. Customer Churn Classifier
np.random.seed(99)
X3 = np.column_stack([
    np.random.randint(1, 60, 600),          # months_subscribed
    np.random.uniform(10, 200, 600),        # monthly_charge
    np.random.randint(0, 20, 600),          # support_calls
    np.random.randint(0, 2, 600),           # has_contract
    np.random.uniform(50, 100, 600),        # satisfaction_score
])
y3 = ((X3[:,2] > 5) | (X3[:,1] > 150) | (X3[:,4] < 60)).astype(int)

from sklearn.linear_model import LogisticRegression
model3 = LogisticRegression(random_state=42, max_iter=1000)
model3.fit(X3, y3)
model3.feature_names_in_ = np.array([
    "months_subscribed", "monthly_charge", "support_calls",
    "has_contract", "satisfaction_score"
])
joblib.dump(model3, "sample_models/churn_predictor.pkl")
print("Created churn_predictor.pkl")

print("\nAll demo models created in sample_models/")
```

```bash
cd backend
python create_demo_models.py
```

---

### Step 6.2 — Demo Script (Memorize This)

```
"I'm going to show you something real.

This is a machine learning model — a churn predictor — sitting as a .pkl file 
on my laptop. It has no API, no docs, no cloud hosting. A data scientist built 
it and it's been sitting idle for 3 months because nobody knows how to deploy it.

Watch what happens when I drag it into our platform."

[drag and drop the file]

"The system immediately inspects it — figures out it's a Logistic Regression 
classifier, that it expects 5 specific inputs, that it predicts customer churn.

It uses AI to write the API documentation, figure out example values for each 
input, generate a model card.

Now it's building the Docker container, pushing it to the cloud registry, 
deploying to Cloud Run..."

[deployment progress ticks through each step]

"Done. 87 seconds. We now have a live HTTPS API endpoint.

Let me test it right here in the platform — months subscribed: 2, monthly 
charge: $180, support calls: 12..."

[hit Run Prediction]

"Churn: 1. High risk. That's a live prediction from a production cloud API 
that didn't exist 90 seconds ago.

Any data scientist in the world can now do this themselves. No DevOps, no 
Docker knowledge, no cloud configuration. Just a file."
```

---

### Step 6.3 — Final Checklist Before Demo

```
□ All 3 sample .pkl files tested and confirmed working
□ GCP project has Cloud Run and Container Registry APIs enabled
□ Docker Desktop is running
□ ANTHROPIC_API_KEY set in environment
□ GCP_PROJECT_ID set in environment
□ Backend starts with: uvicorn main:app --reload --port 8000
□ Frontend starts with: npm run dev
□ Test full flow once with iris_classifier.pkl
□ Test full flow once with churn_predictor.pkl (use this for demo)
□ Screenshot of successful deployment saved as backup
□ Know the exact numbers to type in TestConsole for a good prediction result
□ Demo runs end-to-end in under 2 minutes
```

---

## What Judges Will See — Summary

| Feature | What They See |
|---|---|
| Upload | Drag-and-drop, instant model analysis |
| AI layer | Auto-generated docs, smart input descriptions |
| Deploy progress | Live step-by-step timeline |
| Endpoint | Working HTTPS URL in under 2 minutes |
| Test console | Live predictions inside your own UI |
| Dashboard | All deployed models with status |
| Model card | Professional one-page AI-written summary |

---

## Extras If You Finish Early

- **Auto-generated curl command** — one-click copy of exact curl to hit the API
- **Version bumping** — upload v2, old endpoint stays live, switch with one click
- **Stop/Start endpoint** — toggle Cloud Run service from dashboard
- **Usage graph** — fake a chart with random API call counts — looks real
- **Shareable public page** — static HTML page at `/share/{model_id}` with docs + test form

---

*Built for Avinya TechKnows Cloud Hackathon — DC-1 Category*
