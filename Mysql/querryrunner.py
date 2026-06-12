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

conn = get_connection()
cursor = conn.cursor()

select_query = "SELECT * FROM location_sentiments"
cursor.execute(select_query)

rows = cursor.fetchall()
for row in rows:
    print(row)

cursor.close()
conn.close()
