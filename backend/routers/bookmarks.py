"""
Bookmarks Router — Semantic search, embedding, and revision sheet generation.
Uses in-memory storage. Real API calls with Gemini embeddings and generation.
"""
import json
from fastapi import APIRouter, Form
from services.gemini_client import get_client

router = APIRouter(prefix="/api")

# In-memory bookmark storage (per-session — swap for a DB in production)
_bookmarks = []


@router.post("/bookmarks/save")
async def save_bookmark(
    text: str = Form(...),
    page: str = Form(default="—"),
    tags: str = Form(default="[]"),
):
    """Save a bookmark and generate its embedding for semantic search."""
    client = get_client()

    # Generate embedding
    result = client.models.embed_content(
        model="text-embedding-004",
        contents=[text],
    )
    embedding = result.embeddings[0].values

    bookmark = {
        "id": len(_bookmarks),
        "text": text,
        "page": page,
        "tags": json.loads(tags) if isinstance(tags, str) else tags,
        "embedding": embedding,
    }
    _bookmarks.append(bookmark)
    return {"saved": True, "bookmark": {k: v for k, v in bookmark.items() if k != "embedding"}}


@router.post("/bookmarks/search")
async def semantic_search(query: str = Form(...), limit: int = Form(default=10)):
    """Semantic search over saved bookmarks using cosine similarity."""
    if not _bookmarks:
        return {"results": []}

    client = get_client()
    result = client.models.embed_content(model="text-embedding-004", contents=[query])
    q_emb = result.embeddings[0].values

    # Cosine similarity
    def cosine_sim(a, b):
        dot = sum(x * y for x, y in zip(a, b))
        mag_a = sum(x * x for x in a) ** 0.5
        mag_b = sum(x * x for x in b) ** 0.5
        return dot / (mag_a * mag_b) if mag_a and mag_b else 0

    scored = [
        {**{k: v for k, v in bm.items() if k != "embedding"}, "score": cosine_sim(q_emb, bm["embedding"])}
        for bm in _bookmarks
    ]
    scored.sort(key=lambda x: x["score"], reverse=True)
    return {"results": scored[:limit]}


@router.post("/revision-sheet")
async def generate_revision_sheet(
    bookmarks: str = Form(...),
    subject: str = Form(default="General"),
):
    """Generate a revision sheet from saved bookmarks using Gemini."""
    client = get_client()
    response = client.models.generate_content(
        model="gemini-3-flash-preview",
        contents=[
            f"""You are a study assistant. Create a concise revision sheet from these saved highlights.

Subject: {subject}
Saved highlights:
{bookmarks[:4000]}

Format the revision sheet as:
1. KEY CONCEPTS (bullet points)
2. IMPORTANT DEFINITIONS (term: definition format)
3. FORMULAS OR RULES (if any)
4. EXAM TIPS (2-3 key tips based on the material)
5. QUESTIONS TO REVIEW (3-5 self-test questions)

Keep it concise and easy to scan before an exam."""
        ],
    )
    return {"sheet": response.text}
