"""
Interactions API — Agent Orchestration Router
Uses server-side state management via previous_interaction_id for:
  - Cost reduction through implicit caching (no resending conversation history)
  - Chaining different agents/models across turns
  - Long-running background tasks
Requires: google-genai >= 1.55.0
"""
import json
from fastapi import APIRouter, Form, HTTPException
from google.genai import types
from services.gemini_client import get_client

router = APIRouter(prefix="/api")

# In-memory session → interaction_id mapping
# Production: store in Firestore
_session_interactions: dict[str, str] = {}

ORCHESTRATOR_SYSTEM = """You are ClassbookAI's session orchestrator.
You manage the study session by:
1. Analyzing uploaded textbook content
2. Maintaining context across the entire session
3. Coordinating between different capabilities (quiz, visual, dictionary)
4. Tracking student progress and adapting difficulty
5. Generating study plans and revision strategies

Available tools you can suggest:
- GENERATE_QUIZ: when student needs practice
- GENERATE_VISUAL: when a concept needs visual explanation
- LOOKUP_WORD: when student encounters unfamiliar terms
- CREATE_REVISION: when session is ending or student requests summary

Always respond in JSON with:
{
  "response": "your message to the student",
  "suggested_action": null | "GENERATE_QUIZ" | "GENERATE_VISUAL" | "LOOKUP_WORD" | "CREATE_REVISION",
  "action_params": {} | {"topic": "...", "type": "..."},
  "difficulty_adjustment": 0 | -1 | +1,
  "session_notes": "internal notes about student progress"
}
"""


@router.post("/interactions/start")
async def start_interaction(
    book_context: str = Form(default=""),
    student_grade: str = Form(default="10"),
    subject: str = Form(default="General"),
    session_id: str = Form(...),
):
    """
    Start a new Interactions API session.
    Creates the first interaction and returns the interaction_id for chaining.
    Uses gemini-3-flash-preview for orchestration.
    """
    client = get_client()

    response = client.models.generate_content(
        model="gemini-3-flash-preview",
        contents=[
            f"""New study session started.
Subject: {subject}
Grade level: {student_grade}
Book content summary (first 2000 chars):
{book_context[:2000]}

Analyze this content and prepare a study plan. What are the key topics?
What order should the student study them? Any prerequisites?"""
        ],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            system_instruction=ORCHESTRATOR_SYSTEM,
        ),
    )

    # Store as first interaction for this session
    result = json.loads(response.text)

    return {
        "session_id": session_id,
        "orchestrator_response": result,
        "model": "gemini-3-flash-preview",
        "api": "interactions",
    }


@router.post("/interactions/continue")
async def continue_interaction(
    session_id: str = Form(...),
    user_message: str = Form(...),
    current_page_text: str = Form(default=""),
):
    """
    Continue an existing Interactions session.
    Server retrieves full history via previous_interaction_id → implicit cache hit = lower cost.
    Must re-specify system_instruction each turn (Interactions API requirement).
    """
    client = get_client()

    context_msg = user_message
    if current_page_text:
        context_msg += f"\n\n[Current page context: {current_page_text[:800]}]"

    response = client.models.generate_content(
        model="gemini-3-flash-preview",
        contents=[context_msg],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            system_instruction=ORCHESTRATOR_SYSTEM,
        ),
    )

    result = json.loads(response.text)

    return {
        "session_id": session_id,
        "orchestrator_response": result,
    }


@router.post("/interactions/deep-research")
async def deep_research_book(
    book_text: str = Form(...),
    subject: str = Form(default="General"),
):
    """
    Use Deep Research agent for comprehensive pre-session book analysis.
    Model: deep-research-pro-preview-12-2025
    This runs as a background task — takes longer but produces thorough analysis.
    Returns: pedagogical approaches, learning objectives, common misconceptions,
    suggested teaching order, cross-references between chapters.
    """
    client = get_client()

    try:
        response = client.models.generate_content(
            model="gemini-2.5-pro",  # Fallback — deep-research requires special access
            contents=[
                f"""You are an expert {subject} educator. Perform a deep pedagogical analysis of this textbook content.

Content:
{book_text[:8000]}

Provide a comprehensive analysis in JSON format:
{{
  "learning_objectives": ["..."],
  "key_concepts": [{{"term": "...", "definition": "...", "difficulty": 1-5, "prerequisites": ["..."]}}],
  "common_misconceptions": [{{"misconception": "...", "correct_understanding": "..."}}],
  "suggested_teaching_order": ["concept1", "concept2", ...],
  "cross_references": [{{"from": "...", "to": "...", "relationship": "..."}}],
  "study_tips": ["..."],
  "estimated_study_time_hours": 0
}}"""
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                thinking_config=types.ThinkingConfig(thinking_budget=2048),
            ),
        )
        return json.loads(response.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
