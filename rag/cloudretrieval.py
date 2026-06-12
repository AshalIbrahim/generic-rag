import os
import chromadb
import zipfile
import boto3
from sentence_transformers import SentenceTransformer
from dotenv import load_dotenv
import numpy as np

load_dotenv()

print("S3_BUCKET:", os.getenv("S3_BUCKET"))
print("AWS_ACCESS_KEY_ID:", os.getenv("AWS_ACCESS_KEY_ID"))
print("AWS_SECRET_ACCESS_KEY:", os.getenv("AWS_SECRET_ACCESS_KEY"))

S3_BUCKET = os.getenv("S3_BUCKET")
S3_KEY = "chroma_joined_index.zip"
LOCAL_ZIP = "./chroma_joined_index_cloud.zip"
LOCAL_INDEX_PATH = "./chroma_joined_index_cloud"



# -----------------------
# Download Index from S3
# -----------------------
def download_index_if_needed():
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

# -----------------------
# Initialization
# -----------------------
#download_index_if_needed()

model = SentenceTransformer("all-MiniLM-L6-v2")
chroma_client = chromadb.PersistentClient(path="./chroma_joined_index")

print("Collections in this index:")
for c in chroma_client.list_collections():
    print(c.name)

collection = chroma_client.get_collection("zameen_joined_index")
print("Collection loaded successfully:", collection.name)

# -----------------------
# Retrieval
# -----------------------

def cosine_similarity(a, b):
    a = np.array(a)
    b = np.array(b)
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))


def retrieve(query: str, n_results: int = 10):
    query_emb = model.encode([query])[0]

    results = collection.query(
        query_embeddings=[query_emb.tolist()],
        n_results=n_results
    )

    docs = results["documents"][0]
    metas = results["metadatas"][0]

    # -----------------------------
    # Rerank using cosine similarity
    # -----------------------------
    doc_embeddings = model.encode(docs)
    scores = [cosine_similarity(query_emb, d_emb) for d_emb in doc_embeddings]

    ranked = sorted(zip(docs, metas, scores), key=lambda x: x[2], reverse=True)

    final_docs = [d for d, m, s in ranked][:5]
    final_metas = [m for d, m, s in ranked][:5]

    return {
        "documents": final_docs,
        "metadatas": final_metas
    }

if __name__ == "__main__":
    while True:
        q = input("\nEnter query (exit to quit): ")
        if q.lower() == "exit":
            break
        retrieve(q)
