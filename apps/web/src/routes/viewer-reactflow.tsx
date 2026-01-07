import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  ReactFlow,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type OnNodesChange,
  type Connection,
  type NodeDragHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import {
  parse,
  createInitialNavState,
  loadLibavoid,
  isLibavoidLoaded,
} from 'isomaid'
import type {
  ViewMode,
  Graph,
  NavState,
} from 'isomaid'

type LayoutDirection = 'DOWN' | 'UP' | 'RIGHT' | 'LEFT'

import { graphToReactFlow, updateGraphFromReactFlow } from '../utils/reactflow-adapter'
import { flatNodeTypes } from '../components/nodes'
import { flatEdgeTypes } from '../components/edges'
import { IsoBackground } from '../components/IsoBackground'
import { screenToIso } from '../utils/iso'

export const Route = createFileRoute('/viewer-reactflow')({ component: ReactFlowViewer })

// Inner component that uses ReactFlow hooks
function ReactFlowCanvas({
  viewMode,
}: {
  viewMode: ViewMode
}) {
  return (
    <>
      <IsoBackground isometric={viewMode === 'iso'} gap={20} color="#e0e0e0" />
      <Controls />
      <MiniMap
        nodeStrokeWidth={3}
        zoomable
        pannable
      />
    </>
  )
}

// Default sample diagram
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
const VIEW_MODE_STORAGE_KEY = 'isomaid-editor-view-mode'
const SPLIT_POSITION_STORAGE_KEY = 'isomaid-editor-split-position'
const LAYOUT_DIRECTION_STORAGE_KEY = 'isomaid-editor-layout-direction'
const USE_LIBAVOID_STORAGE_KEY = 'isomaid-editor-use-libavoid'

