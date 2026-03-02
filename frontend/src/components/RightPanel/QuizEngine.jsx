import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import './QuizEngine.css'

const QUIZ_TYPES = [
    { id: 'mcq', label: '📝 MCQ' },
    { id: 'fill_blank', label: '⬜ Fill' },
    { id: 'true_false', label: '✓/✗ T/F' },
]

export default function QuizEngine({ pageAnalysis, currentPage, subject, appendTranscript }) {
    const [quizType, setQuizType] = useState('mcq')
    const [difficulty, setDifficulty] = useState(3)
    const [questions, setQuestions] = useState([])
    const [answers, setAnswers] = useState({})
    const [revealed, setRevealed] = useState({})
    const [loading, setLoading] = useState(false)
    const [score, setScore] = useState(null)

    const generateQuiz = async () => {
        if (!pageAnalysis?.full_text) {
            appendTranscript('system', '⚠️ Upload and analyze a page first.')
            return
        }
        setLoading(true); setQuestions([]); setAnswers({}); setRevealed({}); setScore(null)
        try {
            const fd = new FormData()
            fd.append('page_text', pageAnalysis.full_text)
            fd.append('quiz_type', quizType)
            fd.append('difficulty', difficulty)
            fd.append('num_questions', 4)
            fd.append('subject', subject)
            const res = await fetch('/api/generate-quiz', { method: 'POST', body: fd })
            const data = await res.json()
            setQuestions(data.questions || [])
        } catch (e) {
            appendTranscript('system', '⚠️ Quiz generation failed.')
        } finally {
            setLoading(false)
        }
    }

    const submitAnswer = (qId, idx) => {
        setAnswers(prev => ({ ...prev, [qId]: idx }))
        setRevealed(prev => ({ ...prev, [qId]: true }))
    }

    const calcScore = () => {
        if (!questions.length) return
        const correct = questions.filter(q =>
            answers[q.id] === q.correct_index
        ).length
        setScore({ correct, total: questions.length })
    }

    return (
        <div className="quiz-engine">
            {/* Controls */}
            <div className="qe-controls">
                <div className="qe-type-row">
                    {QUIZ_TYPES.map(t => (
                        <button key={t.id}
                            className={`btn btn-sm ${quizType === t.id ? 'btn-primary' : 'btn-ghost'}`}
                            id={`btn-quiz-type-${t.id}`}
                            onClick={() => setQuizType(t.id)}>{t.label}</button>
                    ))}
                </div>

                <div className="qe-diff-row">
                    <span className="text-xs text-muted">Difficulty</span>
                    <div className="diff-dots">
                        {[1, 2, 3, 4, 5].map(d => (
                            <button key={d} className={`diff-dot ${d <= difficulty ? 'active' : ''}`}
                                id={`btn-diff-${d}`}
                                onClick={() => setDifficulty(d)} />
                        ))}
                    </div>
                </div>

                <button id="btn-generate-quiz" className="btn btn-primary w-full btn-sm"
                    onClick={generateQuiz} disabled={loading}>
                    {loading ? '⏳ Generating…' : '⚡ Generate Quiz'}
                </button>
            </div>

            {/* Questions */}
            <div className="qe-questions">
                <AnimatePresence mode="popLayout">
                    {questions.map((q, qi) => (
                        <motion.div key={q.id}
                            className="qe-card"
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: qi * 0.08 }}>

                            <div className="qe-q-text">
                                <span className="qe-q-num">Q{qi + 1}.</span> {q.question}
                            </div>

                            {q.options && (
                                <div className="qe-options">
                                    {q.options.map((opt, oi) => {
                                        const chosen = answers[q.id] === oi
                                        const isCorrect = q.correct_index === oi
                                        const show = revealed[q.id]
                                        return (
                                            <button key={oi}
                                                id={`btn-q${q.id}-opt${oi}`}
                                                className={`qe-option
                          ${chosen ? 'chosen' : ''}
                          ${show && isCorrect ? 'correct' : ''}
                          ${show && chosen && !isCorrect ? 'wrong' : ''}
                        `}
                                                disabled={!!revealed[q.id]}
                                                onClick={() => submitAnswer(q.id, oi)}>
                                                <span className="opt-label">{String.fromCharCode(65 + oi)}</span>
                                                {opt}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}

                            {revealed[q.id] && (
                                <motion.div className="qe-explanation"
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}>
                                    {answers[q.id] === q.correct_index ? '✅ Correct! ' : '❌ '}
                                    {q.explanation}
                                </motion.div>
                            )}
                        </motion.div>
                    ))}
                </AnimatePresence>

                {questions.length > 0 && !score && Object.keys(revealed).length === questions.length && (
                    <button id="btn-see-score" className="btn btn-primary w-full btn-sm" onClick={calcScore}>
                        📊 See Score
                    </button>
                )}

                {score && (
                    <motion.div className="qe-score" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                        🎯 {score.correct}/{score.total} correct —{' '}
                        <strong>{Math.round((score.correct / score.total) * 100)}%</strong>
                    </motion.div>
                )}
            </div>
        </div>
    )
}
