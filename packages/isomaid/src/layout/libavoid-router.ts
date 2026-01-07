/**
 * Libavoid-based edge router for high-quality orthogonal routing
 *
 * Uses the libavoid-js WebAssembly port of the C++ libavoid library
 * for professional-grade obstacle-avoiding edge routing.
 *
 * @see https://github.com/Aksem/libavoid-js
 * @see https://www.adaptagrams.org/documentation/libavoid.html
 */

import { AvoidLib, type Avoid } from 'libavoid-js'
import type { Graph, Node, Edge, Port, PortSide } from '../model/types'

// Libavoid routing parameters (from adaptagrams documentation)
export const RoutingParameter = {
  segmentPenalty: 0,
  anglePenalty: 1,
  crossingPenalty: 2,
  clusterCrossingPenalty: 3,
  fixedSharedPathPenalty: 4,
  portDirectionPenalty: 5,
  shapeBufferDistance: 6,
  idealNudgingDistance: 7,
  reverseDirectionPenalty: 8,
} as const

// Libavoid routing options
export const RoutingOption = {
  nudgeOrthogonalSegmentsConnectedToShapes: 0,
  improveHyperedgeRoutesMovingJunctions: 1,
  penaliseOrthogonalSharedPathsAtConnEnds: 2,
  nudgeOrthogonalTouchingColinearSegments: 3,
  performUnifyingNudgingPreprocessingStep: 4,
  improveHyperedgeRoutesMovingAddingAndDeletingJunctions: 5,
  nudgeSharedPathsWithCommonEndPoint: 6,
} as const

// Connection direction flags
export const ConnDirFlag = {
  None: 0,
  Up: 1,
  Down: 2,
  Left: 4,
  Right: 8,
  All: 15,
} as const

export interface LibavoidRouterOptions {
  /** Use orthogonal (right-angle) routing vs polyline */
  orthogonal?: boolean
  /** Buffer distance around shapes (default: 10) */
  shapeBufferDistance?: number
  /** Ideal distance between nudged segments (default: 10) */
  idealNudgingDistance?: number
  /** Penalty for edge segments (default: 10) */
  segmentPenalty?: number
  /** Penalty for edge crossings (default: 0 = no penalty, 200+ = strong avoidance) */
  crossingPenalty?: number
  /** Penalty for port direction violations (default: 100) */
  portDirectionPenalty?: number
  /** Enable nudging of orthogonal segments connected to shapes */
  nudgeConnectedSegments?: boolean
  /** Enable nudging of colinear segments */
  nudgeColinearSegments?: boolean
}

const DEFAULT_OPTIONS: Required<LibavoidRouterOptions> = {
  orthogonal: true,
  shapeBufferDistance: 12,
  idealNudgingDistance: 15,
  segmentPenalty: 10,
  crossingPenalty: 200,
  portDirectionPenalty: 100,
  nudgeConnectedSegments: true,
  nudgeColinearSegments: true,
}

// Module state
let avoid: Avoid | null = null
let loadPromise: Promise<void> | null = null

/**
 * Load the libavoid WASM module
 * Must be called before using the router
 */
export async function loadLibavoid(wasmPath?: string): Promise<void> {
  if (avoid) return

  if (loadPromise) {
    return loadPromise
  }

  loadPromise = AvoidLib.load(wasmPath).then(() => {
    avoid = AvoidLib.getInstance()
  })

  return loadPromise
}

/**
 * Check if libavoid is loaded
 */
export function isLibavoidLoaded(): boolean {
  return avoid !== null
}

/**
 * Get the libavoid instance (throws if not loaded)
 */
function getAvoid(): Avoid {
  if (!avoid) {
    throw new Error(
      'Libavoid not loaded. Call loadLibavoid() before routing.'
    )
  }
  return avoid
}

/**
 * Convert PortSide to libavoid direction flag
 */
function portSideToConnDir(side: PortSide): number {
  switch (side) {
    case 'T': return ConnDirFlag.Up
    case 'B': return ConnDirFlag.Down
    case 'L': return ConnDirFlag.Left
    case 'R': return ConnDirFlag.Right
    default: return ConnDirFlag.All
  }
}

/**
 * Route all edges in a graph using libavoid
 *
 * This replaces the simple L-path router with professional obstacle-avoiding routing.
 * Nodes must already have positions (x, y, width, height) set.
 */
