import { useState, useRef, useEffect, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { TextLayer } from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import './BookRenderer.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

export default function BookRenderer({ book, currentPage, setCurrentPage, onPageRendered, onWordClick }) {
    const canvasRef = useRef(null)
    const textLayerRef = useRef(null)
    const [pdfDoc, setPdfDoc] = useState(null)
    const [rendering, setRendering] = useState(false)
    const [totalPages, setTotalPages] = useState(0)
    const [error, setError] = useState(null)
    const [scale, setScale] = useState(1.5)

    // Load PDF
    useEffect(() => {
        if (!book?.localUrl) return
        if (book.mimeType && !book.mimeType.includes('pdf')) return

        let cancelled = false
        const loadPdf = async () => {
            try {
                setError(null)
                const pdf = await pdfjsLib.getDocument(book.localUrl).promise
                if (cancelled) return
                setPdfDoc(pdf)
                setTotalPages(pdf.numPages)
            } catch (e) {
                console.error('PDF load error:', e)
                setError('Failed to load PDF. Try a different file.')
            }
        }
        loadPdf()
        return () => { cancelled = true }
    }, [book?.localUrl, book?.mimeType])

    // Render page + text layer
    useEffect(() => {
        if (!pdfDoc || !canvasRef.current) return

        let cancelled = false
        setRendering(true)

        const renderPage = async () => {
            try {
                const page = await pdfDoc.getPage(currentPage)
                const viewport = page.getViewport({ scale })
                const canvas = canvasRef.current
                if (!canvas || cancelled) return

                canvas.width = viewport.width
                canvas.height = viewport.height

                const ctx = canvas.getContext('2d')
                ctx.clearRect(0, 0, canvas.width, canvas.height)
                await page.render({ canvasContext: ctx, viewport }).promise
                if (cancelled) return

                // Build text layer using pdf.js official API
                const textContent = await page.getTextContent()
                if (cancelled) return

                const fullText = textContent.items.map(item => item.str).join(' ')

                if (textLayerRef.current) {
                    // Clear previous text layer
                    textLayerRef.current.innerHTML = ''
                    textLayerRef.current.style.width = `${viewport.width}px`
                    textLayerRef.current.style.height = `${viewport.height}px`

                    // Use pdf.js built-in TextLayer for pixel-perfect alignment
                    const tl = new TextLayer({
                        textContentSource: textContent,
                        container: textLayerRef.current,
                        viewport: viewport,
                    })
                    await tl.render()
                }

                // Send blob for AI analysis
                canvas.toBlob((blob) => {
                    if (blob && !cancelled) {
                        onPageRendered?.(blob, canvas.width, canvas.height, fullText)
                    }
                }, 'image/jpeg', 0.85)

            } catch (e) {
                console.error('Page render error:', e)
            } finally {
                if (!cancelled) setRendering(false)
            }
        }
        renderPage()
        return () => { cancelled = true }
    }, [pdfDoc, currentPage, scale, onPageRendered])

    // Handle clicks on text layer — get clicked word
    const handleTextLayerClick = useCallback((e) => {
        const sel = window.getSelection()
        if (sel && sel.toString().trim().length > 1) {
            // User selected multi-word text
            const text = sel.toString().trim()
            if (/[a-zA-Z]{2,}/.test(text)) {
                onWordClick?.(text, e.clientX, e.clientY)
            }
            return
        }

        // Single word click via caretRangeFromPoint
        const range = document.caretRangeFromPoint?.(e.clientX, e.clientY)
        if (!range) return

        range.expand('word')
        const word = range.toString().trim()
        if (word.length < 2 || !/[a-zA-Z]{2,}/.test(word)) return

        onWordClick?.(word, e.clientX, e.clientY)
    }, [onWordClick])

    // Image files
    const isImage = book?.mimeType && !book.mimeType.includes('pdf')

    if (error) {
        return (
            <div className="book-error">
                <span>⚠️</span>
                <p>{error}</p>
            </div>
        )
    }

    if (isImage) {
        return (
            <div className="book-image-wrapper">
                <img
                    src={book.localUrl}
                    alt="Book page"
                    className="book-page-img"
                    onLoad={(e) => {
                        const canvas = document.createElement('canvas')
                        canvas.width = e.target.naturalWidth
                        canvas.height = e.target.naturalHeight
                        canvas.getContext('2d').drawImage(e.target, 0, 0)
                        canvas.toBlob((blob) => {
                            onPageRendered?.(blob, canvas.width, canvas.height, '')
                        }, 'image/jpeg', 0.85)
                    }}
                />
            </div>
        )
    }

    return (
        <div className="book-renderer">
            {/* Zoom */}
            <div className="book-zoom">
                <button className="btn btn-ghost btn-sm btn-icon" id="btn-zoom-out"
                    onClick={() => setScale(s => Math.max(0.5, s - 0.25))}>−</button>
                <span className="text-xs text-muted">{Math.round(scale * 100)}%</span>
                <button className="btn btn-ghost btn-sm btn-icon" id="btn-zoom-in"
                    onClick={() => setScale(s => Math.min(3, s + 0.25))}>+</button>
            </div>

            {/* Canvas + text layer */}
            <div className="book-canvas-wrapper">
                {rendering && (
                    <div className="book-loading">
                        <div className="shimmer" style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, borderRadius: 8 }} />
                    </div>
                )}
                <canvas ref={canvasRef} className="book-canvas" id="pdf-canvas" />
                {/* pdf.js TextLayer — perfectly aligned over canvas */}
                <div
                    ref={textLayerRef}
                    className="textLayer"
                    onClick={handleTextLayerClick}
                />
            </div>

            {/* Page nav */}
            {totalPages > 1 && (
                <div className="book-nav">
                    <button className="btn btn-ghost btn-sm" id="btn-prev-page"
                        disabled={currentPage <= 1}
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}>
                        ← Prev
                    </button>
                    <span className="text-sm">
                        <input
                            type="number"
                            className="page-input"
                            value={currentPage}
                            min={1}
                            max={totalPages}
                            onChange={e => {
                                const p = parseInt(e.target.value)
                                if (p >= 1 && p <= totalPages) setCurrentPage(p)
                            }}
                        />
                        <span className="text-muted"> / {totalPages}</span>
                    </span>
                    <button className="btn btn-ghost btn-sm" id="btn-next-page"
                        disabled={currentPage >= totalPages}
                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}>
                        Next →
                    </button>
                </div>
            )}
        </div>
    )
}
