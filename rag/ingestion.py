import os
import mysql.connector
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
import chromadb

load_dotenv()

# -------------------
# Database Connection
# -------------------
def get_connection():
    return mysql.connector.connect(
        host=os.getenv("HOST"),
        port=int(os.getenv("PORT", 3306)),
        user=os.getenv("USER"),
        password=os.getenv("PASSWORD"),
        database=os.getenv("DB_NAME"),
    )

# -------------------
# Synthetic Paragraph
# -------------------
def row_to_paragraph(row, table_type):
    if table_type == "property":
        return (
            f"Property ID {row['id']} is a {row['prop_type']} for {row['purpose']} "
            f"in {row['location']}. It has {row['beds']} beds, {row['baths']} baths, "
            f"covered area {row['covered_area']} sqft, priced at {row['price']}. "
            f"Amenities include: {row['amenities']}."
        )
    elif table_type == "sentiment":
        return (
            f"Location {row['location']} has water sentiment {row['water_sentiment']}, "
            f"electricity sentiment {row['electricity_sentiment']}, gas sentiment {row['gas_sentiment']}, "
            f"traffic sentiment {row['traffic_sentiment']}, safety sentiment {row['safety_sentiment']}. "
            f"Details: {row['gemini_raw_response']}"
        )
    else:
        return str(row)

# -------------------
# Main Ingestion
# -------------------
def main():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    # Fetch property_data
    cursor.execute("SELECT * FROM property_data")
    properties = cursor.fetchall()
    print(f"Fetched {len(properties)} property_data records.")

    # Fetch location_sentiments
    cursor.execute("SELECT * FROM location_sentiments")
    sentiments = cursor.fetchall()
    print(f"Fetched {len(sentiments)} location_sentiments records.")
    conn.close()

    # Initialize SentenceTransformer
    model = SentenceTransformer('all-MiniLM-L6-v2')

    # -------------------
    # Initialize Chroma
    # -------------------
    chroma_client = chromadb.PersistentClient(path="./chroma_index")
    print("chroma client initialized", chroma_client)

    collection_name = "zameen_index"

    # FIX: list_collections() returns objects
    existing_collections = [c.name for c in chroma_client.list_collections()]

    if collection_name in existing_collections:
        collection = chroma_client.get_collection(collection_name)
    else:
        collection = chroma_client.create_collection(
            name=collection_name,
            embedding_function=None  # we pass embeddings manually
        )

    # -------------------
    # Insert property_data
    # -------------------
    for row in properties:
        doc = row_to_paragraph(row, "property")
        emb = model.encode([doc])[0].tolist()

        collection.add(
            ids=[f"property_{row['id']}"],
            documents=[doc],
            embeddings=[emb],
            metadatas=[{"type": "property", "location": row["location"]}]
        )

    # -------------------
    # Insert location_sentiments
    # -------------------
    for row in sentiments:
        doc = row_to_paragraph(row, "sentiment")
        emb = model.encode([doc])[0].tolist()

        collection.add(
            ids=[f"sentiment_{row['location']}"],
            documents=[doc],
            embeddings=[emb],
            metadatas=[{"type": "sentiment", "location": row["location"]}]
        )

    # No `.persist()` needed
    print("✅ Chroma index created and stored at ./chroma_index")

    # -------------------
    # Verification
    # -------------------
    print("\n🔎 Verifying Chroma index...")
    print(f"Total documents in collection: {collection.count()}")

    # Sample test query
    test_query = "Tell me about properties in Korangi, Karachi"
    query_emb = model.encode([test_query])[0].tolist()

    results = collection.query(
        query_embeddings=[query_emb],
        n_results=5
    )

    print("\nTop results for test query:")
    for i, doc in enumerate(results['documents'][0]):
        metadata = results['metadatas'][0][i]
        print(f"\nResult {i+1}:")
        print("Document:", doc)
        print("Metadata:", metadata)


if __name__ == "__main__":
    main()
