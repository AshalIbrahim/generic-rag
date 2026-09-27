"""
Quick row-count comparison: MySQL (source) vs Supabase Postgres (destination).
Run this after a migration to sanity-check nothing was silently dropped.

Usage: python verify_counts.py
(reads the same .env as migration.py — run it from the same folder)
"""

import os
import mysql.connector
import psycopg2
from dotenv import load_dotenv

load_dotenv()

mysql_conn = mysql.connector.connect(
    host=os.getenv("HOST"),
    port=int(os.getenv("PORT", "3306")),
    user=os.getenv("USER"),
    password=os.getenv("PASSWORD"),
    database=os.getenv("DB_NAME"),
)
pg_conn = psycopg2.connect(
    host=os.getenv("SUPABASE_PG_HOST"),
    port=int(os.getenv("SUPABASE_PG_PORT", "5432")),
    user=os.getenv("SUPABASE_PG_USER"),
    password=os.getenv("SUPABASE_PG_PASSWORD"),
    dbname=os.getenv("SUPABASE_PG_DATABASE", "postgres"),
)

# (mysql table name, postgres table name)
TABLES = [
    ("users", "accounts"),
    ("property_data", "property_data"),
    ("location_sentiments", "location_sentiments"),
    ("property_images", "property_images"),
]

mysql_cur = mysql_conn.cursor()
pg_cur = pg_conn.cursor()

print(f"{'Table':25} {'MySQL':>10} {'Postgres':>10} {'Match?':>8}")
print("-" * 56)
for mysql_table, pg_table in TABLES:
    mysql_cur.execute(f"SELECT COUNT(*) FROM {mysql_table}")
    mysql_count = mysql_cur.fetchone()[0]

    pg_cur.execute(f"SELECT COUNT(*) FROM {pg_table}")
    pg_count = pg_cur.fetchone()[0]

    match = "OK" if mysql_count == pg_count else "MISMATCH"
    print(f"{mysql_table:25} {mysql_count:>10} {pg_count:>10} {match:>8}")

mysql_cur.close()
mysql_conn.close()
pg_cur.close()
pg_conn.close()