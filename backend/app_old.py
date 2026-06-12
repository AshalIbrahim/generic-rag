import sys
from google import genai
from sentence_transformers import SentenceTransformer
import chromadb
from typing import List
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import mysql.connector
import pandas as pd
import mlflow
import mlflow.pyfunc
import json
import os
import boto3
from dotenv import load_dotenv
from pydantic import BaseModel
import zipfile
import numpy as np


load_dotenv()

collections = None
chroma_client = None
indexloaded = False
# ---- Load environment variables ----
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_DEFAULT_REGION = os.getenv("AWS_DEFAULT_REGION", "eu-north-1")
S3_BUCKET = os.getenv("S3_BUCKET", "zameen-project")
S3_MODELS_PREFIX = os.getenv("S3_MODELS_PREFIX", "zameen_models")
S3_KEY = "chroma_joined_index.zip"
LOCAL_ZIP = "./chroma_joined_index_cloud.zip"
LOCAL_INDEX_PATH = "./chroma_joined_index_cloud"
# ---- Setup ----
app = FastAPI(title="Zameen MLOps API")

# Allow CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- AWS + MLflow Config ----

googlemodel = genai.Client()



# Initialize S3 client (will use env creds)
s3 = boto3.client(
    "s3",
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    region_name=AWS_DEFAULT_REGION,
)

# MLflow setup
mlflow.set_tracking_uri("http://127.0.0.1:5000")
model_name = "ZameenPriceModelV2"
stage = "Production"

def downloadindex():
    global chroma_client , collections
    if os.path.exists(LOCAL_INDEX_PATH):

        print("📦 Local Chroma index already exists. Skipping download.")
        return
    
    print("⬇️ Downloading Chroma index from S3...")
    s3 = boto3.client("s3")
    s3.download_file(S3_BUCKET, S3_KEY, LOCAL_ZIP)

    print("📂 Extracting zip...")
    with zipfile.ZipFile(LOCAL_ZIP, 'r') as z:
        z.extractall(".")
    
    print("✅ Index ready.")
    chroma_client = chromadb.PersistentClient(path="./chroma_joined_index")
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

        # Load with MLflow
        model = mlflow.sklearn.load_model(f"model_cache/{model_name}")

        with open("model_cache/feature_columns.json", "r") as f:
            feat = json.load(f)
        with open("model_cache/valid_metadata.json", "r") as f:
            valid_metadata = json.load(f)

        sale_feature_columns = feat.get("sale", [])
        print("✅ Model and artifacts loaded from S3 successfully!")

    except Exception as e:
        print(f"❌ Model load failed: {e}")

    return model, sale_feature_columns, valid_metadata


model, sale_feature_columns, valid_metadata = load_model()

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
@app.get("/")
def home():
    return {"message": "Zameen API is running"}


