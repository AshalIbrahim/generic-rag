import sys
import os
from sentence_transformers import SentenceTransformer
import chromadb
from typing import List
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import io
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
from groq import Groq
googlemodel = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
collections = None
chroma_client = None
indexloaded = False
print("API key:", os.getenv("GROQ_API_KEY"))
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

def groq_generate(prompt: str) -> str:
    #models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]
    models = ["openai/gpt-oss-120b","openai/gpt-oss-120b"]
    for model in models:
        try:
            response = groq_client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=1024,
                temperature=0.4,
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            print(f"⚠️ {model} failed: {e}, trying next...")
    raise Exception("All Groq models failed.")
# ---- Load environment variables ----
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_DEFAULT_REGION = os.getenv("AWS_DEFAULT_REGION", "eu-north-1")
S3_BUCKET = os.getenv("S3_BUCKET", "zameen-project")
S3_MODELS_PREFIX = os.getenv("S3_MODELS_PREFIX", "zameen_models")
S3_KEY = "chroma_joined_index.zip"
APP_DIR = Path(__file__).resolve().parent
LOCAL_ZIP = str(APP_DIR / "chroma_joined_index_cloud.zip")
LOCAL_INDEX_PATH = str(APP_DIR / "chroma_joined_index")
# ---- Setup ----
app = FastAPI(title="Zameen MLOps API")

# Allow CORS
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["*"],
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://robin-overtake-discover.ngrok-free.dev"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- HF Chat Config ----
# Supports both HF_API_TOKEN/HF_CHAT_MODEL and HF_TOKEN/HF_MODEL env names.
HF_API_TOKEN = os.getenv("HF_API_TOKEN") or os.getenv("HF_TOKEN", "")
HF_CHAT_MODEL = os.getenv("HF_CHAT_MODEL") or os.getenv("HF_MODEL", "mistralai/Mistral-7B-Instruct-v0.3")
HF_TIMEOUT_SECONDS = int(os.getenv("HF_TIMEOUT_SECONDS", "45"))
HF_MAX_NEW_TOKENS = int(os.getenv("HF_MAX_NEW_TOKENS", "420"))



# Initialize S3 client (will use env creds)
s3 = boto3.client(
    "s3",
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    region_name=AWS_DEFAULT_REGION,
)



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

# ---- DB Connection ----
def get_connection():
    return mysql.connector.connect(
        host=os.getenv("HOST"),
        port=int(os.getenv("PORT", 3306)),
        user=os.getenv("USER"),
        password=os.getenv("PASSWORD"),
        database=os.getenv("DB_NAME"),
    )


# ---- Load model ----
# ---- Load model (without MLflow) ----
def load_model(model_name="ZameenPriceModelSale"):
    model = None
    sale_feature_columns = None
    valid_metadata = None
    try:
        os.makedirs("model_cache", exist_ok=True)

        # Download entire model folder
        paginator = s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(
            Bucket=S3_BUCKET, Prefix=f"{S3_MODELS_PREFIX}/{model_name}"
        ):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                rel_path = os.path.relpath(key, f"{S3_MODELS_PREFIX}/{model_name}")
                local_path = os.path.join("model_cache", model_name, rel_path)
                os.makedirs(os.path.dirname(local_path), exist_ok=True)
                s3.download_file(S3_BUCKET, key, local_path)

        # Download metadata
        s3.download_file(
            S3_BUCKET,
            f"{S3_MODELS_PREFIX}/feature_columns.json",
            "model_cache/feature_columns.json",
        )
        s3.download_file(
            S3_BUCKET,
            f"{S3_MODELS_PREFIX}/valid_metadata.json",
            "model_cache/valid_metadata.json",
        )

        # Try to load with joblib or pickle
        import joblib
        model_path = os.path.join("model_cache", model_name, "model.pkl")
        if not os.path.exists(model_path):
            # Try sklearn default naming
            model_path = os.path.join("model_cache", model_name, "model.joblib")
        if not os.path.exists(model_path):
            # Try model.pkl in model_cache root
            model_path = os.path.join("model_cache", "model.pkl")
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model file not found in expected locations.")
        model = joblib.load(model_path)

        with open("model_cache/feature_columns.json", "r") as f:
            feat = json.load(f)
        with open("model_cache/valid_metadata.json", "r") as f:
            valid_metadata = json.load(f)

        sale_feature_columns = feat.get("sale", [])
        print("✅ Model and artifacts loaded from S3 successfully!")

    except Exception as e:
        print(f"❌ Model load failed: {e}")

    return model, sale_feature_columns, valid_metadata

# model, sale_feature_columns, valid_metadata = load_model()

# ---- Load location/property types ----
locations = []
propertyTypes = []


