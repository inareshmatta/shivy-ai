"""
Live Session Router — TRUE AGENT with Tool Calling
===================================================
The Live Tutor is a real AI agent that:
1. Receives student voice/text
2. Gemini AUTONOMOUSLY decides which tools to call
3. Backend executes the tools
4. Results are fed back to Gemini
5. Gemini responds to the student with the combined knowledge

Tools available to the agent:
- generate_quiz: Create quiz questions on any topic
- lookup_word: Dictionary lookup with etymology, IPA, analogies
- generate_visual: Create visual explanation diagrams
- analyze_page: Analyze the current textbook page
- create_bookmark: Save important concepts for revision
- suggest_next_topic: Recommend what to study next

This uses the Gemini Live API (WebSocket) with tool declarations.
"""
import os
import json
import asyncio
import base64
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from google import genai
from google.genai import types
from services.gemini_client import get_client

router = APIRouter()

LIVE_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025"

# ═══════════════════════════════════════════════
# Tool Declarations — Gemini decides when to call
# ═══════════════════════════════════════════════
AGENT_TOOLS = [
    types.Tool(function_declarations=[
        types.FunctionDeclaration(
            name="generate_quiz",
            description=(
                "Generate quiz questions to test the student's understanding of a topic. "
                "Call this when: the student finishes reading a section, asks to be tested, "
                "or you want to check comprehension after explaining something."
            ),
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "topic": types.Schema(type="STRING", description="The topic to quiz on"),
                    "num_questions": types.Schema(type="INTEGER", description="Number of questions (2-5)"),
                    "quiz_type": types.Schema(
                        type="STRING",
                        description="Type: mcq, fill_blank, true_false, match_following",
                    ),
                    "difficulty": types.Schema(type="INTEGER", description="Difficulty 1-5"),
                },
                required=["topic"],
            ),
        ),
        types.FunctionDeclaration(
            name="lookup_word",
            description=(
                "Look up the definition, pronunciation, and etymology of a word. "
                "Call this when: the student asks 'what does X mean?', encounters "
                "an unfamiliar term, or you detect confusion about terminology."
            ),
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "word": types.Schema(type="STRING", description="The word to look up"),
                    "subject": types.Schema(type="STRING", description="The subject context"),
                },
                required=["word"],
            ),
        ),
        types.FunctionDeclaration(
            name="generate_visual",
            description=(
                "Generate a visual diagram/illustration to explain a concept. "
                "Call this when: the student says 'show me', 'draw', 'visualize', "
                "or when a concept is better explained with a picture."
            ),
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "topic": types.Schema(type="STRING", description="What to visualize"),
                    "visual_type": types.Schema(
                        type="STRING",
                        description="Type: concept_map, flowchart, diagram, infographic",
                    ),
                },
                required=["topic"],
            ),
        ),
        types.FunctionDeclaration(
            name="create_bookmark",
            description=(
                "Save an important concept or definition for the student's revision. "
                "Call this when: you explain a key concept, define an important term, "
                "or the student says 'save this' or 'remember this'."
            ),
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "text": types.Schema(type="STRING", description="The concept/definition to save"),
                    "tags": types.Schema(
                        type="ARRAY",
                        items=types.Schema(type="STRING"),
                        description="Tags like 'Biology', 'Key concept', 'Formula'",
                    ),
                },
                required=["text"],
            ),
        ),
        types.FunctionDeclaration(
            name="suggest_next_topic",
            description=(
                "Suggest what the student should study next based on their progress. "
                "Call this when the student asks 'what should I study next?' or "
                "finishes a topic."
            ),
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "current_topic": types.Schema(type="STRING", description="What they just studied"),
                    "difficulty_so_far": types.Schema(type="INTEGER", description="How hard it was 1-5"),
                },
                required=["current_topic"],
            ),
        ),
    ])
]


