import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useCallback, useRef } from 'react'
import { diagram } from 'isomaid'
import type { ViewMode } from 'isomaid'

export const Route = createFileRoute('/viewer')({ component: DiagramViewer })

// Default sample diagram
const DEFAULT_DIAGRAM = `%%{arch: {view: "flat", nav: "drill"}}%%
flowchart TD
    subgraph Client["Client Layer"]
        Web[Web App]
        Mobile[Mobile App]
        Desktop[Desktop App]
    end

    subgraph Gateway["API Gateway"]
        LB[Load Balancer]
        Auth[Auth Service]
        Rate[Rate Limiter]
        LB --> Auth
        LB --> Rate
    end

    subgraph Services["Microservices"]
        Users[User Service]
        Orders[Order Service]
        Products[Product Service]
        Payments[Payment Service]
        Notifications[Notification Service]
    end

    subgraph Data["Data Layer"]
        UserDB[(User DB)]
        OrderDB[(Order DB)]
        ProductDB[(Product DB)]
        Cache[(Redis Cache)]
    end

    subgraph External["External Services"]
        Stripe[Stripe]
        Twilio[Twilio]
        S3[AWS S3]
    end

    %% Client to Gateway
    Web --> LB
    Mobile --> LB
    Desktop --> LB

    %% Gateway to Services (cross-cutting)
    Auth --> Users
    Rate --> Orders
    Rate --> Products

    %% Service interconnections (complex routing needed)
    Users --> Client
    Orders --> Products
    Orders --> Payments
    Products --> Orders
    Payments --> Notifications
    Users --> Notifications

    %% Services to Data
    Users --> UserDB
    Users --> Cache
    Orders --> OrderDB
    Orders --> Cache
    Products --> ProductDB
    Products --> Cache

    %% External integrations
    Payments --> Stripe
    Notifications --> Twilio
    Products --> S3
`

const STORAGE_KEY = 'isomaid-editor-source'
const MAX_HISTORY = 100