@app.get("/listings")
def get_listings(limit: int = 20):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT prop_type, purpose, covered_area, price, location, beds, baths
        FROM property_data
        LIMIT %s
        """,
        (limit,),
    )
    data = cursor.fetchall()
    cursor.close()
    conn.close()
    return data


@app.get("/locations")
def get_locations(purpose: str = "sale"):
    data = load_location_and_property_types()
    return {"locations": data["locations"]}


@app.get("/prop_type")
def get_prop_type(purpose: str = "sale"):
    data = load_location_and_property_types()
    return {"prop_type": data["prop_type"]}


# ---- Prediction Schema ----
class PredictionInput(BaseModel):
    coveredArea: float
    beds: int
    bathrooms: int
    location: str
    propType: str
    purpose: str = "sale"


@app.post("/predict")
async def predict_price(input_data: PredictionInput):
    if model is None:
        raise HTTPException(
            status_code=500,
            detail="Model not loaded. Check MLflow server and registry.",
        )

    valid_data = load_location_and_property_types()

    if input_data.location not in valid_data["locations"]:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid location. Must be one of: {', '.join(valid_data['locations'])}",
        )

    if input_data.propType not in valid_data["prop_type"]:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid property type. Must be one of: {', '.join(valid_data['prop_type'])}",
        )

    try:
        base_df = pd.DataFrame(
            [[input_data.coveredArea, input_data.beds, input_data.bathrooms]],
            columns=["covered_area", "beds", "baths"],
        )

        loc_df = pd.get_dummies(pd.Series([input_data.location]), prefix="location")
        prop_df = pd.get_dummies(pd.Series([input_data.propType]), prefix="prop_type")
        input_df = pd.concat([base_df, loc_df, prop_df], axis=1)

        # Align columns
        if sale_feature_columns:
            for col in sale_feature_columns:
                if col not in input_df.columns:
                    input_df[col] = 0
            input_df = input_df[sale_feature_columns]
        else:
            input_df = input_df.fillna(0)

        predicted_price = float(model.predict(input_df)[0])
        return {
            "prediction": predicted_price,
            "formatted_price": f"PKR {predicted_price:,.2f}",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")


@app.get("/health")
def health_check():
    return {"status": "ok"}

def retrieve(query: str, n_results: int = 10):
    query_emb = embmodel.encode([query])[0]

    results = collections.query(
        query_embeddings=[query_emb.tolist()],
        n_results=n_results
    )

    docs = results["documents"][0]
    metas = results["metadatas"][0]

    # -----------------------------
    # Rerank using cosine similarity
    # -----------------------------
    doc_embeddings = embmodel.encode(docs)
    scores = [cosine_similarity(query_emb, d_emb) for d_emb in doc_embeddings]

    ranked = sorted(zip(docs, metas, scores), key=lambda x: x[2], reverse=True)

    final_docs = [d for d, m, s in ranked][:5]
    final_metas = [m for d, m, s in ranked][:5]

    return {
        "documents": final_docs,
        "metadatas": final_metas
    }

def cosine_similarity(a, b):
    """Compute cosine similarity between two vectors with zero-division protection."""
    a = np.array(a)
    b = np.array(b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return np.dot(a, b) / (norm_a * norm_b)

class ChatMessage(BaseModel):
    role: str   # "user" or "assistant"
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]

def generate_chat_response(messages: List[ChatMessage]) -> str:
    # 1. Get last user message
    last_user = messages[-1].content

    # 2. Keep last 5 messages as short-term memory
    short_memory = "\n".join(f"{m.role}: {m.content}" for m in messages[-5:])

    # 3. Query Rewriting (Lightweight) - convert user intent to search query
    rewrite_prompt = f"""Rewrite the final user message into a clean, standalone search query 
for retrieving property listings from a vector database.

Conversation so far:
{short_memory}

Write ONLY the rewritten query, nothing else:"""

    try:
        rewritten_query = googlemodel.models.generate_content(
            model="gemini-2.0-flash",
            contents=rewrite_prompt
        ).text.strip()
    except Exception as e:
        print(f"⚠️ Query rewrite failed: {e}, using original message")
        rewritten_query = last_user

    # 5. RAG Retrieval with optimized scoring
    rag_results = retrieve(rewritten_query, n_results=15, top_k=5)
    context_docs = rag_results["documents"]
    context = "\n---DOC---\n".join(context_docs)

    # 5. Final Chat Prompt
    main_prompt = f"""
You are Zameen.com’s intelligent property assistant.
Use the retrieved documents to answer the user accurately, 
with reasoning and a conversational tone.

If context is relevant:
- Cite details using simple language
- Give comparisons, nearby areas, estimation logic

If context is missing or irrelevant:
- Use general real-estate knowledge
- Stay helpful without hallucinating

CONTEXT:
{context}

CONVERSATION:
{short_memory}

USER:
{last_user}

ASSISTANT:
"""

    try:
        output = googlemodel.models.generate_content(
            model="gemini-2.0-flash",
            contents=main_prompt
        )
        generated = output.text.strip()

        # Prevent returning the exact same assistant reply that already appears
        # in the provided conversation messages. If a duplicate is detected,
        # return a short clarification prompt instead to avoid repetition.
        try:
            last_assistant = None
            for m in reversed(messages):
                if m.role == "assistant":
                    last_assistant = m.content
                    break
            if last_assistant and last_assistant.strip() == generated.strip():
                return "I already provided that answer above. Would you like me to clarify or expand on it?"
        except Exception:
            # if anything goes wrong while checking, just return the generated text
            pass

        return generated

    except Exception as e:
        print(f"❌ Chat Error: {e}")
        return "Sorry, I encountered an error. Please try again."



@app.post("/chat")
def chat(req: ChatRequest):
    response = generate_chat_response(req.messages)
    return {"response": response}