/**
 * Orthogonal edge router using A* pathfinding
 *
 * Routes edges around nodes/subgraphs as obstacles.
 * Connects to appropriate sides of nodes based on relative positions.
 * Detects edge crossings for bridge rendering.
 *
 * Hierarchical routing: When edges cross subgraph boundaries,
 * they exit/enter through the closest ports on the parent subgraphs.
 */

import PF from 'pathfinding'
import type { Graph, Node, Edge, Port, PortSide } from '../model/types'

// Grid resolution - smaller = more precise but slower
const GRID_CELL_SIZE = 8

// Padding around obstacles
const OBSTACLE_PADDING = 12

type Side = 'top' | 'bottom' | 'left' | 'right'

interface ConnectionPoint {
  x: number
  y: number
  side: Side
  waypoint: { x: number; y: number }  // Point edge must pass through (standoff)
  port?: Port  // The actual port object with close/far coordinates
}

interface BoundingBox {
  left: number
  right: number
  top: number
  bottom: number
}

/**
 * Find the closest port on a subgraph boundary to a target point
 * Returns the port and its side
 */
function findClosestSubgraphPort(
  subgraph: Node,
  targetX: number,
  targetY: number,
  graph: Graph
): { port: Port; side: Side } | null {
  if (!subgraph.ports || subgraph.ports.length === 0) return null

  let closestPort: Port | null = null
  let closestDist = Infinity
  let closestSide: Side = 'right'

  for (const port of subgraph.ports) {
    if (port.cornerX === undefined || port.cornerY === undefined) continue

    const dist = Math.hypot(port.cornerX - targetX, port.cornerY - targetY)
    if (dist < closestDist) {
      closestDist = dist
      closestPort = port
      closestSide = portSideToSide(port.side)
    }
  }

  return closestPort ? { port: closestPort, side: closestSide } : null
}

/**
 * Convert PortSide to Side
 */
function portSideToSide(portSide: PortSide): Side {
  switch (portSide) {
    case 'T': return 'top'
    case 'B': return 'bottom'
    case 'L': return 'left'
    case 'R': return 'right'
  }
}

/**
 * Check if two nodes share the same immediate parent
 */
function haveSameParent(nodeA: Node, nodeB: Node): boolean {
  return nodeA.parent === nodeB.parent
}

/**
 * Get the chain of ancestors from a node up to root
 */
function getAncestorChain(node: Node, graph: Graph): string[] {
  const chain: string[] = []
  let current = node.parent
  while (current) {
    chain.push(current)
    const parent = graph.nodes.get(current)
    current = parent?.parent
  }
  return chain
}

/**
 * Find the first common ancestor of two nodes
 * Returns null if they share root (no common ancestor subgraph)
 */
function findCommonAncestor(nodeA: Node, nodeB: Node, graph: Graph): string | null {
  const ancestorsA = new Set(getAncestorChain(nodeA, graph))

  let current = nodeB.parent
  while (current) {
    if (ancestorsA.has(current)) {
      return current
    }
    const parent = graph.nodes.get(current)
    current = parent?.parent
  }

  return null
}

/**
 * Get boundary crossing info for an edge
 * Returns the exit/entry subgraphs that need to be crossed
 */
function getBoundaryCrossings(
  fromNode: Node,
  toNode: Node,
  graph: Graph
): { exitSubgraph: Node | null; entrySubgraph: Node | null } {
  // If same parent, no boundary crossing needed
  if (haveSameParent(fromNode, toNode)) {
    return { exitSubgraph: null, entrySubgraph: null }
  }

  const commonAncestor = findCommonAncestor(fromNode, toNode, graph)

  // Find the immediate child of common ancestor that contains fromNode
  let exitSubgraph: Node | null = null
  if (fromNode.parent && fromNode.parent !== commonAncestor) {
    // Walk up from fromNode until we find a node whose parent is the common ancestor
    let current: string | undefined = fromNode.parent
    while (current) {
      const node = graph.nodes.get(current)
      if (!node) break
      if (node.parent === commonAncestor || (!commonAncestor && !node.parent)) {
        exitSubgraph = node
        break
      }
      current = node.parent
    }
  } else if (fromNode.parent) {
    exitSubgraph = graph.nodes.get(fromNode.parent) || null
  }

  // Find the immediate child of common ancestor that contains toNode
  let entrySubgraph: Node | null = null
  if (toNode.parent && toNode.parent !== commonAncestor) {
    let current: string | undefined = toNode.parent
    while (current) {
      const node = graph.nodes.get(current)
      if (!node) break
      if (node.parent === commonAncestor || (!commonAncestor && !node.parent)) {
        entrySubgraph = node
        break
      }
      current = node.parent
    }
  } else if (toNode.parent) {
    entrySubgraph = graph.nodes.get(toNode.parent) || null
  }

  return { exitSubgraph, entrySubgraph }
}

