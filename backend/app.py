# backend/app.py

# Import necessary libraries
from flask import Flask, request, jsonify
from flask_cors import CORS
import google.generativeai as genai
import os
# Initialize Flask app and CORS
app = Flask(__name__)
CORS(app)
# Configure Gemini API key
# DO NOT HARDCODE | READ FROM ENV
GEMINI_KEY = os.getenv("GEMINI_KEY") or os.getenv("GEMINI_API_KEY")  # Your Gemini API key
# Ensure the API key is set
if not GEMINI_KEY:
    raise Exception("❌ Gemini API key missing! Set GEMINI_API_KEY in Render environment")
genai.configure(api_key=GEMINI_KEY)
model = genai.GenerativeModel("gemini-2.5-pro")
# Health check endpoint
@app.route("/")
def home():
    return {"status": "Smart Study Partner backend running"}
# CHAT ENDPOINT
@app.route("/chat/ask", methods=["POST"])
def chat():
    try:
        data = request.get_json()
        message = data.get("message", "")
        noteText = data.get("noteText", "")

        if not message:
            return jsonify({"reply": "Please ask something"}), 200

        prompt = f"""
You are **Smart Study Partner**, an AI designed to help students understand any subject with clarity, structure, and high accuracy.

Your responsibilities:
1. Read the user's message carefully.
2. Analyze the related notes deeply.
3. Identify the exact topics inside the notes or question.  
4. Break the explanation into **Topic 1, Topic 2, Topic 3...** format.
5. For each topic:
     - Give a clear definition  
     - Explain in bullet points  
     - Add short examples if helpful 
     - NEVER generate tables or Markdown tables.
     - NEVER use grid-like formatting such as | --- | or | col | col |. 
     - Keep explanation exam-oriented and beginner-friendly
6. If the user's query belongs to a specific subject (OS, DBMS, OOPS, Networks, Maths, Reasoning etc.), clearly mention the subject at the top.
7. If multiple concepts are present, **separate them cleanly** so the user never gets confused.
8. Communicate like a helpful human teacher:
     - Friendly tone
     - Motivating
     - Clear guidance
9. When helpful, use:
     - Steps
     - Tables
     - Comparisons
     - Formula breakdowns
10. If notes are unclear or incomplete, intelligently fill the gaps.
11. Avoid unnecessary text. Keep it meaningful and crisp.
12. Always end with:
     - A short 2–3 line **master summary**
     - Optional quick-check questions if appropriate
13. NEVER use tables. NEVER merge everything into a single block.  
Keep everything clean, spaced, and extremely easy to read.
Now produce the BEST possible explanation.

User Message:
{message}

Related Notes:
{noteText}

Give a structured, topic-wise explanation using:
Topic 1:
- 
-

Topic 2:
-
-

Continue this format until all ideas are covered.
"""
        # Generate response from Gemini model
        response = model.generate_content(prompt)
        reply = response.text if response else "No response"
        # Return the generated reply
        return jsonify({"reply": reply}), 200
    except Exception as e:
        print("ERROR:", e)
        return jsonify({"reply": "Server error"}), 500
# Initialize the Flask app
if __name__ == "__main__":
    # Render requires 0.0.0.0 + PORT env
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
# End of Program (Program by Zidaan)