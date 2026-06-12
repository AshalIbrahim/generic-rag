"""
Create/update location_sentiments table from backend/locationsentiments.csv.

Usage:
  1) Ensure DB env vars are set (HOST, PORT, USER, PASSWORD, DB_NAME)
  2) Run:
       py -3 Mysql/load_location_sentiments_from_csv.py
     or
       python Mysql/load_location_sentiments_from_csv.py
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Optional

import mysql.connector
import pandas as pd
from dotenv import load_dotenv


load_dotenv()


def get_connection():
    host = (os.getenv("HOST") or os.getenv("MYSQL_HOST") or "127.0.0.1").strip()
    # Avoid Windows named-pipe resolution for host="."
    if host == ".":
        host = "127.0.0.1"
    port = int(os.getenv("PORT") or os.getenv("MYSQL_PORT") or 3306)
    user = os.getenv("USER") or os.getenv("MYSQL_USER")
    password = os.getenv("PASSWORD") or os.getenv("MYSQL_PASSWORD")
    database = os.getenv("DB_NAME") or os.getenv("MYSQL_DATABASE")

    if not user or not database:
        raise ValueError(
            "Missing DB env vars. Set USER/MYSQL_USER and DB_NAME/MYSQL_DATABASE "
            "(plus PASSWORD and HOST/PORT as needed)."
        )

    return mysql.connector.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        database=database,
        use_pure=True,
    )


def normalize_location(value: str) -> str:
    text = str(value or "").strip()
    # Collapse repeated whitespace and normalize comma spacing.
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s*,\s*", ", ", text)
    return text


def normalize_sentiment(value: object) -> Optional[str]:
    if value is None:
        return None
    raw = str(value).strip().lower()
    if not raw:
        return None

    mapping = {
        "good": "Good",
        "fair": "Fair",
        "poor": "Poor",
        "excellent": "Good",
        "very good": "Good",
        "average": "Fair",
        "ok": "Fair",
        "bad": "Poor",
        "very poor": "Poor",
    }
    return mapping.get(raw)


def clean_raw_response(value: object) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    # Keep line breaks, but remove null bytes and normalize Windows newlines.
    text = text.replace("\x00", "").replace("\r\n", "\n")
    return text


def ensure_table(cursor):
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS location_sentiments (
            location VARCHAR(255) PRIMARY KEY,
            water_sentiment VARCHAR(10) NULL CHECK (water_sentiment IN ('Good', 'Fair', 'Poor')),
            electricity_sentiment VARCHAR(10) NULL CHECK (electricity_sentiment IN ('Good', 'Fair', 'Poor')),
            gas_sentiment VARCHAR(10) NULL CHECK (gas_sentiment IN ('Good', 'Fair', 'Poor')),
            traffic_sentiment VARCHAR(10) NULL CHECK (traffic_sentiment IN ('Good', 'Fair', 'Poor')),
            safety_sentiment VARCHAR(10) NULL CHECK (safety_sentiment IN ('Good', 'Fair', 'Poor')),
            gemini_raw_response TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        );
        """
    )


def load_csv(csv_path: Path) -> pd.DataFrame:
    # Resilient CSV parsing:
    # - engine="python" handles messy multiline quoted cells better than C engine
    # - on_bad_lines="skip" avoids hard-failing on malformed rows
    # - keep_default_na=False keeps empty strings stable for cleaning logic
    df = pd.read_csv(
        csv_path,
        dtype=str,
        engine="python",
        on_bad_lines="skip",
        keep_default_na=False,
    )

    # Parse updated_at after read to avoid parser hard-fail on dirty lines.
    if "updated_at" in df.columns:
        df["updated_at"] = pd.to_datetime(df["updated_at"], errors="coerce")
    else:
        df["updated_at"] = pd.NaT

    required = {
        "location",
        "water_sentiment",
        "electricity_sentiment",
        "gas_sentiment",
        "traffic_sentiment",
        "safety_sentiment",
        "gemini_raw_response",
        "updated_at",
    }
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"CSV missing required columns: {sorted(missing)}")

    # Clean fields.
    df["location"] = df["location"].map(normalize_location)
    df["water_sentiment"] = df["water_sentiment"].map(normalize_sentiment)
    df["electricity_sentiment"] = df["electricity_sentiment"].map(normalize_sentiment)
    df["gas_sentiment"] = df["gas_sentiment"].map(normalize_sentiment)
    df["traffic_sentiment"] = df["traffic_sentiment"].map(normalize_sentiment)
    df["safety_sentiment"] = df["safety_sentiment"].map(normalize_sentiment)
    df["gemini_raw_response"] = df["gemini_raw_response"].map(clean_raw_response)

    # Drop rows without location.
    df = df[df["location"].str.len() > 0].copy()

    # Keep latest record per location based on updated_at; invalid timestamps go last.
    df = df.sort_values(by="updated_at", na_position="last").drop_duplicates(subset=["location"], keep="last")

    # Fill blank raw response consistently.
    df["gemini_raw_response"] = df["gemini_raw_response"].replace("", "No explanation provided.")

    return df


def upsert_rows(cursor, df: pd.DataFrame):
    query = """
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

    payload = [
        (
            row.location,
            row.water_sentiment,
            row.electricity_sentiment,
            row.gas_sentiment,
            row.traffic_sentiment,
            row.safety_sentiment,
            row.gemini_raw_response,
        )
        for row in df.itertuples(index=False)
    ]
    cursor.executemany(query, payload)
    return len(payload)


def main():
    root = Path(__file__).resolve().parents[1]
    csv_path = root / "backend" / "locationsentiments.csv"
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV not found: {csv_path}")

    df = load_csv(csv_path)
    conn = get_connection()
    cursor = conn.cursor()
    try:
        ensure_table(cursor)
        count = upsert_rows(cursor, df)
        conn.commit()
        print(f"Upserted {count} cleaned location_sentiments rows from {csv_path}.")
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    main()
