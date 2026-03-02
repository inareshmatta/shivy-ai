import { useRef, useCallback, useEffect, useState } from 'react'
import './VoiceControls.css'

const SAMPLE_RATE = 16000
const CHUNK_SIZE = 1024

export default function VoiceControls({
    session, setSession, settings, setSettings,
    book, pageAnalysis, appendTranscript, currentPage,
}) {
    const wsRef = useRef(null)
    const audioCtxRef = useRef(null)
    const processorRef = useRef(null)
    const nextPlayTimeRef = useRef(0)
    const activeSourcesRef = useRef([])
    const isPlayingRef = useRef(false)
    const [micLevel, setMicLevel] = useState(0)
    const analyserRef = useRef(null)
    const isInterruptedRef = useRef(false)

    // Refs for volatile state to prevent closure staleness without triggering re-renders
    const settingsRef = useRef(settings)
    const bookRef = useRef(book)
    const pageAnalysisRef = useRef(pageAnalysis)

    // Keep refs in sync with props
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

    // Stop all audio immediately
    const stopAudio = useCallback(() => {
        activeSourcesRef.current.forEach(src => { try { src.stop() } catch (e) { } })
        activeSourcesRef.current = []
        nextPlayTimeRef.current = 0
        setSession(s => ({ ...s, orbState: 'listening' }))
    }, [setSession])

    const startSession = useCallback(async () => {
        appendTranscript('system', '⏳ Connecting to AI tutor…')

        let ws
        try {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
            const wsUrl = `${protocol}//${window.location.host}/ws/live`
            ws = new WebSocket(wsUrl)
        } catch (e) {
            appendTranscript('system', '❌ Cannot connect. Start backend: cd backend && uvicorn main:app --port 8080')
            return
        }
        ws.binaryType = 'arraybuffer'
        wsRef.current = ws

        ws.onerror = () => {
            appendTranscript('system', '❌ Connection failed. Make sure backend is running on port 8080.')
            setSession(s => ({ ...s, isLive: false, orbState: 'idle' }))
        }

        ws.onopen = async () => {
            // Send config as JSON (agent needs this to set up tools + system prompt)
            ws.send(JSON.stringify({
                subject: bookRef.current?.subject || 'General',
                grade: settingsRef.current.grade,
                language: settingsRef.current.language,
                voice: settingsRef.current.voice,
                book_context: bookRef.current?.title || '',
                page_text: pageAnalysisRef.current?.full_text?.slice(0, 2000) || '',
            }))

            setSession(s => ({ ...s, isLive: true, orbState: 'listening' }))
            appendTranscript('system', '🎙 Session started — speak to your AI tutor!')

            // Setup mic
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { sampleRate: SAMPLE_RATE, channelCount: 1, echoCancellation: true, noiseSuppression: true }
            })
            audioCtxRef.current = new AudioContext({ sampleRate: SAMPLE_RATE })
            startMeter(stream)

            const src = audioCtxRef.current.createMediaStreamSource(stream)
            const proc = audioCtxRef.current.createScriptProcessor(CHUNK_SIZE, 1, 1)
            processorRef.current = proc

            let loudFrames = 0
            const VAD_THRESHOLD = 0.015 // Lowered threshold to ensure barge-in works even for quiet speaking

            proc.onaudioprocess = (e) => {
                if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
                const f32 = e.inputBuffer.getChannelData(0)

                // Check for barge-in
                if (settingsRef.current.bargeIn && activeSourcesRef.current.length > 0) {
                    let sum = 0;
                    for (let i = 0; i < f32.length; i++) sum += Math.abs(f32[i]);
                    const avg = sum / f32.length;

                    if (avg > VAD_THRESHOLD) {
                        loudFrames++;
                        if (loudFrames > 2) {
                            stopAudio()
                            isInterruptedRef.current = true
                            setTimeout(() => { isInterruptedRef.current = false }, 1000)
                            wsRef.current.send(JSON.stringify({ type: "client_interruption" }))
                            loudFrames = 0
                        }
                    } else {
                        loudFrames = 0;
                    }
                }

                const i16 = new Int16Array(f32.length)
                for (let i = 0; i < f32.length; i++) i16[i] = Math.max(-32768, Math.min(32767, f32[i] * 32768))
                const frame = new Uint8Array(i16.buffer.byteLength + 1)
                frame[0] = 0x00 // Audio message type
                frame.set(new Uint8Array(i16.buffer), 1)
                wsRef.current.send(frame)
            }
            src.connect(proc)
            proc.connect(audioCtxRef.current.destination)
        }

        ws.onmessage = (event) => {
            // Handle BINARY messages (audio from Gemini)
            if (event.data instanceof ArrayBuffer) {
                const data = new Uint8Array(event.data)
                const type = data[0]
                const payload = data.slice(1)

                if (type === 0x01) {
                    if (isInterruptedRef.current) return // Drop in-flight delayed audio chunks after interruption

                    // AI audio chunk - precise scheduling
                    const ctx = audioCtxRef.current
                    if (!ctx) return

                    const int16 = new Int16Array(payload.buffer)
                    const f32 = new Float32Array(int16.length)
                    for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 32768

                    const ab = ctx.createBuffer(1, f32.length, 24000)
                    ab.copyToChannel(f32, 0)

                    let startTime = nextPlayTimeRef.current
                    if (startTime < ctx.currentTime + 0.05) {
                        startTime = ctx.currentTime + 0.05 // buffer a little if behind
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
                }
                return
            }

            // Handle JSON messages (tool calls, transcripts, etc.)
            try {
                const msg = JSON.parse(event.data)

                if (msg.type === 'transcript') {
                    appendTranscript(msg.role || 'ai', msg.text)
                    setSession(s => ({ ...s, orbState: 'thinking' }))
                }

                else if (msg.type === 'tool_call') {
                    // 🔑 THIS is the agent behavior!
                    // Gemini autonomously decided to call a tool
                    const toolEmoji = {
                        generate_quiz: '📝',
                        lookup_word: '📖',
                        generate_visual: '🎨',
                        create_bookmark: '🔖',
                        suggest_next_topic: '📚',
                    }[msg.tool] || '🔧'

                    appendTranscript('agent', `${toolEmoji} Agent called: ${msg.tool}`)

                    // Dispatch tool results to appropriate UI component
                    window.dispatchEvent(new CustomEvent('agent-tool-result', {
                        detail: { tool: msg.tool, args: msg.args, result: msg.result }
                    }))
                }

                else if (msg.type === 'turn_complete') {
                    // Don't auto-switch unless audio is done
                    // The onended handlers will clean up sources
                }

                else if (msg.type === 'interrupted') {
                    stopAudio()
                    isInterruptedRef.current = true
                    // Ignore in-flight audio chunks for a short window to let the network clear
                    setTimeout(() => { isInterruptedRef.current = false }, 1000)
                }

                else if (msg.type === 'error') {
                    appendTranscript('system', '⚠️ ' + msg.message)
                }
            } catch {
                // Not JSON — ignore
            }
        }

        ws.onclose = (e) => {
            if (e.code !== 1000) {
                appendTranscript('system', `⚠️ ${e.code} ${e.reason || 'Connection closed'}`)
            }
            setSession(s => ({ ...s, isLive: false, orbState: 'idle' }))
            cancelAnimationFrame(animFrameRef.current)
        }
    }, [appendTranscript, setSession, stopAudio, startMeter])

    const endSession = useCallback(() => {
        wsRef.current?.close()
        processorRef.current?.disconnect()
        audioCtxRef.current?.close()
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
                    <span className="text-sm">⚡ Barge-in</span>
                    <label className="toggle">
                        <input type="checkbox" id="toggle-bargein"
                            checked={settings.bargeIn}
                            onChange={e => setSettings(s => ({ ...s, bargeIn: e.target.checked }))} />
                        <span className="toggle-slider" />
                    </label>
                </div>
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
