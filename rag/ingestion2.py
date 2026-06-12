import os
import mysql.connector
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
import chromadb

load_dotenv()

# -----------------------
# Database Connection
# -----------------------
def get_connection():
    return mysql.connector.connect(
        host=os.getenv("HOST"),
        port=int(os.getenv("PORT", 3306)),
        user=os.getenv("USER"),
        password=os.getenv("PASSWORD"),
        database=os.getenv("DB_NAME"),
    )

# -----------------------
# Paragraph Builder
# -----------------------
def build_joined_paragraph(row):
    return (
        f"Property ID {row['id']} is a {row['prop_type']} for {row['purpose']} "
        f"in {row['location']}. It has {row['beds']} beds, {row['baths']} baths, "
        f"covered area {row['covered_area']} sqft, priced at {row['price']}. "
        f"Amenities include: {row['amenities']}. "
        f"Sentiment data for this location: water={row['water_sentiment']}, "
        f"electricity={row['electricity_sentiment']}, gas={row['gas_sentiment']}, "
        f"traffic={row['traffic_sentiment']}, safety={row['safety_sentiment']}. "
        f"Additional sentiment notes: {row['gemini_raw_response']}"
    )

# -----------------------
# Join-based Embedding
# -----------------------
def main():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    # INNER JOIN or LEFT JOIN depending on your dataset
    query = """
        SELECT p.*, s.water_sentiment, s.electricity_sentiment, s.gas_sentiment,
               s.traffic_sentiment, s.safety_sentiment, s.gemini_raw_response
        FROM property_data p
        LEFT JOIN location_sentiments s
        ON p.location = s.location;
    """
    cursor.execute(query)
    rows = cursor.fetchall()
    conn.close()

    print(f"Fetched {len(rows)} joined rows.")

    # Model
    model = SentenceTransformer('intfloat/multilingual-e5-large-instruct')

    # Chroma (new index)
    chroma_client = chromadb.PersistentClient(path="./chroma_joined_index")
    collection_name = "zameen_joined_indexBigModel"

    existing = [c.name for c in chroma_client.list_collections()]
    if collection_name in existing:
        collection = chroma_client.get_collection(collection_name)
    else:
        collection = chroma_client.create_collection(
            name=collection_name,
            embedding_function=None
        )

    # Insert combined embeddings
    for row in rows:
        doc = build_joined_paragraph(row)
        emb = model.encode([doc])[0].tolist()

        collection.add(
            ids=[f"joined_{row['id']}"],
            documents=[doc],
            embeddings=[emb],
            metadatas=[{"location": row["location"], "type": "joined"}]
        )

    print("✅ Joined Chroma index created at ./chroma_joined_index")
    print(f"Total docs: {collection.count()}")

    # Quick test query
    q = "I want a property in DHA with good safety"
    q_emb = model.encode([q])[0].tolist()
    results = collection.query(query_embeddings=[q_emb], n_results=3)

    print("\nTop results:")
    for i, doc in enumerate(results['documents'][0]):
        print(f"\nResult {i+1}:")
        print(doc[:200] + "...")
        print("Metadata:", results['metadatas'][0][i])


if __name__ == "__main__":
    main()