/**
 * Get bounding box for a node with padding
 */
function getNodeBounds(node: Node, padding: number = OBSTACLE_PADDING): BoundingBox | null {
  if (node.x === undefined || node.y === undefined) return null

  const halfW = (node.width || 100) / 2
  const halfH = (node.height || 40) / 2

  return {
    left: node.x - halfW - padding,
    right: node.x + halfW + padding,
    top: node.y - halfH - padding,
    bottom: node.y + halfH + padding,
  }
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
 * Determine best connection sides based on relative positions
 * Now uses ports from nodes for connection points
 */
function getConnectionPoints(
  fromNode: Node,
  toNode: Node,
  graph: Graph
): { from: ConnectionPoint; to: ConnectionPoint } {
  const fx = fromNode.x!
  const fy = fromNode.y!

  const tx = toNode.x!
  const ty = toNode.y!

  // Calculate relative position
  const dx = tx - fx
  const dy = ty - fy

  // Determine primary direction based on relative position
  // Use the dominant axis - whichever distance is greater
  const absDx = Math.abs(dx)
  const absDy = Math.abs(dy)

  let fromSide: Side
  let toSide: Side

  if (absDy > absDx) {
    // Primarily vertical - target is more above/below than left/right
    if (dy > 0) {
      fromSide = 'bottom'
      toSide = 'top'
    } else {
      fromSide = 'top'
      toSide = 'bottom'
    }
  } else {
    // Primarily horizontal - target is more left/right than above/below
    if (dx > 0) {
      fromSide = 'right'
      toSide = 'left'
    } else {
      fromSide = 'left'
      toSide = 'right'
    }
  }

  // Get best available ports from nodes - prefers unused ports
  const fromPort = getBestPortOnSide(fromNode, fromSide, tx, ty, graph)
  const toPort = getBestPortOnSide(toNode, toSide, fx, fy, graph)

  // Use CORNER (red) ports for routing - these are the outermost waypoints
  // Rendering will add segments: red → blue → green for visual connection to node surface
  let fromX: number, fromY: number
  let toX: number, toY: number

  if (fromPort && fromPort.cornerX !== undefined && fromPort.cornerY !== undefined) {
    fromX = fromPort.cornerX
    fromY = fromPort.cornerY
  } else {
    // Fallback: calculate edge point
    const hw = (fromNode.width || 100) / 2
    const hh = (fromNode.height || 40) / 2
    switch (fromSide) {
      case 'top': fromX = fx; fromY = fy - hh; break
      case 'bottom': fromX = fx; fromY = fy + hh; break
      case 'left': fromX = fx - hw; fromY = fy; break
      case 'right': fromX = fx + hw; fromY = fy; break
    }
  }

  if (toPort && toPort.cornerX !== undefined && toPort.cornerY !== undefined) {
    toX = toPort.cornerX
    toY = toPort.cornerY
  } else {
    // Fallback: calculate edge point
    const hw = (toNode.width || 100) / 2
    const hh = (toNode.height || 40) / 2
    switch (toSide) {
      case 'top': toX = tx; toY = ty - hh; break
      case 'bottom': toX = tx; toY = ty + hh; break
      case 'left': toX = tx - hw; toY = ty; break
      case 'right': toX = tx + hw; toY = ty; break
    }
  }

  // Routing uses corner positions as both endpoints and waypoints
  // Include port objects so renderer can access close/far coordinates
  return {
    from: { x: fromX, y: fromY, side: fromSide, waypoint: { x: fromX, y: fromY }, port: fromPort ?? undefined },
    to: { x: toX, y: toY, side: toSide, waypoint: { x: toX, y: toY }, port: toPort ?? undefined },
  }
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
  // Calculate graph bounds
  let minX = Infinity, minY = Infinity
  let maxX = -Infinity, maxY = -Infinity

  for (const node of graph.nodes.values()) {
    if (node.x === undefined || node.y === undefined) continue
    const bounds = getNodeBounds(node, OBSTACLE_PADDING + 30)
    if (!bounds) continue

    minX = Math.min(minX, bounds.left)
    minY = Math.min(minY, bounds.top)
    maxX = Math.max(maxX, bounds.right)
    maxY = Math.max(maxY, bounds.bottom)
  }

  // Add margin around graph
  const margin = 80
  minX -= margin
  minY -= margin
  maxX += margin
  maxY += margin

  // Calculate grid dimensions
  const gridWidth = Math.ceil((maxX - minX) / GRID_CELL_SIZE)
  const gridHeight = Math.ceil((maxY - minY) / GRID_CELL_SIZE)

  // Create pathfinding grid
  const grid = new PF.Grid(gridWidth, gridHeight)

  // Helper to convert world coords to grid coords
  const toGrid = (x: number, y: number) => ({
    gx: Math.floor((x - minX) / GRID_CELL_SIZE),
    gy: Math.floor((y - minY) / GRID_CELL_SIZE),
  })

  // Helper to convert grid coords to world coords
  const toWorld = (gx: number, gy: number) => ({
    x: minX + gx * GRID_CELL_SIZE + GRID_CELL_SIZE / 2,
    y: minY + gy * GRID_CELL_SIZE + GRID_CELL_SIZE / 2,
  })

  // Mark obstacles on grid
  const markObstacle = (node: Node, grid: PF.Grid) => {
    const bounds = getNodeBounds(node, OBSTACLE_PADDING)
    if (!bounds) return

    const topLeft = toGrid(bounds.left, bounds.top)
    const bottomRight = toGrid(bounds.right, bounds.bottom)

    for (let gx = topLeft.gx; gx <= bottomRight.gx; gx++) {
      for (let gy = topLeft.gy; gy <= bottomRight.gy; gy++) {
        if (gx >= 0 && gx < gridWidth && gy >= 0 && gy < gridHeight) {
          grid.setWalkableAt(gx, gy, false)
        }
      }
    }
  }

  // Create finder with orthogonal movement only
  const finder = new PF.AStarFinder({
    diagonalMovement: PF.DiagonalMovement.Never,
  })

  // Route each edge
  for (const edge of graph.edges) {
    const fromNode = graph.nodes.get(edge.from)
    const toNode = graph.nodes.get(edge.to)
    if (!fromNode || !toNode) continue
    if (fromNode.x === undefined || fromNode.y === undefined) continue
    if (toNode.x === undefined || toNode.y === undefined) continue

    // Get connection points from ports (ports already have offset built in)
    const { from: fromPt, to: toPt } = getConnectionPoints(fromNode, toNode, graph)

    // Save port sides to edge so renderer can find the ports
    edge.fromPort = sideToPortSide(fromPt.side)
    edge.toPort = sideToPortSide(toPt.side)

    // Save full port objects for unified edge rendering (close/far coordinates)
    edge.sourcePort = fromPt.port
    edge.targetPort = toPt.port

    // Create fresh grid for this edge
    const edgeGrid = grid.clone()

    // Mark all nodes as obstacles EXCEPT source and target
    for (const node of graph.nodes.values()) {
      if (node.id !== edge.from && node.id !== edge.to) {
        markObstacle(node, edgeGrid)
      }
    }

    // A* routes between waypoints (not edge points)
    // This ensures perpendicular entry/exit from nodes
    const start = toGrid(fromPt.waypoint.x, fromPt.waypoint.y)
    const end = toGrid(toPt.waypoint.x, toPt.waypoint.y)

    // Clamp to grid bounds
    start.gx = Math.max(0, Math.min(gridWidth - 1, start.gx))
    start.gy = Math.max(0, Math.min(gridHeight - 1, start.gy))
    end.gx = Math.max(0, Math.min(gridWidth - 1, end.gx))
    end.gy = Math.max(0, Math.min(gridHeight - 1, end.gy))

    // Ensure start and end are walkable
    edgeGrid.setWalkableAt(start.gx, start.gy, true)
    edgeGrid.setWalkableAt(end.gx, end.gy, true)

    // Also clear a small area around start/end for routing flexibility
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const sx = start.gx + dx
        const sy = start.gy + dy
        const ex = end.gx + dx
        const ey = end.gy + dy
        if (sx >= 0 && sx < gridWidth && sy >= 0 && sy < gridHeight) {
          edgeGrid.setWalkableAt(sx, sy, true)
        }
        if (ex >= 0 && ex < gridWidth && ey >= 0 && ey < gridHeight) {
          edgeGrid.setWalkableAt(ex, ey, true)
        }
      }
    }

    // Check for boundary crossings - edges that cross between different subgraphs
    const { exitSubgraph, entrySubgraph } = getBoundaryCrossings(fromNode, toNode, graph)

    // Collect all waypoints for the path
    const waypoints: { x: number; y: number }[] = []

    // Start with source node waypoint
    waypoints.push(fromPt.waypoint)

    // Add exit subgraph boundary port if crossing out of a subgraph
    if (exitSubgraph && exitSubgraph.x !== undefined && exitSubgraph.y !== undefined) {
      const exitPortInfo = findClosestSubgraphPort(exitSubgraph, toNode.x!, toNode.y!, graph)
      if (exitPortInfo && exitPortInfo.port.cornerX !== undefined && exitPortInfo.port.cornerY !== undefined) {
        waypoints.push({ x: exitPortInfo.port.cornerX, y: exitPortInfo.port.cornerY })
      }
    }

    // Add entry subgraph boundary port if crossing into a subgraph
    if (entrySubgraph && entrySubgraph.x !== undefined && entrySubgraph.y !== undefined) {
      const entryPortInfo = findClosestSubgraphPort(entrySubgraph, fromNode.x!, fromNode.y!, graph)
      if (entryPortInfo && entryPortInfo.port.cornerX !== undefined && entryPortInfo.port.cornerY !== undefined) {
        waypoints.push({ x: entryPortInfo.port.cornerX, y: entryPortInfo.port.cornerY })
      }
    }

    // End with target node waypoint
    waypoints.push(toPt.waypoint)

    // Build orthogonal path through all waypoints
    const fullPath: { x: number; y: number }[] = []
    for (let i = 0; i < waypoints.length - 1; i++) {
      const from = waypoints[i]
      const to = waypoints[i + 1]

      // Choose direction based on which way we're primarily going
      const preferHorizontalFirst = Math.abs(to.x - from.x) > Math.abs(to.y - from.y)
      const segmentPath = buildOrthogonalPath(from, to, preferHorizontalFirst)

      // Add segment (skip first point if not first segment to avoid duplicates)
      if (i === 0) {
        fullPath.push(...segmentPath)
      } else {
        fullPath.push(...segmentPath.slice(1))
      }
    }

    // Build full path: edge -> waypoint path -> edge
    edge.points = [
      { x: fromPt.x, y: fromPt.y },  // Start at source edge
      ...fullPath,                    // Through waypoints with orthogonal routing
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
 * Simplify path by removing intermediate points on straight lines
 */
function simplifyPath(path: number[][]): number[][] {
  if (path.length <= 2) return path

  const result: number[][] = [path[0]]

  for (let i = 1; i < path.length - 1; i++) {
    const prev = path[i - 1]
    const curr = path[i]
    const next = path[i + 1]

    // Check if direction changes
    const dx1 = curr[0] - prev[0]
    const dy1 = curr[1] - prev[1]
    const dx2 = next[0] - curr[0]
    const dy2 = next[1] - curr[1]

    // Only keep point if direction changes
    if (dx1 !== dx2 || dy1 !== dy2) {
      result.push(curr)
    }
  }

  result.push(path[path.length - 1])
  return result
}

/**
 * Ensure all segments in a path are orthogonal (no diagonals)
 * Inserts corner points where needed
 */
function makeOrthogonal(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length <= 1) return points

  const result: { x: number; y: number }[] = [points[0]]

  for (let i = 1; i < points.length; i++) {
    const prev = result[result.length - 1]
    const curr = points[i]

    const dx = Math.abs(curr.x - prev.x)
    const dy = Math.abs(curr.y - prev.y)

    // If not aligned on either axis, insert a corner point
    if (dx > 2 && dy > 2) {
      // Choose to go horizontal first, then vertical
      result.push({ x: curr.x, y: prev.y })
    }

    result.push(curr)
  }

  return result
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

/**
 * Ensure the path ends with a perpendicular approach to the target node
 * This guarantees arrows point in the correct direction (toward node center)
 *
 * Target side indicates which side of the TARGET NODE the edge connects to:
 * - 'top': edge connects to top of target, so arrow points DOWN into node
 * - 'bottom': edge connects to bottom of target, so arrow points UP into node
 * - 'left': edge connects to left of target, so arrow points RIGHT into node
 * - 'right': edge connects to right of target, so arrow points LEFT into node
 */
function ensurePerpendicularApproach(
  points: { x: number; y: number }[],
  targetSide: Side
): { x: number; y: number }[] {
  if (points.length < 2) return points

  const lastPoint = points[points.length - 1]
  const secondLast = points[points.length - 2]

  // Minimum segment length for proper arrow display
  const minSegment = 25

  // Check if final segment is already correct
  const dx = lastPoint.x - secondLast.x
  const dy = lastPoint.y - secondLast.y
  const isVertical = Math.abs(dx) < 2
  const isHorizontal = Math.abs(dy) < 2

  switch (targetSide) {
    case 'top':
      // Connecting to TOP of node - path approaches from ABOVE
      // Arrow points DOWN (path goes from low Y to high Y in SVG coords)
      if (isVertical && dy > 0) {
        return points // Already correct - going downward
      }
      // Insert entry point ABOVE the endpoint
      return forcePerpendicularEntry(points, lastPoint, 'from-above', minSegment)

    case 'bottom':
      // Connecting to BOTTOM of node - path approaches from BELOW
      // Arrow points UP (path goes from high Y to low Y in SVG coords)
      if (isVertical && dy < 0) {
        return points // Already correct - going upward
      }
      // Insert entry point BELOW the endpoint
      return forcePerpendicularEntry(points, lastPoint, 'from-below', minSegment)

    case 'left':
      // Connecting to LEFT of node - path approaches from LEFT side
      // Arrow points RIGHT (path goes from low X to high X)
      if (isHorizontal && dx > 0) {
        return points // Already correct - going rightward
      }
      // Insert entry point to the LEFT of the endpoint
      return forcePerpendicularEntry(points, lastPoint, 'from-left', minSegment)

    case 'right':
      // Connecting to RIGHT of node - path approaches from RIGHT side
      // Arrow points LEFT (path goes from high X to low X)
      if (isHorizontal && dx < 0) {
        return points // Already correct - going leftward
      }
      // Insert entry point to the RIGHT of the endpoint
      return forcePerpendicularEntry(points, lastPoint, 'from-right', minSegment)
  }

  return points
}

/**
 * Force a perpendicular entry by inserting corner points
 */
function forcePerpendicularEntry(
  points: { x: number; y: number }[],
  endPoint: { x: number; y: number },
  direction: 'from-above' | 'from-below' | 'from-left' | 'from-right',
  length: number
): { x: number; y: number }[] {
  if (points.length < 2) return points

  const result = [...points.slice(0, -1)]
  const prevPoint = result[result.length - 1]

  // Calculate entry point based on which direction we need to approach from
  let entryPoint: { x: number; y: number }

  switch (direction) {
    case 'from-above':
      // Entry point is above endpoint (lower Y)
      entryPoint = { x: endPoint.x, y: endPoint.y - length }
      break
    case 'from-below':
      // Entry point is below endpoint (higher Y)
      entryPoint = { x: endPoint.x, y: endPoint.y + length }
      break
    case 'from-left':
      // Entry point is to the left of endpoint (lower X)
      entryPoint = { x: endPoint.x - length, y: endPoint.y }
      break
    case 'from-right':
      // Entry point is to the right of endpoint (higher X)
      entryPoint = { x: endPoint.x + length, y: endPoint.y }
      break
  }

  // We may need to add a corner to get from prevPoint to entryPoint orthogonally
  // Check if prevPoint and entryPoint are already aligned on one axis
  const isAlignedX = Math.abs(prevPoint.x - entryPoint.x) < 2
  const isAlignedY = Math.abs(prevPoint.y - entryPoint.y) < 2

  if (!isAlignedX && !isAlignedY) {
    // Need to add a corner point
    // Choose corner based on which would make shorter detour
    if (direction === 'from-above' || direction === 'from-below') {
      // Vertical final segment - make horizontal first, then vertical
      result.push({ x: entryPoint.x, y: prevPoint.y })
    } else {
      // Horizontal final segment - make vertical first, then horizontal
      result.push({ x: prevPoint.x, y: entryPoint.y })
    }
  }

  result.push(entryPoint)
  result.push(endPoint)
  return result
}
