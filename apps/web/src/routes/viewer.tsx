import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  parse,
  render,
  createInitialNavState,
  toggleFold,
  testEdgeCollisions,
  logCollisionReport,
} from 'isomaid'
import type {
  ViewMode,
  Graph,
  NavState,
  CollisionTestResult,
  InteractionMode,
  EditingState,
  DragState,
} from 'isomaid'
import { createEmptyEditingState } from 'isomaid'
import { screenToGraph } from '../utils/coords'

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
const SHOW_GEOFENCES_STORAGE_KEY = 'isomaid-editor-show-geofences'
const SHOW_EDGE_COORDS_STORAGE_KEY = 'isomaid-editor-show-edge-coords'
const SHOW_PORT_COORDS_STORAGE_KEY = 'isomaid-editor-show-port-coords'
const SPLIT_POSITION_STORAGE_KEY = 'isomaid-editor-split-position'
const INTERACTION_MODE_STORAGE_KEY = 'isomaid-editor-interaction-mode'
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
    return false
  })
  const [showGeofences, setShowGeofences] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(SHOW_GEOFENCES_STORAGE_KEY)
      if (saved !== null) {
        return saved === 'true'
      }
    }
    return false
  })
  const [showEdgeCoords, setShowEdgeCoords] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(SHOW_EDGE_COORDS_STORAGE_KEY)
      if (saved !== null) {
        return saved === 'true'
      }
    }
    return false
  })
  const [showPortCoords, setShowPortCoords] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(SHOW_PORT_COORDS_STORAGE_KEY)
      if (saved !== null) {
        return saved === 'true'
      }
    }
    return false
  })
  const [interactionMode, setInteractionMode] = useState<InteractionMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(INTERACTION_MODE_STORAGE_KEY)
      if (saved === 'view' || saved === 'edit' || saved === 'coord') {
        return saved
      }
    }
    return 'view'
  })
  // Editing state for node/edge position overrides
  const [editingState, setEditingState] = useState<EditingState>(createEmptyEditingState)
  // Active drag operation
  const [dragState, setDragState] = useState<DragState | null>(null)
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
  // Collision test results
  const [collisionResult, setCollisionResult] = useState<CollisionTestResult | null>(null)
  const [showCollisions, setShowCollisions] = useState(false)
  // Clicked coordinate display
  const [clickedCoord, setClickedCoord] = useState<{ x: number; y: number; screenX: number; screenY: number } | null>(null)
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
      localStorage.setItem(SHOW_GEOFENCES_STORAGE_KEY, String(showGeofences))
    }
  }, [showGeofences])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(SHOW_EDGE_COORDS_STORAGE_KEY, String(showEdgeCoords))
    }
  }, [showEdgeCoords])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(SHOW_PORT_COORDS_STORAGE_KEY, String(showPortCoords))
    }
  }, [showPortCoords])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(SPLIT_POSITION_STORAGE_KEY, String(splitPosition))
    }
  }, [splitPosition])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(INTERACTION_MODE_STORAGE_KEY, interactionMode)
    }
  }, [interactionMode])

  // Clear editing state when source changes (re-parsing resets positions)
  const prevSourceRef = useRef(source)
  useEffect(() => {
    if (prevSourceRef.current !== source) {
      prevSourceRef.current = source
      // Only clear if there are actual overrides
      if (editingState.nodeOverrides.size > 0 || editingState.edgeOverrides.size > 0) {
        setEditingState(createEmptyEditingState())
      }
    }
  }, [source, editingState.nodeOverrides.size, editingState.edgeOverrides.size])

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
  // Key insight: DON'T re-layout when collapse state changes!
  // Just mark nodes with collapse metadata and let renderer hide children
  const renderCurrentView = useCallback(async () => {
    if (!graph) return

    try {
      // Helper to check if any ancestor is collapsed
      const hasCollapsedAncestor = (nodeId: string): boolean => {
        const node = graph.nodes.get(nodeId)
        if (!node?.parent) return false
        if (navState.collapsed.has(node.parent)) return true
        return hasCollapsedAncestor(node.parent)
      }

      // Create a shallow copy of nodes with collapse metadata and position overrides
      // Keep the full graph structure - don't filter children
      const nodesWithMetadata = new Map()
      for (const [nodeId, node] of graph.nodes) {
        const isCollapsed = navState.collapsed.has(nodeId)
        const hasChildren = node.isSubgraph && (node.children?.length ?? 0) > 0

        // Check if ANY ancestor is collapsed (so it should be hidden)
        const ancestorIsCollapsed = hasCollapsedAncestor(nodeId)

        // Apply position override if exists
        const posOverride = editingState.nodeOverrides.get(nodeId)
        const adjustedX = posOverride ? (node.x || 0) + posOverride.dx : node.x
        const adjustedY = posOverride ? (node.y || 0) + posOverride.dy : node.y

        // Also adjust port coordinates if there's a position override
        let adjustedPorts = node.ports
        if (posOverride && node.ports) {
          adjustedPorts = node.ports.map(port => ({
            ...port,
            closeX: port.closeX !== undefined ? port.closeX + posOverride.dx : undefined,
            closeY: port.closeY !== undefined ? port.closeY + posOverride.dy : undefined,
            farX: port.farX !== undefined ? port.farX + posOverride.dx : undefined,
            farY: port.farY !== undefined ? port.farY + posOverride.dy : undefined,
            cornerX: port.cornerX !== undefined ? port.cornerX + posOverride.dx : undefined,
            cornerY: port.cornerY !== undefined ? port.cornerY + posOverride.dy : undefined,
            x: port.x !== undefined ? port.x + posOverride.dx : undefined,
            y: port.y !== undefined ? port.y + posOverride.dy : undefined,
          }))
        }

        nodesWithMetadata.set(nodeId, {
          ...node,
          x: adjustedX,
          y: adjustedY,
          ports: adjustedPorts,
          _collapsed: isCollapsed,
          _hasChildren: hasChildren,
          _hidden: ancestorIsCollapsed,  // Hide if any ancestor is collapsed
        })
      }

      // Filter edges and adjust endpoints when connected nodes have moved or waypoints have been dragged
      const visibleEdges = graph.edges.filter(edge => {
        const fromNode = nodesWithMetadata.get(edge.from)
        const toNode = nodesWithMetadata.get(edge.to)
        return fromNode && toNode && !fromNode._hidden && !toNode._hidden
      }).map(edge => {
        const fromNode = nodesWithMetadata.get(edge.from)
        const toNode = nodesWithMetadata.get(edge.to)
        const fromOverride = editingState.nodeOverrides.get(edge.from)
        const toOverride = editingState.nodeOverrides.get(edge.to)
        const edgeId = `${edge.from}->${edge.to}`
        const edgeOverride = editingState.edgeOverrides.get(edgeId)

        // If no changes, return edge unchanged
        if (!fromOverride && !toOverride && !edgeOverride) {
          return edge
        }

        // Clone edge for modification
        const adjustedEdge = { ...edge }

        // Apply source port override (user changed which port edge connects to)
        if (edgeOverride?.sourcePortOverride && fromNode?.ports) {
          const newPort = fromNode.ports[edgeOverride.sourcePortOverride.portIndex]
          if (newPort) {
            adjustedEdge.sourcePort = newPort
          }
        } else if (fromOverride && edge.sourcePort) {
          // Adjust source port if source node moved (but no port override)
          adjustedEdge.sourcePort = {
            ...edge.sourcePort,
            closeX: edge.sourcePort.closeX !== undefined ? edge.sourcePort.closeX + fromOverride.dx : undefined,
            closeY: edge.sourcePort.closeY !== undefined ? edge.sourcePort.closeY + fromOverride.dy : undefined,
            farX: edge.sourcePort.farX !== undefined ? edge.sourcePort.farX + fromOverride.dx : undefined,
            farY: edge.sourcePort.farY !== undefined ? edge.sourcePort.farY + fromOverride.dy : undefined,
            cornerX: edge.sourcePort.cornerX !== undefined ? edge.sourcePort.cornerX + fromOverride.dx : undefined,
            cornerY: edge.sourcePort.cornerY !== undefined ? edge.sourcePort.cornerY + fromOverride.dy : undefined,
            x: edge.sourcePort.x !== undefined ? edge.sourcePort.x + fromOverride.dx : undefined,
            y: edge.sourcePort.y !== undefined ? edge.sourcePort.y + fromOverride.dy : undefined,
          }
        }

        // Apply target port override (user changed which port edge connects to)
        if (edgeOverride?.targetPortOverride && toNode?.ports) {
          const newPort = toNode.ports[edgeOverride.targetPortOverride.portIndex]
          if (newPort) {
            adjustedEdge.targetPort = newPort
          }
        } else if (toOverride && edge.targetPort) {
          // Adjust target port if target node moved (but no port override)
          adjustedEdge.targetPort = {
            ...edge.targetPort,
            closeX: edge.targetPort.closeX !== undefined ? edge.targetPort.closeX + toOverride.dx : undefined,
            closeY: edge.targetPort.closeY !== undefined ? edge.targetPort.closeY + toOverride.dy : undefined,
            farX: edge.targetPort.farX !== undefined ? edge.targetPort.farX + toOverride.dx : undefined,
            farY: edge.targetPort.farY !== undefined ? edge.targetPort.farY + toOverride.dy : undefined,
            cornerX: edge.targetPort.cornerX !== undefined ? edge.targetPort.cornerX + toOverride.dx : undefined,
            cornerY: edge.targetPort.cornerY !== undefined ? edge.targetPort.cornerY + toOverride.dy : undefined,
            x: edge.targetPort.x !== undefined ? edge.targetPort.x + toOverride.dx : undefined,
            y: edge.targetPort.y !== undefined ? edge.targetPort.y + toOverride.dy : undefined,
          }
        }

        // Adjust edge waypoints
        if (edge.points && edge.points.length > 0) {
          const adjustedPoints = [...edge.points]

          // If source port was overridden, use the new port position for first waypoint
          if (edgeOverride?.sourcePortOverride && adjustedEdge.sourcePort) {
            const port = adjustedEdge.sourcePort
            if (port.cornerX !== undefined && port.cornerY !== undefined) {
              adjustedPoints[0] = { x: port.cornerX, y: port.cornerY }
            }
          } else if (fromOverride) {
            // Adjust first waypoint if source node moved
            adjustedPoints[0] = {
              x: edge.points[0].x + fromOverride.dx,
              y: edge.points[0].y + fromOverride.dy,
            }
          }

          // If target port was overridden, use the new port position for last waypoint
          if (edgeOverride?.targetPortOverride && adjustedEdge.targetPort && edge.points.length > 1) {
            const port = adjustedEdge.targetPort
            if (port.cornerX !== undefined && port.cornerY !== undefined) {
              const lastIdx = adjustedPoints.length - 1
              adjustedPoints[lastIdx] = { x: port.cornerX, y: port.cornerY }
            }
          } else if (toOverride && edge.points.length > 1) {
            // Adjust last waypoint if target node moved
            const lastIdx = adjustedPoints.length - 1
            adjustedPoints[lastIdx] = {
              x: edge.points[lastIdx].x + toOverride.dx,
              y: edge.points[lastIdx].y + toOverride.dy,
            }
          }

          // Apply waypoint overrides (user-dragged middle waypoints)
          if (edgeOverride) {
            for (const wp of edgeOverride.waypoints) {
              if (wp.index >= 0 && wp.index < adjustedPoints.length) {
                adjustedPoints[wp.index] = { x: wp.x, y: wp.y }
              }
            }
          }

          adjustedEdge.points = adjustedPoints
        }

        return adjustedEdge
      })

      // Create render graph with metadata (no layout recalculation!)
      const renderGraph: Graph = {
        ...graph,
        nodes: nodesWithMetadata,
        edges: visibleEdges,
      }

      const showWaypointHandles = interactionMode === 'edit'
      console.log(`About to render with viewMode=${viewMode}, showPorts=${showPorts}, showGeofences=${showGeofences}, showEdgeCoords=${showEdgeCoords}, showPortCoords=${showPortCoords}, showWaypointHandles=${showWaypointHandles}`)
      const svg = render(renderGraph, { viewMode, showPorts, showGeofences, showEdgeCoords, showPortCoords, showWaypointHandles })
      console.log(`Render completed, svg length=${svg.length}`)

      // Run collision test after render
      const testResult = testEdgeCollisions(renderGraph)
      logCollisionReport(testResult)
      setCollisionResult(testResult)

      setSvg(svg)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to render diagram'
      setPendingError(errorMessage)
    }
  }, [graph, navState, viewMode, showPorts, showGeofences, showEdgeCoords, showPortCoords, editingState, interactionMode])

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

    // Look for a collapse icon by walking up the DOM tree
    let element: SVGElement | null = target
    while (element && element.tagName !== 'svg') {
      if (element.classList?.contains('collapse-icon')) {
        const nodeId = element.getAttribute('data-node-id')
        if (nodeId) {
          const node = graph.nodes.get(nodeId)
          if (node?.isSubgraph) {
            handleToggleFold(nodeId)
            e.stopPropagation()
            return
          }
        }
        break
      }
      element = element.parentElement as SVGElement | null
    }
  }, [graph, handleToggleFold])

  // Handle click on diagram canvas to show coordinates (only in coord mode)
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    // Only show coordinates in coord mode
    if (interactionMode !== 'coord') return

    const container = diagramContainerRef.current
    if (!container) return

    // Get click position relative to the container (for tooltip placement)
    const rect = container.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top

    // Find the SVG's transform group (contains the graph content with offset)
    const svgElement = container.querySelector('svg') as SVGSVGElement | null
    const transformGroup = svgElement?.querySelector('g[transform]') as SVGGraphicsElement | null

    if (svgElement && transformGroup) {
      try {
        // Use the coordinate utility to transform screen to graph coordinates
        const graphPoint = screenToGraph(
          e.clientX,
          e.clientY,
          svgElement,
          transformGroup,
          viewMode
        )

        setClickedCoord({
          x: Math.round(graphPoint.x),
          y: Math.round(graphPoint.y),
          screenX,
          screenY
        })
      } catch {
        // Silently fail if transform not available
      }
    }

    // Auto-hide after 3 seconds
    setTimeout(() => {
      setClickedCoord(null)
    }, 3000)
  }, [interactionMode, viewMode])

  // Handle mousedown for starting drag in edit mode
  const handleEditMouseDown = useCallback((e: React.MouseEvent) => {
    if (interactionMode !== 'edit' || !graph) return

    const target = e.target as SVGElement

    // Walk up DOM to find a draggable element
    let element: SVGElement | null = target
    while (element && element.tagName !== 'svg') {
      // Skip if clicking on collapse icon
      if (element.classList?.contains('collapse-icon')) {
        return
      }

      // Check for endpoint handle (green - for changing port connection)
      if (element.classList?.contains('endpoint-handle') && element.hasAttribute('data-edge-id')) {
        const edgeId = element.getAttribute('data-edge-id')!
        const endpointType = element.getAttribute('data-endpoint') as 'source' | 'target'

        // Start endpoint drag
        setDragState({
          type: 'endpoint',
          targetId: edgeId,
          endpointType,
          startX: e.clientX,
          startY: e.clientY,
          currentX: e.clientX,
          currentY: e.clientY,
        })
        e.preventDefault()
        e.stopPropagation()
        return
      }

      // Check for waypoint handle (orange - for repositioning)
      if (element.classList?.contains('waypoint-handle') && element.hasAttribute('data-edge-id')) {
        const edgeId = element.getAttribute('data-edge-id')!
        const waypointIndex = parseInt(element.getAttribute('data-waypoint-index') || '0', 10)

        // Start waypoint drag
        setDragState({
          type: 'waypoint',
          targetId: edgeId,
          waypointIndex,
          startX: e.clientX,
          startY: e.clientY,
          currentX: e.clientX,
          currentY: e.clientY,
        })
        e.preventDefault()
        e.stopPropagation()
        return
      }

      // Check for node
      if (element.classList?.contains('node') && element.hasAttribute('data-id')) {
        const nodeId = element.getAttribute('data-id')!
        const node = graph.nodes.get(nodeId)

        if (node) {
          // Start node drag
          setDragState({
            type: 'node',
            targetId: nodeId,
            startX: e.clientX,
            startY: e.clientY,
            currentX: e.clientX,
            currentY: e.clientY,
          })
          e.preventDefault()
          e.stopPropagation()
          return
        }
      }

      element = element.parentElement as SVGElement | null
    }
  }, [interactionMode, graph])

  // Handle mouse move during drag
  const handleEditMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState) return

    setDragState(prev => prev ? {
      ...prev,
      currentX: e.clientX,
      currentY: e.clientY,
    } : null)
  }, [dragState])

  // Handle mouse up to complete drag
  const handleEditMouseUp = useCallback((_e: MouseEvent) => {
    if (!dragState || !graph) {
      setDragState(null)
      return
    }

    const container = diagramContainerRef.current
    const svgElement = container?.querySelector('svg') as SVGSVGElement | null
    const transformGroup = svgElement?.querySelector('g[transform]') as SVGGraphicsElement | null

    if (!svgElement || !transformGroup) {
      setDragState(null)
      return
    }

    try {
      // Calculate delta in graph coordinates
      const startGraph = screenToGraph(
        dragState.startX,
        dragState.startY,
        svgElement,
        transformGroup,
        viewMode
      )
      const endGraph = screenToGraph(
        dragState.currentX,
        dragState.currentY,
        svgElement,
        transformGroup,
        viewMode
      )

      const dx = endGraph.x - startGraph.x
      const dy = endGraph.y - startGraph.y

      // Only apply if there's meaningful movement
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        if (dragState.type === 'node') {
          // Apply node position override
          setEditingState(prev => {
            const newOverrides = new Map(prev.nodeOverrides)
            const existing = newOverrides.get(dragState.targetId)

            newOverrides.set(dragState.targetId, {
              nodeId: dragState.targetId,
              dx: (existing?.dx || 0) + dx,
              dy: (existing?.dy || 0) + dy,
            })

            return {
              ...prev,
              nodeOverrides: newOverrides,
            }
          })
        } else if (dragState.type === 'waypoint' && dragState.waypointIndex !== undefined) {
          // Apply waypoint position override
          const edgeId = dragState.targetId
          const waypointIndex = dragState.waypointIndex

          // Find the edge to get the original waypoint position
          const edge = graph.edges.find(e => `${e.from}->${e.to}` === edgeId)
          if (edge?.points && edge.points[waypointIndex]) {
            const originalPoint = edge.points[waypointIndex]

            setEditingState(prev => {
              const newOverrides = new Map(prev.edgeOverrides)
              const existing = newOverrides.get(edgeId)

              // Get existing waypoints or create new array
              const existingWaypoints = existing?.waypoints || []

              // Find if we already have an override for this waypoint
              const existingWaypointIdx = existingWaypoints.findIndex(w => w.index === waypointIndex)

              let newWaypoints
              if (existingWaypointIdx >= 0) {
                // Update existing waypoint override
                newWaypoints = [...existingWaypoints]
                newWaypoints[existingWaypointIdx] = {
                  index: waypointIndex,
                  x: existingWaypoints[existingWaypointIdx].x + dx,
                  y: existingWaypoints[existingWaypointIdx].y + dy,
                }
              } else {
                // Add new waypoint override
                newWaypoints = [...existingWaypoints, {
                  index: waypointIndex,
                  x: originalPoint.x + dx,
                  y: originalPoint.y + dy,
                }]
              }

              newOverrides.set(edgeId, {
                edgeId,
                waypoints: newWaypoints,
              })

              return {
                ...prev,
                edgeOverrides: newOverrides,
              }
            })
          }
        } else if (dragState.type === 'endpoint' && dragState.endpointType) {
          // Apply endpoint port override - find nearest port on the connected node
          const edgeId = dragState.targetId
          const endpointType = dragState.endpointType

          // Find the edge
          const edge = graph.edges.find(e => `${e.from}->${e.to}` === edgeId)
          if (edge) {
            // Get the node we're connecting to
            const nodeId = endpointType === 'source' ? edge.from : edge.to
            const node = graph.nodes.get(nodeId)

            if (node?.ports && node.ports.length > 0) {
              // Find the nearest port to the drop position
              let nearestPortIndex = 0
              let nearestDistance = Infinity

              for (let i = 0; i < node.ports.length; i++) {
                const port = node.ports[i]
                if (port.cornerX !== undefined && port.cornerY !== undefined) {
                  const dist = Math.hypot(
                    endGraph.x - port.cornerX,
                    endGraph.y - port.cornerY
                  )
                  if (dist < nearestDistance) {
                    nearestDistance = dist
                    nearestPortIndex = i
                  }
                }
              }

              // Store the port override
              setEditingState(prev => {
                const newOverrides = new Map(prev.edgeOverrides)
                const existing = newOverrides.get(edgeId)

                const newOverride = {
                  edgeId,
                  waypoints: existing?.waypoints || [],
                  sourcePortOverride: endpointType === 'source'
                    ? { portIndex: nearestPortIndex }
                    : existing?.sourcePortOverride,
                  targetPortOverride: endpointType === 'target'
                    ? { portIndex: nearestPortIndex }
                    : existing?.targetPortOverride,
                }

                newOverrides.set(edgeId, newOverride)

                return {
                  ...prev,
                  edgeOverrides: newOverrides,
                }
              })
            }
          }
        }
      }
    } catch {
      // Silently fail if transform not available
    }

    setDragState(null)
  }, [dragState, graph, viewMode])

  // Attach mouse move/up listeners when dragging
  useEffect(() => {
    if (dragState) {
      document.addEventListener('mousemove', handleEditMouseMove)
      document.addEventListener('mouseup', handleEditMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleEditMouseMove)
        document.removeEventListener('mouseup', handleEditMouseUp)
      }
    }
  }, [dragState, handleEditMouseMove, handleEditMouseUp])

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
  const handleWheel = useCallback((e: WheelEvent) => {
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

  // Attach wheel event listener with passive: false to allow preventDefault
  useEffect(() => {
    const container = diagramContainerRef.current
    if (!container) return

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      container.removeEventListener('wheel', handleWheel)
    }
  }, [handleWheel])

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

            {/* Collision Test Button */}
            <button
              onClick={() => setShowCollisions(!showCollisions)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-2 ${
                collisionResult?.hasCollisions
                  ? 'text-red-400 hover:text-red-300 hover:bg-red-900/30'
                  : 'text-gray-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {collisionResult?.hasCollisions && (
                <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
              )}
              Collisions
              {collisionResult && (
                <span className="text-xs opacity-70">
                  ({collisionResult.collidingEdges}/{collisionResult.totalEdges})
                </span>
              )}
            </button>

            {/* Interaction Mode Toggle */}
            <div className="flex items-center gap-1 bg-slate-700 rounded-lg p-1">
              <button
                onClick={() => setInteractionMode('view')}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  interactionMode === 'view'
                    ? 'bg-slate-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
                title="View mode: Pan and zoom"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <span className="hidden sm:inline">View</span>
              </button>
              <button
                onClick={() => setInteractionMode('edit')}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  interactionMode === 'edit'
                    ? 'bg-amber-500 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
                title="Edit mode: Drag nodes and waypoints"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                <span className="hidden sm:inline">Edit</span>
              </button>
              <button
                onClick={() => setInteractionMode('coord')}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  interactionMode === 'coord'
                    ? 'bg-cyan-500 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
                title="Coord mode: Click to show coordinates"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="hidden sm:inline">Coord</span>
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
                <span>Ports</span>
              </label>

              {/* Show Geofences Toggle */}
              <label className="flex items-center gap-2 cursor-pointer hover:text-gray-300">
                <input
                  type="checkbox"
                  checked={showGeofences}
                  onChange={(e) => setShowGeofences(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-600 bg-slate-700 text-red-500 focus:ring-red-500 focus:ring-offset-slate-900"
                />
                <span>Geofences</span>
              </label>

              {/* Show Edge Coords Toggle */}
              <label className="flex items-center gap-2 cursor-pointer hover:text-gray-300">
                <input
                  type="checkbox"
                  checked={showEdgeCoords}
                  onChange={(e) => setShowEdgeCoords(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-600 bg-slate-700 text-orange-500 focus:ring-orange-500 focus:ring-offset-slate-900"
                />
                <span>Edge</span>
              </label>

              {/* Show Port Coords Toggle */}
              <label className="flex items-center gap-2 cursor-pointer hover:text-gray-300">
                <input
                  type="checkbox"
                  checked={showPortCoords}
                  onChange={(e) => setShowPortCoords(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-600 bg-slate-700 text-green-500 focus:ring-green-500 focus:ring-offset-slate-900"
                />
                <span>Port</span>
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
            className={`flex-1 overflow-hidden relative bg-slate-900 ${
              interactionMode === 'edit' ? 'cursor-move' :
              interactionMode === 'coord' ? 'cursor-crosshair' :
              'cursor-grab'
            }`}
            onClick={handleCanvasClick}
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

            {/* Show collision test results */}
            {showCollisions && collisionResult && (
              <div className={`absolute top-4 right-4 z-10 ${
                collisionResult.hasCollisions
                  ? 'bg-red-900/80 border-red-500'
                  : 'bg-green-900/80 border-green-500'
              } border rounded-lg p-4 text-white max-w-md max-h-96 overflow-auto`}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold">
                    {collisionResult.hasCollisions ? '✗ Collisions Detected' : '✓ No Collisions'}
                  </h3>
                  <button
                    onClick={() => setShowCollisions(false)}
                    className="text-gray-300 hover:text-white text-sm"
                  >
                    ✕
                  </button>
                </div>
                <p className="text-sm opacity-80 mb-2">
                  {collisionResult.collidingEdges}/{collisionResult.totalEdges} edges have collisions
                </p>
                {collisionResult.collisions.length > 0 && (
                  <div className="space-y-2 text-sm">
                    {collisionResult.collisions.map((c, i) => (
                      <div key={i} className="bg-black/30 rounded p-2">
                        <div className="font-mono text-red-300">{c.edgeId}</div>
                        {c.collidingNodes.length > 0 && (
                          <div className="text-gray-300">
                            Nodes: {c.collidingNodes.join(', ')}
                          </div>
                        )}
                        {c.collidingLabels.length > 0 && (
                          <div className="text-yellow-300">
                            Labels: {c.collidingLabels.join(', ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Show clicked coordinate */}
            {clickedCoord && (
              <div
                className="absolute z-20 pointer-events-none"
                style={{
                  left: clickedCoord.screenX,
                  top: clickedCoord.screenY,
                  transform: 'translate(-50%, -100%) translateY(-8px)'
                }}
              >
                <div className="bg-slate-800 border border-cyan-500 rounded-md px-2 py-1 text-cyan-400 font-mono text-sm shadow-lg whitespace-nowrap">
                  {clickedCoord.x}, {clickedCoord.y}
                </div>
                <div
                  className="absolute left-1/2 -translate-x-1/2 w-2 h-2 bg-cyan-500 rounded-full"
                  style={{ bottom: -12 }}
                />
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
                    onMouseDown={handleEditMouseDown}
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
              Mode: <span className={`${
                interactionMode === 'edit' ? 'text-amber-400' :
                interactionMode === 'coord' ? 'text-cyan-400' :
                'text-gray-400'
              }`}>{interactionMode}</span>
            </span>
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
