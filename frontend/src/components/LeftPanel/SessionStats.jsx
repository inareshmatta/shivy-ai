import { useState, useEffect } from 'react'

export default function SessionStats({ pageAnalysis, currentPage }) {
    const [startTime] = useState(Date.now())
    const [elapsed, setElapsed] = useState(0)

    useEffect(() => {
        const id = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000)
        return () => clearInterval(id)
    }, [startTime])

    const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

    return (
        <div style={{ padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
                ['📖 Current page', currentPage],
                ['📚 Concepts detected', pageAnalysis?.key_concepts?.length ?? '—'],
                ['⏱ Study time', fmt(elapsed)],
            ].map(([label, val]) => (
                <div key={label} className="stat-row">
                    <span className="text-sm text-muted">{label}</span>
                    <span className="text-sm" style={{ fontWeight: 600 }}>{val}</span>
                </div>
            ))}
            {pageAnalysis?.difficulty_level && (
                <div className="stat-row">
                    <span className="text-sm text-muted">📊 Page difficulty</span>
                    <DifficultyBar level={pageAnalysis.difficulty_level} />
                </div>
            )}
        </div>
    )
}

function DifficultyBar({ level }) {
    const pct = (level / 10) * 100
    const col = level <= 3 ? 'var(--clr-green)' : level <= 6 ? 'var(--clr-amber)' : 'var(--clr-coral)'
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 60, height: 4, background: 'var(--clr-surface-1)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: col, borderRadius: 4 }} />
            </div>
            <span className="text-xs" style={{ color: col }}>{level}/10</span>
        </div>
    )
}
