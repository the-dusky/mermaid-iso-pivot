/**
 * Orthogonal edge router with simple L-shaped paths
 *
 * Connects nodes via orthogonal edges, using port blocking to avoid
 * routing through label geofences. Detects edge crossings for bridge rendering.
 */

import type { Graph, Node, Edge, Port, PortSide } from '../model/types'
import {
  generateGeofences,
  segmentIntersectsGeofence,
  segmentIntersectsLabelGeofence,
  segmentIntersectsSubgraphGeofence,
  type LabelGeofence,
  type GeofenceData
} from './geofence'

type Side = 'top' | 'bottom' | 'left' | 'right'

interface ConnectionPoint {
  x: number
  y: number
  side: Side
  waypoint: { x: number; y: number }  // Point edge must pass through (standoff)
  port?: Port  // The actual port object with close/far coordinates
}

/**
 * Convert our Side type to PortSide
 */
function sideToPortSide(side: Side): PortSide {
  switch (side) {
    case 'top': return 'T'
    case 'bottom': return 'B'
    case 'left': return 'L'
    case 'right': return 'R'
  }
}

/**
 * Find best available port on a specific side of a node
 * Priority order: center first, then right/top, then left/bottom
 * Always prefers unused ports over used ones
 */
function getBestPortOnSide(
  node: Node,
  side: Side,
  _targetX: number,
  _targetY: number,
  graph: Graph
): Port | undefined {
  if (!node.ports) return undefined
  const portSide = sideToPortSide(side)

  // Get all ports on this side, maintaining their original index
  const portsOnSide = node.ports
    .map((p, idx) => ({ port: p, originalIndex: idx }))
    .filter(item => item.port.side === portSide)

  if (portsOnSide.length === 0) return undefined

  // Find which ports are already allocated by checking sourcePort/targetPort on edges
  // Use the port's original index in node.ports array as a stable identifier
  const usedPortIndices = new Set<number>()
  for (const edge of graph.edges) {
    if (edge.sourcePort && edge.from === node.id && node.ports) {
      const idx = node.ports.indexOf(edge.sourcePort)
      if (idx >= 0) usedPortIndices.add(idx)
    }
    if (edge.targetPort && edge.to === node.id && node.ports) {
      const idx = node.ports.indexOf(edge.targetPort)
      if (idx >= 0) usedPortIndices.add(idx)
    }
  }

  // Define priority order based on port position within the side
  // Ports are generated in elk.ts in order: left/top, center, right/bottom
  // For T/B (3 ports): indices 0=left, 1=center, 2=right → priority [1, 2, 0]
  // For L/R (2 ports): indices 0=top, 1=bottom → priority [0, 1]
  let priorityOrder: number[]
  if (portSide === 'T' || portSide === 'B') {
    // 3 ports: center (1), right (2), left (0)
    priorityOrder = [1, 2, 0]
  } else {
    // 2 ports: top (0), bottom (1)
    priorityOrder = [0, 1]
  }

  // Map priority order to actual ports (by their position within portsOnSide)
  // portsOnSide preserves the generation order from elk.ts
  const orderedPorts = priorityOrder
    .filter(i => i < portsOnSide.length)
    .map(i => portsOnSide[i])

  // Find first unused port in priority order
  for (const item of orderedPorts) {
    if (!usedPortIndices.has(item.originalIndex)) {
      return item.port
    }
  }

  // All ports used, return first in priority order
  return orderedPorts[0]?.port ?? portsOnSide[0]?.port
}

/**
 * Check if a port's corridor is blocked by any label geofence
 */
function isPortBlockedByLabel(
  port: Port,
  labelGeofences: LabelGeofence[],
  nodeId: string
): boolean {
  if (!port.cornerX || !port.cornerY) return false

  // Check the port's corner position against all label geofences
  // (excluding the node's own label)
  for (const labelGeofence of labelGeofences) {
    // Skip this node's own label
    if (labelGeofence.labelId === `label-${nodeId}`) continue

    const { bounds } = labelGeofence
    // Check if port corner is inside label bounds (with some margin)
    const margin = 5
    if (port.cornerX >= bounds.left - margin && port.cornerX <= bounds.right + margin &&
        port.cornerY >= bounds.top - margin && port.cornerY <= bounds.bottom + margin) {
      return true
    }
  }
  return false
}

