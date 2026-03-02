import { useState, useEffect } from 'react'
import './KnowledgeVault.css'

export default function KnowledgeVault({ subject }) {
    const [search, setSearch] = useState('')
    const [bookmarks, setBookmarks] = useState([])

    // Listen for bookmarks from the agent's create_bookmark tool
    useEffect(() => {
        const handler = (e) => {
            const { tool, result } = e.detail
            if (tool === 'create_bookmark' && result?.saved) {
                setBookmarks(prev => [...prev, {
                    id: Date.now(),
                    page: result.page || '—',
                    text: result.text,
                    color: 'blue',
                    tags: result.tags || [],
                }])
            }
        }
        window.addEventListener('agent-tool-result', handler)
        return () => window.removeEventListener('agent-tool-result', handler)
    }, [])

    const filtered = bookmarks.filter(b =>
        b.text.toLowerCase().includes(search.toLowerCase()) ||
        b.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
    )

    const generateRevision = async () => {
        if (bookmarks.length === 0) return
        try {
            const fd = new FormData()
            fd.append('bookmarks', JSON.stringify(bookmarks.map(b => b.text)))
            fd.append('subject', subject || 'General')
            const res = await fetch('/api/revision-sheet', { method: 'POST', body: fd })
            if (res.ok) {
                const data = await res.json()
                // Open revision sheet in a new window/overlay
                const win = window.open('', '_blank')
                win.document.write(`<pre style="font-family:Inter;padding:24px;">${data.sheet || data.text || JSON.stringify(data, null, 2)}</pre>`)
            }
        } catch (err) {
            console.error('Revision sheet generation failed:', err)
        }
    }

    return (
        <div className="knowledge-vault">
            <div className="kv-search-row">
                <input
                    id="input-bookmark-search"
                    className="input"
                    placeholder="🔍 Search saved highlights…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>

            <div className="kv-list">
                {filtered.length === 0 && (
                    <div className="kv-empty">
                        <span>🔖</span>
                        <p className="text-muted text-sm">
                            {search ? 'No matches found' : 'Bookmarks from your AI tutor will appear here'}
                        </p>
                    </div>
                )}
                {filtered.map(b => (
                    <div key={b.id} className="kv-card" id={`bookmark-${b.id}`}>
                        <div className="kv-card-header">
                            <span className={`kv-dot hl-${b.color}`} />
                            <span className="text-xs text-muted">Page {b.page}</span>
                            <button className="btn btn-icon btn-ghost btn-sm kv-del"
                                onClick={() => setBookmarks(prev => prev.filter(x => x.id !== b.id))}>✕</button>
                        </div>
                        <p className="kv-text">{b.text}</p>
                        <div className="kv-tags">
                            {b.tags.map(t => <span key={t} className="tag tag-purple">{t}</span>)}
                        </div>
                    </div>
                ))}
            </div>

            {bookmarks.length > 0 && (
                <div className="kv-footer">
                    <button id="btn-generate-revision" className="btn btn-ghost btn-sm w-full"
                        onClick={generateRevision}>
                        📋 Generate Revision Sheet
                    </button>
                </div>
            )}
        </div>
    )
}
