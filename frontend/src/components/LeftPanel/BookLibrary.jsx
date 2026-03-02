import { useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { motion, AnimatePresence } from 'framer-motion'
import './BookLibrary.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

export default function BookLibrary({ books, activeBook, addBook, removeBook, selectBook }) {
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

            const bookData = {
                title, localUrl, mimeType,
                subject: 'General', grade: '10',
                chapters: [], totalPages: 1, difficultyCurve: [],
            }

            if (isPdf) {
                try {
                    const pdf = await pdfjsLib.getDocument(localUrl).promise
                    bookData.totalPages = pdf.numPages
                } catch (e) {
                    console.warn('Page count failed:', e)
                }
            }

            addBook(bookData)

            // Non-blocking backend upload
            try {
                const fd = new FormData()
                fd.append('file', file)
                fd.append('book_title', title)
                const res = await fetch('/api/upload-book', { method: 'POST', body: fd })
                if (res.ok) {
                    const data = await res.json()
                    // Could update book with server data here
                }
            } catch {
                // Backend not running — fine for local dev
            }
        } catch (e) {
            console.error('File load failed:', e)
        } finally {
            setUploading(false)
        }
    }

    const onDrop = (e) => {
        e.preventDefault(); setDragOver(false)
        const files = Array.from(e.dataTransfer.files)
        files.forEach(handleFile)
    }

    return (
        <div className="book-library">
            {/* Book list */}
            <div className="bl-list">
                <AnimatePresence mode="popLayout">
                    {books.map(book => (
                        <motion.div
                            key={book.id}
                            className={`bl-item ${activeBook?.id === book.id ? 'active' : ''}`}
                            onClick={() => selectBook(book.id)}
                            initial={{ opacity: 0, x: -12 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -12 }}
                            layout
                        >
                            <div className="bl-item-icon">
                                {book.mimeType?.includes('pdf') ? '📕' : '🖼️'}
                            </div>
                            <div className="bl-item-info">
                                <div className="bl-item-title truncate">{book.title}</div>
                                <div className="text-xxs text-muted">
                                    {book.totalPages > 1 ? `${book.totalPages} pages` : '1 page'}
                                    {book.subject !== 'General' && ` · ${book.subject}`}
                                </div>
                            </div>
                            <button
                                className="bl-item-remove"
                                onClick={(e) => { e.stopPropagation(); removeBook(book.id) }}
                                title="Remove">
                                ✕
                            </button>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Upload zone */}
            <div
                className={`bl-upload ${dragOver ? 'drag-over' : ''} ${uploading ? 'uploading' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => !uploading && fileRef.current?.click()}
            >
                <input ref={fileRef} type="file" multiple
                    accept=".pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
                    style={{ display: 'none' }}
                    onChange={e => Array.from(e.target.files).forEach(handleFile)} />
                <span className="bl-upload-icon">{uploading ? '⏳' : '+'}</span>
                <span className="bl-upload-text">
                    {uploading ? 'Loading…' : 'Add book'}
                </span>
            </div>
        </div>
    )
}
