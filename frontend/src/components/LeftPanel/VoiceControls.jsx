import { useRef, useCallback, useEffect, useState } from 'react'
import { GoogleGenAI, Modality } from '@google/genai'
import './VoiceControls.css'

const SEND_SAMPLE_RATE = 16000
const RECV_SAMPLE_RATE = 24000
const CHUNK_SIZE = 1024
const LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025'

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

    // Stop all audio playback immediately
    const stopAudio = useCallback(() => {
        activeSourcesRef.current.forEach(src => { try { src.stop() } catch (e) { } })
        activeSourcesRef.current = []
        nextPlayTimeRef.current = 0
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
        const grade = settingsRef.current.grade
        const language = settingsRef.current.language
        const voice = settingsRef.current.voice
        const pageText = pageAnalysisRef.current?.full_text?.slice(0, 2000) || ''

        const systemInstruction = `You are KlassroomAI, an expert ${subject} tutor for Grade ${grade} students.
You should default to speaking in ${language}. 
However, if the student speaks a different language or explicitly asks you to change languages, you MUST switch to their requested language immediately and seamlessly.

Be conversational, use the student's name if they give it, and make learning fun!`

        const tools = [{
            functionDeclarations: [
                { name: "generate_quiz", description: "Generate quiz questions to test student understanding", parameters: { type: "object", properties: { topic: { type: "string" }, num_questions: { type: "integer" }, quiz_type: { type: "string" } }, required: ["topic"] } },
                { name: "lookup_word", description: "Look up definition, pronunciation, and etymology of a word", parameters: { type: "object", properties: { word: { type: "string" }, subject: { type: "string" } }, required: ["word"] } },
                { name: "generate_visual", description: "Generate a visual diagram to explain a concept", parameters: { type: "object", properties: { topic: { type: "string" }, visual_type: { type: "string" } }, required: ["topic"] } },
                { name: "create_bookmark", description: "Save an important concept for revision", parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
                { name: "suggest_next_topic", description: "Suggest what to study next", parameters: { type: "object", properties: { current_topic: { type: "string" } }, required: ["current_topic"] } },
                { name: "summarize_page", description: "Create a bullet-point summary of the current page", parameters: { type: "object", properties: { page_text: { type: "string" }, max_points: { type: "integer" } }, required: ["page_text"] } },
                { name: "explain_like_im_5", description: "Simplify a complex concept for a 5-year-old", parameters: { type: "object", properties: { concept: { type: "string" } }, required: ["concept"] } },
                { name: "compare_concepts", description: "Compare two concepts side-by-side", parameters: { type: "object", properties: { concept_a: { type: "string" }, concept_b: { type: "string" } }, required: ["concept_a", "concept_b"] } },
                { name: "generate_flashcards", description: "Generate revision flashcards on a topic", parameters: { type: "object", properties: { topic: { type: "string" }, num_cards: { type: "integer" } }, required: ["topic"] } },
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
                                    stopAudio()
                                    isInterruptedRef.current = false
                                }
                            }

                            // Tool calls — execute via backend REST
                            if (message.toolCall) {
                                const functionResponses = []
                                for (const fc of message.toolCall.functionCalls) {
                                    const toolEmoji = {
                                        generate_quiz: '📝', lookup_word: '📖',
                                        generate_visual: '🎨', create_bookmark: '🔖',
                                        suggest_next_topic: '📚',
                                    }[fc.name] || '🔧'
                                    appendTranscript('agent', `${toolEmoji} Agent called: ${fc.name}`)

                                    // Execute tool on backend (API key stays server-side)
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

                                    // Send a simplified status back to Gemini so it doesn't try to read the whole quiz/image aloud verbally
                                    functionResponses.push({
                                        id: fc.id,
                                        name: fc.name,
                                        response: {
                                            result: "Success. The tool result is now visible on the user's screen.",
                                            instruction: "Acknowledge briefly, but DO NOT read the quiz questions, image descriptions, or flashcards aloud."
                                        },
                                    })
                                }

                                // Send tool results back to Gemini
                                geminiSession.sendToolResponse({ functionResponses })
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
                        console.log('[LIVE] Closed:', e?.reason || 'Session ended')
                        setSession(s => ({ ...s, isLive: false, orbState: 'idle' }))
                        cancelAnimationFrame(animFrameRef.current)
                    },
                },
            })

            sessionRef.current = geminiSession
            setSession(s => ({ ...s, isLive: true, orbState: 'listening' }))
            appendTranscript('system', '🎙 Connected — speak to your AI tutor!')

            // Send a short greeting utilizing the JS SDK `sendClientContent` method explicitly
            geminiSession.sendClientContent({ turns: "Hi! I just opened my textbook. I'm ready to learn — introduce yourself briefly and ask what I need help with.", turnComplete: true })

            // 3. Setup mic
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { sampleRate: SEND_SAMPLE_RATE, channelCount: 1, echoCancellation: true, noiseSuppression: true }
            })
            streamRef.current = stream
            audioCtxRef.current = new AudioContext({ sampleRate: SEND_SAMPLE_RATE })
            await audioCtxRef.current.resume()
            playbackCtxRef.current = new AudioContext({ sampleRate: RECV_SAMPLE_RATE })
            await playbackCtxRef.current.resume()

            startMeter(stream)
            const src = audioCtxRef.current.createMediaStreamSource(stream)
            const proc = audioCtxRef.current.createScriptProcessor(CHUNK_SIZE, 1, 1)
            processorRef.current = proc

            proc.onaudioprocess = (e) => {
                if (!sessionRef.current) return
                const f32 = e.inputBuffer.getChannelData(0)
                const i16 = new Int16Array(f32.length)
                for (let i = 0; i < f32.length; i++) i16[i] = Math.max(-32768, Math.min(32767, f32[i] * 32768))

                // Convert to base64 for the JS SDK
                const bytes = new Uint8Array(i16.buffer)
                let binary = ''
                for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
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
        setSession(s => ({ ...s, isLive: false, orbState: 'idle' }))
        setMicLevel(0)
    }, [setSession])

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
