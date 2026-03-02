import VoiceControls from './VoiceControls'
import BookLibrary from './BookLibrary'
import SessionStats from './SessionStats'
import './LeftPanel.css'

export default function LeftPanel({
    session, setSession, books, activeBook,
    addBook, removeBook, selectBook,
    settings, setSettings, pageAnalysis,
    onOpenVisualPanel, onOpenAssessment, onOpenPlanner, appendTranscript, currentPage,
}) {
    return (
        <aside className="panel left-panel">
            {/* Book Library — supports multiple */}
            <div className="panel-card">
                <div className="section-header">
                    <span className="section-header-icon">📚</span>
                    Library
                </div>
                <BookLibrary
                    books={books}
                    activeBook={activeBook}
                    addBook={addBook}
                    removeBook={removeBook}
                    selectBook={selectBook}
                />
            </div>

            {/* Voice Controls */}
            <div className="panel-card">
                <div className="section-header">
                    <span className="section-header-icon">🎙</span>
                    Voice Tutor
                </div>
                <VoiceControls
                    session={session}
                    setSession={setSession}
                    settings={settings}
                    setSettings={setSettings}
                    book={activeBook}
                    pageAnalysis={pageAnalysis}
                    appendTranscript={appendTranscript}
                    currentPage={currentPage}
                />
            </div>

            {/* Settings */}
            <div className="panel-card">
                <div className="section-header">
                    <span className="section-header-icon">⚙️</span>
                    Settings
                </div>
                <div className="lp-settings">
                    <div className="lp-field">
                        <label className="lp-label">Language</label>
                        <select id="sel-language" className="input"
                            value={settings.language}
                            onChange={e => setSettings(s => ({ ...s, language: e.target.value }))}>
                            {['English', 'Hindi', 'Spanish', 'French', 'German', 'Arabic', 'Chinese', 'Japanese',
                                'Korean', 'Portuguese', 'Russian', 'Bengali', 'Tamil', 'Telugu', 'Urdu'].map(l => (
                                    <option key={l}>{l}</option>
                                ))}
                        </select>
                    </div>

                    <div className="lp-field">
                        <label className="lp-label">Grade level</label>
                        <select id="sel-grade" className="input"
                            value={settings.grade}
                            onChange={e => setSettings(s => ({ ...s, grade: e.target.value }))}>
                            {['6', '7', '8', '9', '10', '11', '12', 'Undergraduate', 'Graduate'].map(g => (
                                <option key={g} value={g}>Grade {g}</option>
                            ))}
                        </select>
                    </div>

                    <div className="lp-field">
                        <label className="lp-label">AI Voice</label>
                        <select id="sel-voice" className="input"
                            value={settings.voice}
                            onChange={e => setSettings(s => ({ ...s, voice: e.target.value }))}>
                            {['Kore', 'Puck', 'Charon', 'Fenrir', 'Aoede', 'Leda', 'Orus', 'Zephyr'].map(v => (
                                <option key={v}>{v}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="panel-card">
                <div className="section-header">
                    <span className="section-header-icon">⚡</span>
                    Quick Actions
                </div>
                <div className="lp-actions">
                    <button id="btn-launch-visual" className="btn btn-primary w-full"
                        onClick={() => onOpenVisualPanel()}>
                        🎨 Visual Explainer
                    </button>
                    <button id="btn-launch-assessment" className="btn btn-secondary w-full"
                        onClick={onOpenAssessment}>
                        📝 Assessment Center
                    </button>
                    <button id="btn-launch-planner" className="btn btn-secondary w-full"
                        onClick={onOpenPlanner}>
                        📅 Study Planner
                    </button>
                </div>
            </div>

            {/* Session Stats */}
            <div className="panel-card">
                <div className="section-header">
                    <span className="section-header-icon">📊</span>
                    Session
                </div>
                <SessionStats pageAnalysis={pageAnalysis} currentPage={currentPage} />
            </div>
        </aside>
    )
}
