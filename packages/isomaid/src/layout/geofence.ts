/**
 * Geofence system for edge routing
 *
 * Geofences are exclusion zones around nodes that edges must avoid,
 * except through designated port openings. This creates clean routing
 * where edges enter/exit through specific corridors.
 *
 * Structure:
 * - Each node has a rectangular geofence extending from node edge to corner port distance
 * - Ports create "openings" (corridors) through the geofence
 * - Text labels also get geofences
 * - Edge routing must navigate around geofences, only crossing at port openings
 */

import type { Graph, Node, Port } from '../model/types'

/** A rectangular exclusion zone */
export interface GeofenceRect {
  id: string
  type: 'node' | 'label'
  left: number
  right: number
  top: number
  bottom: number
}

/** An opening/corridor through a geofence at a port location */
export interface GeofenceOpening {
  nodeId: string
  port: Port
  side: 'T' | 'R' | 'B' | 'L'
  // Opening bounds (corridor through the geofence)
  x: number
  y: number
  width: number  // Corridor width
  height: number // Corridor height
}

/** Complete geofence for a node (rectangle with openings) */
export interface NodeGeofence {
  nodeId: string
  // Outer bounds (where geofence ends - at corner port distance)
  outer: GeofenceRect
  // Inner bounds (where geofence starts - at node edge)
  inner: {
    left: number
    right: number
    top: number
    bottom: number
  }
  // Port openings (corridors through the fence)
  openings: GeofenceOpening[]
}

/** Geofence for a text label */
export interface LabelGeofence {
  labelId: string
  bounds: GeofenceRect
  padding: number
}

/** Complete geofence data for a graph */
export interface GeofenceData {
  nodeGeofences: Map<string, NodeGeofence>
  labelGeofences: LabelGeofence[]
}

/** Width of port corridors through geofence (pixels) */
const PORT_CORRIDOR_WIDTH = 20

/** Padding around text labels */
const TEXT_PADDING = 8

/** Approximate character width for label sizing */
const CHAR_WIDTH = 8

/** Line height for labels */
const LINE_HEIGHT = 18

/**
 * Calculate text label bounds for a node
 * Returns pixel coordinates for the label bounding box
 */
function calculateLabelBounds(node: Node): { left: number; right: number; top: number; bottom: number } | null {
  if (!node.label || node.label.length === 0) return null
  if (node.x === undefined || node.y === undefined) return null

  const labelWidth = node.label.length * CHAR_WIDTH + TEXT_PADDING * 2
  const labelHeight = LINE_HEIGHT + TEXT_PADDING

  if (node.isSubgraph) {
    // Subgraph labels are at bottom of container
    const nodeHeight = node.height || 40
    const textOffsetY = nodeHeight / 2 - 16  // Matches svg.ts positioning
    const labelCenterY = node.y + textOffsetY

    return {
      left: node.x - labelWidth / 2,
      right: node.x + labelWidth / 2,
      top: labelCenterY - labelHeight / 2,
      bottom: labelCenterY + labelHeight / 2,
    }
  } else {
    // Regular node labels are centered
    return {
      left: node.x - labelWidth / 2,
      right: node.x + labelWidth / 2,
      top: node.y - labelHeight / 2,
      bottom: node.y + labelHeight / 2,
    }
  }
}

/**
 * Generate geofence for a single node
 */
export function generateNodeGeofence(node: Node): NodeGeofence | null {
  if (node.x === undefined || node.y === undefined || !node.ports || node.ports.length === 0) {
    return null
  }

  const x = node.x
  const y = node.y
  const halfW = (node.width || 100) / 2
  const halfH = (node.height || 40) / 2

  // Calculate outer bounds from corner ports (they define max extent)
  // Find the max extent on each side from the corner ports
  let outerLeft = x - halfW
  let outerRight = x + halfW
  let outerTop = y - halfH
  let outerBottom = y + halfH

  for (const port of node.ports) {
    if (port.cornerX !== undefined && port.cornerY !== undefined) {
      outerLeft = Math.min(outerLeft, port.cornerX)
      outerRight = Math.max(outerRight, port.cornerX)
      outerTop = Math.min(outerTop, port.cornerY)
      outerBottom = Math.max(outerBottom, port.cornerY)
    }
  }

  // Add small padding to outer bounds
  const outerPad = 5
  outerLeft -= outerPad
  outerRight += outerPad
  outerTop -= outerPad
  outerBottom += outerPad

  // Inner bounds are the node edges
  const inner = {
    left: x - halfW,
    right: x + halfW,
    top: y - halfH,
    bottom: y + halfH,
  }

  // Generate openings at each port
  const openings: GeofenceOpening[] = []
  for (const port of node.ports) {
    if (port.cornerX === undefined || port.cornerY === undefined) continue

    let opening: GeofenceOpening

    switch (port.side) {
      case 'T':
        opening = {
          nodeId: node.id,
          port,
          side: 'T',
          x: port.cornerX - PORT_CORRIDOR_WIDTH / 2,
          y: outerTop,
          width: PORT_CORRIDOR_WIDTH,
          height: inner.top - outerTop,
        }
        break
      case 'B':
        opening = {
          nodeId: node.id,
          port,
          side: 'B',
          x: port.cornerX - PORT_CORRIDOR_WIDTH / 2,
          y: inner.bottom,
          width: PORT_CORRIDOR_WIDTH,
          height: outerBottom - inner.bottom,
        }
        break
      case 'L':
        opening = {
          nodeId: node.id,
          port,
          side: 'L',
          x: outerLeft,
          y: port.cornerY - PORT_CORRIDOR_WIDTH / 2,
          width: inner.left - outerLeft,
          height: PORT_CORRIDOR_WIDTH,
        }
        break
      case 'R':
        opening = {
          nodeId: node.id,
          port,
          side: 'R',
          x: inner.right,
          y: port.cornerY - PORT_CORRIDOR_WIDTH / 2,
          width: outerRight - inner.right,
          height: PORT_CORRIDOR_WIDTH,
        }
        break
    }

    openings.push(opening)
  }

  return {
    nodeId: node.id,
    outer: {
      id: `geofence-${node.id}`,
      type: 'node',
      left: outerLeft,
      right: outerRight,
      top: outerTop,
      bottom: outerBottom,
    },
    inner,
    openings,
  }
}

