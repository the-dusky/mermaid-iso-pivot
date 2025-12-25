import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  parse,
  render,
  createInitialNavState,
  toggleFold,
  getVisibleNodesInFoldMode,
  getVisibleEdgesInFoldMode,
} from 'isomaid'
import type { ViewMode, Graph, NavState } from 'isomaid'

export const Route = createFileRoute('/viewer')({ component: DiagramViewer })

// Default sample diagram - demonstrates multi-level fold navigation
const DEFAULT_DIAGRAM = `%%{arch: {view: "flat", nav: "fold"}}%%
flowchart TD
    subgraph Cloud["Cloud Infrastructure"]
        subgraph Frontend["Frontend Layer"]
            Web[Web App]
            Mobile[Mobile App]
            Web --> Mobile
        end

        subgraph Backend["Backend Layer"]
            API[API Server]
            Auth[Auth Service]
            API --> Auth
        end

        subgraph Database["Database Layer"]
            Postgres[(PostgreSQL)]
            Redis[(Redis Cache)]
        end
    end

    %% Connections between layers
    Web --> API
    Mobile --> API
    Auth --> Postgres
    API --> Redis
`

const STORAGE_KEY = 'isomaid-editor-source'
const ZOOM_STORAGE_KEY = 'isomaid-editor-zoom'
const VIEW_MODE_STORAGE_KEY = 'isomaid-editor-view-mode'
const SHOW_PORTS_STORAGE_KEY = 'isomaid-editor-show-ports'
const SPLIT_POSITION_STORAGE_KEY = 'isomaid-editor-split-position'
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
  const [graph, setGraph] = useState<Graph | null>(null)
  const [navState, setNavState] = useState<NavState>(createInitialNavState())
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY)
      if (saved === 'flat' || saved === 'iso') {
        return saved
      }
    }
    return 'flat'
  })
  const [showPorts, setShowPorts] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(SHOW_PORTS_STORAGE_KEY)
      if (saved !== null) {
        return saved === 'true'
      }
    }
    return true
  })
  const [zoom, setZoom] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(ZOOM_STORAGE_KEY)
      if (saved) {
        const parsed = parseFloat(saved)
        if (!isNaN(parsed) && parsed > 0 && parsed <= 3) {
          return parsed
        }
      }
    }
    return 1
  })
  const [panX, setPanX] = useState<number>(0)
  const [panY, setPanY] = useState<number>(0)
  const diagramContainerRef = useRef<HTMLDivElement>(null)
  // Pending error - silently captured, shown only on demand
  const [pendingError, setPendingError] = useState<string | null>(null)
  // Visible error - shown when user clicks Check
  const [visibleError, setVisibleError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [splitPosition, setSplitPosition] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(SPLIT_POSITION_STORAGE_KEY)
      if (saved) {
        const parsed = parseFloat(saved)
        if (!isNaN(parsed) && parsed >= 20 && parsed <= 80) {
          return parsed
        }
      }
    }
    return 40
  })
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

  // Save UI state to localStorage when it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(ZOOM_STORAGE_KEY, String(zoom))
    }
  }, [zoom])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode)
    }
  }, [viewMode])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(SHOW_PORTS_STORAGE_KEY, String(showPorts))
    }
  }, [showPorts])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(SPLIT_POSITION_STORAGE_KEY, String(splitPosition))
    }
  }, [splitPosition])

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

  // Parse Mermaid source into graph
  const parseDiagram = useCallback(async (mermaidSource: string) => {
    try {
      setLoading(true)
      const parsedGraph = await parse(mermaidSource, { viewMode })
      setGraph(parsedGraph)
      setNavState(createInitialNavState()) // Reset navigation on new diagram
      setPendingError(null)
      setVisibleError(null)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to parse diagram'
      setPendingError(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [viewMode])

  // Render current view based on navigation state
  const renderCurrentView = useCallback(() => {
    if (!graph) return

    try {
      // Get visible nodes and edges based on fold state
      const visibleNodeIds = getVisibleNodesInFoldMode(graph, navState)
      const visibleEdges = getVisibleEdgesInFoldMode(graph, navState)

      // Filter the nodes map to only include visible nodes
      const filteredNodes = new Map()
      for (const nodeId of visibleNodeIds) {
        const node = graph.nodes.get(nodeId)
        if (node) {
          // Clear children for collapsed subgraphs to render them as boxes
          const isCollapsed = navState.collapsed.has(nodeId)
          filteredNodes.set(nodeId, {
            ...node,
            children: isCollapsed ? [] : node.children,
            // Add metadata for renderer to show collapse icons
            _collapsed: isCollapsed,
            _hasChildren: node.isSubgraph && (node.children?.length ?? 0) > 0,
          } as any)
        }
      }

      // Create a filtered graph for rendering
      const filteredGraph: Graph = {
        ...graph,
        nodes: filteredNodes,
        rootNodes: visibleNodeIds.filter(id => {
          const node = graph.nodes.get(id)
          return !node?.parent
        }),
        edges: visibleEdges,
      }

      const svg = render(filteredGraph, { viewMode, showPorts })
      setSvg(svg)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to render diagram'
      setPendingError(errorMessage)
    }
  }, [graph, navState, viewMode, showPorts])

  // Debounced parse on source change
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    // Clear visible error when user starts typing (they're fixing it)
    setVisibleError(null)

    debounceRef.current = setTimeout(() => {
      parseDiagram(source)
    }, 300)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [source, parseDiagram])

  // Re-render when graph, viewMode, showPorts, or navState changes
  useEffect(() => {
    renderCurrentView()
  }, [renderCurrentView])

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

  // Fold navigation handler
  const handleToggleFold = useCallback((subgraphId: string) => {
    const newNavState = toggleFold(navState, subgraphId)
    setNavState(newNavState)
  }, [navState])

  // Handle clicks on diagram elements for fold navigation
  const handleDiagramClick = useCallback((e: React.MouseEvent) => {
    if (!graph) return

    // Find the clicked SVG element
    const target = e.target as SVGElement

    // Look for a subgraph node by walking up the DOM tree
    let element: SVGElement | null = target
    while (element && element.tagName !== 'svg') {
      if (element.classList?.contains('subgraph') || element.classList?.contains('node')) {
        const nodeId = element.getAttribute('data-id')
        if (nodeId) {
          const node = graph.nodes.get(nodeId)
          if (node?.isSubgraph) {
            handleToggleFold(nodeId)
            e.stopPropagation()
            return
          }
        }
      }
      element = element.parentElement as SVGElement | null
    }
  }, [graph, handleToggleFold])

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

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setZoom(z => Math.min(z + 0.1, 3))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom(z => Math.max(z - 0.1, 0.1))
  }, [])

  const handleZoomReset = useCallback(() => {
    setZoom(1)
    setPanX(0)
    setPanY(0)
  }, [])

  // Handle view mode change while preserving center point
  const handleViewModeChange = useCallback((newMode: ViewMode) => {
    const container = diagramContainerRef.current
    if (!container) {
      setViewMode(newMode)
      return
    }

    // Calculate current center point in diagram coordinates
    const rect = container.getBoundingClientRect()
    const viewportCenterX = rect.width / 2
    const viewportCenterY = rect.height / 2

    // Convert to diagram coordinates (before transform)
    const diagramCenterX = (viewportCenterX - panX) / zoom
    const diagramCenterY = (viewportCenterY - panY) / zoom

    // Switch mode (will trigger re-render)
    setViewMode(newMode)

    // After a small delay (to let the new SVG render), adjust pan to keep same center
    requestAnimationFrame(() => {
      // Recalculate pan to keep the same diagram point at viewport center
      const newPanX = viewportCenterX - diagramCenterX * zoom
      const newPanY = viewportCenterY - diagramCenterY * zoom
      setPanX(newPanX)
      setPanY(newPanY)
    })
  }, [panX, panY, zoom])

  // Mouse wheel handler - scroll to pan, Ctrl/Cmd+scroll to zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault() // Always prevent default to avoid page scroll

    if (e.ctrlKey || e.metaKey) {
      // Zoom toward cursor position
      const container = diagramContainerRef.current
      if (!container) return

      const rect = container.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      const delta = -e.deltaY / 500
      const newZoom = Math.max(0.1, Math.min(3, zoom + delta))

      // Calculate new pan to zoom toward mouse position
      const zoomRatio = newZoom / zoom
      setPanX(prev => mouseX - (mouseX - prev) * zoomRatio)
      setPanY(prev => mouseY - (mouseY - prev) * zoomRatio)
      setZoom(newZoom)
    } else {
      // Pan with scroll
      setPanX(prev => prev - e.deltaX)
      setPanY(prev => prev - e.deltaY)
    }
  }, [zoom])


  // Determine status indicator
  const hasError = pendingError !== null
  const isValid = !hasError && svg !== ''

  return (
    <div
      className="h-[calc(100vh-48px)] flex flex-col bg-slate-900 text-white overflow-hidden"
      style={{ overscrollBehavior: 'none' }}
    >
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
                onClick={() => handleViewModeChange('flat')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'flat'
                    ? 'bg-cyan-500 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Flat
              </button>
              <button
                onClick={() => handleViewModeChange('iso')}
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
          className="flex flex-col min-h-0 bg-slate-850 border-r border-slate-700"
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
            <div className="flex items-center gap-3">
              {loading && <span className="text-cyan-400 text-xs">Rendering...</span>}

              {/* Show Ports Toggle */}
              <label className="flex items-center gap-2 cursor-pointer hover:text-gray-300">
                <input
                  type="checkbox"
                  checked={showPorts}
                  onChange={(e) => setShowPorts(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-slate-900"
                />
                <span>Show Ports</span>
              </label>

              {/* Zoom Controls */}
              <div className="flex items-center gap-1 bg-slate-700 rounded-md px-2 py-1">
                <button
                  onClick={handleZoomOut}
                  className="text-gray-400 hover:text-white px-1"
                  title="Zoom Out"
                >
                  −
                </button>
                <button
                  onClick={handleZoomReset}
                  className="text-gray-400 hover:text-white px-2 text-xs"
                  title="Reset Zoom"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  onClick={handleZoomIn}
                  className="text-gray-400 hover:text-white px-1"
                  title="Zoom In"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Diagram Content */}
          <div
            ref={diagramContainerRef}
            className="flex-1 overflow-hidden relative bg-slate-900"
            onWheel={handleWheel}
          >
            {/* Show visible error (only when Check is clicked) */}
            {visibleError && (
              <div className="absolute top-4 left-4 right-4 z-10 bg-red-900/50 border border-red-500 rounded-lg p-4 text-red-200">
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

            {/* Canvas container with pan/zoom transform */}
            <div
              className="absolute inset-0"
              style={{
                transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
                transformOrigin: '0 0',
              }}
            >
              {/* Always show last good SVG if we have one */}
              {svg && (
                <div
                  className="bg-white rounded-lg p-8 inline-block"
                  style={{
                    transform: viewMode === 'iso' ? 'perspective(1000px)' : 'none',
                  }}
                >
                  <div
                    dangerouslySetInnerHTML={{ __html: svg }}
                    className="diagram-container"
                    onClick={handleDiagramClick}
                    style={{ cursor: 'pointer' }}
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
      </div>

      {/* Status Bar */}
      <div className="flex-shrink-0 bg-slate-800 border-t border-slate-700 px-6 py-2">
        <div className="text-sm text-gray-400 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span>
              View: <span className="text-cyan-400">{viewMode}</span>
            </span>
            <span>
              Zoom: <span className="text-cyan-400">{Math.round(zoom * 100)}%</span>
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
          <div className="text-xs hidden xl:block whitespace-nowrap">
            Tab inserts spaces • Scroll to pan • Ctrl/Cmd + Scroll to zoom • Diagram updates on valid syntax
          </div>
        </div>
      </div>
    </div>
  )
}