export function routeEdgesLibavoid(
  graph: Graph,
  options: LibavoidRouterOptions = {}
): void {
  const Avoid = getAvoid()
  const opts = { ...DEFAULT_OPTIONS, ...options }

  // Create router with orthogonal or polyline routing
  const routingFlags = opts.orthogonal
    ? Avoid.OrthogonalRouting
    : Avoid.PolyLineRouting

  const router = new Avoid.Router(routingFlags)

  // Configure routing parameters
  router.setRoutingParameter(RoutingParameter.shapeBufferDistance, opts.shapeBufferDistance)
  router.setRoutingParameter(RoutingParameter.idealNudgingDistance, opts.idealNudgingDistance)
  router.setRoutingParameter(RoutingParameter.segmentPenalty, opts.segmentPenalty)
  router.setRoutingParameter(RoutingParameter.crossingPenalty, opts.crossingPenalty)
  router.setRoutingParameter(RoutingParameter.portDirectionPenalty, opts.portDirectionPenalty)

  // Configure routing options
  router.setRoutingOption(RoutingOption.nudgeOrthogonalSegmentsConnectedToShapes, opts.nudgeConnectedSegments)
  router.setRoutingOption(RoutingOption.nudgeOrthogonalTouchingColinearSegments, opts.nudgeColinearSegments)

  // Track shapes and connectors for cleanup
  const shapeRefs = new Map<string, any>() // ShapeRef instances
  const connRefs: any[] = [] // ConnRef instances

  try {
    // Step 1: Add all nodes as obstacles (shapes)
    for (const node of graph.nodes.values()) {
      if (node.x === undefined || node.y === undefined) continue

      const width = node.width || 100
      const height = node.height || 40

      // Create rectangle centered at node position
      const center = new Avoid.Point(node.x, node.y)
      const rect = new Avoid.Rectangle(center, width, height)
      const shapeRef = new Avoid.ShapeRef(router, rect)

      shapeRefs.set(node.id, shapeRef)

      // Add connection pins for each port if the node has ports
      if (node.ports && node.ports.length > 0) {
        addPortPins(Avoid, shapeRef, node, width, height)
      }
    }

    // Step 2: Create connectors for all edges
    for (const edge of graph.edges) {
      const fromNode = graph.nodes.get(edge.from)
      const toNode = graph.nodes.get(edge.to)

      if (!fromNode || !toNode) continue
      if (fromNode.x === undefined || fromNode.y === undefined) continue
      if (toNode.x === undefined || toNode.y === undefined) continue

      const fromShape = shapeRefs.get(edge.from)
      const toShape = shapeRefs.get(edge.to)

      let connRef: any

      if (fromShape && toShape) {
        // Connect via shape connection pins (port-aware routing)
        // Use pin class ID 1 for all connections (allows libavoid to choose best port)
        const srcEnd = new Avoid.ConnEnd(fromShape, 1)
        const dstEnd = new Avoid.ConnEnd(toShape, 1)
        connRef = new Avoid.ConnRef(router, srcEnd, dstEnd)
      } else {
        // Fallback: connect via points
        const srcPt = new Avoid.Point(fromNode.x, fromNode.y)
        const dstPt = new Avoid.Point(toNode.x, toNode.y)
        const srcEnd = new Avoid.ConnEnd(srcPt)
        const dstEnd = new Avoid.ConnEnd(dstPt)
        connRef = new Avoid.ConnRef(router, srcEnd, dstEnd)
      }

      // Enable crossing avoidance for this connector
      connRef.setHateCrossings(true)

      connRefs.push({ connRef, edge })
    }

    // Step 3: Process the routing transaction
    router.processTransaction()

    // Step 4: Extract routes and apply to edges
    for (const { connRef, edge } of connRefs) {
      const route = connRef.displayRoute()
      const points: { x: number; y: number }[] = []

      const numPoints = route.size()
      for (let i = 0; i < numPoints; i++) {
        const pt = route.get_ps(i)
        points.push({ x: pt.x, y: pt.y })
      }

      edge.points = points

      // Determine port sides from route direction
      if (points.length >= 2) {
        edge.fromPort = determinePortSide(points[0], points[1])
        edge.toPort = determinePortSide(points[points.length - 1], points[points.length - 2])
      }
    }

  } finally {
    // Cleanup: destroy all libavoid objects
    // The router destructor cleans up shapes and connectors
    Avoid.destroy(router)
  }
}