/**
 * Check if a side of a node has any unblocked ports
 */
function hasUnblockedPortsOnSide(
  node: Node,
  side: Side,
  labelGeofences: LabelGeofence[]
): boolean {
  if (!node.ports) return false
  const portSide = sideToPortSide(side)

  for (const port of node.ports) {
    if (port.side === portSide && !isPortBlockedByLabel(port, labelGeofences, node.id)) {
      return true
    }
  }
  return false
}

/**
 * Find best available port on a specific side, filtering out blocked ports
 */
function getBestUnblockedPortOnSide(
  node: Node,
  side: Side,
  targetX: number,
  targetY: number,
  graph: Graph,
  labelGeofences: LabelGeofence[]
): Port | undefined {
  if (!node.ports) return undefined
  const portSide = sideToPortSide(side)

  // Get all ports on this side, maintaining their original index
  const portsOnSide = node.ports
    .map((p, idx) => ({ port: p, originalIndex: idx }))
    .filter(item => item.port.side === portSide)
    // Filter out ports blocked by label geofences
    .filter(item => !isPortBlockedByLabel(item.port, labelGeofences, node.id))

  if (portsOnSide.length === 0) return undefined

  // Find which ports are already allocated
  const usedPortIndices = new Set<number>()
  for (const edge of graph.edges) {
    if (edge.sourcePort && edge.from === node.id && node.ports) {
      const idx = node.ports.indexOf(edge.sourcePort)
      if (idx >= 0) usedPortIndices.add(idx)
    }
    if (edge.targetPort && edge.to === node.id && node.ports) {
      const idx = node.ports.indexOf(edge.targetPort)
      if (idx >= 0) usedPortIndices.add(idx)
    }
  }

  // Priority order: center, right/top, left/bottom
  let priorityOrder: number[]
  if (portSide === 'T' || portSide === 'B') {
    priorityOrder = [1, 2, 0]
  } else {
    priorityOrder = [0, 1]
  }

  // Find first unused port in priority order
  for (const priority of priorityOrder) {
    const item = portsOnSide.find((_, idx) => idx === priority)
    if (item && !usedPortIndices.has(item.originalIndex)) {
      return item.port
    }
  }

  // All unblocked ports used, return first available
  return portsOnSide[0]?.port
}

/**
 * Calculate L-path distance for a given port combination
 * An L-path has exactly one turn, so distance = |dx| + |dy|
 */
function calculateLPathDistance(
  fromX: number, fromY: number,
  toX: number, toY: number
): number {
  return Math.abs(toX - fromX) + Math.abs(toY - fromY)
}

/**
 * Penalty per collision - each collision adds equivalent of 3 turns worth of routing
 * A typical turn adds ~50-100px of path, so 3 turns ≈ 150-300px penalty
 */
const COLLISION_PENALTY = 200

/**
 * Build a test path between two points for collision testing
 * Uses same logic as buildOrthogonalPath to ensure consistency
 */
function buildTestPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  fromSide: Side,
  toSide: Side
): { x: number; y: number }[] {
  // Delegate to the same function used for actual paths
  return buildOrthogonalPath(from, to, fromSide, toSide)
}

/**
 * Count how many geofences an L-path collides with
 *
 * Geofence exclusion rules:
 * - Source node: Only excluded for FIRST segment (exiting via port)
 * - Target node: Only excluded for LAST segment (entering via port)
 * - Middle segments: Must check against ALL node geofences including source/target
 * - Parent subgraphs: Always excluded (nodes must cross their container boundary)
 */
