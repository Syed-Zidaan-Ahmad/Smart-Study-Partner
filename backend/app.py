# backend/app.py

# Import necessary libraries
from flask import Flask, request, jsonify
from flask_cors import CORS
import google.generativeai as genai
import os
import supabase
from datetime import datetime
# Initialize Flask app and CORS
app = Flask(__name__)
CORS(app)
# Configure Gemini API key
# No need to set the API key as it is set in Render environment variables
GEMINI_KEY = os.getenv("GEMINI_KEY") or os.getenv("GEMINI_API_KEY")  # Your Gemini API key
# Ensure the API key is set
if not GEMINI_KEY:
    raise Exception("❌ Gemini API key missing! Set GEMINI_API_KEY in Render environment")
genai.configure(api_key=GEMINI_KEY)
# Main model initialization
model = genai.GenerativeModel("gemini-2.5-pro")
# SUPABASE: Initialization
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    raise Exception("❌ Supabase credentials missing! Add SUPABASE_URL and SUPABASE_KEY")
supabase_client = supabase.create_client(SUPABASE_URL, SUPABASE_KEY)
# Health check endpoint
@app.route("/")
def home():
    return {"status": "Smart Study Partner backend running"}
# Chat Endpoint
@app.route("/chat/ask", methods=["POST"])
def chat():
    try:
        data = request.get_json()
        message = data.get("message", "")
        noteText = data.get("noteText", "")
        if not message:
            return jsonify({"reply": "Please ask something"}), 200

        # prompt for structured explanation
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
     - NEVER use formatting like | ---- | columns or grids.
     - Keep explanation exam-oriented and beginner-friendly.
6. If the user's query belongs to a specific subject (OS, DBMS, OOPS, CN, Maths, Reasoning), mention the subject at the very top.
7. Separate concepts cleanly so the user never gets confused.
8. Communicate like a helpful teacher (friendly + clear).
9. When helpful, use:
     - Steps
     - Comparisons
     - Formula breakdowns
10. If notes are unclear or incomplete, intelligently fill the gaps.
11. Avoid unnecessary paragraphs.
12. Always end with:
     - A short 2–3 line **master summary**
     - Optional quick-check questions if appropriate
13. NEVER, EVER use tables.
14. Keep spacing clean, readable, and organized.

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

        response = model.generate_content(prompt)
        reply = response.text if response else "No response"

        return jsonify({"reply": reply}), 200

    except Exception as e:
        print("ERROR:", e)
        return jsonify({"reply": "Server error"}), 500
# Quiz Generation Endpoint
@app.route("/chat/quiz", methods=["POST"])
def generate_quiz():
    try:
        data = request.get_json()
        noteText = data.get("noteText", "")

        if not noteText.strip():
            return jsonify({"quiz": "No notes found to generate quiz."}), 200

        quiz_prompt = f"""
You are Smart Study Partner.

Generate a high-quality quiz based ONLY on the notes below.

Notes:
{noteText}

Rules for the quiz:
- Make 5 to 8 conceptual, exam-oriented questions.
- Mix MCQs + Short answer + True/False.
- Each question must be clear and meaningful.
- DO NOT give answers.
- Number the questions properly.
- Do NOT use tables.
- Keep spacing clean, readable, and simple.

Now generate the quiz.
"""

        response = model.generate_content(quiz_prompt)
        quiz = response.text if response else "No quiz generated"

        return jsonify({"quiz": quiz}), 200

    except Exception as e:
        print("QUIZ ERROR:", e)
        return jsonify({"quiz": "Server error during quiz generation"}), 500
# Quiz Answers Endpoint
@app.route("/chat/quiz_answers", methods=["POST"])
def quiz_answers():
    try:
        data = request.get_json()
        noteText = data.get("noteText", "")
        quiz = data.get("quiz", "")

        if not noteText.strip() or not quiz.strip():
            return jsonify({"answers": "Not enough data to generate answers."}), 200

        answers_prompt = f"""
You are Smart Study Partner.

Below is the quiz generated earlier. Now generate ONLY the correct answers.

Notes:
{noteText}

Quiz:
{quiz}

Rules:
- Give only final answers.
- Keep them numbered.
- No explanation.
- No extra sentences.
- No table formatting.
- Clean and simple.

Give the answers now.
"""

        response = model.generate_content(answers_prompt)
        answers = response.text if response else "No answers generated"

        return jsonify({"answers": answers}), 200

    except Exception as e:
        print("QUIZ ANSWERS ERROR:", e)
        return jsonify({"answers": "Server error generating answers"}), 500
# Saving notes to Supabase
@app.route("/notes/save", methods=["POST"])
def save_note():
    try:
        data = request.get_json()
        title = data.get("title", "")
        text = data.get("text", "")

        if not text.strip():
            return jsonify({"status": "Note empty"}), 200

        inserted = supabase_client.table("notes").insert({
            "title": title,
            "content": text,
            "created_at": datetime.utcnow().isoformat()
        }).execute()

        return jsonify({"status": "saved", "data": inserted.data}), 200

    except Exception as e:
        print("SUPABASE SAVE ERROR:", e)
        return jsonify({"status": "error saving note"}), 500
# Getting notes from Supabase
@app.route("/notes/get", methods=["GET"])
def get_notes():
    try:
        data = supabase_client.table("notes").select("*").order("created_at", desc=True).execute()
        return jsonify({"notes": data.data}), 200

    except Exception as e:
        print("SUPABASE GET ERROR:", e)
        return jsonify({"notes": []}), 500
# Deleting notes from Supabase
@app.route("/notes/delete", methods=["POST"])
def delete_note():
    try:
        data = request.get_json()
        note_id = data.get("id")

        supabase_client.table("notes").delete().eq("id", note_id).execute()

        return jsonify({"status": "deleted"}), 200

    except Exception as e:
        print("SUPABASE DELETE ERROR:", e)
        return jsonify({"status": "error deleting note"}), 500
# Initialize the Flask app
if __name__ == "__main__":
    # Render requires 0.0.0.0 + PORT env
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
# End of Program (Program by Zidaan)