def load_location_and_property_types():
    global locations, propertyTypes
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT DISTINCT prop_type, location FROM property_data")
        rows = cursor.fetchall()
        cursor.close()
        conn.close()

        locations = sorted({r["location"] for r in rows if r.get("location")})
        propertyTypes = sorted({r["prop_type"] for r in rows if r.get("prop_type")})

        return {"locations": locations, "prop_type": propertyTypes}
    except Exception as e:
        print(f" Failed to load locations/property types from DB: {e}")
        return {"locations": [], "prop_type": []}


load_location_and_property_types()


# ---- Routes ----
class LoginRequest(BaseModel):
    email: str
    password: str


@app.post("/auth/login")
def login(body: LoginRequest):
    print("inside login route backend with")
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("SELECT * FROM users WHERE email = %s", (body.email,))
    user = cursor.fetchone()

    if not user or body.password != user["upassword"]:
        cursor.close()
        conn.close()
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    cursor.execute(
        "UPDATE users SET in_session = TRUE, last_login = %s WHERE id = %s",
        (datetime.utcnow(), user["id"])
    )
    conn.commit()
    cursor.close()
    conn.close()

    return {
        "id": user["id"],
        "email": user["email"],
    }


@app.post("/auth/logout")
def logout(user_id: int):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("UPDATE users SET in_session = FALSE WHERE id = %s", (user_id,))
    conn.commit()
    cursor.close()
    conn.close()

    return {"message": "Logged out successfully."}


def get_current_user(user_id: int):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("SELECT * FROM users WHERE id = %s AND in_session = TRUE", (user_id,))
    user = cursor.fetchone()
    cursor.close()
    conn.close()

    if not user:
        raise HTTPException(status_code=401, detail="Not logged in.")

    return user


@app.get("/")
def home():
    return {"message": "Zameen API is running"}


@app.get("/listings")
def get_listings(
    limit: int = 20,
    location: str | None = None,
    prop_type: str | None = None,
    purpose: str | None = None,  # "sale" or "rent"
    min_price: float | None = None,
    max_price: float | None = None,
):
    """
    Return property listings with optional filtering applied in the database.
    Supported filters (all optional):
    - location: exact match on location column
    - prop_type: exact match on prop_type column
    - purpose: "sale" / "rent"
    - min_price / max_price: numeric price range
    """
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    query = """
        SELECT id, prop_type, purpose, covered_area, price, location, beds, baths, amenities
        FROM property_data
        WHERE 1=1
    """
    params: list = []

    if location:
        query += " AND location = %s"
        params.append(location)

    if prop_type:
        query += " AND prop_type = %s"
        params.append(prop_type)

    if purpose:
        query += " AND purpose = %s"
        params.append(purpose)

    if min_price is not None:
        query += " AND price >= %s"
        params.append(min_price)

    if max_price is not None:
        query += " AND price <= %s"
        params.append(max_price)

    query += " LIMIT %s"
    params.append(limit)

    cursor.execute(query, tuple(params))
    data = cursor.fetchall()
    cursor.close()
    conn.close()
    return data


