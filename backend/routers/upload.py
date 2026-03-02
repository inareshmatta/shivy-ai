import os
import json
import tempfile
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from services.gemini_client import get_client
from google.genai import types

router = APIRouter(prefix="/api")


@router.post("/upload-book")
async def upload_book(
    file: UploadFile = File(...),
    book_title: str = Form(...),
    user_id: str = Form(default="anonymous"),
):
    """
    Upload PDF/image to Gemini Files API.
    Files persist 48 hours. Returns file URI for session reuse.
    """
    client = get_client()
    file_bytes = await file.read()
    mime = file.content_type or "application/pdf"

    with tempfile.NamedTemporaryFile(delete=False, suffix=_ext(mime)) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        uploaded = client.files.upload(
            file=tmp_path,
            config={"mime_type": mime, "display_name": book_title},
        )
        return {
            "file_uri": uploaded.uri,
            "file_name": uploaded.name,
            "mime_type": mime,
            "title": book_title,
        }
    finally:
        os.unlink(tmp_path)


@router.post("/analyze-book-structure")
async def analyze_book_structure(
    file_uri: str = Form(...),
    mime_type: str = Form(default="application/pdf"),
):
    """
    Analyze full book using Files API URI (no re-upload).
    Returns chapter list, difficulty curve, prerequisite map.
    """
    client = get_client()

    response = client.models.generate_content(
        model="gemini-3-flash-preview",
        contents=[
            {"file_data": {"file_uri": file_uri, "mime_type": mime_type}},
            """Analyze this textbook and return JSON with these exact keys:
- "chapters": array of {"title": string, "start_page": int, "end_page": int, "key_topics": [string]}
- "subject": detected subject (string)
- "grade_level": estimated grade level (string)
- "total_pages": integer
- "prerequisite_map": object mapping chapter titles to list of prerequisite chapter titles
- "difficulty_curve": array of 1-10 integers, one per chapter""",
        ],
        config=types.GenerateContentConfig(response_mime_type="application/json"),
    )

    return json.loads(response.text)


def _ext(mime: str) -> str:
    return {
        "application/pdf": ".pdf",
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/heic": ".heic",
        "image/heif": ".heif",
    }.get(mime, ".bin")
