import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import './WordTooltip.css'

export default function WordTooltip({ word, x, y, definition, loading, onClose, onAskTutor, onBookmark, onVisualize }) {
    const ref = useRef()
    const [pos, setPos] = useState({ left: x, top: y + 12 })

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [onClose])

    // Reposition after render to keep tooltip fully within viewport
    useEffect(() => {
        if (!ref.current) return
        const rect = ref.current.getBoundingClientRect()
        const margin = 16
        let left = x
        let top = y + 12

        // Clamp right edge
        if (left + rect.width > window.innerWidth - margin) {
            left = window.innerWidth - rect.width - margin
        }
        // Clamp left edge
        if (left < margin) left = margin

        // Clamp bottom edge — if tooltip overflows below, show above the word
        if (top + rect.height > window.innerHeight - margin) {
            top = y - rect.height - 8
        }
        // Clamp top edge
        if (top < margin) top = margin

        setPos({ left, top })
    }, [x, y, definition, loading])

    return (
        <AnimatePresence>
            <motion.div
                ref={ref}
                className="word-tooltip tooltip"
                style={{ left: pos.left, top: pos.top }}
                initial={{ opacity: 0, scale: 0.9, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                id="word-tooltip"
            >
                {/* Header */}
                <div className="wt-header">
                    <div className="wt-word-block">
                        <span className="wt-word">{word}</span>
                        {definition?.difficulty && (
                            <span className={`tag ${definition.difficulty <= 2 ? 'tag-green' : definition.difficulty <= 3 ? 'tag-amber' : 'tag-coral'}`}>
                                Lv.{definition.difficulty}
                            </span>
                        )}
                    </div>
                    <button className="btn btn-icon btn-ghost btn-sm wt-close" onClick={onClose}>✕</button>
                </div>

                {/* Pronunciation */}
                {definition?.ipa && (
                    <div className="wt-pronunciation">
                        <span className="wt-ipa">{definition.ipa}</span>
                        {definition.pronunciation_guide && (
                            <span className="wt-pronun-guide">({definition.pronunciation_guide})</span>
                        )}
                    </div>
                )}

                {loading ? (
                    <div className="wt-loading">
                        <div className="shimmer" style={{ height: 12, borderRadius: 4, margin: '6px 0' }} />
                        <div className="shimmer" style={{ height: 12, borderRadius: 4, width: '80%' }} />
                        <div className="shimmer" style={{ height: 12, borderRadius: 4, width: '60%', marginTop: 4 }} />
                    </div>
                ) : definition ? (
                    <>
                        {/* Etymology */}
                        {definition.etymology && (
                            <div className="wt-etymology">
                                🌿 <span>{definition.etymology}</span>
                            </div>
                        )}

                        {/* Subject definition */}
                        <p className="wt-def">
                            <strong>{definition.subject_definition ? 'Subject definition:' : 'Definition:'}</strong>{' '}
                            {definition.subject_definition || definition.general_definition}
                        </p>

                        {/* General definition (if different) */}
                        {definition.general_definition && definition.subject_definition && (
                            <p className="wt-gen-def">
                                <em>General:</em> {definition.general_definition}
                            </p>
                        )}

                        {/* Analogy */}
                        {definition.simple_analogy && (
                            <div className="wt-analogy">💡 {definition.simple_analogy}</div>
                        )}

                        {/* Example sentence */}
                        {definition.example_sentence && (
                            <div className="wt-example">
                                📝 <em>"{definition.example_sentence}"</em>
                            </div>
                        )}

                        {/* Fun fact */}
                        {definition.fun_fact && (
                            <div className="wt-fun-fact">
                                🎓 <strong>Did you know?</strong> {definition.fun_fact}
                            </div>
                        )}

                        {/* Related terms */}
                        {definition.related_terms?.length > 0 && (
                            <div className="wt-related">
                                {definition.related_terms.map(t => (
                                    <span key={t} className="tag tag-purple">{t}</span>
                                ))}
                            </div>
                        )}

                        {/* Context */}
                        {definition.usage_in_context && (
                            <p className="wt-context">
                                📄 <em>{definition.usage_in_context}</em>
                            </p>
                        )}

                        {/* Actions */}
                        <div className="wt-actions">
                            <button className="btn btn-ghost btn-sm" id={`btn-ask-tutor-${word}`}
                                onClick={() => { onAskTutor(word); onClose() }}>🤖 Ask Tutor</button>
                            <button className="btn btn-ghost btn-sm" id={`btn-visualize-${word}`}
                                onClick={() => { onVisualize?.(word); onClose() }}>🎨 Visualize</button>
                            <button className="btn btn-ghost btn-sm" id={`btn-bookmark-${word}`}
                                onClick={() => { onBookmark(word, definition); onClose() }}>🔖 Save</button>
                        </div>

                        {/* Source indicator */}
                        <div className="wt-source">
                            <span className="text-xs text-muted">🔍 Google Search grounded</span>
                        </div>
                    </>
                ) : definition?.error ? (
                    <p className="text-muted text-sm" style={{ padding: '8px 0' }}>⚠️ {definition.error}</p>
                ) : (
                    <p className="text-muted text-sm">Could not load definition.</p>
                )}
            </motion.div>
        </AnimatePresence>
    )
}
