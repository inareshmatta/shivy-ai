import { useState } from 'react'
import KnowledgeVault from './KnowledgeVault'
import './RightPanel.css'

export default function RightPanel({ pageAnalysis, currentPage, subject, appendTranscript, onOpenAssessment }) {
    return (
        <aside className="panel right-panel">
            {/* Quick quiz summary */}
            <div className="panel-card">
                <div className="section-header">
                    <span className="section-header-icon">📝</span>
                    Assessments
                </div>
                <div className="rp-assess">
                    <div className="rp-assess-stats">
                        <div className="rp-assess-stat">
                            <span className="rp-stat-num gradient-text">0</span>
                            <span className="text-xxs text-muted">Taken</span>
                        </div>
                        <div className="rp-assess-stat">
                            <span className="rp-stat-num gradient-text">—</span>
                            <span className="text-xxs text-muted">Avg Score</span>
                        </div>
                        <div className="rp-assess-stat">
                            <span className="rp-stat-num gradient-text">0</span>
                            <span className="text-xxs text-muted">Streak</span>
                        </div>
                    </div>
                    <button id="btn-open-assessment" className="btn btn-primary w-full btn-sm"
                        onClick={onOpenAssessment}>
                        ⚡ Take Assessment
                    </button>
                    <div className="rp-type-tags">
                        {['MCQ', 'Fill Blank', 'T/F', 'Match', 'Short'].map(t => (
                            <span key={t} className="tag tag-ghost">{t}</span>
                        ))}
                    </div>
                </div>
            </div>

            {/* Page insights */}
            {pageAnalysis && (
                <div className="panel-card">
                    <div className="section-header">
                        <span className="section-header-icon">🧠</span>
                        Page Insights
                    </div>
                    <div className="rp-insights">
                        {pageAnalysis.key_concepts?.length > 0 && (
                            <div className="rp-concepts">
                                {pageAnalysis.key_concepts.map(c => (
                                    <span key={c} className="tag tag-blue">{c}</span>
                                ))}
                            </div>
                        )}
                        {pageAnalysis.page_summary && (
                            <p className="rp-summary">{pageAnalysis.page_summary}</p>
                        )}
                        <div className="rp-meta">
                            {pageAnalysis.difficulty_level && (
                                <span className="tag tag-amber">Difficulty: {pageAnalysis.difficulty_level}/10</span>
                            )}
                            {pageAnalysis.has_diagram && <span className="tag tag-teal">Has Diagram</span>}
                            {pageAnalysis.has_formula && <span className="tag tag-purple">Has Formulas</span>}
                        </div>
                    </div>
                </div>
            )}

            {/* Knowledge vault */}
            <div className="panel-card" style={{ flex: 1, minHeight: 0 }}>
                <div className="section-header">
                    <span className="section-header-icon">🔖</span>
                    Knowledge Vault
                </div>
                <KnowledgeVault subject={subject} />
            </div>
        </aside>
    )
}
