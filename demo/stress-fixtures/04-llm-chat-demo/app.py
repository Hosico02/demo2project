import os
from flask import Flask, jsonify, render_template, request
from openai import OpenAI

app = Flask(__name__)
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))


@app.get("/")
def index():
    return render_template("index.html")


@app.post("/chat")
def chat():
    body = request.get_json(silent=True) or {}
    message = body.get("message", "")
    response = client.chat.completions.create(
        model=os.environ.get("WW_MODEL", "gpt-3.5-turbo"),
        messages=[{"role": "user", "content": message}],
    )
    return jsonify({"reply": response.choices[0].message.content})
