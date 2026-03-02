import './TopBar.css'

export default function TopBar({ books, session, onEndSession }) {
    const bookCount = books?.length || 0
    return (
        <header className="topbar">
            <div className="topbar-left">
                <span className="topbar-logo">
                    <span className="topbar-logo-icon">📖</span>
                    <span className="gradient-text">ClassbookAI</span>
                </span>

                {bookCount > 0 && (
                    <>
                        <span className="topbar-divider" />
                        <span className="topbar-book-count">
                            📚 {bookCount} {bookCount === 1 ? 'book' : 'books'}
                        </span>
                    </>
                )}
            </div>

            <div className="topbar-right">
                {session.isLive ? (
                    <>
                        <span className="live-indicator">
                            <span className="live-dot active" />
                            LIVE SESSION
                        </span>
                        <button id="btn-end-session" className="btn btn-danger btn-sm" onClick={onEndSession}>
                            ⏹ End
                        </button>
                    </>
                ) : (
                    <span className="status-idle">Ready</span>
                )}
            </div>
        </header>
    )
}
