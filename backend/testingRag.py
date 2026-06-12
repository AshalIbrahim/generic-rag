import sys
import os
from sentence_transformers import SentenceTransformer
import chromadb
from typing import List
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import mysql.connector
import pandas as pd
import json
import boto3
from dotenv import load_dotenv
from pydantic import BaseModel
import zipfile
import numpy as np
import re
from datetime import datetime
from huggingface_hub import InferenceClient
from pathlib import Path


load_dotenv()
from google import genai
googlemodel = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
collections = None
chroma_client = None
indexloaded = False
print("API key:", os.getenv("GROQ_API_KEY"))

AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_DEFAULT_REGION = os.getenv("AWS_DEFAULT_REGION", "eu-north-1")
S3_BUCKET = os.getenv("S3_BUCKET", "zameen-project")
S3_MODELS_PREFIX = os.getenv("S3_MODELS_PREFIX", "zameen_models")
S3_KEY = "chroma_joined_index.zip"
APP_DIR = Path(__file__).resolve().parent
LOCAL_ZIP = str(APP_DIR / "chroma_joined_index_cloud.zip")
LOCAL_INDEX_PATH = str(APP_DIR / "chroma_joined_index")

def downloadindex():
    global chroma_client, collections
    legacy_cloud_path = APP_DIR / "chroma_joined_index_cloud"
    standard_path = APP_DIR / "chroma_joined_index"
    chosen_path = standard_path if standard_path.exists() else legacy_cloud_path
    if chosen_path.exists():
        print("Local Chroma index already exists. Skipping download.")
        chroma_client = chromadb.PersistentClient(path=str(chosen_path))
        collections = chroma_client.get_collection("zameen_joined_index")
        return
    print("Downloading Chroma index from S3...")
    s3 = boto3.client("s3")
    s3.download_file(S3_BUCKET, S3_KEY, LOCAL_ZIP)
    print("Extracting zip...")
    with zipfile.ZipFile(LOCAL_ZIP, "r") as z:
        for member in z.infolist():
            member_name = member.filename.replace("/", os.sep).replace("\\", os.sep)
            if (
                not member_name
                or member_name.startswith(("..", "/", "\\"))
                or any(ch in member_name for ch in ['<', '>', ':', '"', '|', '?', '*'])
            ):
                continue
            target = APP_DIR / member_name
            target.parent.mkdir(parents=True, exist_ok=True)
            if member.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            with z.open(member, "r") as src, open(target, "wb") as dst:
                dst.write(src.read())
    chosen_path = standard_path if standard_path.exists() else legacy_cloud_path
    print("Index ready.")
    chroma_client = chromadb.PersistentClient(path=str(chosen_path))
    collections = chroma_client.get_collection("zameen_joined_index")


downloadindex()
embmodel = SentenceTransformer("all-MiniLM-L6-v2")

def cosine_similarity(a, b):
    """Compute cosine similarity between two vectors with zero-division protection."""
    a = np.array(a)
    b = np.array(b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return np.dot(a, b) / (norm_a * norm_b)


def to_python_number(value):
    """Convert numpy scalar types to native Python numbers for JSON serialization."""
    if isinstance(value, np.generic):
        return value.item()
    return value


def retrieve(query: str, n_results: int = 20, top_k: int = 7):
    """
    Enhanced RAG retrieval with advanced reranking:
    - Hybrid scoring: semantic similarity + keyword matching
    - Metadata-aware boosting
    - Diversity filtering to avoid redundant results
    """
    try:
        # Encode query
        query_emb = embmodel.encode([query])[0]
        query_lower = query.lower()
        query_words = set(query_lower.split())

        # Retrieve initial results from Chroma (get more for better reranking)
        results = collections.query(
            query_embeddings=[query_emb.tolist()],
            n_results=n_results
        )

        docs = results["documents"][0]
        metas = results["metadatas"][0]
        ids = results.get("ids", [None] * len(docs))[0] if results.get("ids") else [None] * len(docs)

        if not docs:
            return {"documents": [], "metadatas": [], "scores": [], "ids": []}

        # Enhanced reranking with multiple signals
        doc_embeddings = embmodel.encode(docs)
        semantic_scores = [cosine_similarity(query_emb, d_emb) for d_emb in doc_embeddings]
        
        # Keyword matching boost (simple TF-based)
        keyword_boosts = []
        for doc in docs:
            doc_lower = doc.lower()
            doc_words = set(doc_lower.split())
            # Count matching keywords
            matches = len(query_words.intersection(doc_words))
            # Normalize by query length
            keyword_score = matches / max(len(query_words), 1) if query_words else 0
            keyword_boosts.append(keyword_score * 0.2)  # 20% boost max
        
        # Metadata boost (if location/property type matches query)
        metadata_boosts = []
        for meta in metas:
            meta_boost = 0.0
            if meta:
                meta_str = " ".join(str(v).lower() for v in meta.values() if v)
                meta_words = set(meta_str.split())
                meta_matches = len(query_words.intersection(meta_words))
                meta_boost = (meta_matches / max(len(query_words), 1)) * 0.15 if query_words else 0
            metadata_boosts.append(meta_boost)
        
        # Combined scoring: semantic (70%) + keyword (20%) + metadata (10%)
        combined_scores = [
            (sem * 0.7) + (kw * 0.2) + (meta * 0.1)
            for sem, kw, meta in zip(semantic_scores, keyword_boosts, metadata_boosts)
        ]

        # Sort by combined score
        ranked = sorted(zip(docs, metas, ids, combined_scores, semantic_scores), 
                       key=lambda x: x[3], reverse=True)
        
        # Diversity filtering: avoid very similar documents
        final_docs = []
        final_metas = []
        final_scores = []
        final_ids = []
        seen_content = set()
        
        for doc, meta, doc_id, comb_score, sem_score in ranked:
            # Simple deduplication: skip if very similar content already selected
            doc_snippet = doc[:100].lower().strip()
            if doc_snippet not in seen_content:
                final_docs.append(doc)
                final_metas.append(meta)
                final_scores.append(comb_score)
                final_ids.append(doc_id)
                seen_content.add(doc_snippet)
                
                if len(final_docs) >= top_k:
                    break

        return {
            "documents": final_docs,
            "metadatas": final_metas,
            "scores": [float(to_python_number(s)) for s in final_scores],
            "ids": final_ids,
        }
    except Exception as e:
        print(f"❌ Retrieval Error: {e}")
        import traceback
        traceback.print_exc()

        return {"documents": [], "metadatas": [], "scores": [], "ids": []}


# --- Simple FastAPI wrapper for testing RAG locally ---
app = FastAPI(title="Testing RAG API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RAGTestRequest(BaseModel):
    query: str
    n_results: int | None = 20
    top_k: int | None = 7


@app.post("/rag/test")
def rag_test(body: RAGTestRequest):
    """Return raw retrieval output for inspection."""
    if collections is None:
        raise HTTPException(status_code=503, detail="Search index not loaded")
    try:
        results = retrieve(body.query, n_results=body.n_results or 20, top_k=body.top_k or 7)
        return {"query": body.query, "results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    # Start server on port 8005 for local testing
    uvicorn.run("testingRag:app", host="0.0.0.0", port=8005, reload=False)