@app.get("/listings/{listing_id}")
def get_listing_by_id(listing_id: int):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    query = """
        SELECT
            p.id,
            p.prop_type,
            p.purpose,
            p.covered_area,
            p.price,
            p.location,
            p.beds,
            p.baths,
            p.amenities,
            s.water_sentiment,
            s.electricity_sentiment,
            s.gas_sentiment,
            s.traffic_sentiment,
            s.safety_sentiment
        FROM property_data p
        LEFT JOIN location_sentiments s
            ON LOWER(REPLACE(REPLACE(TRIM(s.location), ', ', ','), ' ,', ',')) =
               LOWER(REPLACE(REPLACE(TRIM(p.location), ', ', ','), ' ,', ','))
        WHERE p.id = %s
        LIMIT 1
    """
    cursor.execute(query, (listing_id,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Property not found")

    # Fallback sentiment lookup in case join misses due subtle formatting/cleanup differences.
    sentiment_cols = [
        "water_sentiment",
        "electricity_sentiment",
        "gas_sentiment",
        "traffic_sentiment",
        "safety_sentiment",
    ]
    if row.get("location") and any(not row.get(c) for c in sentiment_cols):
        lookup = """
            SELECT
                water_sentiment,
                electricity_sentiment,
                gas_sentiment,
                traffic_sentiment,
                safety_sentiment
            FROM location_sentiments
            WHERE LOWER(REPLACE(REPLACE(TRIM(location), ', ', ','), ' ,', ',')) =
                  LOWER(REPLACE(REPLACE(TRIM(%s), ', ', ','), ' ,', ','))
            LIMIT 1
        """
        conn2 = get_connection()
        cursor2 = conn2.cursor(dictionary=True)
        try:
            cursor2.execute(lookup, (row["location"],))
            srow = cursor2.fetchone() or {}
            for c in sentiment_cols:
                if not row.get(c):
                    row[c] = srow.get(c)
        finally:
            cursor2.close()
            conn2.close()

    # Consistent defaults for detail page fields across the app.
    row["prop_type"] = row.get("prop_type") or "N/A"
    row["purpose"] = row.get("purpose") or "N/A"
    row["location"] = row.get("location") or "N/A"
    row["amenities"] = row.get("amenities") or "N/A"
    return row


@app.get("/locations")
def get_locations(purpose: str = "sale"):
    data = load_location_and_property_types()
    return {"locations": data["locations"]}


@app.get("/prop_type")
def get_prop_type(purpose: str = "sale"):
    data = load_location_and_property_types()
    return {"prop_type": data["prop_type"]}


# Prediction endpoint removed: feature deprecated and cleaned up


@app.get("/health")
def health_check():
    return {"status": "ok"}

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


class ChatMessage(BaseModel):
    role: str   # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    model: str | None = None


def extract_property_data(doc: str) -> dict:
    """Extract structured property data from document text for mathematical operations and sentiment analysis."""
    data = {}
    try:
        # Try to extract price
        price_match = re.search(r'price[:\s]+([\d,]+)', doc, re.IGNORECASE)
        if price_match:
            data['price'] = float(price_match.group(1).replace(',', ''))
        
        # Extract area
        area_match = re.search(r'(?:area|covered_area|size)[:\s]+([\d.]+)', doc, re.IGNORECASE)
        if area_match:
            data['area'] = float(area_match.group(1))
        
        # Extract beds/baths
        beds_match = re.search(r'bed[s]?[:\s]+(\d+)', doc, re.IGNORECASE)
        if beds_match:
            data['beds'] = int(beds_match.group(1))
        
        baths_match = re.search(r'bath[s]?[:\s]+(\d+)', doc, re.IGNORECASE)
        if baths_match:
            data['baths'] = int(baths_match.group(1))
        
        # Extract location
        location_match = re.search(r'location[:\s]+([A-Za-z\s,]+)', doc, re.IGNORECASE)
        if location_match:
            data['location'] = location_match.group(1).strip()
        
        # Extract property type
        prop_type_match = re.search(r'(?:type|prop_type)[:\s]+([A-Za-z\s]+)', doc, re.IGNORECASE)
        if prop_type_match:
            data['prop_type'] = prop_type_match.group(1).strip()
        
        # Extract sentiment information if present
        sentiment_keywords = ['water_sentiment', 'electricity_sentiment', 'gas_sentiment', 'traffic_sentiment', 'safety_sentiment']
        for keyword in sentiment_keywords:
            pattern = rf'{keyword}[:\s]+(good|fair|poor)', re.IGNORECASE
            match = re.search(pattern, doc)
            if match:
                data[keyword] = match.group(1).capitalize()
    except:
        pass
    return data


def build_property_cards(bundles: List[dict]) -> List[dict]:
    """
    Prepare structured card data for retrieved properties.
    Returns all meaningful retrieved properties (not hard-capped at 3).
    """
    cards: List[dict] = []
    conn = None
    cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
    except Exception:
        conn = None
        cursor = None
    for idx, bundle in enumerate(bundles):
        data = bundle.get("data") or {}
        doc = bundle.get("doc", "")
        meta = bundle.get("meta") or {}

        price = data.get("price")
        area = data.get("area")
        beds = data.get("beds")
        baths = data.get("baths")
        location = data.get("location") or meta.get("location")
        prop_type = data.get("prop_type") or meta.get("prop_type")
        purpose = meta.get("purpose")

        # Skip only when we truly have no usable identifying info.
        if (
            price is None
            and area is None
            and beds is None
            and baths is None
            and not location
            and not prop_type
        ):
            continue

        price_per_area = (price / area) if price and area and area != 0 else None

        # Prefer exact retrieved ID when available.
        raw_bundle_id = bundle.get("doc_id") or meta.get("id")
        resolved_id = None
        if raw_bundle_id is not None and str(raw_bundle_id).strip():
            raw_text = str(raw_bundle_id).strip()
            # Chroma IDs may include prefixes; extract trailing integer when possible.
            m = re.search(r"(\d+)$", raw_text)
            if m:
                resolved_id = int(m.group(1))
            elif raw_text.isdigit():
                resolved_id = int(raw_text)
        # Fallback: extract property id directly from retrieved document content.
        if resolved_id is None and doc:
            m_doc = re.search(r"property\s*id\s*[:#]?\s*(\d+)", doc, flags=re.IGNORECASE)
            if m_doc:
                resolved_id = int(m_doc.group(1))
        amenities = None
        if cursor and resolved_id is not None:
            try:
                cursor.execute(
                    "SELECT id, amenities FROM property_data WHERE id = %s LIMIT 1",
                    (resolved_id,),
                )
                matched = cursor.fetchone()
                if matched:
                    resolved_id = matched.get("id")
                    amenities = matched.get("amenities")
                else:
                    # If retrieved ID doesn't exist in property_data, drop linkability.
                    resolved_id = None
            except Exception:
                resolved_id = None

        # Hard rule: only keep properties grounded to an actual retrieved property id.
        if resolved_id is None:
            continue

        cards.append(
            {
                "id": resolved_id,
                "detail_url": f"/property/{resolved_id}" if resolved_id else None,
                "label": prop_type or f"Property {idx+1}",
                "location": location,
                "purpose": purpose,
                "price": to_python_number(price),
                "area": to_python_number(area),
                "beds": beds,
                "baths": baths,
                "amenities": amenities,
                "price_per_area": to_python_number(price_per_area),
                "score": to_python_number(bundle.get("score")),
                "snippet": doc[:280],
            }
        )

    if cursor:
        cursor.close()
    if conn:
        conn.close()
    # Deduplicate by resolved property id (fallback to label+location) while
    # preserving retrieval order.
    seen = set()
    deduped = []
    for c in cards:
        key = c.get("id") if c.get("id") is not None else f"{c.get('label')}|{c.get('location')}"
        if key in seen:
            continue
        seen.add(key)
        deduped.append(c)
    return deduped


def build_comparison_insights(cards: List[dict]) -> str:
    """Produce textual insights (cheapest, best value, etc.) for prompt guidance."""
    if not cards:
        return "Not enough structured data for comparison."

    insights = []
    priced = [c for c in cards if isinstance(c.get("price"), (int, float))]
    areas = [c for c in cards if isinstance(c.get("area"), (int, float))]
    value_props = [c for c in cards if isinstance(c.get("price_per_area"), (int, float))]

    if priced:
        cheapest = min(priced, key=lambda x: x["price"])
        insights.append(
            f"Cheapest option: {cheapest['label']} at PKR {cheapest['price']:,.0f}"
        )
    if priced:
        premium = max(priced, key=lambda x: x["price"])
        insights.append(
            f"Highest budget option: {premium['label']} at PKR {premium['price']:,.0f}"
        )
    if areas:
        largest = max(areas, key=lambda x: x["area"])
        insights.append(
            f"Largest covered area: {largest['label']} with {largest['area']} units"
        )
    if value_props:
        best_value = min(value_props, key=lambda x: x["price_per_area"])
        insights.append(
            f"Best price/area: {best_value['label']} at PKR {best_value['price_per_area']:,.0f} per unit"
        )

    if not insights:
        return "Structured comparison unavailable."

    return "\n".join(insights)


def pick_discussed_properties(cards: List[dict], answer_text: str, max_links: int | None = None) -> List[dict]:
    """
    Keep only properties that are likely discussed in the generated answer.
    Falls back to top-ranked few if text matching is inconclusive.
    """
    if not cards:
        return []

    text = (answer_text or "").lower()
    id_mentions = set(
        int(m.group(1))
        for m in re.finditer(r"property\s*id\s*[:#]?\s*(\d+)", text, flags=re.IGNORECASE)
    )
    if id_mentions:
        strict = [c for c in cards if c.get("id") in id_mentions]
        if strict:
            return strict if max_links is None else strict[:max_links]

    scored = []
    for c in cards:
        if not c.get("id"):
            continue
        score = 0.0
        label = str(c.get("label") or "").lower().strip()
        location = str(c.get("location") or "").lower().strip()
        purpose = str(c.get("purpose") or "").lower().strip()
        retrieval_score = float(c.get("score") or 0.0)

        # Stronger matching: require richer evidence, not single-word overlap.
        label_hit = bool(label and label in text)
        location_hit = bool(location and location in text)
        if label_hit and location_hit:
            score += 3.0
        elif location_hit:
            score += 1.5
        elif label_hit:
            score += 1.0
        if purpose and purpose in text:
            score += 0.5
        score += retrieval_score
        scored.append((score, retrieval_score, c))

    # If we matched terms from the response, prioritize those.
    matched = [item for item in scored if item[0] >= (item[1] + 1.0)]
    if matched:
        matched.sort(key=lambda x: (x[0], x[1]), reverse=True)
        selected = [x[2] for x in matched]
        return selected if max_links is None else selected[:max_links]

    # Otherwise, return all retrieval-grounded cards (no arbitrary cap).
    return cards if max_links is None else cards[:max_links]


def clean_generated_response(text: str) -> str:
    """
    Improve final formatting and remove internal retrieval labels like 'Document 1'.
    """
    if not text:
        return text
    out = text.replace("\r\n", "\n")
    # Remove lines that start with retrieval labels.
    out = re.sub(r"(?im)^\s*document\s*\d+\s*[:\-].*$", "", out)
    out = re.sub(r"(?im)\bdocument\s*\d+\b", "property", out)
    # Collapse excessive blank lines.
    out = re.sub(r"\n{3,}", "\n\n", out).strip()
    return out


def query_hf(prompt: str, model: str | None = None) -> str:
    """
    Generate chat response using huggingface_hub.InferenceClient chat completions API.
    Mirrors the style used in your provided nlpminiproj backend.
    """
    if not HF_API_TOKEN:
        raise RuntimeError("HF_API_TOKEN not set")

    selected_model = (model or HF_CHAT_MODEL).strip()
    client = InferenceClient(model=selected_model, token=HF_API_TOKEN, timeout=HF_TIMEOUT_SECONDS)
    system_prompt = (
        "You are a helpful Pakistan real estate assistant. "
        "Use provided context, stay concise, and include concrete numbers when available."
    )
    try:
        response = client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            max_tokens=HF_MAX_NEW_TOKENS,
            temperature=0.35,
            top_p=0.9,
        )
        return (response.choices[0].message.content or "").strip()
    except Exception as e:
        print(f"[HF Chat Error] {e}")
        return ""

# After RAG retrieval, filter by purpose and type from metadata
def filter_by_intent(docs, metas, ids, scores, query_lower):
    purpose_filter = None
    if "for sale" in query_lower or "sale" in query_lower:
        purpose_filter = "sale"
    elif "for rent" in query_lower or "rent" in query_lower:
        purpose_filter = "rent"

    type_filter = None
    if "house" in query_lower or "houses" in query_lower:
        type_filter = "house"
    elif "plot" in query_lower or "plots" in query_lower:
        type_filter = "plot"
    elif "apartment" in query_lower or "flat" in query_lower or "apartments" in query_lower or "flats" in query_lower:
        type_filter = "apartment"

    filtered = []
    for doc, meta, doc_id, score in zip(docs, metas, ids, scores):
        doc_lower = doc.lower()
        if purpose_filter and f"for {purpose_filter}" not in doc_lower:
            continue
        if type_filter and type_filter not in doc_lower:
            continue
        filtered.append((doc, meta, doc_id, score))
    
    return zip(*filtered) if filtered else ([], [], [], [])


def generate_chat_response(messages: List[ChatMessage], model: str | None = None) -> dict:
    try:
        last_user = messages[-1].content
        print(f"Received user message: {last_user}")
        user_messages = [m.content for m in messages if m.role == "user"]
        if len(user_messages) > 1 and user_messages[-1] == user_messages[-2]:
            return {
                "text": "I just answered that question. Would you like more details or a different question?",
                "properties": [],
            }
        recent_messages = messages[-6:] if len(messages) > 6 else messages
        conversation_history = "\n".join(
            f"{'User' if m.role == 'user' else 'Assistant'}: {m.content[:220]}"
            for m in recent_messages[:-1]
        )
        print(f"Conversation history for context:\n{conversation_history}")
        key_facts = []
        for msg in recent_messages:
            content_lower = msg.content.lower()
            if any(word in content_lower for word in ["location", "area", "budget", "price", "beds", "baths"]):
                key_facts.append(f"User mentioned: {msg.content[:120]}")

        key_facts_str = "\n".join(key_facts[-4:]) if key_facts else "No specific preferences mentioned yet."
        print(f"Extracted key facts:\n{key_facts_str}")
        # 4. Intent Detection + Query Rewriting
        intent_prompt = f"""You are an assistant for a Pakistan real estate platform. Classify the user's message into one of these intents and respond accordingly.

INTENTS:
- greeting: user is saying hi, hello, thanks, or making small talk with no property-related request
- pitch_request: user wants a sales pitch written for one or more properties to show to a buyer
- property_search: user is looking for properties (describing requirements, asking for listings, comparing, filtering)
- general_chat: user is asking a general question or following up that doesn't require searching listings

Conversation context:
{conversation_history}

Key facts from conversation:
{key_facts_str}

Current user message: "{last_user}"

RULES:
- If intent is "greeting" or "general_chat": return ONLY this format:
  INTENT: greeting
  QUERY: {last_user}

- If intent is "pitch_request": extract what property/properties the user wants pitched and return:
  INTENT: pitch_request
  QUERY: <search terms to find those properties via RAG, e.g. "3 bed house for sale DHA Karachi">

- If intent is "property_search": rewrite the user message into an optimized search query incorporating context, return:
  INTENT: property_search
  QUERY: <rewritten search query>

Return ONLY the two lines (INTENT and QUERY). Nothing else."""

        print(f"============== Intent prompt:\n{intent_prompt}")

        detected_intent = "property_search"
        rewritten_query = last_user
        try:
            intent_response = groq_generate(intent_prompt)
            print(f"============== Intent response: {intent_response}")
            for line in intent_response.strip().splitlines():
                line = line.strip()
                if line.upper().startswith("INTENT:"):
                    detected_intent = line.split(":", 1)[1].strip().lower()
                elif line.upper().startswith("QUERY:"):
                    rewritten_query = line.split(":", 1)[1].strip()
            print(f"============== Detected intent: {detected_intent} | Rewritten query: {rewritten_query}")
        except Exception as e:
            print(f"⚠️ Intent detection failed: {e}, defaulting to property_search")
            detected_intent = "property_search"
            rewritten_query = last_user

        # 5. Intent-driven RAG + Response
        # For greetings and general chat, skip RAG entirely and respond directly
        if detected_intent in ("greeting", "general_chat"):
            print(f"============ Skipping RAG for intent: {detected_intent}")
            chitchat_prompt = f"""You are a friendly Pakistan real estate assistant named Zameen Assistant.
The user is not asking about a property right now — just have a natural, warm conversation.

Recent conversation:
{conversation_history}

User message: "{last_user}"

Respond conversationally in 1-3 sentences. Do NOT list properties, use markdown headers, or mention retrieval.
If the user greeted you, greet them back warmly and let them know you can help find properties, write pitches, or answer real estate questions."""
            generated = groq_generate(chitchat_prompt).strip()
            print(f"============ Chitchat response:\n{generated}")
            recent_assistant = [m.content for m in reversed(messages) if m.role == "assistant"]
            if recent_assistant and recent_assistant[0].strip() == generated.strip():
                generated = "Happy to help! What are you looking for today?"
            return {"text": generated, "properties": []}

        # For property_search and pitch_request — run RAG
        rag_results = retrieve(rewritten_query, n_results=20, top_k=7)
        context_docs, context_metas, context_ids, context_scores = filter_by_intent(
            rag_results["documents"],
            rag_results.get("metadatas", []),
            rag_results.get("ids", []),
            rag_results.get("scores", []),
            rewritten_query.lower()
        )
        print(f"============ RAG retrieved {len(rag_results.get('documents', []))} documents.")
        print(f"========== RAG retrieved documents:\n{rag_results.get('documents', [])}")
        context_docs = rag_results["documents"]
        context_scores = rag_results["scores"]
        print(f"============ RAG context scores: {context_scores}")
        context_metas = rag_results.get("metadatas", []) or []
        print(f"============ RAG context metas: {context_metas}")
        context_ids = rag_results.get("ids", []) or []
        print(f"============ RAG context ids: {context_ids}")
        bundled_results = []
        formatted_context_parts = []
        sentiment_info = []
        for idx, doc in enumerate(context_docs):
            score = context_scores[idx] if idx < len(context_scores) else 0.0
            meta = context_metas[idx] if idx < len(context_metas) else {}
            doc_id = context_ids[idx] if idx < len(context_ids) else None
            prop_data = extract_property_data(doc)
            bundle = {"doc": doc, "score": score, "meta": meta or {}, "data": prop_data, "doc_id": doc_id}
            bundled_results.append(bundle)
            doc_lower = doc.lower()
            if any(word in doc_lower for word in ['sentiment', 'water', 'electricity', 'gas', 'traffic', 'safety', 'good', 'fair', 'poor']):
                location = prop_data.get("location") or meta.get("location", "")
                if location:
                    sentiment_info.append(f"Location: {location} - Sentiment data available in document")
            info_parts = [f"Retrieved property (relevance: {score:.3f})"]
            if doc_id:
                display_id = doc_id.replace("joined_", "") if doc_id else None
                if display_id:
                    info_parts.append(f"Property ID: {display_id}")
                info_parts.append(f"Property ID: {doc_id}")
            if prop_data.get("price"):
                info_parts.append(f"Price: PKR {prop_data['price']:,.0f}")
            if prop_data.get("area"):
                info_parts.append(f"Area: {prop_data['area']} sq units")
            if prop_data.get("location"):
                info_parts.append(f"Location: {prop_data['location']}")
            if prop_data.get("beds"):
                info_parts.append(f"Beds: {prop_data['beds']}")
            if prop_data.get("baths"):
                info_parts.append(f"Baths: {prop_data['baths']}")
            formatted_context_parts.append(f"{' | '.join(info_parts)}\nContent: {doc[:340]}")
        context = (
            "\n\n---\n\n".join(formatted_context_parts)
            if formatted_context_parts
            else "[No relevant property listings found.]"
        )
        structured_cards = build_property_cards(bundled_results)
        print(f"============ Structured property cards: {structured_cards}")
        comparison_summary = build_comparison_insights(structured_cards)
        print(f"============ Comparison insights: {comparison_summary}")
        avg_score = np.mean(context_scores) if context_scores else 0.0
        use_context = avg_score > 0.25
        sentiment_context = "\n".join(sentiment_info) if sentiment_info else "No specific sentiment data found in retrieved documents."

        # Build the correct main prompt based on intent
        if detected_intent == "pitch_request":
            main_prompt = f"""You are coaching an experienced, consultative real estate agent in Pakistan who is on a live call with a buyer right now. Generate quick-reference talking points the agent can glance at mid-call — not a written pitch for the buyer to read.

Retrieved property data:
{context if use_context else '[No listings found — inform the user politely.]'}

Sentiment data for locations:
{sentiment_context}

Recent conversation:
{conversation_history}

User's request: "{last_user}"

STEP 1 — Infer buyer intent first (use this to choose what to surface, don't show it as a separate section):
From the request and conversation, work out what likely matters most to this buyer — budget sensitivity, family size, location prestige, investment vs. living, commute, security, etc.

STEP 2 — Rank properties honestly:
If multiple properties are retrieved, order them strongest match first. Give the best match the most space; mention weaker matches briefly and be honest about where they fall short.

FORMAT — output exactly this structure per property:

**[Property ID] — [location], [type], PKR [price]**
- Key facts: beds, baths, area (only what's in the data — say "not available" if missing)
- Why it fits this buyer: 1-2 short selling angles tied to their inferred needs, not a generic feature list
- Say if asked about condition/location: one short phrase the agent can say out loud, using sentiment data cautiously (e.g. "residents have reported good water supply" — only if present in the data)

After all properties, add:
**Closing line to use:** one natural, short line to move the call forward (e.g. suggest a viewing or next step) — not a generic CTA.

RULES (non-negotiable):
- Never invent details. Only use what's in the retrieved property data. Missing info = say "not available," don't guess.
- Keep every bullet short enough to read at a glance mid-call — no paragraphs, no flowing prose.
- Treat sentiment data as supporting color, not fact — phrase it as reported/observed, not guaranteed.
- Do NOT mention document retrieval, scores, or internal system details.
- Do not include objection-handling scripts (e.g. price pushback responses) — facts and selling angles only."""

        else:  # property_search
            main_prompt = f"""You are a knowledgeable Pakistan real estate assistant.
Do NOT mention document numbers or retrieval internals.
When discussing a property, mention its Property ID so the user can view it.

Retrieved listings:
{context if use_context else 'Limited listing context available.'}

Sentiment data:
{sentiment_context}

Comparison insights:
{comparison_summary}

Recent conversation:
{conversation_history}

Key facts from conversation:
{key_facts_str}

User query: "{last_user}"

RESPONSE RULES:
- If the user is browsing or wants recommendations: use this structure in markdown:
    Here's what I found
  - One bullet per property: Property ID, location, type, purpose, price, beds, baths, area.
  Why These Match
  (brief explanation)
  Location Notes
  (sentiment info if available: water, electricity, gas, traffic, safety)

- If the user is comparing or asking for calculations (cheapest, best value, price per sqft):
  Show the math clearly. Sort and rank. Explain your reasoning.

- If the user asks a follow-up or conversational question about already-listed properties:
  Answer naturally without re-listing everything. Reference properties by ID.

- Always use only details present in the retrieved context. If something is missing, say "not available".
- Never fabricate property details."""

        output = groq_generate(main_prompt)
        print(f"============ Raw generated response:\n{output}")
        generated = output.strip()
        print(f"============ Final response:\n{generated}")

        # Final duplicate check
        recent_assistant = [m.content for m in reversed(messages) if m.role == "assistant"]
        if recent_assistant and recent_assistant[0].strip() == generated.strip():
            generated = "I've already covered that. Would you like me to dig deeper or help with something else?"
        filtered_cards = pick_discussed_properties(structured_cards, generated, max_links=None)
        print(f"============ Filtered property cards: {filtered_cards}")
        return {"text": generated, "properties": filtered_cards}
    except Exception as e:
        print(f"Chat Error: {e}")
        import traceback
        traceback.print_exc()
        return {
            "text": "Sorry, I encountered an error. Please try again.",
            "properties": [],
        }

@app.post("/chat")
def chat(req: ChatRequest):
    """Chat endpoint - returns a SINGLE high-quality text response per request."""
    payload = generate_chat_response(req.messages, model=req.model)
    #print("Payload response: ",payload)
    return {
        "response": payload.get("text"),
        "properties": payload.get("properties", []),  # No cards - all info in text response
    }

class AddListingRequest(BaseModel):
    prop_type: str
    purpose: str
    covered_area: float
    price: float
    location: str
    beds: int
    baths: int
    amenities: str = ''


@app.post("/listings/add")
def add_listing(body: AddListingRequest):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        INSERT INTO property_data (prop_type, purpose, covered_area, price, location, beds, baths, amenities)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            body.prop_type,
            body.purpose,
            body.covered_area,
            body.price,
            body.location,
            body.beds,
            body.baths,
            body.amenities,
        )
    )
    conn.commit()
    cursor.close()
    conn.close()

    return {"success": True, "message": "Listing added successfully."}

    # ---- Bulk property upload ----
