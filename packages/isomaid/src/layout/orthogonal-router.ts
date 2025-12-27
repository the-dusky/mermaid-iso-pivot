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
 * Build an L-path between two points for collision testing
 * Returns the path points (2-4 points depending on alignment)
 */
function buildTestLPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  preferHorizontalFirst: boolean
): { x: number; y: number }[] {
  // If already aligned on one axis, direct path
  if (Math.abs(from.x - to.x) < 2) {
    return [from, to]
  }
  if (Math.abs(from.y - to.y) < 2) {
    return [from, to]
  }

  // L-path with single turn at midpoint (biased toward source)
  const bias = 0.4
  if (preferHorizontalFirst) {
    const midX = from.x + (to.x - from.x) * bias
    return [
      from,
      { x: midX, y: from.y },
      { x: midX, y: to.y },
      to
    ]
  } else {
    const midY = from.y + (to.y - from.y) * bias
    return [
      from,
      { x: from.x, y: midY },
      { x: to.x, y: midY },
      to
    ]
  }
}

/**
 * Count how many geofences an L-path collides with
 * Excludes source and target nodes from collision checks
 * Also excludes parent subgraphs (nodes inside a subgraph must cross its boundary)
 */
function countPathCollisions(
  path: { x: number; y: number }[],
  geofenceData: GeofenceData,
  excludeNodeIds: string[],
  excludeSubgraphIds: string[] = []
): number {
  let collisionCount = 0
  const countedNodes = new Set<string>()
  const countedLabels = new Set<string>()
  const countedSubgraphs = new Set<string>()

  for (let i = 0; i < path.length - 1; i++) {
    const p1 = path[i]
    const p2 = path[i + 1]

    // Check node geofences
    for (const [nodeId, geofence] of geofenceData.nodeGeofences) {
      if (excludeNodeIds.includes(nodeId)) continue
      if (countedNodes.has(nodeId)) continue

      if (segmentIntersectsGeofence(p1, p2, geofence)) {
        countedNodes.add(nodeId)
        collisionCount++
      }
    }

    // Check subgraph geofences
    for (const [subgraphId, subgraphGeofence] of geofenceData.subgraphGeofences) {
      // Skip source/target nodes
      if (excludeNodeIds.includes(subgraphId)) continue
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

      // Skip labels for source/target nodes
      if (excludeNodeIds.includes(nodeId)) continue
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

  // Nodes to exclude from collision detection (source and target)
  const excludeNodeIds = [fromNode.id, toNode.id]

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
        // Determine path direction preference based on sides
        const preferHorizontalFirst = (fromSide === 'left' || fromSide === 'right') ||
          (toSide === 'top' || toSide === 'bottom')

        // Build test path and count collisions
        const testPath = buildTestLPath(
          { x: fromPos.x, y: fromPos.y },
          { x: toPos.x, y: toPos.y },
          preferHorizontalFirst
        )
        const collisions = countPathCollisions(testPath, geofenceData, excludeNodeIds, excludeSubgraphIds)
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
 * Route edges orthogonally around obstacles
 */
export function routeEdgesOrthogonal(
  graph: Graph,
  _opts: { viewMode: 'flat' | 'iso' }
): void {
  // Generate geofences for port blocking (not for A* routing)
  const geofenceData = generateGeofences(graph)

  // Route each edge
  for (const edge of graph.edges) {
    const fromNode = graph.nodes.get(edge.from)
    const toNode = graph.nodes.get(edge.to)
    if (!fromNode || !toNode) continue
    if (fromNode.x === undefined || fromNode.y === undefined) continue
    if (toNode.x === undefined || toNode.y === undefined) continue

    // Get connection points from ports (ports already have offset built in)
    // Pass labelGeofences and full geofenceData for collision-aware routing
    const { from: fromPt, to: toPt } = getConnectionPoints(
      fromNode, toNode, graph, geofenceData.labelGeofences, geofenceData
    )

    // Save port sides to edge so renderer can find the ports
    edge.fromPort = sideToPortSide(fromPt.side)
    edge.toPort = sideToPortSide(toPt.side)

    // Save full port objects for unified edge rendering (close/far coordinates)
    edge.sourcePort = fromPt.port
    edge.targetPort = toPt.port

    // Use simple orthogonal routing (not A* - that creates zigzag paths)
    const preferHorizontalFirst = Math.abs(toPt.waypoint.x - fromPt.waypoint.x) >
                                   Math.abs(toPt.waypoint.y - fromPt.waypoint.y)
    const middlePath = buildOrthogonalPath(fromPt.waypoint, toPt.waypoint, preferHorizontalFirst)

    // Build full path: edge -> waypoint path -> edge
    edge.points = [
      { x: fromPt.x, y: fromPt.y },  // Start at source edge
      ...middlePath,                  // Through waypoints with orthogonal routing
      { x: toPt.x, y: toPt.y },       // End at target edge
    ]
  }

  // Find and store edge crossings
  const crossings = findEdgeCrossings(graph.edges)
  for (const [edge, points] of crossings) {
    edge.crossings = points
  }
}

/**
 * Build a simple orthogonal path between two waypoints
 * Places turns centrally between source and target, with bias toward source
 *
 * Central turn strategy:
 * - Calculate midpoint between from and to
 * - Bias slightly toward source (40% from source, 60% toward target)
 * - This keeps the routing balanced but visually favors source proximity
 */
function buildOrthogonalPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  preferHorizontalFirst: boolean = true
): { x: number; y: number }[] {
  // If already aligned on one axis, just return direct path
  if (Math.abs(from.x - to.x) < 2) {
    return [from, to]
  }
  if (Math.abs(from.y - to.y) < 2) {
    return [from, to]
  }

  // Bias factor: 0.5 = center, lower = closer to source
  const bias = 0.4

  // Need corner points - place turns centrally with source bias
  if (preferHorizontalFirst) {
    // Go horizontal first (X changes), then vertical (Y changes)
    // Turn line is at midpoint X between from.x and to.x, biased toward source
    const midX = from.x + (to.x - from.x) * bias
    return [
      from,
      { x: midX, y: from.y },  // First turn: go horizontal to midpoint
      { x: midX, y: to.y },    // Second turn: go vertical at midpoint
      to
    ]
  } else {
    // Go vertical first (Y changes), then horizontal (X changes)
    // Turn line is at midpoint Y between from.y and to.y, biased toward source
    const midY = from.y + (to.y - from.y) * bias
    return [
      from,
      { x: from.x, y: midY },  // First turn: go vertical to midpoint
      { x: to.x, y: midY },    // Second turn: go horizontal at midpoint
      to
    ]
  }
}
