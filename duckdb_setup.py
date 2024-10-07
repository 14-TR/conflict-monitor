import duckdb
import pandas as pd

# Path to your data file (JSON or CSV)
data_file_path = 'acled_events.json'  # Change to the path of your data file
duckdb_file_path = 'acled_data.duckdb'

# Create or connect to a DuckDB database
con = duckdb.connect(duckdb_file_path)

# Load the data into a DataFrame (modify as per your data format)
df = pd.read_json(data_file_path)

# Create a table in DuckDB and insert data
con.execute("CREATE TABLE IF NOT EXISTS events AS SELECT * FROM df")

# Verify the data was inserted
result = con.execute("SELECT COUNT(*) FROM events").fetchall()
print(f"Total records in DuckDB: {result[0][0]}")

# Close the connection
con.close()