REQUIRED_LISTING_COLUMNS = ["prop_type", "purpose", "covered_area", "price", "location", "beds", "baths"]


def validate_property_row(row: dict, row_num: int):
    """Validate and coerce a single row from an uploaded listings file.

    Returns (cleaned_dict, None) on success, or (None, error_message) on failure.
    row_num is the 1-indexed row number as it appears in the original file
    (used only for error messages, not stored).
    """
    errors = []
    cleaned = {}

    prop_type = str(row.get("prop_type", "")).strip()
    if not prop_type or prop_type.lower() == "nan":
        errors.append("missing prop_type")
    cleaned["prop_type"] = prop_type

    purpose = str(row.get("purpose", "")).strip()
    if not purpose or purpose.lower() == "nan":
        errors.append("missing purpose")
    cleaned["purpose"] = purpose

    location = str(row.get("location", "")).strip()
    if not location or location.lower() == "nan":
        errors.append("missing location")
    cleaned["location"] = location

    try:
        cleaned["covered_area"] = float(row.get("covered_area"))
        if cleaned["covered_area"] <= 0:
            errors.append("covered_area must be positive")
    except (TypeError, ValueError):
        errors.append("invalid covered_area")

    try:
        cleaned["price"] = float(row.get("price"))
        if cleaned["price"] <= 0:
            errors.append("price must be positive")
    except (TypeError, ValueError):
        errors.append("invalid price")

    try:
        cleaned["beds"] = int(row.get("beds"))
        if cleaned["beds"] < 0:
            errors.append("beds cannot be negative")
    except (TypeError, ValueError):
        errors.append("invalid beds")

    try:
        cleaned["baths"] = int(row.get("baths"))
        if cleaned["baths"] < 0:
            errors.append("baths cannot be negative")
    except (TypeError, ValueError):
        errors.append("invalid baths")

    amenities = row.get("amenities", "")
    cleaned["amenities"] = "" if pd.isna(amenities) else str(amenities).strip()

    if errors:
        return None, f"Row {row_num}: " + "; ".join(errors)
    return cleaned, None


