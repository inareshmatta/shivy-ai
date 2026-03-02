import { useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import './UploadDock.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

export default function UploadDock({ book, setBook }) {
    const fileRef = useRef()
    const [uploading, setUploading] = useState(false)
    const [dragOver, setDragOver] = useState(false)

    const handleFile = async (file) => {
        if (!file) return
        setUploading(true)

        try {
            const localUrl = URL.createObjectURL(file)
            const mimeType = file.type || 'application/pdf'
            const title = file.name.replace(/\.[^.]+$/, '')
            const isPdf = mimeType.includes('pdf')

            // Set book immediately with local data so PDF renders right away
            const bookData = {
                title,
                localUrl,
                mimeType,
                subject: 'General',
                grade: '10',
                chapters: [],
                totalPages: 1,
                difficultyCurve: [],
            }

            // For PDFs, get page count using pdf.js
            if (isPdf) {
                try {
                    const pdf = await pdfjsLib.getDocument(localUrl).promise
                    bookData.totalPages = pdf.numPages
                } catch (e) {
                    console.warn('Could not count PDF pages:', e)
                }
            }

            setBook(bookData)

            // Also try uploading to backend (non-blocking)
            try {
                const fd = new FormData()
                fd.append('file', file)
                fd.append('book_title', title)
                const res = await fetch('/api/upload-book', { method: 'POST', body: fd })
                if (res.ok) {
                    const data = await res.json()
                    // Update with server data
                    setBook(prev => ({ ...prev, fileUri: data.file_uri }))

                    // Try to analyze book structure
                    const sfd = new FormData()
                    sfd.append('file_uri', data.file_uri)
                    sfd.append('mime_type', mimeType)
                    const sRes = await fetch('/api/analyze-book-structure', { method: 'POST', body: sfd })
                    if (sRes.ok) {
                        const structure = await sRes.json()
                        setBook(prev => ({
                            ...prev,
                            subject: structure.subject || prev.subject,
                            grade: structure.grade_level || prev.grade,
                            chapters: structure.chapters || prev.chapters,
                            difficultyCurve: structure.difficulty_curve || prev.difficultyCurve,
                        }))
                    }
                }
            } catch {
                console.warn('Backend not available — using local-only mode')
            }
        } catch (e) {
            console.error('File load failed', e)
        } finally {
            setUploading(false)
        }
    }

    const onDrop = (e) => {
        e.preventDefault(); setDragOver(false)
        handleFile(e.dataTransfer.files[0])
    }

    return (
        <div className="upload-dock" style={{ padding: '10px 12px 12px' }}>
            {book ? (
                <div className="upload-success">
                    <div className="upload-icon">{book.mimeType?.includes('pdf') ? '📕' : '🖼️'}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="truncate" style={{ fontWeight: 600, fontSize: 13 }}>{book.title}</div>
                        <div className="text-sm text-muted">
                            {book.subject}{book.totalPages > 1 ? ` · ${book.totalPages} pages` : ''}
                        </div>
                    </div>
                    <button className="btn btn-ghost btn-sm" id="btn-change-book"
                        onClick={() => { if (book.localUrl) URL.revokeObjectURL(book.localUrl); setBook(null) }}>✕</button>
                </div>
            ) : (
                <div
                    id="drop-zone"
                    className={`drop-zone ${dragOver ? 'drag-over' : ''} ${uploading ? 'shimmer' : ''}`}
                    onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={onDrop}
                    onClick={() => !uploading && fileRef.current?.click()}
                >
                    <input ref={fileRef} type="file"
                        accept=".pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
                        style={{ display: 'none' }}
                        onChange={e => handleFile(e.target.files[0])} />
                    <div className="drop-icon">{uploading ? '⏳' : '📄'}</div>
                    <div className="drop-text">
                        {uploading ? 'Loading…' : 'Drop PDF or image here'}
                    </div>
                    <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                        PDF · JPG · PNG · WEBP · HEIC
                    </div>
                </div>
            )}
        </div>
    )
}