function countPathCollisions(
  path: { x: number; y: number }[],
  geofenceData: GeofenceData,
  sourceNodeId: string,
  targetNodeId: string,
  excludeSubgraphIds: string[] = []
): number {
  let collisionCount = 0
  const countedNodes = new Set<string>()
  const countedLabels = new Set<string>()
  const countedSubgraphs = new Set<string>()
  const lastSegmentIdx = path.length - 2

  for (let i = 0; i < path.length - 1; i++) {
    const p1 = path[i]
    const p2 = path[i + 1]
    const isFirstSegment = i === 0
    const isLastSegment = i === lastSegmentIdx

    // Check node geofences
    for (const [nodeId, geofence] of geofenceData.nodeGeofences) {
      // Source geofence: only skip for first segment (exiting via port)
      if (nodeId === sourceNodeId && isFirstSegment) continue
      // Target geofence: only skip for last segment (entering via port)
      if (nodeId === targetNodeId && isLastSegment) continue
      if (countedNodes.has(nodeId)) continue

      if (segmentIntersectsGeofence(p1, p2, geofence)) {
        countedNodes.add(nodeId)
        collisionCount++
      }
    }

    // Check subgraph geofences
    for (const [subgraphId, subgraphGeofence] of geofenceData.subgraphGeofences) {
      // Source/target subgraph handling (same as nodes)
      if (subgraphId === sourceNodeId && isFirstSegment) continue
      if (subgraphId === targetNodeId && isLastSegment) continue
      // Skip parent subgraphs (nodes inside must cross their parent's boundary)
      if (excludeSubgraphIds.includes(subgraphId)) continue
      if (countedSubgraphs.has(subgraphId)) continue

      if (segmentIntersectsSubgraphGeofence(p1, p2, subgraphGeofence)) {
        countedSubgraphs.add(subgraphId)
        collisionCount++
      }
    }

    // Check label geofences (subgraph labels are the main concern)
    for (const labelGeofence of geofenceData.labelGeofences) {
      const labelId = labelGeofence.labelId
      // Extract node ID from label ID
      const nodeId = labelId.replace('label-', '').replace('edge-', '')

      // Skip labels for source/target nodes on their respective segments
      if (nodeId === sourceNodeId && isFirstSegment) continue
      if (nodeId === targetNodeId && isLastSegment) continue
      if (countedLabels.has(labelId)) continue

      if (segmentIntersectsLabelGeofence(p1, p2, labelGeofence)) {
        countedLabels.add(labelId)
        collisionCount++
      }
    }
  }

  return collisionCount
}

/**
 * Get port position for a given side, with fallback calculation
 */
function getPortPosition(
  node: Node,
  side: Side,
  port: Port | undefined,
  graph: Graph,
  labelGeofences: LabelGeofence[]
): { x: number; y: number; port: Port | undefined } {
  // Try to get an unblocked port on this side
  const actualPort = port || (
    labelGeofences.length > 0
      ? getBestUnblockedPortOnSide(node, side, node.x!, node.y!, graph, labelGeofences)
      : getBestPortOnSide(node, side, node.x!, node.y!, graph)
  )

  if (actualPort && actualPort.cornerX !== undefined && actualPort.cornerY !== undefined) {
    return { x: actualPort.cornerX, y: actualPort.cornerY, port: actualPort }
  }

  // Fallback: calculate edge point
  const hw = (node.width || 100) / 2
  const hh = (node.height || 40) / 2
  const nx = node.x!
  const ny = node.y!

  switch (side) {
    case 'top': return { x: nx, y: ny - hh, port: undefined }
    case 'bottom': return { x: nx, y: ny + hh, port: undefined }
    case 'left': return { x: nx - hw, y: ny, port: undefined }
    case 'right': return { x: nx + hw, y: ny, port: undefined }
  }
}

/**
 * Determine best connection sides by evaluating multiple port combinations
 * and choosing the one with lowest cost (distance + collision penalties).
 * Avoids sides blocked by label geofences.
 */