@app.post("/listings/bulk-upload")
async def bulk_upload_listings(file: UploadFile = File(...)):
    """Upload a CSV or XLSX file of properties and insert the valid rows.

    Expects a header row with (at least) these columns:
    prop_type, purpose, covered_area, price, location, beds, baths
    amenities is optional.

    Invalid rows are skipped individually (not an all-or-nothing batch) and
    reported back so the uploader knows exactly what failed and why.
    """
    filename = (file.filename or "").lower()
    contents = await file.read()

    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(contents))
        elif filename.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(contents))
        else:
            raise HTTPException(
                status_code=400,
                detail="Unsupported file type. Please upload a .csv or .xlsx file.",
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {e}")

    if df.empty:
        raise HTTPException(status_code=400, detail="Uploaded file has no rows.")

    df.columns = [str(c).strip().lower() for c in df.columns]
    missing_cols = [c for c in REQUIRED_LISTING_COLUMNS if c not in df.columns]
    if missing_cols:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required column(s): {', '.join(missing_cols)}",
        )

    valid_rows = []
    row_errors = []
    for i, row in df.iterrows():
        # +2 accounts for the header row and 0-indexing, so this matches the
        # row number the uploader would see if they opened the file themselves.
        cleaned, error = validate_property_row(row.to_dict(), row_num=i + 2)
        if error:
            row_errors.append(error)
        else:
            valid_rows.append(cleaned)

    inserted = 0
    if valid_rows:
        conn = get_connection()
        cursor = conn.cursor()
        try:
            for r in valid_rows:
                cursor.execute(
                    """
                    INSERT INTO property_data (prop_type, purpose, covered_area, price, location, beds, baths, amenities)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        r["prop_type"],
                        r["purpose"],
                        r["covered_area"],
                        r["price"],
                        r["location"],
                        r["beds"],
                        r["baths"],
                        r["amenities"],
                    ),
                )
                inserted += 1
            conn.commit()
        except Exception as e:
            conn.rollback()
            cursor.close()
            conn.close()
            raise HTTPException(status_code=500, detail=f"Database error during insert: {e}")
        cursor.close()
        conn.close()

    return {
        "success": True,
        "rows_received": int(len(df)),
        "rows_inserted": inserted,
        "rows_failed": len(row_errors),
        "errors": row_errors,
    }