function ReactFlowViewer() {
  // Load initial source from localStorage or use default
  const [source, setSource] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) return saved
    }
    return DEFAULT_DIAGRAM
  })

  const [graph, setGraph] = useState<Graph | null>(null)
  const [_navState, setNavState] = useState<NavState>(createInitialNavState())
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY)
      if (saved === 'flat' || saved === 'iso') {
        return saved
      }
    }
    return 'flat'
  })
  const [layoutDirection, setLayoutDirection] = useState<LayoutDirection>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(LAYOUT_DIRECTION_STORAGE_KEY)
      if (saved === 'DOWN' || saved === 'UP' || saved === 'RIGHT' || saved === 'LEFT') {
        return saved
      }
    }
    return 'DOWN'
  })

  // Libavoid routing state
  const [useLibavoid, setUseLibavoid] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(USE_LIBAVOID_STORAGE_KEY)
      return saved === 'true'
    }
    return false
  })
  const [libavoidLoaded, setLibavoidLoaded] = useState(false)
  const [libavoidLoading, setLibavoidLoading] = useState(false)

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [splitPosition, _setSplitPosition] = useState<number>(() => {
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

  // Save source to localStorage when it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, source)
    }
  }, [source])

  // Save view mode to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode)
    }
  }, [viewMode])

  // Save split position to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(SPLIT_POSITION_STORAGE_KEY, String(splitPosition))
    }
  }, [splitPosition])

  // Save layout direction to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LAYOUT_DIRECTION_STORAGE_KEY, layoutDirection)
    }
  }, [layoutDirection])

  // Save useLibavoid to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(USE_LIBAVOID_STORAGE_KEY, String(useLibavoid))
    }
  }, [useLibavoid])

  // Load libavoid WASM when useLibavoid is enabled
  useEffect(() => {
    if (useLibavoid && !libavoidLoaded && !libavoidLoading) {
      setLibavoidLoading(true)
      // Load from public folder - the WASM file is copied there by Vite plugin
      loadLibavoid('/libavoid.wasm')
        .then(() => {
          setLibavoidLoaded(true)
          setLibavoidLoading(false)
          console.log('[libavoid] WASM module loaded successfully')
        })
        .catch((err) => {
          console.error('[libavoid] Failed to load WASM:', err)
          setLibavoidLoading(false)
          setUseLibavoid(false)
        })
    }
  }, [useLibavoid, libavoidLoaded, libavoidLoading])

  // Check if libavoid is already loaded (e.g., from previous session)
  useEffect(() => {
    if (isLibavoidLoaded()) {
      setLibavoidLoaded(true)
    }
  }, [])

  // Parse Mermaid source into graph (only re-parse when source or layout changes)
  const parseDiagram = useCallback(async (mermaidSource: string, currentViewMode: ViewMode) => {
    try {
      setLoading(true)
      setError(null)

      const parsedGraph = await parse(mermaidSource, {
        viewMode: currentViewMode,
        direction: layoutDirection,
        // Always let ReactFlow handle edges dynamically
        skipEdgeRouting: true,
      })
      setGraph(parsedGraph)
      setNavState(createInitialNavState())

      // Convert to ReactFlow format (pass viewMode for 3D rendering)
      const { nodes: rfNodes, edges: rfEdges } = graphToReactFlow(parsedGraph, currentViewMode)
      setNodes(rfNodes)
      setEdges(rfEdges)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to parse diagram'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [layoutDirection, useLibavoid, libavoidLoaded, setNodes, setEdges])

  // Parse diagram when source or layout changes (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      parseDiagram(source, viewMode)
    }, 300)

    return () => clearTimeout(timer)
  }, [source, layoutDirection, parseDiagram])

  // Update viewMode in existing nodes/edges without re-parsing
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: { ...n.data, viewMode },
      }))
    )
    setEdges((eds) =>
      eds.map((e) => ({
        ...e,
        data: { ...e.data, viewMode },
      }))
    )
  }, [viewMode, setNodes, setEdges])

  // Handle node drag - update graph positions
  // Note: In iso mode, bounds don't perfectly match the visual diamond shape
  // because each node renders its own iso projection with different offsets.
  // This is a known limitation of per-node iso rendering.
  const handleNodesChange: OnNodesChange = useCallback((changes) => {
    onNodesChange(changes)

    // Update graph model with new positions
    if (graph && changes.some(c => c.type === 'position')) {
      const updatedGraph = updateGraphFromReactFlow(graph, nodes)
      setGraph(updatedGraph)
    }
  }, [onNodesChange, graph, nodes])

  // Handle new connections
  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge(connection, eds))
    },
    [setEdges]
  )

  // Isometric CSS class name
  const isometricClassName = viewMode === 'iso' ? 'isometric-view' : ''

  // Use flat node and edge types for BOTH views
  // The isometric effect is achieved via CSS transform on the entire canvas
  // This ensures nodes, edges, and bounds all transform together consistently
  const currentNodeTypes = flatNodeTypes
  const currentEdgeTypes = flatEdgeTypes

  const handleReset = useCallback(() => {
    setSource(DEFAULT_DIAGRAM)
    setError(null)
  }, [])

  const handleViewModeChange = useCallback((newMode: ViewMode) => {
    setViewMode(newMode)
  }, [])

  // Track drag start for iso mode inverse-transform
  const dragStartRef = useRef<{
    nodeId: string
    startPos: { x: number; y: number }
    startMouse: { x: number; y: number }
  } | null>(null)

  // Handle drag start - store initial positions
  const handleNodeDragStart: NodeDragHandler = useCallback(
    (event, node) => {
      if (viewMode === 'iso') {
        dragStartRef.current = {
          nodeId: node.id,
          startPos: { x: node.position.x, y: node.position.y },
          startMouse: { x: event.clientX, y: event.clientY },
        }
      }
    },
    [viewMode]
  )

  // Handle drag - apply inverse transform for iso mode
  const handleNodeDrag: NodeDragHandler = useCallback(
    (event, node) => {
      if (viewMode === 'iso' && dragStartRef.current && dragStartRef.current.nodeId === node.id) {
        // Calculate screen delta from drag start
        const screenDx = event.clientX - dragStartRef.current.startMouse.x
        const screenDy = event.clientY - dragStartRef.current.startMouse.y

        // Inverse transform: screen delta -> flat coordinate delta
        // The iso transform is: matrix(0.866, 0.5, -0.866, 0.5, 0, 0)
        // This means: screenX = flatX * 0.866 - flatY * 0.866
        //             screenY = flatX * 0.5 + flatY * 0.5
        // Solving for flat coordinates:
        const { isoX, isoY } = screenToIso(screenDx, screenDy)

        // Apply transformed delta to starting position
        const newX = dragStartRef.current.startPos.x + isoX
        const newY = dragStartRef.current.startPos.y + isoY

        // Update node position
        setNodes((nds) =>
          nds.map((n) =>
            n.id === node.id
              ? { ...n, position: { x: newX, y: newY } }
              : n
          )
        )
      }
    },
    [viewMode, setNodes]
  )

  // Handle drag end - clear ref
  const handleNodeDragStop: NodeDragHandler = useCallback(
    () => {
      dragStartRef.current = null
    },
    []
  )

  const handleLayoutDirectionChange = useCallback((newDirection: LayoutDirection) => {
    setLayoutDirection(newDirection)
  }, [])

  return (
    <div className="h-[calc(100vh-48px)] flex flex-col bg-slate-900 text-white overflow-hidden">
      {/* Toolbar */}
      <div className="flex-shrink-0 bg-slate-800 border-b border-slate-700 px-6 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">
            <span className="text-cyan-400">isomaid</span> ReactFlow Viewer
          </h1>

          <div className="flex items-center gap-4">
            {/* Reset Button */}
            <button
              onClick={handleReset}
              className="px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-slate-700 rounded-md transition-colors"
            >
              Reset
            </button>

            {/* Layout Direction Toggle */}
            <div className="flex items-center gap-1 bg-slate-700 rounded-lg p-1">
              <span className="px-2 text-xs text-gray-400">Layout:</span>
              <button
                onClick={() => handleLayoutDirectionChange('DOWN')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  layoutDirection === 'DOWN'
                    ? 'bg-purple-500 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
                title="Top to Bottom"
              >
                ↓
              </button>
              <button
                onClick={() => handleLayoutDirectionChange('RIGHT')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  layoutDirection === 'RIGHT'
                    ? 'bg-purple-500 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
                title="Left to Right"
              >
                →
              </button>
              <button
                onClick={() => handleLayoutDirectionChange('UP')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  layoutDirection === 'UP'
                    ? 'bg-purple-500 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
                title="Bottom to Top"
              >
                ↑
              </button>
              <button
                onClick={() => handleLayoutDirectionChange('LEFT')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  layoutDirection === 'LEFT'
                    ? 'bg-purple-500 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
                title="Right to Left"
              >
                ←
              </button>
            </div>

            {/* Libavoid Toggle */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setUseLibavoid(!useLibavoid)}
                disabled={libavoidLoading}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  useLibavoid && libavoidLoaded
                    ? 'bg-green-500 text-white'
                    : useLibavoid && libavoidLoading
                    ? 'bg-yellow-500 text-white animate-pulse'
                    : 'bg-slate-700 text-gray-400 hover:text-white'
                }`}
                title={useLibavoid ? 'Using libavoid edge routing' : 'Enable libavoid edge routing'}
              >
                {libavoidLoading ? 'Loading...' : useLibavoid ? 'Libavoid ON' : 'Libavoid'}
              </button>
            </div>

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
      <div className="flex-1 flex min-h-0">
        {/* Editor Panel */}
        <div
          className="flex flex-col min-h-0 bg-slate-850 border-r border-slate-700"
          style={{ width: `${splitPosition}%` }}
        >
          <div className="flex-shrink-0 px-4 py-2 bg-slate-800 border-b border-slate-700 text-sm text-gray-400 flex items-center justify-between">
            <span>Mermaid Source</span>
            {loading && <span className="text-cyan-400 text-xs">Parsing...</span>}
            {error && <span className="text-red-400 text-xs">Error</span>}
          </div>

          <div className="flex-1 relative min-h-0">
            <textarea
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="absolute inset-0 w-full h-full p-4 bg-slate-900 text-gray-100 font-mono text-sm resize-none focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
              spellCheck={false}
              placeholder="Enter Mermaid diagram code..."
            />
          </div>

          {error && (
            <div className="p-4 bg-red-900/30 border-t border-red-500 text-red-200 text-sm">
              <strong>Error:</strong> {error}
            </div>
          )}
        </div>

        {/* Diagram Panel */}
        <div
          className="flex flex-col min-h-0"
          style={{ width: `${100 - splitPosition}%` }}
        >
          <div className="flex-shrink-0 px-4 py-2 bg-slate-800 border-b border-slate-700 text-sm text-gray-400">
            <span>Diagram Preview (ReactFlow)</span>
          </div>

          <div className="flex-1 relative bg-white">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={handleNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeDragStart={handleNodeDragStart}
              onNodeDrag={handleNodeDrag}
              onNodeDragStop={handleNodeDragStop}
              nodeTypes={currentNodeTypes}
              edgeTypes={currentEdgeTypes}
              fitView
              attributionPosition="bottom-left"
              className={isometricClassName}
              panOnScroll={true}
              panOnDrag={true}
              zoomOnScroll={false}
              zoomOnPinch={true}
              zoomOnDoubleClick={false}
            >
              <ReactFlowCanvas viewMode={viewMode} />
            </ReactFlow>
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="flex-shrink-0 bg-slate-800 border-t border-slate-700 px-6 py-2">
        <div className="text-sm text-gray-400 flex items-center gap-4">
          <span>
            Mode: <span className="text-cyan-400">ReactFlow</span>
          </span>
          <span>
            View: <span className="text-cyan-400">{viewMode}</span>
          </span>
          <span>
            Layout: <span className="text-purple-400">{layoutDirection}</span>
          </span>
          <span>
            Router: <span className={useLibavoid && libavoidLoaded ? 'text-green-400' : 'text-gray-500'}>
              {useLibavoid && libavoidLoaded ? 'libavoid' : 'simple'}
            </span>
          </span>
          <span>
            Nodes: <span className="text-cyan-400">{nodes.length}</span>
          </span>
          <span>
            Edges: <span className="text-cyan-400">{edges.length}</span>
          </span>
        </div>
      </div>
    </div>
  )
}