/**
 * Add connection pins to a shape for port-aware routing
 */
function addPortPins(
  Avoid: Avoid,
  shapeRef: any,
  node: Node,
  width: number,
  height: number
): void {
  const halfW = width / 2
  const halfH = height / 2

  // Add pins at the center of each side
  // Pin class ID 1 = general connection class
  // Offsets are relative to shape center, proportional=false means absolute offset

  // Top center
  new Avoid.ShapeConnectionPin(
    shapeRef, 1,
    0, -halfH,  // x offset, y offset from center
    false,      // not proportional
    0,          // inside offset
    ConnDirFlag.Up
  )

  // Bottom center
  new Avoid.ShapeConnectionPin(
    shapeRef, 1,
    0, halfH,
    false, 0,
    ConnDirFlag.Down
  )

  // Left center
  new Avoid.ShapeConnectionPin(
    shapeRef, 1,
    -halfW, 0,
    false, 0,
    ConnDirFlag.Left
  )

  // Right center
  new Avoid.ShapeConnectionPin(
    shapeRef, 1,
    halfW, 0,
    false, 0,
    ConnDirFlag.Right
  )

  // Add additional pins for multi-port nodes (3 pins per horizontal side, 2 per vertical)
  const topSpacing = halfW / 2
  const sideSpacing = halfH / 2

  // Additional top pins (left and right of center)
  new Avoid.ShapeConnectionPin(shapeRef, 1, -topSpacing, -halfH, false, 0, ConnDirFlag.Up)
  new Avoid.ShapeConnectionPin(shapeRef, 1, topSpacing, -halfH, false, 0, ConnDirFlag.Up)

  // Additional bottom pins
  new Avoid.ShapeConnectionPin(shapeRef, 1, -topSpacing, halfH, false, 0, ConnDirFlag.Down)
  new Avoid.ShapeConnectionPin(shapeRef, 1, topSpacing, halfH, false, 0, ConnDirFlag.Down)

  // Additional left pins (above and below center)
  new Avoid.ShapeConnectionPin(shapeRef, 1, -halfW, -sideSpacing, false, 0, ConnDirFlag.Left)

  // Additional right pins
  new Avoid.ShapeConnectionPin(shapeRef, 1, halfW, -sideSpacing, false, 0, ConnDirFlag.Right)
}

/**
 * Determine which port side a point is on based on movement direction
 */
function determinePortSide(
  point: { x: number; y: number },
  nextPoint: { x: number; y: number }
): PortSide {
  const dx = nextPoint.x - point.x
  const dy = nextPoint.y - point.y

  // Determine primary direction of movement
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'R' : 'L'
  } else {
    return dy > 0 ? 'B' : 'T'
  }
}

/**
 * Find edge crossings in routed edges (for bridge rendering)
 */
export function findEdgeCrossingsLibavoid(
  edges: Edge[]
): Map<Edge, { x: number; y: number }[]> {
  const crossings = new Map<Edge, { x: number; y: number }[]>()

  for (let i = 0; i < edges.length; i++) {
    const edge1 = edges[i]
    if (!edge1.points || edge1.points.length < 2) continue

    const edgeCrossings: { x: number; y: number }[] = []

    for (let j = i + 1; j < edges.length; j++) {
      const edge2 = edges[j]
      if (!edge2.points || edge2.points.length < 2) continue

      // Check all segment pairs
      for (let s1 = 0; s1 < edge1.points.length - 1; s1++) {
        for (let s2 = 0; s2 < edge2.points.length - 1; s2++) {
          const intersection = segmentsIntersect(
            edge1.points[s1], edge1.points[s1 + 1],
            edge2.points[s2], edge2.points[s2 + 1]
          )
          if (intersection) {
            edgeCrossings.push(intersection)
          }
        }
      }
    }

    if (edgeCrossings.length > 0) {
      crossings.set(edge1, edgeCrossings)
    }
  }

  return crossings
}

/**
 * Check if two line segments intersect
 */
function segmentsIntersect(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  p4: { x: number; y: number }
): { x: number; y: number } | null {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x)
  if (Math.abs(d) < 0.0001) return null // Parallel

  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d
  const u = -((p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x)) / d

  if (t >= 0.01 && t <= 0.99 && u >= 0.01 && u <= 0.99) {
    return {
      x: p1.x + t * (p2.x - p1.x),
      y: p1.y + t * (p2.y - p1.y),
    }
  }

  return null
}