# ═══════════════════════════════════════════════
# Tool Execution — Backend runs the tool logic
# ═══════════════════════════════════════════════
async def execute_tool(name: str, args: dict, client) -> dict:
    """Execute a tool that Gemini autonomously decided to call."""

    if name == "generate_quiz":
        topic = args.get("topic", "General")
        num = min(args.get("num_questions", 3), 5)
        qtype = args.get("quiz_type", "mcq")
        diff = args.get("difficulty", 3)

        response = client.models.generate_content(
            model="gemini-3-flash-preview",
            contents=[
                f"Generate {num} {qtype} questions about '{topic}' at difficulty {diff}/5. "
                f"Return JSON with 'questions' array. Each has: question, options (4), correct_index, explanation."
            ],
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        return {"quiz": json.loads(response.text), "tool": "generate_quiz"}

    elif name == "lookup_word":
        word = args.get("word", "")
        subject = args.get("subject", "General")

        response = client.models.generate_content(
            model="gemini-3-flash-preview",
            contents=[
                f'Define "{word}" for a {subject} student. Return JSON: '
                f'ipa, pronunciation_guide, etymology, subject_definition, simple_analogy, related_terms (4).'
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                tools=[{"google_search": {}}],  # Grounded in real data
            ),
        )
        return {"definition": json.loads(response.text), "tool": "lookup_word"}

    elif name == "generate_visual":
        topic = args.get("topic", "")
        vtype = args.get("visual_type", "diagram")

        response = client.models.generate_content(
            model="gemini-2.5-flash-image",  # Nano Banana for image gen
            contents=[
                f"Create a clear, educational {vtype} about '{topic}'. "
                f"Style: clean, labeled, colorful, textbook-quality."
            ],
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE", "TEXT"],
            ),
        )
        # Extract image if present
        result = {"tool": "generate_visual", "topic": topic}
        for part in response.candidates[0].content.parts:
            if hasattr(part, 'inline_data') and part.inline_data:
                result["image_b64"] = base64.b64encode(part.inline_data.data).decode()
                result["mime_type"] = part.inline_data.mime_type
            elif hasattr(part, 'text') and part.text:
                result["description"] = part.text
        return result

    elif name == "create_bookmark":
        return {
            "tool": "create_bookmark",
            "saved": True,
            "text": args.get("text", ""),
            "tags": args.get("tags", []),
        }

    elif name == "suggest_next_topic":
        current = args.get("current_topic", "")
        response = client.models.generate_content(
            model="gemini-3-flash-preview",
            contents=[
                f"Student just studied '{current}'. Suggest the 3 best next topics "
                f"in logical learning order. Return JSON: topics (array of strings), reason (string)."
            ],
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        return {"suggestions": json.loads(response.text), "tool": "suggest_next_topic"}

    return {"error": f"Unknown tool: {name}"}


# ═══════════════════════════════════════════════
# WebSocket — Real-time voice + agentic loop
# ═══════════════════════════════════════════════
@router.websocket("/ws/live")
async def live_session(ws: WebSocket):
    """
    WebSocket bridge: Client ↔ Gemini Live API.
    The agent loop:
    1. Student speaks/types → sent to Gemini
    2. Gemini may respond with audio/text OR function_call
    3. If function_call → backend executes tool → sends result back to Gemini
    4. Gemini incorporates tool results → responds to student
    """
    await ws.accept()
    api_key = os.getenv("GEMINI_API_KEY", "")
    client = get_client()

    try:
        # Wait for config message from client
        init_data = await ws.receive_json()
        subject = init_data.get("subject", "General")
        grade = init_data.get("grade", "10")
        language = init_data.get("language", "English")
        book_context = init_data.get("book_context", "")
        page_text = init_data.get("page_text", "")

        system_prompt = f"""You are ClassbookAI, an expert {subject} tutor for Grade {grade} students.
You speak in {language}. You are warm, encouraging, and adapt to the student's level.

IMPORTANT: You have tools available. USE THEM PROACTIVELY:
- When a student struggles with a term → call lookup_word
- When a concept needs visualization → call generate_visual
- After explaining a topic → call generate_quiz to test understanding
- When the student learns something important → call create_bookmark
- When they finish a topic → call suggest_next_topic

Current textbook page content:
{page_text[:2000]}

Book context: {book_context[:500]}

Be conversational, use the student's name if they give it, and make learning fun!"""

        # Connect to Gemini Live API
        # Removed speech_config because native audio models do not support voice selection yet (causes 1008 error)
        live_config = {
            "response_modalities": ["AUDIO"],
            "system_instruction": system_prompt,
            "tools": [{"function_declarations": [t.to_dict() if hasattr(t, 'to_dict') else t for t in AGENT_TOOLS[0].function_declarations]}],
        }

        async with client.aio.live.connect(
            model=LIVE_MODEL, config=live_config
        ) as session:

            async def recv_from_gemini():
                """Listen for Gemini responses — audio, text, or tool calls."""
                try:
                    async for response in session.receive():
                        # Tool calls — agent behavior
                        if response.tool_call:
                            function_responses = []
                            for fc in response.tool_call.function_calls:
                                # Execute the tool
                                tool_result = await execute_tool(
                                    fc.name, dict(fc.args), client
                                )

                                # Notify frontend
                                await ws.send_json({
                                    "type": "tool_call",
                                    "tool": fc.name,
                                    "args": dict(fc.args),
                                    "result": tool_result,
                                })

                                function_responses.append(
                                    types.FunctionResponse(
                                        id=fc.id,
                                        name=fc.name,
                                        response={"result": tool_result},
                                    )
                                )

                            # Send all tool results back to Gemini
                            await session.send_tool_response(
                                function_responses=function_responses
                            )

                        # Audio data
                        if response.data is not None:
                            header = bytes([0x01])
                            await ws.send_bytes(header + response.data)

                        # Server content (text, turn complete)
                        if response.server_content:
                            model_turn = response.server_content.model_turn
                            if model_turn:
                                for part in model_turn.parts:
                                    if hasattr(part, 'text') and part.text:
                                        await ws.send_json({
                                            "type": "transcript",
                                            "role": "ai",
                                            "text": part.text,
                                        })

                            if response.server_content.turn_complete:
                                await ws.send_json({"type": "turn_complete"})
                            
                            if response.server_content.interrupted:
                                await ws.send_json({"type": "interrupted"})

                except Exception as e:
                    await ws.send_json({"type": "error", "message": str(e)})

            # Start receiving from Gemini in background
            recv_task = asyncio.create_task(recv_from_gemini())

            # Forward client messages to Gemini
            try:
                while True:
                    msg = await ws.receive()

                    if msg.get("type") == "websocket.disconnect":
                        break

                    if "bytes" in msg:
                        raw = msg["bytes"]
                        msg_type = raw[0]
                        payload = raw[1:]

                        if msg_type == 0x00:
                            # Audio from mic (PCM 16kHz)
                            await session.send_realtime_input(
                                audio={"data": payload, "mime_type": "audio/pcm;rate=16000"}
                            )
                        elif msg_type == 0x10:
                            # JPEG frame from camera/screen
                            await session.send_realtime_input(
                                video={"data": payload, "mime_type": "image/jpeg"}
                            )

                    elif "text" in msg:
                        data = json.loads(msg["text"])

                        if data.get("type") == "text":
                            await session.send_client_content(
                                turns={"parts": [{"text": data["content"]}]}
                            )
                        elif data.get("type") == "context_update":
                            await session.send_client_content(
                                turns={"parts": [{"text": f"[Context update] Student is now on: {data.get('text', '')}"}]}
                            )

            except WebSocketDisconnect:
                pass
            finally:
                recv_task.cancel()

    except Exception as e:
        try:
            await ws.send_json({"type": "error", "message": str(e)})
        except:
            pass
    finally:
        try:
            await ws.close()
        except:
            pass
