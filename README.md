<div align="center">
  <img src="./architecture.png" alt="KlassroomAI" width="700"/>
  
  # 🎓 KlassroomAI
  
  **Transform static textbooks into interactive, multimodal AI learning environments.**

  [![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
  [![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
  [![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
  [![Vite](https://img.shields.io/badge/Vite-7-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev)
  [![Gemini](https://img.shields.io/badge/Google_Gemini-886FBF?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev)
  [![Cloud Run](https://img.shields.io/badge/Cloud_Run-4285F4?style=for-the-badge&logo=googlecloud&logoColor=white)](https://cloud.google.com/run)
  [![WebSockets](https://img.shields.io/badge/WebSockets-010101?style=for-the-badge&logo=socketdotio&logoColor=white)]()
  [![PDF.js](https://img.shields.io/badge/PDF.js-FF6600?style=for-the-badge&logo=mozilla&logoColor=white)](https://mozilla.github.io/pdf.js/)
  [![Framer Motion](https://img.shields.io/badge/Framer_Motion-0055FF?style=for-the-badge&logo=framer&logoColor=white)](https://www.framer.com/motion/)
  [![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://docker.com)

  <br/>

  [🌐 Live Demo](https://klassroom-api-vav7hon2rq-uc.a.run.app) · [📖 Docs](#how-we-built-it) · [🚀 Quick Start](#-spin-up-instructions)

</div>

---

## Inspiration

Modern education relies heavily on static PDFs, textbooks, and one-way lectures. When a student doesn't understand a concept, they are forced to **leave their study material** — to search Google, watch a YouTube video, or use a generic ChatGPT interface. This breaks focus and strips away the direct context of what they were studying.

We were inspired to solve this by bringing a **proactive, multimodal AI agent directly into the textbook**. Instead of the student asking the AI questions in a separate chatbox, the AI:
- **Watches** the student study (sees the exact PDF page)
- **Listens** to their voice in real-time
- **Sees** the diagrams and charts they are looking at
- **Speaks back** with low-latency, natural voice tutoring

---

## What it does

KlassroomAI takes any uploaded textbook (PDF) and wraps it in a multimodal orchestration layer, transforming static studying into an interactive, AI-guided experience.

### 🎙️ Real-time Spoken Tutor (Zero-Latency Voice)
At its core, KlassroomAI features a **voice-first proactive tutor** powered by the **Gemini 2.5 Flash Native Audio** API.

| Feature | How it works |
|---|---|
| **Natural Conversation** | Students speak naturally; the AI responds in a warm, human-like voice with <500ms latency |
| **True Barge-in** | Binary PCM audio streams via WebSockets allow instant interruption — say "Wait, explain that again" mid-sentence |
| **Contextual Awareness** | The tutor reads the current PDF page text, analyzes visible diagrams, and adapts its teaching in real-time |
| **Precise Audio Scheduling** | Uses `AudioContext.currentTime` scheduling instead of event-loop queues to eliminate stuttering and lag |

### 🤖 Autonomous Agentic Behaviors
The AI tutor isn't just a chatbot — it acts as an **autonomous orchestration agent** that decides when to use its tools:

| Tool | Trigger | What Happens |
|---|---|---|
| `generate_quiz` | After explaining a topic | A quiz panel slides out with MCQs, True/False, and Fill-in-the-Blank questions |
| `lookup_word` | Student encounters an unfamiliar term | Google Search-grounded dictionary with IPA pronunciation, etymology, and contextual definition |
| `suggest_next_topic` | Student finishes a concept | AI guides them to the next logical topic based on curriculum and prerequisites |
| `create_bookmark` | Student highlights important text | Content is saved to the Knowledge Vault for revision |

### 🖼️ Visual Explainer (Nano Banana 2)
Some concepts are impossible to understand through text or voice alone.

- If a student says *"I'm confused about the Krebs Cycle"*, the orchestration agent triggers the **Visual Explainer**
- The UI seamlessly slides out a panel that generates an **infographic, flowchart, or concept map** on the fly
- These visuals are **grounded by Google Search** results, ensuring factual accuracy over hallucination
- The student can iteratively **refine** the visual: *"Make it simpler"* or *"Add more detail about ATP"*

### 👁️ Native PDF Pixel Interactivity & Vision
We discarded the traditional "upload PDF and chat" paradigm in favor of **deep DOM integration**:

- **Clickable Words**: By rendering a precise HTML `TextLayer` over the PDF Canvas using `pdf.js`, every single word in the book becomes interactive
- **Click → Dictionary**: Instant lookup with IPA pronunciation, etymology, subject-specific and general definitions
- **Highlight → Bookmark**: Select a sentence to save it to the **Knowledge Vault** for revision sheets
- **🔖 Save to Vault**: From the dictionary tooltip, one click saves the word and definition
- **🎨 Visualize**: From the dictionary tooltip, one click opens the Visual Explainer pre-filled with that concept
- **👁️ Explain Page & Diagrams**: A single button extracts a **pixel-perfect Base64 snapshot** of the current page's canvas (capturing complex charts, graphs, and images) and sends it directly to the **Gemini Vision model**. The voice tutor then verbally explains the specific diagram

### 📅 Predictive AI Curriculum Planner
Students input their exam date and available daily study hours:

- The system analyzes the length and complexity of the uploaded textbook
- The AI dynamically generates a **personalized, week-by-week study schedule**
- Three distinct pedagogical phases: **📖 Study** → **🔄 Revision** → **📝 Practice Tests**
- **Progress tracking** with checkable tasks and a visual progress bar
- **Reset timeline** capability if the student falls behind

---

## How we built it

Our system is a decoupled **React Frontend** and **FastAPI Python Backend**, orchestrated via WebSockets for real-time streaming to the Gemini API. The full stack is deployed to **Google Cloud Run**.

### System Architecture

```mermaid
graph TD
    subgraph Client["🖥️ React / Vite Frontend"]
        UI["KlassroomAI UI"]
        PDF["PDF.js TextLayer"]
        WA["WebAudio API"]
        MIC["Mic Audio Stream"]
    end

    subgraph Server["⚙️ FastAPI Backend - Cloud Run"]
        WS["WebSocket Router"]
        VIS["Vision API"]
        PLAN["Curriculum Route"]
        AGT["Interactions Agent"]
    end

    subgraph Google["☁️ Google Cloud / Gemini"]
        LIVE["Gemini 2.5 Flash Native Audio"]
        GVIS["Gemini 2.5 Pro Vision"]
        SEARCH["Google Search Grounding"]
    end

    UI <-->|"WebSocket: PCM Audio + JSON"| WS
    UI -->|"REST POST"| VIS
    UI -->|"REST POST"| PLAN
    WS <-->|"LiveConnect Stream"| LIVE
    VIS --> GVIS
    AGT --> GVIS
    LIVE <--> SEARCH
```

### Data Flow: Voice Tutor Session

```mermaid
sequenceDiagram
    participant S as Student
    participant F as Frontend
    participant B as Backend
    participant G as Gemini Native Audio

    S->>F: Clicks "Start Tutor"
    F->>B: WebSocket Connect
    B->>G: LiveConnect Session
    G-->>B: Session Ready
    B-->>F: Connected

    loop Real-time Audio Loop
        S->>F: Speaks into Mic
        F->>B: Binary PCM Audio (16kHz)
        B->>G: send_realtime_input
        G-->>B: Audio Response Chunks
        B-->>F: Binary PCM Audio (24kHz)
        F->>S: Plays via WebAudio Scheduler
    end

    Note over G: Agent detects topic complete
    G->>B: Tool Call: generate_quiz
    B-->>F: Quiz Data JSON
    F->>S: Quiz Panel Slides Out
```

### Folder Structure

```
KlassroomAI/
├── 📁 frontend/                    # React + Vite SPA
│   ├── src/
│   │   ├── App.jsx                 # State orchestration hub
│   │   ├── index.css               # Design system tokens
│   │   └── components/
│   │       ├── CenterCanvas/       # PDF renderer, word tooltips, AI orb
│   │       ├── LeftPanel/          # Voice controls, book library, upload
│   │       ├── RightPanel/         # Knowledge vault, quiz engine
│   │       ├── VisualPanel/        # AI visual explainer overlay
│   │       ├── AssessmentPanel/    # Full assessment overlay
│   │       └── CurriculumPlanner/  # Study schedule generator
│   └── vite.config.js              # Dev proxy to backend
│
├── 📁 backend/                     # FastAPI Python server
│   ├── main.py                     # App entry + SPA serving
│   ├── Dockerfile                  # Cloud Run container
│   ├── requirements.txt
│   ├── services/
│   │   └── gemini_client.py        # Shared Gemini client
│   └── routers/
│       ├── live_session.py         # WebSocket ↔ Gemini Native Audio
│       ├── interactions.py         # Gemini 3 orchestrator agent
│       ├── vision.py               # Page analysis + dictionary
│       ├── visual_gen.py           # Image generation
│       ├── quiz.py                 # Quiz generation
│       ├── curriculum.py           # Study plan generation
│       ├── upload.py               # PDF upload handling
│       └── bookmarks.py            # Knowledge vault persistence
│
├── cloudbuild.yaml                 # GCP Infrastructure-as-Code
├── start.bat                       # One-click local launcher
└── architecture.png                # System architecture diagram
```

---

## Challenges we ran into

| Challenge | Root Cause | Our Solution |
|---|---|---|
| **20-30s audio lag** | Recursive `onended` event-loop queuing on the main thread | Refactored to precise `AudioContext.currentTime` scheduling on the audio thread |
| **1008 Policy Violation** | `speech_config` block unsupported by Native Audio preview models | Stripped config to minimal dict matching official Gemini Live API docs |
| **PDF text misalignment** | Custom bounding-box detection was slow and inaccurate | Migrated to `pdf.js` native `TextLayer` for pixel-perfect DOM overlay |
| **Barge-in trailing audio** | Old audio chunks kept playing after interruption | Added `interrupted` event handler that calls `.stop()` on all active `BufferSource` nodes |

---

## Accomplishments that we're proud of

- 🎙️ Achieving a truly **human-like, zero-latency conversation loop** that understands the exact visual context of what the student is reading
- 🤖 Successfully coupling **deep agentic tools** (autonomous quiz generation, visual explainer) into the real-time audio loop without blocking conversation
- ✨ Designing a pristine, **glassmorphic SaaS UI** that feels premium — not a hackathon prototype
- ☁️ Setting up an **automated GCP Infrastructure-as-Code pipeline** using `cloudbuild.yaml` and Cloud Run
- 📄 Building **pixel-perfect interactive PDF text** where every word is clickable for instant dictionary lookups

---

## What we learned

- The incredible power (and difficulty) of managing **asynchronous binary WebSockets** for real-time PCM audio streaming
- How to orchestrate **multi-model agent handoffs** — using Gemini-3-Flash for orchestration and Native Audio for the real-time voice loop
- **WebAudio scheduling** is critical for smooth playback — never rely on `onended` callbacks for real-time audio
- Practical experience in **automated cloud deployments** via Google Cloud Run and `cloudbuild.yaml`
- The importance of **client-side DOM integration** with `pdf.js` TextLayers for interactive document experiences

---

## What's next for KlassroomAI

- 👥 **Multi-student collaborative rooms** — multiple students join the same study session with the AI tutor moderating
- 🧠 **Long-term Knowledge Graphs** — storing the student's Knowledge Vault across years to predict future struggles
- 📱 **Mobile Application** — porting to React Native for studying on the go
- 🌍 **Multi-language Support** — voice tutoring in Hindi, Spanish, and other languages
- 📊 **Analytics Dashboard** — tracking study patterns, weak areas, and improvement over time

---

## 🚀 Spin-Up Instructions

### Prerequisites
- **Python 3.10+**
- **Node.js 18+**

### 1. Clone & Configure
```bash
git clone https://github.com/inareshmatta/klassroom-ai.git
cd klassroom-ai
```

Create `backend/.env`:
```env
GEMINI_API_KEY=your_key_here
```

### 2. Run
**Windows** — double-click `start.bat` or run:
```bash
./start.bat
```

**Manual:**
```bash
# Terminal 1: Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --port 8080

# Terminal 2: Frontend
cd frontend
npm install
npm run dev
```

---

## ☁️ Cloud Deployment Proof

| Item | Link |
|---|---|
| **Live App** | [https://klassroom-api-vav7hon2rq-uc.a.run.app](https://klassroom-api-vav7hon2rq-uc.a.run.app) |
| **Health Check** | [/health](https://klassroom-api-vav7hon2rq-uc.a.run.app/health) |
| **Infrastructure-as-Code** | [`cloudbuild.yaml`](./cloudbuild.yaml) + [`Dockerfile`](./backend/Dockerfile) |
| **Cloud Console** | [Cloud Run Dashboard](https://console.cloud.google.com/run/detail/us-central1/klassroom-api?project=alert-nimbus-482707-p6) |

---

<div align="center">
  <p>Built with ❤️ for the Google AI Agent Hackathon</p>
</div>
