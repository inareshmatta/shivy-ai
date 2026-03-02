import { useState, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import LeftPanel from './components/LeftPanel/LeftPanel'
import CenterCanvas from './components/CenterCanvas/CenterCanvas'
import RightPanel from './components/RightPanel/RightPanel'
import VisualPanel from './components/VisualPanel/VisualPanel'
import AssessmentPanel from './components/AssessmentPanel/AssessmentPanel'
import CurriculumPlanner from './components/CurriculumPlanner/CurriculumPlanner'
import TopBar from './components/TopBar'
import './App.css'

export default function App() {
  // Session state
  const [session, setSession] = useState({
    isLive: false,
    orbState: 'idle',
  })

  // Multi-book library
  const [books, setBooks] = useState([])               // Array of book objects
  const [activeBookId, setActiveBookId] = useState(null) // Currently selected book
  const activeBook = books.find(b => b.id === activeBookId) || null

  // Page state (per book)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageAnalysis, setPageAnalysis] = useState(null)


  // Visual panel state
  const [visualPanel, setVisualPanel] = useState({
    open: false,
    sessionId: null,
    currentImage: null,
    history: [],
  })

  // Assessment panel state
  const [assessmentOpen, setAssessmentOpen] = useState(false)

  // Curriculum Planner state
  const [plannerOpen, setPlannerOpen] = useState(false)

  // Tutor settings
  const [settings, setSettings] = useState({
    voice: 'Kore',
    language: 'English',
    grade: '10',
    affectiveMode: true,
    bargeIn: true,
  })

  // Transcript
  const [transcript, setTranscript] = useState([])

  const appendTranscript = useCallback((role, text) => {
    setTranscript(prev => [...prev.slice(-100), { role, text, ts: Date.now() }])
  }, [])

  // Book management
  const addBook = useCallback((bookData) => {
    const id = crypto.randomUUID()
    const newBook = { ...bookData, id }
    setBooks(prev => [...prev, newBook])
    setActiveBookId(id)
    setCurrentPage(1)
    setPageAnalysis(null)

  }, [])

  const removeBook = useCallback((bookId) => {
    setBooks(prev => prev.filter(b => b.id !== bookId))
    if (activeBookId === bookId) {
      setActiveBookId(null)
      setPageAnalysis(null)

    }
  }, [activeBookId])

  const selectBook = useCallback((bookId) => {
    setActiveBookId(bookId)
    setCurrentPage(1)
    setPageAnalysis(null)

  }, [])

  // Visual panel
  const openVisualPanel = useCallback((image = null, initialTopic = '') => {
    setVisualPanel(prev => ({
      ...prev,
      open: true,
      sessionId: prev.sessionId || crypto.randomUUID(),
      currentImage: image || prev.currentImage,
      topic: initialTopic,
    }))
  }, [])

  const closeVisualPanel = useCallback(() => {
    setVisualPanel(prev => ({ ...prev, open: false }))
  }, [])

  const onVisualGenerated = useCallback((imageData) => {
    setVisualPanel(prev => ({
      ...prev,
      open: true,
      currentImage: imageData,
      history: [...prev.history, imageData],
    }))
  }, [])

  return (
    <div className="app-shell">
      <TopBar
        books={books}
        session={session}
        onEndSession={() => setSession(s => ({ ...s, isLive: false, orbState: 'idle' }))}
      />

      <div className="app-body">
        <LeftPanel
          session={session}
          setSession={setSession}
          books={books}
          activeBook={activeBook}
          addBook={addBook}
          removeBook={removeBook}
          selectBook={selectBook}
          settings={settings}
          setSettings={setSettings}
          pageAnalysis={pageAnalysis}
          onOpenVisualPanel={openVisualPanel}
          onOpenAssessment={() => setAssessmentOpen(true)}
          onOpenPlanner={() => setPlannerOpen(true)}
          appendTranscript={appendTranscript}
          currentPage={currentPage}
        />

        <CenterCanvas
          book={activeBook}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          session={session}
          setSession={setSession}
          pageAnalysis={pageAnalysis}
          setPageAnalysis={setPageAnalysis}
          settings={settings}
          appendTranscript={appendTranscript}
          onVisualRequest={onVisualGenerated}
          onOpenVisualPanel={openVisualPanel}
          transcript={transcript}
        />

        <RightPanel
          pageAnalysis={pageAnalysis}
          currentPage={currentPage}
          subject={activeBook?.subject || 'General'}
          appendTranscript={appendTranscript}
          onOpenAssessment={() => setAssessmentOpen(true)}
        />
      </div>

      {/* Full-screen overlays */}
      <AnimatePresence>
        {visualPanel.open && (
          <VisualPanel
            {...visualPanel}
            subject={activeBook?.subject || 'General'}
            initialTopic={visualPanel.topic}
            onClose={closeVisualPanel}
            onVisualGenerated={onVisualGenerated}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {assessmentOpen && (
          <AssessmentPanel
            books={books}
            activeBook={activeBook}
            pageAnalysis={pageAnalysis}
            currentPage={currentPage}
            onClose={() => setAssessmentOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {plannerOpen && (
          <CurriculumPlanner
            books={books}
            onClose={() => setPlannerOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
