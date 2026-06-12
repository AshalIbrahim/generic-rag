# insertsentiments_corrected.py
from dotenv import load_dotenv
import os
import time
import mysql.connector
import requests
import sys

load_dotenv()

def get_connection():
    return mysql.connector.connect(
        host=os.getenv("HOST"),
        port=int(os.getenv("PORT", 3306)),
        user=os.getenv("USER"),
        password=os.getenv("PASSWORD"),
        database=os.getenv("DB_NAME"),
    )


HUGGINGFACE_API_KEY = os.getenv("HUGGINGFACE_API_KEY")

# Hugging Face API setup
HUGGINGFACE_API_URL = "https://api-inference.huggingface.co/models/mistralai/Mixtral-8x7B-Instruct-v0.1"

MODEL = "gemini-2.5-flash"   # choose an available model; change if needed

# ---------- Helpers ----------
def get_sentiment_from_gemini(location: str, max_retries=3) -> str:
    prompt = f"""
You are a concise assistant that returns only lines of the form:
water: Good/Fair/Poor
electricity: Good/Fair/Poor
gas: Good/Fair/Poor
traffic: Good/Fair/Poor
safety: Good/Fair/Poor
explain: <full reasoning>

For the location: "{location}"
Return those lines only.
"""
            headers = {"Authorization": f"Bearer {HUGGINGFACE_API_KEY}"}
            payload = {
                "inputs": prompt,
                "parameters": {
                    "max_new_tokens": 80,
                    "temperature": 0.5,
                    "return_full_text": False
                }
            }
            resp = requests.post(HUGGINGFACE_API_URL, headers=headers, json=payload, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, list) and data and "generated_text" in data[0]:
                return data[0]["generated_text"].strip()
            if isinstance(data, dict) and "generated_text" in data:
                return data["generated_text"].strip()
            return str(data)
                contents=prompt
            )
            # official SDK provides .text for simple text-only responses
            text = getattr(response, "text", None)
            if text is None:
                # fallback: try to extract from response.output if present
                out = getattr(response, "output", None)
                if out and len(out) > 0:
                    # navigate typical structure: output -> [ { 'content': [ { 'text': '...' } ] } ]
                    try:
                        text = out[0].get("content", [])[0].get("text")
                        # simple line parser: key: value
                    except Exception:
                        text = str(response)
            return text or ""
        except Exception as e:
            print(f"[Gemini] attempt {attempt} failed: {e}", file=sys.stderr)
            if attempt < max_retries:
                time.sleep(60 + attempt)  # backoff
            else:
                raise

def parse_gemini_text(text: str) -> dict:
    # simple line parser: key: value
    out = {"water": None, "electricity": None, "gas": None, "traffic": None, "safety": None, "gemini_raw_response": text}
    for line in text.splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            k = k.strip().lower()
            v = v.strip()
            # map 'explain' to raw response is already stored
            if k in out:
                out[k] = v
    return out

# ---------- Main ----------
def main():
    conn = get_connection()
    cursor = conn.cursor()

    # replace 'properties' with your actual source table if different
    # cursor.execute("SELECT DISTINCT location FROM property_data WHERE location IS NOT NULL")
    # locations = cursor.fetchall()
    # print(f"Found {len(locations)} distinct locations")

    cursor.execute("SELECT DISTINCT location FROM property_data WHERE location IS NOT NULL AND location NOT IN (SELECT location FROM location_sentiments)")
    locations = cursor.fetchall()
    print(f"Found {len(locations)} new locations to process")

    insert_query = """
    INSERT INTO location_sentiments (
        location,
        water_sentiment,
        electricity_sentiment,
        gas_sentiment,
        traffic_sentiment,
        safety_sentiment,
        gemini_raw_response
    ) VALUES (%s,%s,%s,%s,%s,%s,%s)
    ON DUPLICATE KEY UPDATE
        water_sentiment = VALUES(water_sentiment),
        electricity_sentiment = VALUES(electricity_sentiment),
        gas_sentiment = VALUES(gas_sentiment),
        traffic_sentiment = VALUES(traffic_sentiment),
        safety_sentiment = VALUES(safety_sentiment),
        gemini_raw_response = VALUES(gemini_raw_response),
        updated_at = CURRENT_TIMESTAMP;
    """

    for (location,) in locations:
        print(f"Processing location: {location}")
        try:
            raw = get_sentiment_from_hf(location)
        except Exception as e:
            print(f"Skipping {location} due to Gemini error: {e}", file=sys.stderr)
            continue

        parsed = parse_gemini_text(raw)

        data = (
            location,
            parsed.get("water"),
            parsed.get("electricity"),
            parsed.get("gas"),
            parsed.get("traffic"),
            parsed.get("safety"),
            parsed.get("gemini_raw_response"),
        )
        try:
            cursor.execute(insert_query, data)
            conn.commit()
            print(f"Inserted/Updated -> {location}")
        except Exception as e:
            conn.rollback()
            print(f"DB error for {location}: {e}", file=sys.stderr)

        time.sleep(0.5)  # small pause to avoid aggressive rate-limits

    cursor.close()
    conn.close()
    print("Done.")

if __name__ == "__main__":
    main()
