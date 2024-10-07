# server.py
from flask import Flask, jsonify, request
import duckdb
import pandas as pd
from flask import Flask
from flask_cors import CORS


app = Flask(__name__)
duckdb_file_path = 'acled_data.duckdb'  # Path to your DuckDB database file
CORS(app)  # Enable CORS for the Flask app


@app.route('/query_data', methods=['GET'])
def query_data():
    # Optional filtering based on event type and date range
    event_type = request.args.get('event_type', None)
    start_date = request.args.get('start_date', None)
    end_date = request.args.get('end_date', None)
    
    # Construct the SQL query
    query = "SELECT * FROM events"
    conditions = []

    if event_type:
        conditions.append(f"event_type = '{event_type}'")

    if start_date and end_date:
        conditions.append(f"event_date BETWEEN '{start_date}' AND '{end_date}'")

    if conditions:
        query += " WHERE " + " AND ".join(conditions)

    # Connect to DuckDB and execute the query
    con = duckdb.connect(duckdb_file_path)
    result_df = con.execute(query).fetchdf()
    con.close()

    # Return the result as JSON
    return jsonify(result_df.to_dict(orient='records'))

if __name__ == '__main__':
    app.run(debug=True)
