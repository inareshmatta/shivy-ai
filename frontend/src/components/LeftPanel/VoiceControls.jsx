import { useRef, useCallback, useEffect, useState } from 'react'
import { GoogleGenAI, Modality } from '@google/genai'
import './VoiceControls.css'

const SEND_SAMPLE_RATE = 16000
const RECV_SAMPLE_RATE = 24000
const CHUNK_SIZE = 1024
const LIVE_MODEL = 'gemini-live-2.5-flash-native-audio'
export default function VoiceControls({
    session, setSession, settings, setSettings,
    book, pageAnalysis, appendTranscript, currentPage,
}) {
    const sessionRef = useRef(null)          // Gemini Live session
    const audioCtxRef = useRef(null)          // Capture AudioContext (16kHz)
    const playbackCtxRef = useRef(null)       // Playback AudioContext (24kHz)
    const processorRef = useRef(null)
    const nextPlayTimeRef = useRef(0)
    const activeSourcesRef = useRef([])
    const [micLevel, setMicLevel] = useState(0)
    const analyserRef = useRef(null)
    const animFrameRef = useRef(null)
    const isInterruptedRef = useRef(false)
    const streamRef = useRef(null)
    const videoRef = useRef(null)             // Hidden video element for webcam
    const visionIntervalRef = useRef(null)    // Interval for sending webcam frames
    const isToolPendingRef = useRef(false)    // Prevents "Operation not implemented" crash when sending input during a pending tool call

    // Refs for volatile state
    const settingsRef = useRef(settings)
    const bookRef = useRef(book)
    const pageAnalysisRef = useRef(pageAnalysis)

    useEffect(() => { settingsRef.current = settings }, [settings])
    useEffect(() => { bookRef.current = book }, [book])
    useEffect(() => { pageAnalysisRef.current = pageAnalysis }, [pageAnalysis])

    // Mic level meter
    const startMeter = useCallback((stream) => {
        const ctx = audioCtxRef.current
        const src = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        src.connect(analyser)
        analyserRef.current = analyser
        const buf = new Uint8Array(analyser.frequencyBinCount)
        const tick = () => {
            analyser.getByteFrequencyData(buf)
            const avg = buf.reduce((a, b) => a + b, 0) / buf.length
            setMicLevel(Math.min(100, (avg / 128) * 100))
            animFrameRef.current = requestAnimationFrame(tick)
        }
        tick()
    }, [])

    // Stop all audio playback immediately — aggressively flush buffered audio
    const stopAudio = useCallback(() => {
        // Stop all scheduled sources
        activeSourcesRef.current.forEach(src => { try { src.stop() } catch (e) { } })
        activeSourcesRef.current = []
        nextPlayTimeRef.current = 0

        // Close and recreate the playback context to flush any buffered audio instantly
        const oldCtx = playbackCtxRef.current
        if (oldCtx && oldCtx.state !== 'closed') {
            try { oldCtx.close() } catch (e) { }
        }
        const newCtx = new AudioContext({ sampleRate: RECV_SAMPLE_RATE })
        newCtx.resume()
        playbackCtxRef.current = newCtx

        setSession(s => ({ ...s, orbState: 'listening' }))
    }, [setSession])

    // Play a PCM audio chunk from Gemini (base64 encoded, 24kHz)
    const playAudioChunk = useCallback((base64Data) => {
        if (isInterruptedRef.current) return

        const ctx = playbackCtxRef.current
        if (!ctx) return

        const raw = atob(base64Data)
        const bytes = new Uint8Array(raw.length)
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
        const int16 = new Int16Array(bytes.buffer)
        const f32 = new Float32Array(int16.length)
        for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 32768

        const ab = ctx.createBuffer(1, f32.length, RECV_SAMPLE_RATE)
        ab.copyToChannel(f32, 0)

        let startTime = nextPlayTimeRef.current
        if (startTime < ctx.currentTime + 0.05) {
            startTime = ctx.currentTime + 0.05
        }

        const src = ctx.createBufferSource()
        src.buffer = ab
        src.connect(ctx.destination)
        src.onended = () => {
            activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== src)
        }
        src.start(startTime)

        activeSourcesRef.current.push(src)
        nextPlayTimeRef.current = startTime + ab.duration

        setSession(s => ({ ...s, orbState: 'speaking' }))
    }, [setSession])

    const startSession = useCallback(async () => {
        appendTranscript('system', '⏳ Connecting to AI tutor…')

        // 1. Get ephemeral token from backend (API key stays server-side)
        let tokenData
        try {
            const res = await fetch('/api/ephemeral-token', { method: 'POST' })
            if (!res.ok) throw new Error(`Token error: ${res.status}`)
            tokenData = await res.json()
        } catch (e) {
            appendTranscript('system', `❌ Cannot get token. Start backend: cd backend && uvicorn main:app --port 8080`)
            return
        }

        // Build config
        const subject = bookRef.current?.subject || 'General'
        const voice = settingsRef.current.voice
        const pageText = pageAnalysisRef.current?.full_text?.slice(0, 2000) || ''

        const systemInstruction = `You are Shivy AI, an expert ${subject} tutor for High School students. Your tagline is "The Future of School, Powered by AI".
You MUST ALWAYS speak in English by default. 
DO NOT switch languages or accents unless the user explicitly asks you to (e.g., "Speak in Spanish" or "Can we practice French?"). Even if the user says a single word in another language by accident, remain in English unless formally requested to switch.

The student is currently looking at the following textbook page content:
"""
${pageText}
"""

You will receive the page image whenever the student navigates to a new page. You can SEE the page they are reading.
When the student asks about something on "this page" or "the current page", refer to the most recent page image and text you received.
Always be aware of which page the student is on and reference specific content from that page.

CRITICAL INSTRUCTIONS:
- You are equipped with tools (dictionary, quiz, visual generator, flashcards).
- When asked to explain a concept visually, you MUST call 'generate_visual'.
- When asked for a definition or what a word means, you MUST call 'lookup_word'.
- When asked for a quiz, test, MCQs, or "fill in the blanks", you MUST call 'generate_quiz' with the appropriate 'quiz_type' (e.g. 'mcq', 'fill_in_the_blanks').
- When asked for flashcards or shorts, you MUST call 'generate_flashcards'.
- When asked what to study next, you MUST call 'suggest_next_topic'.
- NEVER tell the user to click a button or use a tool manually. ALWAYS execute the tool call yourself!
- When discussing complex topics, proactively generate diagrams using 'generate_visual'.

DISCIPLINE & BEHAVIOR TRACKING (VIA WEBCAM VISION):
- You are continuously receiving webcam frames of the student.
- IMPORTANT: Looking down at a book or paper is NORMAL behavior (the student is reading or writing). Do NOT flag that as sleeping or tired!
- Only flag 'sleeping' if the student's eyes are CLOSED and there is NO hand/arm movement for a prolonged period (head resting on desk, completely still).
- If the webcam feed suddenly goes completely BLACK or shows a covered/turned-off camera, you MUST verbally nudge the student: "Hey, it looks like your camera turned off. Can you turn it back on so I can help you better?" and ALSO call 'log_discipline' with issue="camera_off".
- When calling 'log_discipline', always include a clear timestamp-style note (e.g. "Camera went dark at 12:35 PM" or "Student appeared asleep, no movement for 30 seconds").
- Do NOT be overly aggressive. Only flag genuine issues, not normal studying postures.

DICTATION HOMEWORK:
- When the student asks for a dictation exercise, FIRST ask them: "How many words would you like me to dictate? 2, 3, or 5?"
- Wait for the student to answer. Then select that many vocabulary words from the *current page text*.
- Tell the student to grab a pen and paper. 
- Dictate the words ONE BY ONE slowly. Repeat each word twice, sounding it out (e.g. "Pro... cras... ti... na... tion"). After each word, ask: "Say 'Next' when you have written it down." WAIT for them to respond before moving to the next word.
- After ALL words are dictated, ask the student to hold their paper up to the camera so you can verify their spelling.
- 🛑 ABSOLUTE RULE: You MUST WAIT for the student to hold up the paper. You MUST look at the webcam feed (Agent Vision) to read their handwritten spelling.
- 🛑 ABSOLUTE RULE: You MUST verbally tell the student exactly which letters they got right or wrong based on the image you see.
- 🛑 ABSOLUTE RULE: You are FORBIDDEN from calling the 'save_dictation_words' tool until AFTER you have verbally reviewed the spellings from the webcam image. If you call it before seeing the paper, you fail the exercise.
- ONLY AFTER the vision review is complete, call 'save_dictation_words' with the words.

GUIDED READING:
- The student can activate guided reading by voice (e.g. "Read this page to me", "Start guided reading", "Read along with me") OR by clicking the Guided Reading button.
- Read the text paragraph by paragraph. After each paragraph, pause and offer the student choices:
  "Would you like to: practice dictation on words from this paragraph, take a quick assessment, or need help understanding any word? Just say 'Next' to continue reading."
- If the student says "dictation" → start the DICTATION HOMEWORK flow using words from that paragraph.
- If the student says "assessment" or "quiz" → you MUST call the tool generate_quiz(topic="<paragraph topic>", num_questions=3, quiz_type="mcq"). Do NOT just talk about a quiz, actually execute the function call!
- If the student asks about a specific word → you MUST call the tool lookup_word(word="<the word>", subject="${subject}"). Do NOT just define it verbally, execute the function call!
- If the student says "next" or "continue" → move to the next paragraph.

- IMPORTANT: Before or while calling a tool, ALWAYS give a short verbal confirmation like "Sure, let me generate that quiz for you" or "Let me draw that up" so there is no dead air.
- Be conversational, use the student's name if they give it, and make learning fun!
`

        const tools = [{
            functionDeclarations: [
                { name: "generate_quiz", description: "Create quiz questions (MCQs, fill in the blanks, true/false) to test the student on a topic. Call this when asked for a quiz, test, MCQs, or fill in the blanks.", parameters: { type: "OBJECT", properties: { topic: { type: "STRING" }, num_questions: { type: "INTEGER" }, quiz_type: { type: "STRING", description: "mcq, fill_in_the_blanks, true_false" } }, required: ["topic"] } },
                { name: "lookup_word", description: "Look up definition, pronunciation, and etymology of a word", parameters: { type: "OBJECT", properties: { word: { type: "STRING" }, subject: { type: "STRING" } }, required: ["word"] } },
                { name: "generate_visual", description: "Generate a visual diagram to explain a concept", parameters: { type: "OBJECT", properties: { topic: { type: "STRING" }, visual_type: { type: "STRING" } }, required: ["topic"] } },
                { name: "create_bookmark", description: "Save an important concept in the Knowledge Vault for revision. Call this when the student says 'save this', 'remember this', or 'add to knowledge vault'.", parameters: { type: "OBJECT", properties: { text: { type: "STRING" } }, required: ["text"] } },
                { name: "suggest_next_topic", description: "Suggest what to study next based on context", parameters: { type: "OBJECT", properties: { current_topic: { type: "STRING" } }, required: ["current_topic"] } },
                { name: "summarize_page", description: "Create a bullet-point summary of the current page", parameters: { type: "OBJECT", properties: { page_text: { type: "STRING" }, max_points: { type: "INTEGER" } }, required: ["page_text"] } },
                { name: "explain_like_im_5", description: "Simplify a complex concept for a 5-year-old", parameters: { type: "OBJECT", properties: { concept: { type: "STRING" } }, required: ["concept"] } },
                { name: "compare_concepts", description: "Compare two concepts side-by-side", parameters: { type: "OBJECT", properties: { concept_a: { type: "STRING" }, concept_b: { type: "STRING" } }, required: ["concept_a", "concept_b"] } },
                { name: "generate_flashcards", description: "Generate revision flashcards or shorts on a topic. Call this immediately when the user asks for flashcards or shorts.", parameters: { type: "OBJECT", properties: { topic: { type: "STRING" }, num_cards: { type: "INTEGER" } }, required: ["topic"] } },
                { name: "log_discipline", description: "Log a disciplinary issue based on webcam visual feed (e.g., student is sleeping or camera is off).", parameters: { type: "OBJECT", properties: { issue: { type: "STRING", description: "sleeping, camera_off, distracted, using_phone" }, severity: { type: "INTEGER", description: "1 to 5 scale" }, note: { type: "STRING", description: "Description of what you see" } }, required: ["issue", "severity", "note"] } },
                { name: "save_dictation_words", description: "Save the list of words you are about to dictate to the student so they appear in the UI.", parameters: { type: "OBJECT", properties: { words: { type: "ARRAY", items: { type: "STRING" }, description: "Array of words for dictation" } }, required: ["words"] } },
            ]
        }]

        const config = {
            systemInstruction: { parts: [{ text: systemInstruction }] },
            responseModalities: ["AUDIO"],
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } }
            },
            tools: tools,
        }

        // 2. Connect directly to Gemini Live API with ephemeral token
        try {
            const ai = new GoogleGenAI({
                apiKey: tokenData.token,
                httpOptions: { apiVersion: 'v1alpha' },
            })

            const geminiSession = await ai.live.connect({
                model: tokenData.model || LIVE_MODEL,
                config: config,
                callbacks: {
                    onopen: () => {
                        console.log('[LIVE] Connected to Gemini Live API (direct)')
                    },
                    onmessage: async (message) => {
                        try {
                            // Audio data
                            if (message.data) {
                                playAudioChunk(message.data)
                            }

                            // Server content
                            if (message.serverContent) {
                                // Output transcription
                                if (message.serverContent.outputTranscription?.text) {
                                    const text = message.serverContent.outputTranscription.text
                                    if (text.trim()) {
                                        appendTranscript('ai', text)
                                    }
                                }

                                // Input transcription (what user said)
                                if (message.serverContent.inputTranscription?.text) {
                                    const text = message.serverContent.inputTranscription.text
                                    if (text.trim()) {
                                        appendTranscript('user', text)
                                    }
                                }

                                // Turn complete
                                if (message.serverContent.turnComplete) {
                                    isInterruptedRef.current = false
                                    setSession(s => ({ ...s, orbState: 'listening' }))
                                }

                                // Interrupted
                                if (message.serverContent.interrupted) {
                                    isInterruptedRef.current = true
                                    stopAudio()
                                }
                            }

                            // Tool calls — execute via backend REST
                            // In SDK v1.43+, tool calls arrive in modelTurn.parts
                            let functionCalls = []
                            if (message.toolCall) {
                                functionCalls = message.toolCall.functionCalls || []
                            } else if (message.serverContent?.modelTurn?.parts) {
                                functionCalls = message.serverContent.modelTurn.parts
                                    .filter(p => p.functionCall)
                                    .map(p => p.functionCall)
                            }

                            if (functionCalls.length > 0) {
                                // STOP sending audio/video to Gemini while a tool is pending
                                // If we don't, the server rejects it with Error 1008 "Operation not implemented"
                                isToolPendingRef.current = true

                                // Execute tools in the background — do NOT block the message handler
                                // This prevents audio lag while tools are being fetched
                                const gs = sessionRef.current
                                    ; (async () => {
                                        const functionResponses = []
                                        for (const fc of functionCalls) {
                                            const toolEmoji = {
                                                generate_quiz: '📝', lookup_word: '📖',
                                                generate_visual: '🎨', create_bookmark: '🔖',
                                                suggest_next_topic: '📚', generate_flashcards: '📇',
                                                log_discipline: '🚨', save_dictation_words: '✍️',
                                            }[fc.name] || '🔧'

                                            const toolFriendlyName = {
                                                generate_quiz: 'Quiz', lookup_word: 'Definition',
                                                generate_visual: 'Visual Diagram', create_bookmark: 'Note in Knowledge Vault',
                                                generate_flashcards: 'Flashcards', log_discipline: 'Logging Behavior',
                                                save_dictation_words: 'Preparing Dictation',
                                            }[fc.name] || 'Content'

                                            appendTranscript('agent', `${toolEmoji} Agent is generating: ${toolFriendlyName}...`)

                                            // Dispatch start event for UI loading indicators
                                            window.dispatchEvent(new CustomEvent('agent-tool-start', {
                                                detail: { tool: fc.name, args: fc.args }
                                            }))

                                            // Send a simplified status back to Gemini IMMEDIATELY so it doesn't hang
                                            // waiting for a potentially slow Cloud Run backend response
                                            functionResponses.push({
                                                id: fc.id,
                                                name: fc.name,
                                                response: {
                                                    result: "Tool triggered successfully. The UI is now processing it.",
                                                    instruction: "Acknowledge briefly, but DO NOT wait for the data and DO NOT read the data aloud."
                                                },
                                            })
                                        }

                                        // 1. Send immediate ACK back to Gemini to unblock the conversation loop
                                        if (gs) {
                                            gs.sendToolResponse({ functionResponses })
                                            // RESUME sending audio/video now that the tool has been acknowledged
                                            isToolPendingRef.current = false
                                        }

                                        // 2. NOW execute the tools on the backend asynchronously
                                        for (const fc of functionCalls) {
                                            let toolResult = { error: 'Tool execution failed' }
                                            try {
                                                const res = await fetch('/api/execute-tool', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ tool: fc.name, args: fc.args }),
                                                })
                                                if (res.ok) {
                                                    toolResult = await res.json()
                                                }
                                            } catch (e) {
                                                console.error('[LIVE] Tool execution error:', e)
                                            }

                                            // Dispatch the full rich data to the frontend UI so it can render the component
                                            window.dispatchEvent(new CustomEvent('agent-tool-result', {
                                                detail: { tool: fc.name, args: fc.args, result: toolResult }
                                            }))
                                        }
                                    })()
                            }
                        } catch (err) {
                            console.error('[LIVE] Message handling error:', err)
                        }
                    },
                    onerror: (e) => {
                        console.error('[LIVE] Error:', e.message)
                        appendTranscript('system', '⚠️ ' + (e.message || 'Connection error'))
                    },
                    onclose: (e) => {
                        const reason = e?.reason || 'Session ended'
                        console.log('[LIVE] Closed:', reason)
                        cancelAnimationFrame(animFrameRef.current)

                        // If the session was supposed to be live, this is an unexpected close
                        // Show a visible notification so the user knows what happened
                        appendTranscript('system', `⚠️ Voice session ended: ${reason}. Click "Start Tutor" to reconnect.`)
                        setSession(s => ({ ...s, isLive: false, orbState: 'idle' }))
                        sessionRef.current = null
                    },
                },
            })

            sessionRef.current = geminiSession
            setSession(s => ({ ...s, isLive: true, orbState: 'listening' }))
            appendTranscript('system', '🎙 Connected — speak to your AI tutor!')

            // Send initial page image so the AI can see what the student is reading
            try {
                const canvas = document.getElementById('pdf-canvas')
                if (canvas) {
                    const base64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1]
                    geminiSession.sendRealtimeInput({ video: { mimeType: 'image/jpeg', data: base64 } })
                }
            } catch (e) { console.warn('[LIVE] Could not send initial page image:', e) }

            // Send a short greeting utilizing the JS SDK `sendClientContent` method explicitly
            geminiSession.sendClientContent({ turns: "Hi! I just opened my textbook. I'm ready to learn — introduce yourself briefly and ask what I need help with.", turnComplete: true })

            // 3. Setup mic & webcam
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true },
                video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
            })
            streamRef.current = stream

            // Attach video stream to the React video ref
            if (videoRef.current) {
                videoRef.current.srcObject = stream
                videoRef.current.play().catch(e => console.warn('Video play prevented:', e))
            }

            // Start continuous vision loop (every 3 seconds for better dictation responsiveness)
            visionIntervalRef.current = setInterval(() => {
                if (!sessionRef.current || !videoRef.current) return
                if (isToolPendingRef.current) return // Do not send vision while a tool is pending (Crash 1008 fix)
                
                if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA && videoRef.current.videoWidth > 0) {
                    try {
                        // Enforce max width of 480px to prevent massively uncompressed frames from 
                        // clogging the WebSocket queue and delaying audio packets (which breaks barge-in)
                        const MAX_WIDTH = 480
                        const scale = Math.min(1, MAX_WIDTH / videoRef.current.videoWidth)
                        const width = videoRef.current.videoWidth * scale
                        const height = videoRef.current.videoHeight * scale

                        const canvas = document.createElement('canvas')
                        canvas.width = width
                        canvas.height = height
                        const ctx = canvas.getContext('2d')
                        ctx.drawImage(videoRef.current, 0, 0, width, height)
                        
                        // Extremely low quality JPEG to keep payload under 20KB for instant transmission
                        const base64 = canvas.toDataURL('image/jpeg', 0.25).split(',')[1]
                        sessionRef.current.sendRealtimeInput({ video: { mimeType: 'image/jpeg', data: base64 } })
                    } catch (e) { console.warn('[LIVE] Webcam frame failed:', e) }
                }
            }, 3000)

            audioCtxRef.current = new AudioContext({ sampleRate: SEND_SAMPLE_RATE })
            await audioCtxRef.current.resume()
            playbackCtxRef.current = new AudioContext({ sampleRate: RECV_SAMPLE_RATE })
            await playbackCtxRef.current.resume()

            startMeter(stream)
            const src = audioCtxRef.current.createMediaStreamSource(new MediaStream(stream.getAudioTracks()))
            const proc = audioCtxRef.current.createScriptProcessor(CHUNK_SIZE, 1, 1)
            processorRef.current = proc

            proc.onaudioprocess = (e) => {
                if (!sessionRef.current || isToolPendingRef.current) return // Pause audio input when tool is pending
                
                const f32 = e.inputBuffer.getChannelData(0)
                const i16 = new Int16Array(f32.length)
                for (let i = 0; i < f32.length; i++) {
                    i16[i] = Math.max(-32768, Math.min(32767, f32[i] * 32768))
                }

                // Faster Base64 conversion for PCM chunks
                const bytes = new Uint8Array(i16.buffer)

                // Chunk the string creation to avoid max stack size exceeded errors if chunks were larger,
                // but at 1024, apply works well.
                const binary = String.fromCharCode.apply(null, bytes)
                const b64 = btoa(binary)

                // Pass the correct parameter object for LiveSendRealtimeInputParameters
                sessionRef.current.sendRealtimeInput({
                    audio: {
                        mimeType: `audio/pcm;rate=${SEND_SAMPLE_RATE}`,
                        data: b64
                    }
                })
            }
            src.connect(proc)
            proc.connect(audioCtxRef.current.destination)

        } catch (e) {
            console.error('[LIVE] Connection failed:', e)
            appendTranscript('system', `❌ Connection failed: ${e.message}`)
            setSession(s => ({ ...s, isLive: false, orbState: 'idle' }))
        }
    }, [appendTranscript, setSession, stopAudio, startMeter, playAudioChunk])

    const endSession = useCallback(() => {
        sessionRef.current?.close()
        sessionRef.current = null
        processorRef.current?.disconnect()
        streamRef.current?.getTracks().forEach(t => t.stop())
        audioCtxRef.current?.close()
        playbackCtxRef.current?.close()
        cancelAnimationFrame(animFrameRef.current)
        clearInterval(visionIntervalRef.current)
        setSession(s => ({ ...s, isLive: false, orbState: 'idle' }))
        setMicLevel(0)
    }, [setSession])

    // ═══════════════════════════════════════════════
    // Live page-change bridge: send current page to Gemini when user navigates
    // ═══════════════════════════════════════════════
    useEffect(() => {
        if (!session.isLive) return

        const handlePageChanged = (e) => {
            const gs = sessionRef.current
            if (!gs) return

            const { pageNumber, pageText, imageBase64 } = e.detail || {}

            // Send page image so Gemini can SEE the page
            if (imageBase64) {
                try {
                    gs.sendRealtimeInput({ video: { mimeType: 'image/jpeg', data: imageBase64 } })
                    console.log(`[LIVE] Sent page ${pageNumber} image to Gemini`)
                } catch (err) { console.warn('[LIVE] Failed to send page image:', err) }
            }

            // Send text context update so Gemini knows the page number and text
            const contextMsg = `[The student just turned to page ${pageNumber}. Here is the text content of this page:]\n${(pageText || '').slice(0, 2000)}`
            try {
                gs.sendClientContent({ turns: contextMsg, turnComplete: true })
                console.log(`[LIVE] Sent page ${pageNumber} text context to Gemini`)
            } catch (err) { console.warn('[LIVE] Failed to send page context:', err) }

            appendTranscript('system', `📄 Page ${pageNumber} shared with AI tutor`)
        }

        // Also handle manual "Explain Page" button clicks
        const handleVisionFrame = (e) => {
            const gs = sessionRef.current
            if (!gs) return
            const base64 = e.detail
            if (base64) {
                try {
                    gs.sendRealtimeInput({ video: { mimeType: 'image/jpeg', data: base64 } })
                } catch (err) { console.warn('[LIVE] Failed to send vision frame:', err) }
            }
        }

        window.addEventListener('page-changed-live', handlePageChanged)
        window.addEventListener('send-vision-frame', handleVisionFrame)
        return () => {
            window.removeEventListener('page-changed-live', handlePageChanged)
            window.removeEventListener('send-vision-frame', handleVisionFrame)
        }
    }, [session.isLive, appendTranscript])

    useEffect(() => {
        const handleTriggerMsg = (e) => {
            const msg = e.detail
            if (sessionRef.current && session.isLive && msg) {
                try {
                    sessionRef.current.sendClientContent({ turns: msg, turnComplete: true })
                } catch (err) { console.warn('[LIVE] Failed to trigger client msg:', err) }
            }
        }
        window.addEventListener('trigger-client-message', handleTriggerMsg)
        return () => window.removeEventListener('trigger-client-message', handleTriggerMsg)
    }, [session.isLive])

    return (
        <div className="voice-controls">
            <div className="vc-row">
                {!session.isLive ? (
                    <button id="btn-start-tutor" className="btn btn-primary w-full" onClick={startSession}>
                        ● Start Tutor
                    </button>
                ) : (
                    <button id="btn-end-tutor" className="btn btn-danger w-full" onClick={endSession}>
                        ⏹ End Session
                    </button>
                )}
            </div>

            {session.isLive && (
                <div className="vc-webcam-preview">
                    <span className="text-xs text-muted mb-1 block" style={{ marginBottom: '4px' }}>Webcam Source (Agent Vision)</span>
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        style={{ width: '100%', borderRadius: 'var(--radius)', background: '#000', maxHeight: '160px', objectFit: 'cover' }}
                    />
                </div>
            )}

            <div className="vc-meter-row">
                <span className="text-xs text-muted">🎤 Mic</span>
                <div className="meter-bar">
                    <div className="meter-fill" style={{ width: `${micLevel}%`, background: 'var(--clr-primary)' }} />
                </div>
            </div>

            <div className="vc-toggles">
                <div className="lp-toggle-row">
                    <span className="text-sm">🎭 Affective Mode</span>
                    <label className="toggle">
                        <input type="checkbox" id="toggle-affective"
                            checked={settings.affectiveMode}
                            onChange={e => setSettings(s => ({ ...s, affectiveMode: e.target.checked }))} />
                        <span className="toggle-slider" />
                    </label>
                </div>
            </div>
        </div>
    )
}
