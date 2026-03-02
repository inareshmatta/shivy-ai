import { useState } from 'react'
import { motion } from 'framer-motion'
import './VisualPanel.css'

const VISUAL_TYPES = [
    { id: 'concept_map', label: '🗺️ Concept Map' },
    { id: 'flowchart', label: '📊 Flowchart' },
    { id: 'infographic', label: '📖 Infographic' },
    { id: 'diagram', label: '🔬 Diagram' },
    { id: 'timeline', label: '📅 Timeline' },
]

export default function VisualPanel({ open, sessionId, currentImage, history, subject, initialTopic, onClose, onVisualGenerated }) {
    const [selectedType, setSelectedType] = useState('concept_map')
    const [topic, setTopic] = useState(initialTopic || '')
    const [detail, setDetail] = useState('')
    const [quality, setQuality] = useState('fast')
    const [refineText, setRefineText] = useState('')
    const [generating, setGenerating] = useState(false)
    const [historyIdx, setHistoryIdx] = useState(null)

    const generate = async () => {
        if (!topic.trim()) return
        setGenerating(true)
        try {
            const fd = new FormData()
            fd.append('visual_type', selectedType)
            fd.append('topic', topic)
            fd.append('detail', detail)
            fd.append('subject', subject)
            fd.append('session_id', sessionId)
            fd.append('quality', quality)
            const res = await fetch('/api/generate-visual', { method: 'POST', body: fd })
            const data = await res.json()
            if (data.image_b64) {
                onVisualGenerated({ ...data, type: selectedType, topic, timestamp: Date.now() })
                setHistoryIdx(null)
            }
        } finally {
            setGenerating(false)
        }
    }

    const refine = async () => {
        if (!refineText.trim()) return
        setGenerating(true)
        try {
            const fd = new FormData()
            fd.append('session_id', sessionId)
            fd.append('instruction', refineText)
            fd.append('quality', quality)
            const res = await fetch('/api/refine-visual', { method: 'POST', body: fd })
            const data = await res.json()
            if (data.image_b64) {
                onVisualGenerated({ ...data, timestamp: Date.now() })
                setRefineText('')
                setHistoryIdx(null)
            }
        } finally {
            setGenerating(false)
        }
    }

    const displayImage = historyIdx !== null ? history[historyIdx] : currentImage

    return (
        <motion.div
            className="visual-panel"
            id="visual-panel"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        >
            {/* Header */}
            <div className="vp-header">
                <span className="gradient-text" style={{ fontWeight: 700 }}>🎨 Visual Explainer</span>
                <div className="vp-header-right">
                    <span className="text-xs text-muted">Powered by Nano Banana 2</span>
                    {displayImage && (
                        <a className="btn btn-ghost btn-sm"
                            href={`data:${displayImage.mime_type};base64,${displayImage.image_b64}`}
                            download={`classbook-${displayImage.type || 'visual'}.png`}
                            id="btn-download-visual">💾 Save</a>
                    )}
                    <button id="btn-close-visual" className="btn btn-ghost btn-sm" onClick={onClose}>↓ Close</button>
                </div>
            </div>

            <div className="vp-body">
                {/* Left: Controls */}
                <div className="vp-controls">
                    <div className="vp-type-grid">
                        {VISUAL_TYPES.map(t => (
                            <button key={t.id}
                                id={`btn-vtype-${t.id}`}
                                className={`btn btn-sm ${selectedType === t.id ? 'btn-primary' : 'btn-ghost'}`}
                                onClick={() => setSelectedType(t.id)}>{t.label}</button>
                        ))}
                    </div>

                    <input id="input-visual-topic" className="input"
                        placeholder="Topic (e.g. Photosynthesis)"
                        value={topic} onChange={e => setTopic(e.target.value)} />

                    <textarea id="input-visual-detail" className="input vp-textarea"
                        placeholder="Extra detail (optional)…"
                        value={detail} onChange={e => setDetail(e.target.value)} rows={2} />

                    <div className="vp-quality-row">
                        <span className="text-xs text-muted">Quality</span>
                        <div style={{ display: 'flex', gap: 4 }}>
                            {[['fast', '⚡ Fast'], ['pro', '🏆 Pro 4K']].map(([q, l]) => (
                                <button key={q} id={`btn-quality-${q}`}
                                    className={`btn btn-sm ${quality === q ? 'btn-primary' : 'btn-ghost'}`}
                                    onClick={() => setQuality(q)}>{l}</button>
                            ))}
                        </div>
                    </div>

                    <button id="btn-generate-visual" className="btn btn-primary w-full"
                        onClick={generate} disabled={generating || !topic.trim()}>
                        {generating ? '⏳ Generating…' : '✨ Generate Visual'}
                    </button>

                    <hr className="divider" />

                    <div className="vp-refine-section">
                        <h4>✏️ Refine</h4>
                        <input id="input-refine-visual" className="input"
                            placeholder="e.g. Add labels, Make arrows bigger…"
                            value={refineText}
                            onChange={e => setRefineText(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && refine()} />
                        <button id="btn-refine-visual" className="btn btn-ghost btn-sm w-full"
                            onClick={refine} disabled={generating || !refineText.trim()}>
                            🔄 Apply Refinement
                        </button>
                    </div>

                    {history.length > 1 && (
                        <div className="vp-history">
                            <h4>📜 History ({history.length})</h4>
                            <div className="vp-history-thumbs">
                                {history.map((h, i) => (
                                    <div key={i} className={`vp-thumb ${historyIdx === i ? 'active' : ''}`}
                                        onClick={() => setHistoryIdx(historyIdx === i ? null : i)}>
                                        <img src={`data:${h.mime_type};base64,${h.image_b64}`} alt={`v${i + 1}`} />
                                        <span>v{i + 1}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right: Canvas */}
                <div className="vp-canvas">
                    {generating ? (
                        <div className="vp-generating">
                            <div className="vp-gen-orb" />
                            <p>Generating with Nano Banana 2…</p>
                            <p className="text-muted text-sm">Uses Google Search for accuracy</p>
                        </div>
                    ) : displayImage ? (
                        <img
                            id="visual-output-img"
                            className="vp-output-img"
                            src={`data:${displayImage.mime_type};base64,${displayImage.image_b64}`}
                            alt={displayImage.alt_text || 'Generated visual'}
                        />
                    ) : (
                        <div className="vp-placeholder">
                            <span style={{ fontSize: 64 }}>🎨</span>
                            <p style={{ marginTop: 12 }}>Choose a type, enter a topic, and hit Generate</p>
                            <p className="text-muted text-sm" style={{ marginTop: 4 }}>
                                Nano Banana 2 · 2K resolution · Google Search-grounded
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    )
}