function getConnectionPoints(
  fromNode: Node,
  toNode: Node,
  graph: Graph,
  labelGeofences: LabelGeofence[] = [],
  geofenceData?: GeofenceData
): { from: ConnectionPoint; to: ConnectionPoint } {
  const fx = fromNode.x!
  const fy = fromNode.y!
  const tx = toNode.x!
  const ty = toNode.y!

  // Calculate relative position to determine candidate sides
  const dx = tx - fx
  const dy = ty - fy

  // Generate candidate side pairs based on relative position
  // We consider both primary and secondary options for each node
  const fromCandidates: Side[] = []
  const toCandidates: Side[] = []

  // Primary sides based on direction
  if (dy > 0) {
    fromCandidates.push('bottom')
    toCandidates.push('top')
  } else if (dy < 0) {
    fromCandidates.push('top')
    toCandidates.push('bottom')
  }

  if (dx > 0) {
    fromCandidates.push('right')
    toCandidates.push('left')
  } else if (dx < 0) {
    fromCandidates.push('left')
    toCandidates.push('right')
  }

  // Ensure we have at least one candidate on each side
  if (fromCandidates.length === 0) fromCandidates.push('bottom', 'right')
  if (toCandidates.length === 0) toCandidates.push('top', 'left')

  // Filter out blocked sides
  const validFromSides = fromCandidates.filter(side =>
    labelGeofences.length === 0 || hasUnblockedPortsOnSide(fromNode, side, labelGeofences)
  )
  const validToSides = toCandidates.filter(side =>
    labelGeofences.length === 0 || hasUnblockedPortsOnSide(toNode, side, labelGeofences)
  )

  // If all preferred sides are blocked, try all sides
  const allSides: Side[] = ['top', 'bottom', 'left', 'right']
  const finalFromSides = validFromSides.length > 0 ? validFromSides :
    allSides.filter(side => labelGeofences.length === 0 || hasUnblockedPortsOnSide(fromNode, side, labelGeofences))
  const finalToSides = validToSides.length > 0 ? validToSides :
    allSides.filter(side => labelGeofences.length === 0 || hasUnblockedPortsOnSide(toNode, side, labelGeofences))

  // Parent subgraphs to exclude - nodes inside a subgraph must cross its boundary
  const excludeSubgraphIds: string[] = []
  if (fromNode.parent) excludeSubgraphIds.push(fromNode.parent)
  if (toNode.parent && !excludeSubgraphIds.includes(toNode.parent)) {
    excludeSubgraphIds.push(toNode.parent)
  }

  // Evaluate all combinations and find the lowest cost path
  let bestFrom: ConnectionPoint | null = null
  let bestTo: ConnectionPoint | null = null
  let bestCost = Infinity

  for (const fromSide of finalFromSides) {
    for (const toSide of finalToSides) {
      const fromPos = getPortPosition(fromNode, fromSide, undefined, graph, labelGeofences)
      const toPos = getPortPosition(toNode, toSide, undefined, graph, labelGeofences)

      const distance = calculateLPathDistance(fromPos.x, fromPos.y, toPos.x, toPos.y)

      // Calculate collision penalty if geofence data is available
      let collisionPenalty = 0
      if (geofenceData) {
        // Build test path using same logic as actual rendering
        const testPath = buildTestPath(
          { x: fromPos.x, y: fromPos.y },
          { x: toPos.x, y: toPos.y },
          fromSide,
          toSide
        )
        const collisions = countPathCollisions(testPath, geofenceData, fromNode.id, toNode.id, excludeSubgraphIds)
        collisionPenalty = collisions * COLLISION_PENALTY
      }

      const totalCost = distance + collisionPenalty

      if (totalCost < bestCost) {
        bestCost = totalCost
        bestFrom = {
          x: fromPos.x,
          y: fromPos.y,
          side: fromSide,
          waypoint: { x: fromPos.x, y: fromPos.y },
          port: fromPos.port
        }
        bestTo = {
          x: toPos.x,
          y: toPos.y,
          side: toSide,
          waypoint: { x: toPos.x, y: toPos.y },
          port: toPos.port
        }
      }
    }
  }

  // Fallback (should never happen if nodes have valid positions)
  if (!bestFrom || !bestTo) {
    const fromHH = (fromNode.height || 40) / 2
    const toHH = (toNode.height || 40) / 2
    bestFrom = {
      x: fx, y: fy + fromHH, side: 'bottom',
      waypoint: { x: fx, y: fy + fromHH }, port: undefined
    }
    bestTo = {
      x: tx, y: ty - toHH, side: 'top',
      waypoint: { x: tx, y: ty - toHH }, port: undefined
    }
  }

  return { from: bestFrom, to: bestTo }
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

/**
 * Find all crossings between edges
 */
export function findEdgeCrossings(edges: Edge[]): Map<Edge, { x: number; y: number }[]> {
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
            edge1.points[s1],
            edge1.points[s1 + 1],
            edge2.points[s2],
            edge2.points[s2 + 1]
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
 * Count how many already-routed edges a candidate path would cross
 */
function countEdgeCrossings(
  candidatePath: { x: number; y: number }[],
  routedEdges: { points: { x: number; y: number }[] }[]
): number {
  let crossingCount = 0

  for (const routedEdge of routedEdges) {
    if (!routedEdge.points || routedEdge.points.length < 2) continue

    // Check all segment pairs between candidate and routed edge
    for (let i = 0; i < candidatePath.length - 1; i++) {
      for (let j = 0; j < routedEdge.points.length - 1; j++) {
        const intersection = segmentsIntersect(
          candidatePath[i],
          candidatePath[i + 1],
          routedEdge.points[j],
          routedEdge.points[j + 1]
        )
        if (intersection) {
          crossingCount++
        }
      }
    }
  }

  return crossingCount
}

/**
 * Count turns in a path (direction changes)
 */
function countTurns(points: { x: number; y: number }[]): number {
  if (points.length < 3) return 0
  let turns = 0
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    const next = points[i + 1]
    const dx1 = curr.x - prev.x
    const dy1 = curr.y - prev.y
    const dx2 = next.x - curr.x
    const dy2 = next.y - curr.y
    const isHorizontal1 = Math.abs(dx1) > Math.abs(dy1)
    const isHorizontal2 = Math.abs(dx2) > Math.abs(dy2)
    if (isHorizontal1 !== isHorizontal2) turns++
  }
  return turns
}

/**
 * Calculate Manhattan distance for a path
 */
function pathDistance(points: { x: number; y: number }[]): number {
  let dist = 0
  for (let i = 1; i < points.length; i++) {
    dist += Math.abs(points[i].x - points[i-1].x) + Math.abs(points[i].y - points[i-1].y)
  }
  return dist
}

interface RouteCandidate {
  points: { x: number; y: number }[]
  fromPt: ConnectionPoint
  toPt: ConnectionPoint
  collisions: number
  edgeCrossings: number
  distance: number
  turns: number
}

/**
 * Route a single edge and return the result with full metrics
 */
function routeSingleEdge(
  fromNode: Node,
  toNode: Node,
  graph: Graph,
  geofenceData: GeofenceData,
  fromSide: Side,
  toSide: Side,
  routedEdges: { points: { x: number; y: number }[] }[]
): RouteCandidate {
  const fromPos = getPortPosition(fromNode, fromSide, undefined, graph, geofenceData.labelGeofences)
  const toPos = getPortPosition(toNode, toSide, undefined, graph, geofenceData.labelGeofences)

  const fromPt: ConnectionPoint = {
    x: fromPos.x,
    y: fromPos.y,
    side: fromSide,
    waypoint: { x: fromPos.x, y: fromPos.y },
    port: fromPos.port
  }
  const toPt: ConnectionPoint = {
    x: toPos.x,
    y: toPos.y,
    side: toSide,
    waypoint: { x: toPos.x, y: toPos.y },
    port: toPos.port
  }

  const middlePath = buildOrthogonalPath(fromPt.waypoint, toPt.waypoint, fromSide, toSide)
  const points = [
    { x: fromPt.x, y: fromPt.y },
    ...middlePath,
    { x: toPt.x, y: toPt.y }
  ]

  // Count collisions for this path
  const excludeSubgraphIds: string[] = []
  if (fromNode.parent) excludeSubgraphIds.push(fromNode.parent)
  if (toNode.parent && !excludeSubgraphIds.includes(toNode.parent)) {
    excludeSubgraphIds.push(toNode.parent)
  }

  const collisions = countPathCollisions(points, geofenceData, fromNode.id, toNode.id, excludeSubgraphIds)
  const edgeCrossings = countEdgeCrossings(points, routedEdges)
  const distance = pathDistance(points)
  const turns = countTurns(points)

  return { points, fromPt, toPt, collisions, edgeCrossings, distance, turns }
}

/**
 * Route edges orthogonally around obstacles
 *
 * Routing priority (in order):
 * 1. Zero collisions (must not collide with geofences)
 * 2. Zero edge crossings (prefer paths that don't cross other edges)
 * 3. Shortest distance (closest port combination)
 * 4. Fewest turns (minimize path complexity)
 */
export function routeEdgesOrthogonal(
  graph: Graph,
  _opts: { viewMode: 'flat' | 'iso' }
): void {
  // Generate geofences for port blocking (not for A* routing)
  const geofenceData = generateGeofences(graph)
  const allSides: Side[] = ['top', 'bottom', 'left', 'right']

  // Track already-routed edges for crossing detection
  const routedEdges: { points: { x: number; y: number }[] }[] = []

  // Route each edge
  for (const edge of graph.edges) {
    const fromNode = graph.nodes.get(edge.from)
    const toNode = graph.nodes.get(edge.to)
    if (!fromNode || !toNode) continue
    if (fromNode.x === undefined || fromNode.y === undefined) continue
    if (toNode.x === undefined || toNode.y === undefined) continue

    // Generate ALL 16 port combination candidates
    const candidates: RouteCandidate[] = []
    for (const fromSide of allSides) {
      for (const toSide of allSides) {
        const candidate = routeSingleEdge(
          fromNode, toNode, graph, geofenceData,
          fromSide, toSide, routedEdges
        )
        candidates.push(candidate)
      }
    }

    // Sort candidates by priority:
    // 1. Collisions (0 first - collision-free paths win)
    // 2. Edge crossings (0 first - paths without crossings win)
    // 3. Distance (shorter is better)
    // 4. Turns (fewer is better)
    candidates.sort((a, b) => {
      // First: prioritize collision-free
      if (a.collisions !== b.collisions) {
        return a.collisions - b.collisions
      }
      // Second: fewer edge crossings
      if (a.edgeCrossings !== b.edgeCrossings) {
        return a.edgeCrossings - b.edgeCrossings
      }
      // Third: shorter distance
      if (a.distance !== b.distance) {
        return a.distance - b.distance
      }
      // Fourth: fewer turns
      return a.turns - b.turns
    })

    // Pick the best candidate
    const best = candidates[0]

    // Apply the best result to the edge
    edge.fromPort = sideToPortSide(best.fromPt.side)
    edge.toPort = sideToPortSide(best.toPt.side)
    edge.sourcePort = best.fromPt.port
    edge.targetPort = best.toPt.port

    // Simplify path by removing redundant collinear points
    edge.points = simplifyPath(best.points)

    // Add to routed edges for future crossing detection
    routedEdges.push({ points: edge.points })
  }

  // Find and store edge crossings (for bridge rendering)
  const crossings = findEdgeCrossings(graph.edges)
  for (const [edge, points] of crossings) {
    edge.crossings = points
  }
}

/**
 * Simplify path by removing redundant collinear points
 *
 * Eliminates unnecessary points from orthogonal paths - only keeps
 * points where the path actually changes direction.
 *
 * From: https://gist.github.com/jose-mdz/4a8894c152383b9d7a870c24a04447e4
 */
function simplifyPath(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length <= 2) {
    return points
  }

  const result: { x: number; y: number }[] = [points[0]]

  for (let i = 1; i < points.length; i++) {
    const cur = points[i]

    // Always include the last point
    if (i === points.length - 1) {
      result.push(cur)
      break
    }

    const prev = points[i - 1]
    const next = points[i + 1]

    // Check if this point represents a bend (direction change)
    // For orthogonal paths: check if prev→cur and cur→next are in different directions
    const dx1 = cur.x - prev.x
    const dy1 = cur.y - prev.y
    const dx2 = next.x - cur.x
    const dy2 = next.y - cur.y

    // Determine if segments are horizontal or vertical
    const isHorizontal1 = Math.abs(dx1) > Math.abs(dy1)
    const isHorizontal2 = Math.abs(dx2) > Math.abs(dy2)

    // If direction changes (horizontal to vertical or vice versa), keep the point
    // Also handle zero-length segments by checking actual movement
    const hasBend = isHorizontal1 !== isHorizontal2 ||
                    (Math.abs(dx1) < 0.1 && Math.abs(dy1) < 0.1) ||
                    (Math.abs(dx2) < 0.1 && Math.abs(dy2) < 0.1)

    if (hasBend) {
      result.push(cur)
    }
  }

  return result
}

