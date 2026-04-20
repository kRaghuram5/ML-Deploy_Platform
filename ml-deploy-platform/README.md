# ML Deploy Platform

One-click ML model deployment demo for hackathons.

## What it does

Upload a sklearn .pkl or .joblib file and the platform:
1. Inspects model inputs and task type
2. Generates a FastAPI inference wrapper and Dockerfile
3. Builds and pushes image
4. Deploys to Google Cloud Run
5. Returns live HTTPS endpoint with in-app test console

## Project structure

- backend: FastAPI app, model introspection, wrapper generation, deployment pipeline
- frontend: React app for upload, deployment progress, endpoint testing, dashboard
- sample_models: pre-baked models for stable demos

## Phase-by-phase execution

### Phase 1 (Hours 0-3)
1. Setup Python environment and install backend dependencies
2. Start backend and verify /docs works
3. Setup frontend dependencies and verify upload UI opens
4. Test model upload and inspection output

### Phase 2 (Hours 3-7)
1. Ensure Docker Desktop and gcloud are authenticated
2. Run deployment from UI and verify endpoint creation
3. Validate prediction endpoint returns output

### Phase 3 (Hours 7-11)
1. Set GEMINI_API_KEY
2. Upload model and verify AI docs, input schema, model card generation

### Phase 4 (Hours 11-13)
1. Use endpoint card links for docs and health
2. Run predictions in test console with low and high values

### Phase 5 (Hours 13-15)
1. Deploy multiple models and validate dashboard history

### Phase 6 (Hours 15-16)
1. Generate and verify 3 demo models
2. Rehearse end-to-end flow for <2 minute demo

## Local setup

## 1) Backend

cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env

Load your env vars in shell:
export GEMINI_API_KEY=...
export GCP_PROJECT_ID=cloud2026-492918
export GCP_REGION=us-central1

Run backend:
uvicorn main:app --reload --port 8000

## 2) Frontend

cd frontend
npm install
npm run dev

Open http://localhost:5173

## 3) Create demo models

cd backend
source venv/bin/activate
python create_demo_models.py

## Demo-safe constraints

- Supported model family: scikit-learn only
- Supported file types: .pkl and .joblib
- Use only verified models from sample_models during judging demo

## Troubleshooting quick checks

1. If deploy fails immediately, verify GCP_PROJECT_ID is set
2. If Docker build fails, ensure Docker Desktop is running
3. If AI analysis fails, verify GEMINI_API_KEY is set
4. If upload fails, verify file extension is .pkl or .joblib
