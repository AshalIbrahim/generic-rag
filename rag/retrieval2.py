import chromadb
from sentence_transformers import SentenceTransformer

# -------------------
# Initialization
# -------------------

# Load the same model used during ingestion
model = SentenceTransformer("all-MiniLM-L6-v2")

# Load Chroma persistent index
chroma_client = chromadb.PersistentClient(path="./chroma_joined_index")

# Load the collection
collection = chroma_client.get_collection("zameen_joined_index")

# -------------------
# Retrieval Function
# -------------------
def retrieve(query: str, n_results: int = 5):
    """
    Takes a natural-language query,
    converts it into an embedding,
    performs semantic search in Chroma,
    and returns the top documents.
    """

    print(f"\n🔍 Running semantic search for: {query}")

    # Convert query → embedding
    query_emb = model.encode([query])[0].tolist()

    # Query Chroma
    results = collection.query(
        query_embeddings=[query_emb],
        n_results=n_results
    )

    # Pretty-print
    docs = results["documents"][0]
    metas = results["metadatas"][0]
    ids = results["ids"][0]

    print(f"\nTop {n_results} results:")
    for i in range(len(docs)):
        print("\n-----------------------------")
        print(f"Result {i+1}")
        print(f"ID: {ids[i]}")
        print(f"Location: {metas[i].get('location', 'N/A')}")
        print(f"Type: {metas[i].get('type', 'N/A')}")
        print("Document:")
        print(docs[i])

    return results


# -------------------
# Script Entry
# -------------------
if __name__ == "__main__":
    while True:
        q = input("\nEnter your query (or type 'exit'): ")
        if q.lower() in ["exit", "quit"]:
            break

        retrieve(q, n_results=5)
