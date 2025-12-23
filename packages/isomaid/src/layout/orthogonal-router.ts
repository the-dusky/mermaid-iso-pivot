/**
 * Orthogonal edge router using A* pathfinding
 *
 * Routes edges around nodes/subgraphs as obstacles.
 * Connects to appropriate sides of nodes based on relative positions.
 * Detects edge crossings for bridge rendering.
 */

import PF from 'pathfinding'
import type { Graph, Node, Edge } from '../model/types'

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
}

interface BoundingBox {
  left: number
  right: number
  top: number
  bottom: number
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
 * Determine best connection sides based on relative positions
 */
function getConnectionPoints(
  fromNode: Node,
  toNode: Node,
  gap: number
): { from: ConnectionPoint; to: ConnectionPoint } {
  const fx = fromNode.x!
  const fy = fromNode.y!
  const fw = fromNode.width || 100
  const fh = fromNode.height || 40

  const tx = toNode.x!
  const ty = toNode.y!
  const tw = toNode.width || 100
  const th = toNode.height || 40

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

  // Calculate connection points - the point ON the node edge
  const getEdgePoint = (node: Node, side: Side): { x: number; y: number } => {
    const x = node.x!
    const y = node.y!
    const w = node.width || 100
    const h = node.height || 40

    switch (side) {
      case 'top':
        return { x, y: y - h / 2 }
      case 'bottom':
        return { x, y: y + h / 2 }
      case 'left':
        return { x: x - w / 2, y }
      case 'right':
        return { x: x + w / 2, y }
    }
  }

  // Calculate waypoint - the point the edge must pass through (standoff distance)
  const getWaypoint = (node: Node, side: Side, standoff: number): { x: number; y: number } => {
    const edgePt = getEdgePoint(node, side)
    switch (side) {
      case 'top':
        return { x: edgePt.x, y: edgePt.y - standoff }
      case 'bottom':
        return { x: edgePt.x, y: edgePt.y + standoff }
      case 'left':
        return { x: edgePt.x - standoff, y: edgePt.y }
      case 'right':
        return { x: edgePt.x + standoff, y: edgePt.y }
    }
  }

  const fromEdge = getEdgePoint(fromNode, fromSide)
  const toEdge = getEdgePoint(toNode, toSide)
  const fromWaypoint = getWaypoint(fromNode, fromSide, gap)
  const toWaypoint = getWaypoint(toNode, toSide, gap)

  return {
    from: { ...fromEdge, side: fromSide, waypoint: fromWaypoint },
    to: { ...toEdge, side: toSide, waypoint: toWaypoint },
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
  opts: { viewMode: 'flat' | 'iso' }
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

  // Calculate edge gaps based on view mode
  const gap = opts.viewMode === 'iso' ? 14 : 8

  // Route each edge
  for (const edge of graph.edges) {
    const fromNode = graph.nodes.get(edge.from)
    const toNode = graph.nodes.get(edge.to)
    if (!fromNode || !toNode) continue
    if (fromNode.x === undefined || fromNode.y === undefined) continue
    if (toNode.x === undefined || toNode.y === undefined) continue

    // Get connection points based on relative positions
    const { from: fromPt, to: toPt } = getConnectionPoints(fromNode, toNode, gap)

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

    // Build simple orthogonal path without A* for now
    // A* was causing diagonal issues due to grid quantization
    //
    // Path structure:
    // 1. Edge point (on node surface)
    // 2. Waypoint (standoff from node)
    // 3. Corner points (orthogonal routing between waypoints)
    // 4. Target waypoint
    // 5. Target edge point

    // Build orthogonal path between the two waypoints
    // Choose direction based on which way we're primarily going
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
 * Goes horizontal first, then vertical (or vice versa based on direction)
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

  // Need a corner point
  if (preferHorizontalFirst) {
    // Go horizontal first, then vertical
    return [from, { x: to.x, y: from.y }, to]
  } else {
    // Go vertical first, then horizontal
    return [from, { x: from.x, y: to.y }, to]
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
