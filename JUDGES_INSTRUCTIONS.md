# 👨‍⚖️ Hackathon Judges' Instructions

This document provides a concise map for testing the advanced multimodal agentic capabilities of **Shivy AI**.

## 🚀 Quick Access
- **Live Demo:** [https://shivy-ai-kygarr5jkq-uc.a.run.app](https://shivy-ai-kygarr5jkq-uc.a.run.app)
- **Architecture Diagram:** [README.md#system-architecture](./README.md#system-architecture)

---

## 🔍 Key Features to Test

### 1. 🎙️ Multimodal Voice Tutoring (Zero-Latency)
- **Action:** Click **"Start Tutor"** and ask: *"Can you explain the main concept on this page?"*
- **Judge's Note:** Observe the <500ms latency and the warm, human-like voice response.
- **Barge-in:** Try interrupting the AI mid-sentence. It uses server-side VAD to stop and listen to you immediately.

### 2. 📹 Discipline & Behavior Tracking (Vision Agent)
- **Action:** While the tutor is active, **close your eyes** and head-down for 10 seconds OR **cover your webcam**.
- **Result:** The AI will verbally nudge you (*"Hey, are you still with me?"*) and log a **Discipline Flag** in the Session Activity panel (right).
- **Intelligence:** Try looking down at a book; the AI is trained to recognize this as *normal studying* and won't flag it.

### 3. 📝 Contextual Dictation Homework
- **Action:** Say *"I want to do some dictation"*.
- **Flow:**
  1. AI asks how many words (2, 3, or 5).
  2. AI dictates words **one-by-one** (sounding them out slowly).
  3. You say *"Next"* to proceed.
  4. At the end, **hold your handwritten paper up to the webcam**.
  5. The AI reviews your spelling via vision and gives corrections before logging them to the UI.

### 📖 4. Interactive Guided Reading
- **Action:** Say *"Read this page to me"* or click the button.
- **Flow:** AI reads paragraph-by-paragraph. After each, it stops to offer a **Quiz**, **Dictation**, or **Word Lookup**. 
- **Judge's Note:** This demonstrates proactive agentic orchestration.

### 🖼️ 5. Image Homework Review
- **Action:** Click **"Add book"** and upload a `.jpg` of any handwritten math or text homework.
- **Result:** Click **"Review Homework"**. The AI analyzes the image (Gemini Vision) and gives verbal feedback on your work.

---

## 🛠️ Implementation Highlights
- **Direct SDK Connection:** Uses Google's `@google/genai` for direct client-to-server WebSocket streaming (minimum latency).
- **Ephemeral Security:** Backend mints short-lived, single-use tokens to protect the API key.
- **Tool Orchestration:** Gemini Flash 1.5/2.0 acts as an autonomous agent, deciding when to open UI panels (Quizzes, Visuals) without user buttons.

---
Built with Google Gemini & Cloud Run.
