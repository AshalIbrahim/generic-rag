import pandas as pd
import re
import numpy as np
import mysql.connector
import time
import os
from dotenv import load_dotenv


# # ---------- STEP 1: Load CSV ----------

load_dotenv()
# ---------- STEP 1: Load CSV ----------
# (adjust path as needed)pi
df = pd.read_csv("F:\mlops2\properties.csv")

# ---------- STEP 2: Normalize Column Names ----------
df.columns = (
    df.columns.str.strip()
    .str.lower()
    .str.replace(" ", "_")
    .str.replace("\ufeff", "", regex=True)  # remove BOM if present
)

print("🧾 Columns found:", list(df.columns))

# ---------- STEP 3: Auto-fix Column Names ----------
rename_map = {}
for c in df.columns:
    if "price" in c and "text" in c:
        rename_map[c] = "price"
    if "prop" in c and "type" in c:
        rename_map[c] = "prop_type"
    if "covered" in c and "area" in c:
        rename_map[c] = "covered_area"
df.rename(columns=rename_map, inplace=True)

# Ensure all required columns exist
required_cols = [
    "prop_type",
    "purpose",
    "covered_area",
    "price",
    "location",
    "beds",
    "baths",
    "amenities",
]
missing = [c for c in required_cols if c not in df.columns]
if missing:
    raise ValueError(f"❌ Missing required columns in CSV: {missing}")


# ---------- STEP 4: Clean Price ----------
def clean_price(price):
    if isinstance(price, str):
        price = price.strip()
        match = re.search(r"([\d\.]+)\s*(Crore|Lakh)", price)
        if match:
            value, unit = float(match.group(1)), match.group(2)
            if unit == "Crore":
                return value * 10_000_000
            elif unit == "Lakh":
                return value * 100_000
        nums = re.findall(r"[\d\.]+", price)
        return float(nums[0]) if nums else np.nan
    try:
        return float(price)
    except Exception:
        return np.nan


# Optionally apply cleaning if your price column needs parsing
# df["price"] = df["price"].apply(clean_price)

# ---------- STEP 5: Clean Covered Area ----------
# Coerce to numeric safely
df["covered_area"] = pd.to_numeric(
    df["covered_area"].astype(str).str.extract(r"([\d\.]+)")[0], errors="coerce"
)

# ---------- STEP 6: Clean Beds & Baths ----------
# Extract numbers and coerce
df["beds"] = pd.to_numeric(
    df["beds"].astype(str).str.extract(r"(\d+)")[0], errors="coerce"
)
df["baths"] = pd.to_numeric(
    df["baths"].astype(str).str.extract(r"(\d+)")[0], errors="coerce"
)
# Replace common dash variants with NaN
num_cols = [c for c in ("covered_area", "price", "beds", "baths") if c in df.columns]
dash_variants = {"-", "–", "—"}
for col in num_cols:
    df[col] = df[col].replace(list(dash_variants), np.nan)

# ---------- STEP 7: Clean Text Fields and Handle NaNs ----------
# Ensure string columns are safe to operate on (convert NaN -> empty string)
for col in ["prop_type", "purpose", "location", "amenities"]:
    if col in df.columns:
        df[col] = df[col].fillna("").astype(str).str.strip()

