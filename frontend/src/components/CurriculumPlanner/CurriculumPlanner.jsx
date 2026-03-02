import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import './CurriculumPlanner.css'

const COLORS = ['#6C8EF2', '#A78BFA', '#F472B6', '#34D399', '#FBBF24', '#FB7185']

export default function CurriculumPlanner({ books, onClose }) {
    const [plan, setPlan] = useState(null)
    const [loading, setLoading] = useState(false)
    const [examDate, setExamDate] = useState('')
    const [dailyHours, setDailyHours] = useState(3)
    const [error, setError] = useState(null)

    // Generate curriculum plan via AI
    const generatePlan = useCallback(async () => {
        if (!examDate) return setError('Please set your exam date')
        setError(null)
        setLoading(true)

        try {
            const subjects = books.map(b => b.name || b.filename || 'Unknown').join(', ')
            const daysUntilExam = Math.max(1, Math.ceil(
                (new Date(examDate) - new Date()) / (1000 * 60 * 60 * 24)
            ))

            const res = await fetch('/api/curriculum-plan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subjects,
                    days_until_exam: daysUntilExam,
                    daily_hours: dailyHours,
                    num_books: books.length,
                }),
            })

            if (res.ok) {
                const data = await res.json()
                setPlan(data)
            } else {
                // Fallback: generate a simple plan locally
                setPlan(generateLocalPlan(books, daysUntilExam, dailyHours))
            }
        } catch {
            // Offline fallback
            const daysUntilExam = Math.max(1, Math.ceil(
                (new Date(examDate) - new Date()) / (1000 * 60 * 60 * 24)
            ))
            setPlan(generateLocalPlan(books, daysUntilExam, dailyHours))
        } finally {
            setLoading(false)
        }
    }, [books, examDate, dailyHours])

    // Local plan generator (works without backend)
    function generateLocalPlan(books, totalDays, hoursPerDay) {
        const phases = [
            { name: '📖 Study Phase', pct: 0.5, desc: 'Read and understand all chapters' },
            { name: '🔄 Revision Phase', pct: 0.3, desc: 'Review key concepts and formulas' },
            { name: '📝 Practice Phase', pct: 0.2, desc: 'Mock tests and problem solving' },
        ]

        const today = new Date()
        let dayOffset = 0

        const weeks = []
        phases.forEach((phase, pi) => {
            const phaseDays = Math.max(1, Math.round(totalDays * phase.pct))
            const phaseWeeks = Math.max(1, Math.ceil(phaseDays / 7))

            for (let w = 0; w < phaseWeeks; w++) {
                const weekStart = new Date(today)
                weekStart.setDate(weekStart.getDate() + dayOffset)
                const weekEnd = new Date(weekStart)
                weekEnd.setDate(weekEnd.getDate() + 6)
                dayOffset += 7

                const tasks = books.map((b, bi) => ({
                    id: `${pi}-${w}-${bi}`,
                    subject: b.name || b.filename || `Book ${bi + 1}`,
                    task: phase.name === '📖 Study Phase'
                        ? `Study chapters from ${b.name || 'book'}`
                        : phase.name === '🔄 Revision Phase'
                            ? `Revise key concepts`
                            : `Practice problems & mock test`,
                    hours: Math.round(hoursPerDay / books.length * 10) / 10,
                    done: false,
                    color: COLORS[bi % COLORS.length],
                }))

                weeks.push({
                    label: `Week ${weeks.length + 1}`,
                    phase: phase.name,
                    phaseDesc: phase.desc,
                    dateRange: `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
                    tasks,
                })
            }
        })

        return {
            total_days: totalDays,
            daily_hours: hoursPerDay,
            exam_date: examDate,
            weeks,
            tips: [
                'Start each session with a 5-min review of yesterday\'s notes',
                'Use the AI tutor for difficult concepts — don\'t get stuck',
                'Take quizzes after each chapter to reinforce learning',
                'Sleep well — memory consolidation happens during sleep',
            ],
        }
    }

    // Toggle task completion
    const toggleTask = (weekIdx, taskId) => {
        setPlan(prev => ({
            ...prev,
            weeks: prev.weeks.map((w, wi) => wi !== weekIdx ? w : {
                ...w,
                tasks: w.tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t)
            })
        }))
    }

    // Reset plan
    const resetPlan = () => {
        setPlan(prev => prev ? {
            ...prev,
            weeks: prev.weeks.map(w => ({
                ...w,
                tasks: w.tasks.map(t => ({ ...t, done: false }))
            }))
        } : null)
    }

    // Calculate progress
    const progress = plan ? (() => {
        const total = plan.weeks.reduce((a, w) => a + w.tasks.length, 0)
        const done = plan.weeks.reduce((a, w) => a + w.tasks.filter(t => t.done).length, 0)
        return total > 0 ? Math.round(done / total * 100) : 0
    })() : 0

    return (
        <AnimatePresence>
            <motion.div
                className="planner-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
            >
                <motion.div
                    className="planner-panel glass"
                    initial={{ y: 40, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 40, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                >
                    {/* Header */}
                    <div className="planner-header">
                        <div>
                            <h2>📅 Curriculum Planner</h2>
                            <p className="text-muted text-sm">Plan your exam preparation</p>
                        </div>
                        <button className="btn btn-icon btn-ghost" id="btn-close-planner" onClick={onClose}>✕</button>
                    </div>

                    {!plan ? (
                        /* Setup form */
                        <div className="planner-setup">
                            <div className="planner-setup-card glass">
                                <h3>🎯 Set your goal</h3>

                                <label className="planner-label">
                                    <span>Exam Date</span>
                                    <input
                                        type="date"
                                        className="planner-input"
                                        value={examDate}
                                        min={new Date().toISOString().split('T')[0]}
                                        onChange={e => setExamDate(e.target.value)}
                                    />
                                </label>

                                <label className="planner-label">
                                    <span>Daily Study Hours</span>
                                    <div className="planner-hours">
                                        {[1, 2, 3, 4, 5, 6].map(h => (
                                            <button
                                                key={h}
                                                className={`tag ${dailyHours === h ? 'tag-blue active' : ''}`}
                                                onClick={() => setDailyHours(h)}
                                            >{h}h</button>
                                        ))}
                                    </div>
                                </label>

                                <div className="planner-books-preview">
                                    <span className="text-xs text-muted">Subjects from Library:</span>
                                    <div className="planner-book-tags">
                                        {books.length > 0 ? books.map((b, i) => (
                                            <span key={i} className="tag" style={{ background: COLORS[i % COLORS.length] + '30', color: COLORS[i % COLORS.length] }}>
                                                {b.name || b.filename || `Book ${i + 1}`}
                                            </span>
                                        )) : (
                                            <span className="text-muted text-xs">Upload books first</span>
                                        )}
                                    </div>
                                </div>

                                {error && <p className="planner-error">⚠️ {error}</p>}

                                <button
                                    className="btn btn-primary"
                                    id="btn-generate-plan"
                                    onClick={generatePlan}
                                    disabled={loading || books.length === 0}
                                >
                                    {loading ? '⏳ Generating…' : '✨ Generate Study Plan'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* Plan view */
                        <div className="planner-content">
                            {/* Progress bar */}
                            <div className="planner-progress-section">
                                <div className="planner-progress-header">
                                    <span className="planner-progress-label">
                                        {progress < 30 ? '🚀 Just Started' :
                                            progress < 60 ? '📚 Making Progress' :
                                                progress < 90 ? '🔥 Almost There' : '🏆 Ready!'}
                                    </span>
                                    <span className="planner-progress-pct">{progress}%</span>
                                </div>
                                <div className="planner-progress-bar">
                                    <div className="planner-progress-fill" style={{ width: `${progress}%` }} />
                                </div>
                                <div className="planner-meta">
                                    <span>📅 Exam: {new Date(plan.exam_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                                    <span>⏱ {plan.daily_hours}h/day</span>
                                    <span>📖 {books.length} subject{books.length > 1 ? 's' : ''}</span>
                                </div>
                            </div>

                            {/* Weeks */}
                            <div className="planner-weeks">
                                {plan.weeks.map((week, wi) => (
                                    <div key={wi} className="planner-week">
                                        <div className="planner-week-header">
                                            <div>
                                                <strong>{week.label}</strong>
                                                <span className="tag tag-blue" style={{ marginLeft: 8, fontSize: 10 }}>{week.phase}</span>
                                            </div>
                                            <span className="text-xs text-muted">{week.dateRange}</span>
                                        </div>
                                        <p className="text-xs text-muted" style={{ marginBottom: 8 }}>{week.phaseDesc}</p>
                                        <div className="planner-tasks">
                                            {week.tasks.map(task => (
                                                <div
                                                    key={task.id}
                                                    className={`planner-task ${task.done ? 'done' : ''}`}
                                                    onClick={() => toggleTask(wi, task.id)}
                                                >
                                                    <div className="planner-task-check" style={{ borderColor: task.color, background: task.done ? task.color : 'transparent' }}>
                                                        {task.done && '✓'}
                                                    </div>
                                                    <div className="planner-task-info">
                                                        <span className="planner-task-subject" style={{ color: task.color }}>{task.subject}</span>
                                                        <span className={`planner-task-desc ${task.done ? 'struck' : ''}`}>{task.task}</span>
                                                    </div>
                                                    <span className="planner-task-hours">{task.hours}h</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Tips */}
                            {plan.tips?.length > 0 && (
                                <div className="planner-tips">
                                    <h4>💡 Study Tips</h4>
                                    {plan.tips.map((tip, i) => (
                                        <p key={i} className="planner-tip">• {tip}</p>
                                    ))}
                                </div>
                            )}

                            {/* Actions */}
                            <div className="planner-actions">
                                <button className="btn btn-ghost" id="btn-reset-plan" onClick={resetPlan}>
                                    🔄 Reset Progress
                                </button>
                                <button className="btn btn-ghost" id="btn-new-plan" onClick={() => setPlan(null)}>
                                    📝 New Plan
                                </button>
                            </div>
                        </div>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}
