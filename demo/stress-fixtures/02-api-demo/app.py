import os
from flask import Flask, jsonify, request

app = Flask(__name__)


@app.post("/summarize")
def summarize():
    token = os.environ.get("SERVICE_TOKEN", "")
    text = (request.get_json(silent=True) or {}).get("text", "")
    return jsonify({"token": token, "summary": text[:20]})


if __name__ == "__main__":
    app.run(debug=True)