# ---------- STEP 8: Impute Missing Values ----------
# Inspect amenities for numeric mentions like "2 beds", "3 bath" and use that
# If a number is mentioned, fill with that number. Otherwise leave as 0.
for index, row in df.iterrows():
    amenities_text = (row.get("amenities") or "").lower()
    # Beds: look for patterns like '2 bed', '2 beds', '2 br', '2 bedroom'
    if "beds" in df.columns:
        beds_val = row.get("beds")
        if pd.isna(beds_val) or beds_val == 0:
            bed_match = re.search(r"(\d+)\s*(?:beds?|br|bedrooms?)", amenities_text)
            if bed_match:
                try:
                    df.at[index, "beds"] = int(bed_match.group(1))
                except Exception:
                    # on parse error, leave as 0
                    df.at[index, "beds"] = 0
            else:
                # leave as 0 per requirement
                df.at[index, "beds"] = 0
    # Baths: look for patterns like '2 bath', '2 baths', '2 ba', '2 bathroom'
    if "baths" in df.columns:
        baths_val = row.get("baths")
        if pd.isna(baths_val) or baths_val == 0:
            bath_match = re.search(r"(\d+)\s*(?:baths?|ba|bathrooms?)", amenities_text)
            if bath_match:
                try:
                    df.at[index, "baths"] = int(bath_match.group(1))
                except Exception:
                    df.at[index, "baths"] = 0
            else:
                # leave as 0 per requirement
                df.at[index, "baths"] = 0

# After imputation ensure beds/baths are integers and no NaN remain
if "beds" in df.columns:
    df["beds"] = pd.to_numeric(df["beds"], errors="coerce").fillna(0).astype(int)
if "baths" in df.columns:
    df["baths"] = pd.to_numeric(df["baths"], errors="coerce").fillna(0).astype(int)

# ---------- STEP 9: Save Cleaned CSV ----------
df.to_csv("zameen_cleaned.csv", index=False)
print("Cleaned data saved to zameen_cleaned.csv")
print("HOST:", os.getenv("host"))
print("PORT:", os.getenv("port"))
print("USER:", os.getenv("user"))
print("PASSWORD:", os.getenv("password"))

# ---------- STEP 10: Connect to MySQL ----------
def connect_mysql(retries=3, delay=2):
    for i in range(retries):
        try:
            connection = mysql.connector.connect(
                host=os.getenv("host"),
                port=os.getenv("port"),
                user=os.getenv("user"),
                password=os.getenv("password"),
                database="zameen",
            )
            if connection.is_connected():
                print("✅ Connected to MySQL successfully.")
                return connection
        except mysql.connector.Error as e:
            print(f"⚠️ MySQL connection failed ({e}), retrying in {delay}s...")
            time.sleep(delay)
    raise ConnectionError("❌ Could not connect to MySQL after retries.")


connection = connect_mysql()
cursor = connection.cursor()

try:
    # ---------- STEP 12: Insert Data ----------
    insert_query = """
        INSERT INTO property_data
        (prop_type, purpose, covered_area, price, location, beds, baths, amenities)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
    """

    data_tuples = []

    def to_float_safe(v):
        try:
            if v in (None, "", "nan"):
                return None
            return float(v)
        except Exception:
            return None

    def to_int_safe(v):
        try:
            if v in (None, "", "nan"):
                return None
            return int(float(v))
        except Exception:
            return None

    for _, row in df.iterrows():
        covered_area_val = to_float_safe(row.get("covered_area"))
        price_val = to_float_safe(row.get("price"))
        beds_val = to_int_safe(row.get("beds"))
        baths_val = to_int_safe(row.get("baths"))

        # Amenities: prefer empty string instead of numpy.nan
        amenities_val = (
            row.get("amenities")
            if row.get("amenities") not in (None, "", "nan")
            else ""
        )

        data_tuples.append(
            (
                row.get("prop_type") or None,
                row.get("purpose") or None,
                covered_area_val,
                price_val,
                row.get("location") or None,
                beds_val,
                baths_val,
                amenities_val,
            )
        )

    cursor.executemany(insert_query, data_tuples)
    connection.commit()
    print(f"✅ Successfully inserted {cursor.rowcount} rows into MySQL.")
except mysql.connector.Error as e:
    print(f"⚠️ MySQL error during insert: {e}")
    try:
        connection.rollback()
    except Exception:
        pass
except Exception as e:
    print(f"❌ Unexpected error: {e}")
finally:
    try:
        if cursor:
            cursor.close()
    except Exception:
        pass
    try:
        if connection and connection.is_connected():
            connection.close()
    except Exception:
        pass
    print("🔒 MySQL connection closed.")
