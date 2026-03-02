import os
import asyncio
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv

load_dotenv()

from routers import live_session, vision, visual_gen, upload, quiz, bookmarks, ephemeral_token, interactions, curriculum

app = FastAPI(title="KlassroomAI Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173,*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(live_session.router)
app.include_router(vision.router)
app.include_router(visual_gen.router)
app.include_router(upload.router)
app.include_router(quiz.router)
app.include_router(bookmarks.router)
app.include_router(ephemeral_token.router)
app.include_router(interactions.router)
app.include_router(curriculum.router)

@app.get("/health")
async def health():
    return {"status": "ok", "service": "KlassroomAI"}

# Serve the built React frontend from /static
STATIC_DIR = Path(__file__).parent / "static"
if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Catch-all: serve the React SPA index.html for any non-API route."""
        file_path = STATIC_DIR / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(STATIC_DIR / "index.html")

