import base64
import io
from fastapi import APIRouter, Form, UploadFile, File
from google.genai import types
from services.gemini_client import get_client

router = APIRouter(prefix="/api")

# Multi-turn chat sessions for iterative visual refinement
_visual_chats: dict = {}


def _get_chat(session_id: str, quality: str = "fast"):
    """
    quality="fast" → gemini-3.1-flash-image-preview (Nano Banana 2 — recommended default)
    quality="pro"  → gemini-3-pro-image-preview (Nano Banana Pro — 4K, complex)
    quality="speed"→ gemini-2.5-flash-image (Nano Banana — bulk/quick)
    """
    model_map = {
        "fast": "gemini-3.1-flash-image-preview",
        "pro": "gemini-3-pro-image-preview",
        "speed": "gemini-2.5-flash-image",
    }
    key = f"{session_id}_{quality}"
    if key not in _visual_chats:
        client = get_client()
        model = model_map.get(quality, model_map["fast"])

        # image_size only supported for Nano Banana 2 + Pro (NOT gemini-2.5-flash-image)
        if quality == "speed":
            img_cfg = types.ImageConfig(aspect_ratio="16:9")
        else:
            img_cfg = types.ImageConfig(aspect_ratio="16:9", image_size="2K")

        _visual_chats[key] = client.chats.create(
            model=model,
            config=types.GenerateContentConfig(
                response_modalities=["TEXT", "IMAGE"],
                image_config=img_cfg,
                tools=[{"google_search": {}}],
            ),
        )
    return _visual_chats[key]


PROMPTS = {
    "concept_map": lambda topic, detail, subject: f"""
        Create a vibrant, color-coded concept map for {subject} topic: {topic}.
        {detail}
        Style: educational infographic, clean layout, colored rounded boxes with connecting arrows,
        each box has a clear bold label, arrows show relationships with short labels,
        suitable for a high school student. Include a legend. White background. 16:9 format.
    """,
    "flowchart": lambda topic, detail, subject: f"""
        Create a detailed step-by-step flowchart for {subject}: {topic}.
        {detail}
        Style: professional educational flowchart — diamond shapes for decisions,
        rectangles for processes, rounded rectangles for start/end,
        color-code: start=bright green, process=sky blue, decision=golden yellow, end=coral red.
        Include title at top. 16:9 ratio for classroom display.
    """,
    "infographic": lambda topic, detail, subject: f"""
        Create a vibrant infographic explaining "{topic}" in {subject}.
        {detail}
        Style: colorful modern educational poster — bold title, key facts in callout boxes,
        visual metaphors, icons, numbered steps if applicable. White or light background. 16:9.
    """,
    "timeline": lambda topic, detail, subject: f"""
        Create a horizontal timeline infographic for {subject}: {topic}.
        {detail}
        Style: clean modern design, color-coded eras, clear labels and dates,
        icons for each major event, suitable for exam revision. 16:9 ratio.
    """,
    "diagram": lambda topic, detail, subject: f"""
        Create a labeled scientific diagram of {topic} for {subject}.
        {detail}
        Style: textbook-quality illustration — clean line art with colored fill,
        all parts labeled with neat leader lines, scale or legend included, white background. 16:9.
    """,
}


@router.post("/generate-visual")
async def generate_visual(
    visual_type: str = Form(...),
    topic: str = Form(...),
    detail: str = Form(default=""),
    subject: str = Form(default="General"),
    session_id: str = Form(...),
    quality: str = Form(default="fast"),
):
    """
    Generate educational visual using Nano Banana.
    Default quality='fast' → gemini-3.1-flash-image-preview (Nano Banana 2, recommended).
    Supports multi-turn refinement via session_id.
    Google Search grounding for scientifically accurate diagrams.
    """
    chat = _get_chat(session_id, quality)
    prompt_fn = PROMPTS.get(visual_type, PROMPTS["infographic"])
    prompt = prompt_fn(topic, detail, subject)

    response = chat.send_message(prompt)

    for part in response.parts:
        if part.inline_data and part.inline_data.mime_type.startswith("image"):
            return {
                "image_b64": base64.b64encode(part.inline_data.data).decode(),
                "mime_type": part.inline_data.mime_type,
                "alt_text": f"{visual_type}: {topic}",
                "session_id": session_id,
                "model": "gemini-3.1-flash-image-preview" if quality == "fast" else quality,
            }

    return {"error": "No image generated", "text": next((p.text for p in response.parts if p.text), "")}


@router.post("/refine-visual")
async def refine_visual(
    session_id: str = Form(...),
    instruction: str = Form(...),
    quality: str = Form(default="fast"),
):
    """
    Refine the previously generated visual using a voice/text instruction.
    Multi-turn chat remembers previous image — Nano Banana updates it.
    Examples: 'Make arrows bigger', 'Add the Krebs cycle', 'Translate labels to Hindi'.
    """
    chat = _get_chat(session_id, quality)
    response = chat.send_message(instruction)

    for part in response.parts:
        if part.inline_data and part.inline_data.mime_type.startswith("image"):
            return {
                "image_b64": base64.b64encode(part.inline_data.data).decode(),
                "mime_type": part.inline_data.mime_type,
                "session_id": session_id,
            }

    return {"error": "Refinement produced no image", "text": next((p.text for p in response.parts if p.text), "")}


@router.post("/generate-from-page")
async def generate_from_page(
    file: UploadFile = File(...),
    instruction: str = Form(...),
):
    """
    Quick diagram from an uploaded page image using Nano Banana (speed model).
    gemini-2.5-flash-image — best with up to 3 input images, max 1024px output.
    """
    from PIL import Image as PILImage
    client = get_client()
    image_bytes = await file.read()
    page_image = PILImage.open(io.BytesIO(image_bytes))

    response = client.models.generate_content(
        model="gemini-2.5-flash-image",
        contents=[instruction, page_image],
        config=types.GenerateContentConfig(
            response_modalities=["TEXT", "IMAGE"],
            image_config=types.ImageConfig(aspect_ratio="16:9"),
            # Note: image_size NOT supported for gemini-2.5-flash-image
        ),
    )

    for part in response.parts:
        if part.inline_data:
            return {
                "image_b64": base64.b64encode(part.inline_data.data).decode(),
                "mime_type": part.inline_data.mime_type,
            }

    return {"error": "No image generated"}
