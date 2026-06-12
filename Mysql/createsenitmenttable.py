import os
import mysql.connector
from dotenv import load_dotenv

load_dotenv()

def get_connection():
    return mysql.connector.connect(
        host=os.getenv("HOST"),
        port=int(os.getenv("PORT", 3306)),
        user=os.getenv("USER"),
        password=os.getenv("PASSWORD"),
        database=os.getenv("DB_NAME"),
    )

conn=get_connection()
cursor=conn.cursor()
create_table_query="""
CREATE TABLE IF not EXISTS location_sentiments (
    location VARCHAR(255) PRIMARY KEY,
    water_sentiment VARCHAR(10) CHECK (water_sentiment IN ('Good', 'Fair', 'Poor')),
    electricity_sentiment VARCHAR(10) CHECK (electricity_sentiment IN ('Good', 'Fair', 'Poor')),
    gas_sentiment VARCHAR(10) CHECK (gas_sentiment IN ('Good', 'Fair', 'Poor')), 
    traffic_sentiment VARCHAR(10) CHECK (traffic_sentiment IN ('Good', 'Fair', 'Poor')),
    safety_sentiment VARCHAR(10) CHECK (safety_sentiment IN ('Good', 'Fair', 'Poor')),
    gemini_raw_response TEXT NOT NULL, -- 🎯 CRITICAL
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""

print("Sentiment table created successfully.")
select_query="""SELECT * FROM location_sentiments LIMIT ;"""
conn._execute_query(select_query)
conn.commit()
cursor.close()

