"""
Plotwise: MySQL -> Supabase Postgres migration

Run the postgres_schema.sql file against your new Supabase project FIRST,
then run this script.

Install dependencies:
    pip install mysql-connector-python psycopg2-binary bcrypt python-dotenv

This reads all credentials from your existing .env file automatically —
nothing needs to be typed into this script. Just add the five new
SUPABASE_PG_* variables to your .env alongside your existing ones.
"""

import os
import re
import bcrypt
import mysql.connector
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()  # reads your existing .env file — same one app.py already uses

# ---------------------------------------------------------------------
# CONFIG — pulled straight from .env, matching your existing variable
# names for MySQL. Only the SUPABASE_PG_* ones are new; add them to
# your .env (see the message accompanying this script for where to
# find each value in your Supabase dashboard).
# ---------------------------------------------------------------------
MYSQL_CONFIG = {
    "host": os.getenv("HOST"),
    "port": int(os.getenv("PORT", "3306")),
    "user": os.getenv("USER"),
    "password": os.getenv("PASSWORD"),
    "database": os.getenv("DB_NAME"),
}

PG_CONFIG = {
    "host": os.getenv("SUPABASE_PG_HOST"),
    "port": int(os.getenv("SUPABASE_PG_PORT", "5432")),
    "user": os.getenv("SUPABASE_PG_USER"),
    "password": os.getenv("SUPABASE_PG_PASSWORD"),
    "dbname": os.getenv("SUPABASE_PG_DATABASE", "postgres"),
}

# Fail loudly and early if anything's missing, instead of a confusing
# connection error later.
_missing = [k for k, v in {**MYSQL_CONFIG, **PG_CONFIG}.items() if v in (None, "")]
if _missing:
    raise SystemExit(f"Missing required config value(s), check your .env: {_missing}")

DEFAULT_TENANT_ID = 1  # matches the seed row inserted by postgres_schema.sql


def get_mysql_conn():
    return mysql.connector.connect(**MYSQL_CONFIG)


def get_pg_conn():
    return psycopg2.connect(**PG_CONFIG)


def parse_location(raw: str):
    """Split 'Korangi, Karachi, Sindh' into (area, city, province)."""
    parts = [p.strip() for p in (raw or "").split(",") if p.strip()]
    area = parts[0] if len(parts) > 0 else raw
    city = parts[1] if len(parts) > 1 else None
    province = parts[2] if len(parts) > 2 else None
    return area, city, province


def parse_amenities(raw: str):
    """Split the messy free-text amenities blob into individual tags.
    Known to be inconsistent (mixed \\r\\n and comma separators, some
    run-together phrases) — this is a best-effort split, not perfect.
    Review the `amenities_raw` column afterward for anything that didn't
    split cleanly.
    """
    if not raw:
        return []
    normalized = raw.replace("\r\n", "\n").replace("\r", "\n")
    tokens = re.split(r"[\n,]+", normalized)
    cleaned = [t.strip() for t in tokens if t.strip()]
    seen = set()
    result = []
    for t in cleaned:
        key = t.lower()
        if key not in seen:
            seen.add(key)
            result.append(t)
    return result


def migrate_locations(mysql_cur, pg_cur):
    mysql_cur.execute("SELECT DISTINCT location FROM property_data WHERE location IS NOT NULL")
    prop_locations = {row["location"] for row in mysql_cur.fetchall()}

    mysql_cur.execute("SELECT DISTINCT location FROM location_sentiments WHERE location IS NOT NULL")
    sentiment_locations = {row["location"] for row in mysql_cur.fetchall()}

    all_locations = prop_locations | sentiment_locations
    lookup = {}

    for raw in sorted(all_locations):
        area, city, province = parse_location(raw)
        pg_cur.execute(
            """
            INSERT INTO locations (area, city, province, raw_text)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (raw_text) DO UPDATE SET raw_text = EXCLUDED.raw_text
            RETURNING id
            """,
            (area, city, province, raw),
        )
        lookup[raw] = pg_cur.fetchone()[0]

    print(f"[locations] migrated {len(lookup)} distinct locations")
    return lookup


