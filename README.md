# Generic RAG Starter

One-line pitch: A minimal, reproducible Retrieval-Augmented Generation (RAG) starter—Chroma-backed retrieval, semantic reranking, and a lightweight FastAPI + React UI for experimenting with retrieval and chat workflows.

---

## Architecture (Data → Retrieval → Generation)

```mermaid
flowchart LR
	A[Data Ingestion] -->|CSV / MySQL / S3| B[Vector Index (Chroma)]
	B --> C[Retrieval & Reranking]
	C --> D[Generation (LM) / Chat]
	D --> E[Frontend (React) / API (FastAPI)]
```

This repo contains a `backend/` service (FastAPI), a `frontend/` React app (Vite), and local index/artifacts under `backend/chroma_joined_index` 

---

## Quick start (local / development)

Prerequisites

- Git
- Python 3.10+
- Node.js 18+
- (optional) Docker & Docker Compose

Clone and open the project

```powershell
git clone https://github.com/AshalIbrahim/generic-rag.git
cd generic-rag
```

Windows PowerShell — activate venv (example used in this workspace):

```powershell
(Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned) ; (& f:\generic-rag\.venv\Scripts\Activate.ps1)
```

Install Python deps

```powershell
pip install -r requirements.txt
```

Install frontend deps

```bash
cd frontend
npm install
```

Run frontend (Vite)

```bash
cd frontend
npm run dev
```

Run backend (FastAPI)

```bash
# from repo root
cd backend
uvicorn app:app --reload
# or run the lightweight test server: python testingRag.py (starts on port 8005)
```

Notes:
- The repo includes `backend/testingRag.py`, a small FastAPI wrapper you can run for quick RAG testing on port 8005. It exposes `POST /rag/test` which returns raw retrieval results.
- If you prefer Docker, use `docker-compose up --build` (if you have a compose file configured).

---

## Local testing with Postman / curl

Example `curl` to test the lightweight RAG test endpoint (testingRag or the main backend if you added `/rag/test`):

```bash
curl -X POST http://localhost:8005/rag/test \
  -H "Content-Type: application/json" \
  -d '{"query":"3 bedroom house in Cantt Karachi","n_results":20,"top_k":5}'
```

Expected response: JSON with keys `query` and `results` where `results` contains `documents`, `metadatas`, `scores`, and `ids`.

---

## API documentation (FastAPI)

- GET `/` — basic health check
- POST `/rag/test` — return raw retrieval output for a query (used for debugging and RAG experiments)
- POST `/rag` — (if present) returns processed/re-ranked retrieval results used by chat flows
- POST `/chat` — chat endpoint that runs query rewrite, retrieval, and generation (varies across branches/versions)

If you run the backend with `uvicorn app:app --reload` the FastAPI docs are available at `http://localhost:8000/docs` (default port when running the main backend server).

---

## Project notes

- This repository is intentionally generic — adapt data sources (MySQL / CSV / S3) and LLM providers (Hugging Face, Google Gemini, Groq) by setting environment variables and swapping small helper functions.
- The retrieval pipeline in `backend/testingRag.py` (and `backend/app.py`) performs semantic retrieval (SentenceTransformers) + reranking (semantic + keyword + metadata boosts) and diversity filtering.

---

## Troubleshooting

- "Search index not loaded" (503): ensure the Chroma index folder exists (`backend/chroma_joined_index`) or that `testingRag.py`/`app.py` successfully downloaded and extracted the index from S3. Watch the backend logs for `Index ready.`
- Import errors (e.g., `groq` import): install missing package in the same Python environment, or guard the import if you don't use that provider.
- Port conflicts: backend examples use ports `8000` (main backend) and `8005` (testingRag). Make sure nothing else is binding those ports.

---

## Next actions you might want me to do

- Add a simple `/health` endpoint to `testingRag.py` to report index status (loaded vs not loaded).
- Add `Makefile` targets for `dev`, `test`, `lint`, and `docker`.
- Add minimal `requirements.txt` entries for optional LLM providers (Groq, Google GenAI helper).

Tell me which you'd like next and I'll apply the changes.
