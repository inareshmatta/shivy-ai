import json
from fastapi import APIRouter, UploadFile, File, Form
from google.genai import types
from services.gemini_client import get_client

router = APIRouter(prefix="/api")
MODEL = "gemini-3-flash-preview"


@router.post("/analyze-page")
async def analyze_page(
    file: UploadFile = File(...),
    subject: str = Form(default="General"),
):
    """Full page analysis: text extraction, key concepts, diagrams, difficulty."""
    client = get_client()
    image_bytes = await file.read()
    mime = file.content_type or "image/jpeg"

    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        thinking_config=types.ThinkingConfig(thinking_budget=0),
    )
    response = client.models.generate_content(
        model=MODEL,
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type=mime),
            f"""This is a page from a {subject} textbook.
Return JSON with these exact keys:
- "full_text": all readable text in reading order (string)
- "key_concepts": list of 3-8 main concepts/terms (array of strings)
- "has_diagram": true/false
- "diagram_description": what the diagram shows (string or null)
- "has_formula": true/false
- "formulas": list of mathematical/chemical formulas (array of strings)
- "page_summary": 2-sentence summary (string)
- "difficulty_level": 1-10 integer""",
        ],
        config=config,
    )
    return json.loads(response.text)


@router.post("/word-bboxes")
async def word_bboxes(
    file: UploadFile = File(...),
):
    """Extract per-word bounding boxes [ymin, xmin, ymax, xmax] normalized 0-1000."""
    client = get_client()
    image_bytes = await file.read()
    mime = file.content_type or "image/jpeg"

    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        thinking_config=types.ThinkingConfig(thinking_budget=0),
    )
    response = client.models.generate_content(
        model=MODEL,
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type=mime),
            """Detect every readable word on this page.
Return a JSON array. Each element must have:
- "word": the exact text (string)
- "box_2d": [ymin, xmin, ymax, xmax] normalized 0-1000 (array of 4 integers)
- "line": line number 1-indexed (integer)
Only include actual text words, skip decorations and borders.""",
        ],
        config=config,
    )
    return json.loads(response.text)


@router.post("/word-definition")
async def word_definition(
    word: str = Form(...),
    context: str = Form(default=""),
    subject: str = Form(default="General"),
    language: str = Form(default="English"),
):
    """
    Dictionary Agent — Enhanced word lookup with Google Search grounding.
    Uses real web sources for definitions, etymology, pronunciation.
    Falls back to model knowledge if search unavailable.
    """
    client = get_client()

    # Use Google Search grounding for accurate, real definitions
    response = client.models.generate_content(
        model=MODEL,
        contents=[
            f"""Word: "{word}"
Subject: {subject}
Language for explanation: {language}
Page context where this word appears: {context[:400]}

You are a dictionary and tutoring agent. Look up this word and return JSON with these exact keys:
- "ipa": IPA pronunciation string (e.g. "/ˌfoʊ.toʊˈsɪn.θə.sɪs/")
- "pronunciation_guide": simple pronunciation guide for students (e.g. "foh-toh-SIN-thuh-sis")
- "etymology": word origin/roots (e.g. "Greek: photo (light) + synthesis (putting together)")
- "general_definition": standard dictionary definition (string)
- "subject_definition": definition specific to {subject} context (string)
- "simple_analogy": explain to a 12-year-old using a relatable everyday analogy (string)
- "usage_in_context": how this word specifically relates to what's on the page (string)
- "example_sentence": one clear example sentence using this word (string)
- "related_terms": list of 4 related terms from same subject (array of strings)
- "difficulty": how advanced this term is, 1-5 integer
- "fun_fact": one interesting/memorable fact about this concept to help remember it (string)"""
        ],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            tools=[{"google_search": {}}],  # Google Search grounding for real definitions
        ),
    )
    return json.loads(response.text)



@router.post("/segment-diagram")
async def segment_diagram(file: UploadFile = File(...)):
    """Segment diagram components. Returns list with label, box_2d, mask, description."""
    client = get_client()
    image_bytes = await file.read()
    mime = file.content_type or "image/jpeg"

    config = types.GenerateContentConfig(
        thinking_config=types.ThinkingConfig(thinking_budget=0),
        response_mime_type="application/json",
    )
    response = client.models.generate_content(
        model=MODEL,
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type=mime),
            """Segment and label each distinct component in this diagram.
Return a JSON array. Each element must have:
- "label": component name (string)
- "box_2d": [y0, x0, y1, x1] normalized 0-1000 (array of 4 integers)
- "mask": base64 PNG probability map — binarize at threshold 127 (string)
- "description": brief description of what this component does (string)""",
        ],
        config=config,
    )
    return json.loads(response.text)