def migrate_accounts(mysql_cur, pg_cur):
    mysql_cur.execute("SELECT id, email, upassword, in_session, last_login FROM users")
    rows = mysql_cur.fetchall()
    migrated = 0
    for row in rows:
        hashed = bcrypt.hashpw(row["upassword"].encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        pg_cur.execute(
            """
            INSERT INTO accounts (tenant_id, email, password_hash, role, in_session, last_login)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (email) DO NOTHING
            """,
            (DEFAULT_TENANT_ID, row["email"], hashed, "agent", bool(row["in_session"]), row["last_login"]),
        )
        migrated += 1
    print(f"[accounts] migrated {migrated} user(s) — passwords hashed with bcrypt")


def get_or_create_amenity(pg_cur, name, amenity_cache):
    if name in amenity_cache:
        return amenity_cache[name]
    pg_cur.execute(
        """
        INSERT INTO amenities (name) VALUES (%s)
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id
        """,
        (name,),
    )
    amenity_id = pg_cur.fetchone()[0]
    amenity_cache[name] = amenity_id
    return amenity_id


def migrate_properties(mysql_cur, pg_cur, location_lookup):
    mysql_cur.execute(
        "SELECT id, prop_type, purpose, covered_area, price, location, beds, baths, amenities FROM property_data"
    )
    rows = mysql_cur.fetchall()
    amenity_cache = {}
    migrated = 0
    skipped = []

    for row in rows:
        try:
            location_id = location_lookup.get(row["location"])
            pg_cur.execute(
                """
                INSERT INTO property_data
                    (id, tenant_id, agent_id, location_id, prop_type, purpose,
                     covered_area, price, beds, baths, amenities_raw, status)
                VALUES (%s, %s, NULL, %s, %s, %s, %s, %s, %s, %s, %s, 'active')
                ON CONFLICT (id) DO NOTHING
                """,
                (
                    row["id"],
                    DEFAULT_TENANT_ID,
                    location_id,
                    row["prop_type"],
                    row["purpose"],
                    row["covered_area"],
                    row["price"],
                    row["beds"],
                    row["baths"],
                    row["amenities"],
                ),
            )

            for amenity_name in parse_amenities(row["amenities"]):
                amenity_id = get_or_create_amenity(pg_cur, amenity_name, amenity_cache)
                pg_cur.execute(
                    """
                    INSERT INTO property_amenities (property_id, amenity_id)
                    VALUES (%s, %s)
                    ON CONFLICT DO NOTHING
                    """,
                    (row["id"], amenity_id),
                )
            migrated += 1
        except Exception as e:
            skipped.append((row["id"], str(e)))

    print(f"[property_data] migrated {migrated} row(s), {len(skipped)} skipped")
    for pid, err in skipped:
        print(f"  - skipped property id {pid}: {err}")
    print(f"[amenities] {len(amenity_cache)} distinct amenity tags created")


def migrate_location_sentiments(mysql_cur, pg_cur, location_lookup):
    mysql_cur.execute(
        """
        SELECT location, water_sentiment, electricity_sentiment, gas_sentiment,
               traffic_sentiment, safety_sentiment, gemini_raw_response, updated_at
        FROM location_sentiments
        """
    )
    rows = mysql_cur.fetchall()
    migrated = 0
    for row in rows:
        location_id = location_lookup.get(row["location"])
        pg_cur.execute(
            """
            INSERT INTO location_sentiments
                (location_id, water_sentiment, electricity_sentiment, gas_sentiment,
                 traffic_sentiment, safety_sentiment, gemini_raw_response, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                location_id,
                row["water_sentiment"],
                row["electricity_sentiment"],
                row["gas_sentiment"],
                row["traffic_sentiment"],
                row["safety_sentiment"],
                row["gemini_raw_response"],
                row["updated_at"],
            ),
        )
        migrated += 1
    print(f"[location_sentiments] migrated {migrated} row(s)")


def migrate_property_images(mysql_cur, pg_cur):
    mysql_cur.execute("SELECT property_id, storage_path, is_primary, uploaded_at FROM property_images")
    rows = mysql_cur.fetchall()
    migrated = 0
    for row in rows:
        pg_cur.execute(
            """
            INSERT INTO property_images (property_id, storage_path, is_primary, uploaded_at)
            VALUES (%s, %s, %s, %s)
            """,
            (row["property_id"], row["storage_path"], bool(row["is_primary"]), row["uploaded_at"]),
        )
        migrated += 1
    print(f"[property_images] migrated {migrated} row(s)")


def main():
    mysql_conn = get_mysql_conn()
    mysql_cur = mysql_conn.cursor(dictionary=True)

    pg_conn = get_pg_conn()
    pg_cur = pg_conn.cursor()

    try:
        location_lookup = migrate_locations(mysql_cur, pg_cur)
        migrate_accounts(mysql_cur, pg_cur)
        migrate_properties(mysql_cur, pg_cur, location_lookup)
        migrate_location_sentiments(mysql_cur, pg_cur, location_lookup)
        migrate_property_images(mysql_cur, pg_cur)

        pg_conn.commit()
        print("\nMigration committed successfully.")
    except Exception as e:
        pg_conn.rollback()
        print(f"\nMigration failed, rolled back: {e}")
        raise
    finally:
        mysql_cur.close()
        mysql_conn.close()
        pg_cur.close()
        pg_conn.close()


if __name__ == "__main__":
    main()