/**
 * Build an orthogonal path with MINIMAL turns while respecting port directions
 *
 * Turn minimization strategy:
 * - 0 turns: if already aligned on X or Y axis (direct line)
 * - 1 turn: when L-path doesn't violate port directions
 * - 2 turns: when port directions conflict with target position
 *
 * Port direction rules:
 * - Right port: first segment must go right (dx > 0)
 * - Left port: first segment must go left (dx < 0)
 * - Bottom port: first segment must go down (dy > 0)
 * - Top port: first segment must go up (dy < 0)
 */
function buildOrthogonalPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  fromSide: Side,
  toSide: Side
): { x: number; y: number }[] {
  const dx = to.x - from.x
  const dy = to.y - from.y

  // 0 turns: already aligned on one axis, direct path
  if (Math.abs(dx) < 2) {
    return [from, to]
  }
  if (Math.abs(dy) < 2) {
    return [from, to]
  }

  // Determine required initial and final directions based on ports
  // Exit direction: which way must we go first?
  const mustGoRight = fromSide === 'right'
  const mustGoLeft = fromSide === 'left'
  const mustGoDown = fromSide === 'bottom'
  const mustGoUp = fromSide === 'top'

  // Entry direction: which way must we approach from?
  // (opposite of port side - entering left port means approaching from left, going right)
  const mustApproachFromLeft = toSide === 'left'   // final dx > 0
  const mustApproachFromRight = toSide === 'right' // final dx < 0
  const mustApproachFromTop = toSide === 'top'     // final dy > 0
  const mustApproachFromBottom = toSide === 'bottom' // final dy < 0

  // Check if simple L-path is valid (1 turn)
  // L-path horizontal-first: from → (to.x, from.y) → to
  // L-path vertical-first: from → (from.x, to.y) → to

  // Try horizontal-first L-path
  const hFirstValid =
    // First segment is horizontal (from.y constant, x changes)
    ((!mustGoRight || dx > 0) && (!mustGoLeft || dx < 0) && !mustGoDown && !mustGoUp) &&
    // Second segment is vertical (to.x constant, y changes)
    ((!mustApproachFromTop || dy > 0) && (!mustApproachFromBottom || dy < 0))

  // Try vertical-first L-path
  const vFirstValid =
    // First segment is vertical (from.x constant, y changes)
    ((!mustGoDown || dy > 0) && (!mustGoUp || dy < 0) && !mustGoRight && !mustGoLeft) &&
    // Second segment is horizontal (to.y constant, x changes)
    ((!mustApproachFromLeft || dx > 0) && (!mustApproachFromRight || dx < 0))

  if (hFirstValid) {
    // 1 turn: horizontal then vertical
    return [
      from,
      { x: to.x, y: from.y },
      to
    ]
  }

  if (vFirstValid) {
    // 1 turn: vertical then horizontal
    return [
      from,
      { x: from.x, y: to.y },
      to
    ]
  }

  // 2 turns required: port directions conflict with simple L-path
  // Use 40% bias - place the zig-zag turn 40% of the way from source to target
  const bias = 0.4

  // Determine which direction we MUST go first based on exit port
  if (mustGoRight || mustGoLeft) {
    // Must start horizontal, then need 2 turns
    const midX = from.x + dx * bias
    return [
      from,
      { x: midX, y: from.y },
      { x: midX, y: to.y },
      to
    ]
  } else {
    // Must start vertical (mustGoDown || mustGoUp), then need 2 turns
    const midY = from.y + dy * bias
    return [
      from,
      { x: from.x, y: midY },
      { x: to.x, y: midY },
      to
    ]
  }
}
