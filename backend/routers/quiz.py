"""
Quiz Router — Multi-format assessment generation with Gemini structured output.
Supports: MCQ, Fill-in-blank, True/False, Match the Following, Short Answer
Includes difficulty scaling and topic-based generation.
"""
import json
from fastapi import APIRouter, Form
from google.genai import types
from services.gemini_client import get_client

router = APIRouter(prefix="/api")
MODEL = "gemini-3-flash-preview"


@router.post("/generate-quiz")
async def generate_quiz(
    page_text: str = Form(...),
    quiz_type: str = Form(default="mcq"),   # Comma-separated: mcq,fill_blank,match_following
    difficulty: int = Form(default=3),
    num_questions: int = Form(default=5),
    subject: str = Form(default="General"),
    topic: str = Form(default=""),
    source_scope: str = Form(default="current_page"),
):
    """
    Generate multi-format assessment questions using Gemini structured output.
    The question types can be mixed in a single assessment.
    """
    client = get_client()
    types_list = [t.strip() for t in quiz_type.split(',')]
    topic_str = topic if topic else "the content provided"

    prompt = f"""You are an expert {subject} assessment creator.
Based on the following content, generate exactly {num_questions} questions about {topic_str}.
Difficulty level: {difficulty}/5 (1=beginner, 5=expert).

Content to base questions on:
{page_text[:4000]}

Question types requested: {', '.join(types_list)}
Distribute the questions across the requested types roughly equally.

Return a JSON object with this exact structure:
{{
  "questions": [
    {{
      "id": 0,
      "type": "mcq",
      "question": "...",
      "options": ["A", "B", "C", "D"],
      "correct_index": 0,
      "explanation": "Why this is correct...",
      "topic": "specific topic",
      "difficulty": 1-5
    }},
    {{
      "id": 1,
      "type": "fill_blank",
      "question": "The process of ____________ converts light to energy.",
      "correct_answer": "photosynthesis",
      "explanation": "...",
      "topic": "...",
      "difficulty": 1-5
    }},
    {{
      "id": 2,
      "type": "true_false",
      "question": "Statement to evaluate...",
      "options": ["True", "False"],
      "correct_index": 0 or 1,
      "explanation": "...",
      "topic": "...",
      "difficulty": 1-5
    }},
    {{
      "id": 3,
      "type": "match_following",
      "question": "Match each term with its definition:",
      "pairs": [
        {{"left": "Term1", "right": "Definition1"}},
        {{"left": "Term2", "right": "Definition2"}},
        {{"left": "Term3", "right": "Definition3"}},
        {{"left": "Term4", "right": "Definition4"}}
      ],
      "topic": "...",
      "difficulty": 1-5
    }},
    {{
      "id": 4,
      "type": "short_answer",
      "question": "Explain in 2-3 sentences...",
      "model_answer": "The expected answer...",
      "topic": "...",
      "difficulty": 1-5
    }}
  ],
  "assessment_summary": {{
    "total_questions": {num_questions},
    "topics_covered": ["topic1", "topic2"],
    "estimated_time_minutes": 10,
    "difficulty_label": "Intermediate"
  }}
}}

Important rules:
- Every question MUST have a unique integer id starting from 0
- MCQ must have exactly 4 options
- Fill blank must have a single clear correct_answer
- Match the following must have exactly 4 pairs
- Short answer must have a model_answer for grading
- Explanations should be educational and helpful
- Questions should test understanding, not just memory
"""

    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        thinking_config=types.ThinkingConfig(thinking_budget=1024),
    )

    response = client.models.generate_content(
        model=MODEL,
        contents=[prompt],
        config=config,
    )

    return json.loads(response.text)


@router.post("/grade-short-answer")
async def grade_short_answer(
    question: str = Form(...),
    student_answer: str = Form(...),
    model_answer: str = Form(...),
    subject: str = Form(default="General"),
):
    """
    Grade a short-answer response using Gemini.
    Returns score (0-10), feedback, and suggestions.
    """
    client = get_client()

    response = client.models.generate_content(
        model=MODEL,
        contents=[
            f"""Grade this student's answer for a {subject} question.

Question: {question}
Model answer: {model_answer}
Student's answer: {student_answer}

Return JSON with:
- "score": integer 0-10
- "feedback": specific constructive feedback (string)
- "missing_points": what key points were missed (array of strings)
- "strengths": what the student got right (array of strings)
- "grade": letter grade A+/A/B/C/D/F
- "suggestion": how to improve (string)"""
        ],
        config=types.GenerateContentConfig(response_mime_type="application/json"),
    )

    return json.loads(response.text)