function DiagramViewer() {
  // Load initial source from localStorage or use default
  const [source, setSource] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) return saved
    }
    return DEFAULT_DIAGRAM
  })

  const [svg, setSvg] = useState<string>('')
  const [viewMode, setViewMode] = useState<ViewMode>('flat')
  // Pending error - silently captured, shown only on demand
  const [pendingError, setPendingError] = useState<string | null>(null)
  // Visible error - shown when user clicks Check
  const [visibleError, setVisibleError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [splitPosition, setSplitPosition] = useState(40) // percentage
  const [isResizing, setIsResizing] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Undo/redo history
  const historyRef = useRef<string[]>([])
  const historyIndexRef = useRef<number>(-1)
  const isUndoRedoRef = useRef<boolean>(false)

  // Debounce timer ref
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  // History debounce - batch rapid changes into single history entry
  const historyDebounceRef = useRef<NodeJS.Timeout | null>(null)

  // Initialize history with initial source
  useEffect(() => {
    if (historyRef.current.length === 0) {
      historyRef.current = [source]
      historyIndexRef.current = 0
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Save to localStorage when source changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, source)
    }

    // Add to history (debounced to batch rapid changes)
    if (!isUndoRedoRef.current) {
      if (historyDebounceRef.current) {
        clearTimeout(historyDebounceRef.current)
      }

      historyDebounceRef.current = setTimeout(() => {
        const history = historyRef.current
        const index = historyIndexRef.current

        // Don't add if same as current
        if (history[index] === source) return

        // Truncate any redo history
        const newHistory = history.slice(0, index + 1)
        newHistory.push(source)

        // Limit history size
        if (newHistory.length > MAX_HISTORY) {
          newHistory.shift()
        }

        historyRef.current = newHistory
        historyIndexRef.current = newHistory.length - 1
      }, 500) // Batch changes within 500ms
    }

    isUndoRedoRef.current = false
  }, [source])

  const renderDiagram = useCallback(async (mermaidSource: string) => {
    try {
      setLoading(true)
      const result = await diagram(mermaidSource, {
        render: { viewMode },
      })
      // Success - update SVG and clear all errors
      setSvg(result)
      setPendingError(null)
      setVisibleError(null)
    } catch (err) {
      // Silently capture error - keep last good SVG
      const errorMessage = err instanceof Error ? err.message : 'Failed to render diagram'
      setPendingError(errorMessage)
      // Don't clear SVG - keep showing last good render
    } finally {
      setLoading(false)
    }
  }, [viewMode])

  // Debounced render on source change
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    // Clear visible error when user starts typing (they're fixing it)
    setVisibleError(null)

    debounceRef.current = setTimeout(() => {
      renderDiagram(source)
    }, 300)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [source, renderDiagram])

  // Re-render when viewMode changes
  useEffect(() => {
    renderDiagram(source)
  }, [viewMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle Check button - show pending error if any
  const handleCheck = useCallback(() => {
    if (pendingError) {
      setVisibleError(pendingError)
    } else {
      // No error - could show a success toast, but for now just clear any visible error
      setVisibleError(null)
    }
  }, [pendingError])

  // Undo - go back in history
  const handleUndo = useCallback(() => {
    const index = historyIndexRef.current
    if (index > 0) {
      isUndoRedoRef.current = true
      historyIndexRef.current = index - 1
      setSource(historyRef.current[index - 1])
    }
  }, [])

  // Redo - go forward in history
  const handleRedo = useCallback(() => {
    const history = historyRef.current
    const index = historyIndexRef.current
    if (index < history.length - 1) {
      isUndoRedoRef.current = true
      historyIndexRef.current = index + 1
      setSource(history[index + 1])
    }
  }, [])

  // Handle split pane resizing
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing || !containerRef.current) return

    const containerRect = containerRef.current.getBoundingClientRect()
    const newPosition = ((e.clientX - containerRect.left) / containerRect.width) * 100

    // Clamp between 20% and 80%
    setSplitPosition(Math.max(20, Math.min(80, newPosition)))
  }, [isResizing])

  const handleMouseUp = useCallback(() => {
    setIsResizing(false)
  }, [])

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isResizing, handleMouseMove, handleMouseUp])

  // Handle keyboard shortcuts in textarea
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
    const modKey = isMac ? e.metaKey : e.ctrlKey

    // Undo: Cmd+Z / Ctrl+Z
    if (modKey && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      handleUndo()
      return
    }

    // Redo: Cmd+Shift+Z / Ctrl+Shift+Z (or Ctrl+Y on Windows)
    if ((modKey && e.key === 'z' && e.shiftKey) || (!isMac && e.ctrlKey && e.key === 'y')) {
      e.preventDefault()
      handleRedo()
      return
    }

    // Tab inserts spaces
    if (e.key === 'Tab') {
      e.preventDefault()
      const target = e.target as HTMLTextAreaElement
      const start = target.selectionStart
      const end = target.selectionEnd

      // Insert 4 spaces at cursor
      const newValue = source.substring(0, start) + '    ' + source.substring(end)
      setSource(newValue)

      // Move cursor after the inserted spaces
      requestAnimationFrame(() => {
        target.selectionStart = target.selectionEnd = start + 4
      })
    }
  }, [source, handleUndo, handleRedo])

  const handleReset = useCallback(() => {
    setSource(DEFAULT_DIAGRAM)
    setPendingError(null)
    setVisibleError(null)
  }, [])

  // Determine status indicator
  const hasError = pendingError !== null
  const isValid = !hasError && svg !== ''

  return (
    <div className="h-screen flex flex-col bg-slate-900 text-white">
      {/* Toolbar */}
      <div className="flex-shrink-0 bg-slate-800 border-b border-slate-700 px-6 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">
            <span className="text-cyan-400">isomaid</span> Diagram Editor
          </h1>

          <div className="flex items-center gap-4">
            {/* Reset Button */}
            <button
              onClick={handleReset}
              className="px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-slate-700 rounded-md transition-colors"
            >
              Reset
            </button>

            {/* Check Button */}
            <button
              onClick={handleCheck}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-2 ${
                hasError
                  ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-900/30'
                  : 'text-gray-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {hasError && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              )}
              Check
            </button>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-2 bg-slate-700 rounded-lg p-1">
              <button
                onClick={() => setViewMode('flat')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'flat'
                    ? 'bg-cyan-500 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Flat
              </button>
              <button
                onClick={() => setViewMode('iso')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'iso'
                    ? 'bg-cyan-500 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Isometric
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Split Pane Container */}
      <div
        ref={containerRef}
        className="flex-1 flex min-h-0"
        style={{ cursor: isResizing ? 'col-resize' : 'default' }}
      >
        {/* Editor Panel */}
        <div
          className="flex flex-col bg-slate-850 border-r border-slate-700"
          style={{ width: `${splitPosition}%` }}
        >
          {/* Editor Header */}
          <div className="flex-shrink-0 px-4 py-2 bg-slate-800 border-b border-slate-700 text-sm text-gray-400 flex items-center justify-between">
            <span>Mermaid Source</span>
            {/* Status indicator */}
            <span className="flex items-center gap-1.5">
              {loading && (
                <span className="text-cyan-400 text-xs">...</span>
              )}
              {!loading && isValid && (
                <span className="w-2 h-2 rounded-full bg-green-500" title="Valid" />
              )}
              {!loading && hasError && (
                <span className="w-2 h-2 rounded-full bg-amber-400" title="Has issues - click Check" />
              )}
            </span>
          </div>

          {/* Editor Content */}
          <div className="flex-1 relative min-h-0">
            <textarea
              value={source}
              onChange={(e) => setSource(e.target.value)}
              onKeyDown={handleKeyDown}
              className="absolute inset-0 w-full h-full p-4 bg-slate-900 text-gray-100 font-mono text-sm resize-none focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
              spellCheck={false}
              placeholder="Enter Mermaid diagram code..."
            />
          </div>
        </div>

        {/* Resize Handle */}
        <div
          onMouseDown={handleMouseDown}
          className="w-1 bg-slate-700 hover:bg-cyan-500 cursor-col-resize transition-colors flex-shrink-0"
        />

        {/* Diagram Panel */}
        <div
          className="flex flex-col min-h-0"
          style={{ width: `${100 - splitPosition}%` }}
        >
          {/* Diagram Header */}
          <div className="flex-shrink-0 px-4 py-2 bg-slate-800 border-b border-slate-700 text-sm text-gray-400 flex items-center justify-between">
            <span>Diagram Preview</span>
            {loading && <span className="text-cyan-400 text-xs">Rendering...</span>}
          </div>

          {/* Diagram Content */}
          <div className="flex-1 overflow-auto p-4">
            {/* Show visible error (only when Check is clicked) */}
            {visibleError && (
              <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 text-red-200 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold">Parse Error</h3>
                  <button
                    onClick={() => setVisibleError(null)}
                    className="text-red-300 hover:text-white text-sm"
                  >
                    Dismiss
                  </button>
                </div>
                <pre className="text-sm whitespace-pre-wrap font-mono">{visibleError}</pre>
              </div>
            )}

            {/* Always show last good SVG if we have one */}
            {svg && (
              <div
                className="bg-white rounded-lg p-8 inline-block min-w-full"
                style={{
                  transform: viewMode === 'iso' ? 'perspective(1000px)' : 'none',
                  transition: 'transform 0.3s ease-in-out',
                }}
              >
                <div
                  dangerouslySetInnerHTML={{ __html: svg }}
                  className="diagram-container"
                />
              </div>
            )}

            {!svg && !loading && (
              <div className="text-gray-500 text-center py-8">
                Enter Mermaid code to see the diagram
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="flex-shrink-0 bg-slate-800 border-t border-slate-700 px-6 py-2">
        <div className="text-sm text-gray-400 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span>
              View: <span className="text-cyan-400">{viewMode}</span>
            </span>
            <span>
              Lines: <span className="text-cyan-400">{source.split('\n').length}</span>
            </span>
            {hasError && (
              <span className="text-amber-400">
                Issues detected - click Check to see details
              </span>
            )}
          </div>
          <div className="text-xs">
            Tab inserts spaces • Diagram updates on valid syntax
          </div>
        </div>
      </div>
    </div>
  )
}
