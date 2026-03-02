import { useState, useRef, useCallback } from 'react'
import BookRenderer from './BookRenderer'
import AIPresenceOrb from './AIPresenceOrb'
import WordTooltip from './WordTooltip'
import './CenterCanvas.css'

export default function CenterCanvas({
    book, currentPage, setCurrentPage, session, setSession,
    pageAnalysis, setPageAnalysis,
    settings, appendTranscript, onVisualRequest, onOpenVisualPanel,
    transcript,
}) {
    const containerRef = useRef(null)
    const [tooltip, setTooltip] = useState(null)
    const [analyzing, setAnalyzing] = useState(false)
    const lastAnalyzedPage = useRef(null)

    // Called when BookRenderer renders a page
    const onPageRendered = useCallback(async (blob, canvasW, canvasH, pageText) => {
        // Skip if same page already analyzed
        if (lastAnalyzedPage.current === currentPage) return
        lastAnalyzedPage.current = currentPage

        // Store page text locally even without backend
        setPageAnalysis(prev => ({
            ...prev,
            full_text: pageText || prev?.full_text || '',
        }))

        setAnalyzing(true)
        try {
            const fd = new FormData()
            fd.append('file', blob, 'page.jpg')
            fd.append('subject', book?.subject || 'General')

            const res = await fetch('/api/analyze-page', { method: 'POST', body: fd })
            if (res.ok) {
                const analysis = await res.json()
                setPageAnalysis({ ...analysis, full_text: pageText || analysis.full_text || '' })
            }
        } catch (e) {
            console.warn('Page analysis unavailable (backend not running):', e.message)
        } finally {
            setAnalyzing(false)
        }
    }, [book, currentPage, setPageAnalysis])

    // Word click → dictionary lookup (works with or without backend)
    const handleWordClick = useCallback(async (word, pageX, pageY) => {
        setTooltip({ word, x: pageX, y: pageY, definition: null, loading: true })
        try {
            const fd = new FormData()
            fd.append('word', word)
            fd.append('context', pageAnalysis?.full_text?.slice(0, 400) || '')
            fd.append('subject', book?.subject || 'General')
            fd.append('language', settings?.language || 'English')
            const res = await fetch('/api/word-definition', { method: 'POST', body: fd })
            if (res.ok) {
                const def = await res.json()
                setTooltip(prev => prev?.word === word ? { ...prev, definition: def, loading: false } : prev)
            } else {
                setTooltip(prev => prev ? { ...prev, loading: false, definition: { error: 'Backend not available. Start the backend to enable dictionary.' } } : prev)
            }
        } catch {
            setTooltip(prev => prev ? { ...prev, loading: false, definition: { error: 'Cannot connect to backend. Start: cd backend && uvicorn main:app --port 8080' } } : prev)
        }
    }, [book, pageAnalysis, settings])

    // Empty state
    if (!book) {
        return (
            <main className="center-canvas" ref={containerRef}>
                <div className="orb-wrapper">
                    <AIPresenceOrb state={session.orbState} />
                </div>
                <div className="cc-content">
                    <div className="cc-empty">
                        <div className="cc-empty-icon">📖</div>
                        <h2>Upload a textbook to begin</h2>
                        <p className="text-muted">Drag a PDF or image to the left panel</p>
                        <div className="cc-features">
                            {['🎙 Voice tutor', '👁 Word detection', '🎨 Visual diagrams', '🧠 Auto quiz'].map(f => (
                                <span key={f} className="tag tag-blue">{f}</span>
                            ))}
                        </div>
                    </div>
                </div>
            </main>
        )
    }

    return (
        <main className="center-canvas" ref={containerRef}>
            {/* AI Orb */}
            <div className="orb-wrapper">
                <AIPresenceOrb state={session.orbState} />
                {analyzing && <span className="analyzing-tag tag tag-amber">🔍 Analyzing…</span>}
                {book && session.isLive && (
                    <button className="btn btn-sm btn-ghost" style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}
                        onClick={() => {
                            const canvas = document.getElementById('pdf-canvas')
                            if (canvas) {
                                const base64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1]
                                window.dispatchEvent(new CustomEvent('send-vision-frame', { detail: base64 }))
                                appendTranscript('user', '👁️ Please explain the diagrams on this page.')
                            } else {
                                appendTranscript('system', '⚠️ Cannot capture page right now.')
                            }
                        }}>
                        👁️ Explain Page & Diagrams
                    </button>
                )}
            </div>

            {/* Book content */}
            <div className="cc-content">
                <div className="cc-page-wrapper">
                    <BookRenderer
                        book={book}
                        currentPage={currentPage}
                        setCurrentPage={setCurrentPage}
                        onPageRendered={onPageRendered}
                        onWordClick={handleWordClick}
                    />
                </div>
            </div>

            {/* Word tooltip */}
            {tooltip && (
                <WordTooltip
                    {...tooltip}
                    onClose={() => setTooltip(null)}
                    onAskTutor={(word) => appendTranscript('user', `Tell me about "${word}"`)}
                    onVisualize={(word) => {
                        onOpenVisualPanel?.(null, word)
                        appendTranscript('system', `🎨 Opened Visual Explainer for "${word}"`)
                    }}
                    onBookmark={(word, def) => {
                        window.dispatchEvent(new CustomEvent('agent-tool-result', {
                            detail: {
                                tool: 'create_bookmark',
                                result: {
                                    saved: true,
                                    text: `${word}: ${def?.subject_definition || def?.general_definition || 'Saved from dictionary'}`,
                                    tags: [book?.subject || 'General', 'Dictionary'],
                                    page: currentPage,
                                },
                            },
                        }))
                    }}
                />
            )}

            {/* Transcript bar — shows system messages, agent actions, errors */}
            {transcript && transcript.length > 0 && (
                <div className="cc-transcript">
                    {transcript.slice(-5).map((msg, i) => (
                        <div key={i} className={`cc-msg cc-msg-${msg.role}`}>
                            <span className="cc-msg-icon">
                                {msg.role === 'system' ? '⚙️' :
                                    msg.role === 'agent' ? '🤖' :
                                        msg.role === 'ai' ? '🎙️' :
                                            msg.role === 'user' ? '💬' : '📌'}
                            </span>
                            <span className="cc-msg-text">{msg.text}</span>
                        </div>
                    ))}
                </div>
            )}
        </main>
    )
}
