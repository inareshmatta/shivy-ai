"""
Curriculum Planner Router — AI-powered study plan generation
"""
import json
from fastapi import APIRouter
from pydantic import BaseModel
from services.gemini_client import get_client
from google.genai import types

router = APIRouter()


class PlanRequest(BaseModel):
    subjects: str
    days_until_exam: int
    daily_hours: int = 3
    num_books: int = 1


@router.post("/api/curriculum-plan")
async def generate_curriculum_plan(req: PlanRequest):
    """Generate an AI-powered study plan."""
    client = get_client()

    prompt = f"""Create a detailed study plan for a student with these parameters:
- Subjects: {req.subjects}
- Days until exam: {req.days_until_exam}
- Daily study hours: {req.daily_hours}
- Number of textbooks: {req.num_books}

Structure the plan in weekly blocks with 3 phases:
1. 📖 Study Phase (50% of time) — Read and understand chapters
2. 🔄 Revision Phase (30% of time) — Review key concepts
3. 📝 Practice Phase (20% of time) — Mock tests and problems

Return JSON with this structure:
{{
  "total_days": {req.days_until_exam},
  "daily_hours": {req.daily_hours},
  "weeks": [
    {{
      "label": "Week 1",
      "phase": "📖 Study Phase",
      "phaseDesc": "Read and understand all chapters",
      "dateRange": "Mar 3 — Mar 9",
      "tasks": [
        {{
          "id": "0-0-0",
          "subject": "Mathematics",
          "task": "Study Algebra basics - equations and inequalities",
          "hours": 1.5,
          "done": false,
          "color": "#6C8EF2"
        }}
      ]
    }}
  ],
  "tips": ["Tip 1", "Tip 2", "Tip 3", "Tip 4"]
}}

Make the tasks specific and actionable. Include 4 personalized study tips."""

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash-preview-05-20",
            contents=[prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )
        plan = json.loads(response.text)
        plan["exam_date"] = ""  # Frontend will set this
        return plan
    except Exception as e:
        return {"error": str(e)}