/**
 * Generate geofences for all nodes in a graph
 */
export function generateGeofences(graph: Graph): GeofenceData {
  const nodeGeofences = new Map<string, NodeGeofence>()
  const labelGeofences: LabelGeofence[] = []

  for (const node of graph.nodes.values()) {
    // Generate node geofence (with ports) for regular nodes only
    // Subgraphs don't get node geofences - edges can pass through them
    if (!node.isSubgraph) {
      const geofence = generateNodeGeofence(node)
      if (geofence) {
        nodeGeofences.set(node.id, geofence)
      }
    }

    // Generate label geofence for ALL nodes including subgraphs
    // This protects text from being crossed by edges
    const labelBounds = calculateLabelBounds(node)
    if (labelBounds) {
      labelGeofences.push({
        labelId: `label-${node.id}`,
        bounds: {
          id: `label-geofence-${node.id}`,
          type: 'label',
          left: labelBounds.left - TEXT_PADDING,
          right: labelBounds.right + TEXT_PADDING,
          top: labelBounds.top - TEXT_PADDING,
          bottom: labelBounds.bottom + TEXT_PADDING,
        },
        padding: TEXT_PADDING,
      })
    }
  }

  // Add edge label geofences
  for (const edge of graph.edges) {
    if (edge.label && edge.points && edge.points.length >= 2) {
      // Calculate edge label position (midpoint of path)
      const midIdx = Math.floor(edge.points.length / 2)
      const midPoint = edge.points[midIdx]

      const labelWidth = edge.label.length * CHAR_WIDTH + TEXT_PADDING * 2
      const labelHeight = LINE_HEIGHT + TEXT_PADDING

      labelGeofences.push({
        labelId: `label-edge-${edge.id}`,
        bounds: {
          id: `label-geofence-edge-${edge.id}`,
          type: 'label',
          left: midPoint.x - labelWidth / 2 - TEXT_PADDING,
          right: midPoint.x + labelWidth / 2 + TEXT_PADDING,
          top: midPoint.y - labelHeight / 2 - TEXT_PADDING - 8, // offset above line
          bottom: midPoint.y + labelHeight / 2 + TEXT_PADDING - 8,
        },
        padding: TEXT_PADDING,
      })
    }
  }

  return { nodeGeofences, labelGeofences }
}

/**
 * Check if a point is inside a geofenced area (excluding openings)
 */
export function isPointInGeofence(
  x: number,
  y: number,
  geofence: NodeGeofence
): boolean {
  // First check if point is in the geofence band (between outer and inner)
  const inOuter = x >= geofence.outer.left && x <= geofence.outer.right &&
                  y >= geofence.outer.top && y <= geofence.outer.bottom
  const inInner = x >= geofence.inner.left && x <= geofence.inner.right &&
                  y >= geofence.inner.top && y <= geofence.inner.bottom

  if (!inOuter || inInner) return false

  // Point is in the geofence band - check if it's in an opening
  for (const opening of geofence.openings) {
    if (x >= opening.x && x <= opening.x + opening.width &&
        y >= opening.y && y <= opening.y + opening.height) {
      return false // In an opening, so not blocked
    }
  }

  return true // In geofence and not in any opening
}

/**
 * Check if a line segment intersects a geofence (excluding openings)
 */
export function segmentIntersectsGeofence(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  geofence: NodeGeofence
): boolean {
  // Sample points along the segment
  const steps = 10
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = p1.x + (p2.x - p1.x) * t
    const y = p1.y + (p2.y - p1.y) * t
    if (isPointInGeofence(x, y, geofence)) {
      return true
    }
  }
  return false
}

/**
 * Check if a path crosses any geofence (for collision detection)
 */
export function pathCrossesGeofences(
  path: { x: number; y: number }[],
  geofenceData: GeofenceData,
  excludeNodes: string[] = []
): { crosses: boolean; blockedBy: string[] } {
  const blockedBy: string[] = []

  for (let i = 0; i < path.length - 1; i++) {
    for (const [nodeId, geofence] of geofenceData.nodeGeofences) {
      if (excludeNodes.includes(nodeId)) continue
      if (segmentIntersectsGeofence(path[i], path[i + 1], geofence)) {
        if (!blockedBy.includes(nodeId)) {
          blockedBy.push(nodeId)
        }
      }
    }
  }

  return {
    crosses: blockedBy.length > 0,
    blockedBy,
  }
}
