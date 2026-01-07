/**
 * Floating edge utilities for isometric nodes
 *
 * Calculates dynamic connection points based on node positions,
 * projecting through isometric space for proper visual connections.
 */

import { Position, type InternalNode } from '@xyflow/react'
import { project, DEFAULT_Z_HEIGHT, COS_ANGLE, SIN_ANGLE } from './iso'

interface Point {
  x: number
  y: number
}

interface EdgeParams {
  sx: number
  sy: number
  tx: number
  ty: number
  sourcePos: Position
  targetPos: Position
}

/**
 * Get the bottom face corners of an isometric box for edge connections
 *
 * Since isometric nodes are extruded flat nodes, edges should connect
 * at the bottom (base) level where the "flat" shape exists.
 *
 * The bottom face is a diamond shape with 4 corners:
 * - back: furthest point (north in iso view)
 * - left: left point (west in iso view)
 * - right: right point (east in iso view)
 * - front: closest point (south in iso view)
 */
function getIsoBottomCorners(node: InternalNode): {
  back: Point   // Back side center (midpoint of left-back edge)
  left: Point   // Left side center (midpoint of front-left edge)
  right: Point  // Right side center (midpoint of back-right edge)
  front: Point  // Front side center (midpoint of right-front edge)
  center: Point // Center of bottom face
  corners: {    // Actual corner points (for handle positioning)
    back: Point
    left: Point
    right: Point
    front: Point
  }
} {
  // Get the base position and dimensions
  const posX = node.internals?.positionAbsolute?.x ?? node.position.x
  const posY = node.internals?.positionAbsolute?.y ?? node.position.y

  // Node data for dimensions
  const data = node.data as { width?: number; height?: number } | undefined
  const nodeWidth = data?.width ?? 120
  const nodeHeight = data?.height ?? 60
  const depth = DEFAULT_Z_HEIGHT

  // Project the corners of the 3D box
  // We only need the bottom face (z = 0) and top face for offset calculation
  const corners = {
    // Bottom face (z = 0) - this is where edges connect
    frontLeft: project(0, 0, 0),
    frontRight: project(nodeWidth, 0, 0),
    backRight: project(nodeWidth, nodeHeight, 0),
    backLeft: project(0, nodeHeight, 0),
    // Top face (z = depth) - needed for bounding box calculation
    topFrontLeft: project(0, 0, depth),
    topFrontRight: project(nodeWidth, 0, depth),
    topBackRight: project(nodeWidth, nodeHeight, depth),
    topBackLeft: project(0, nodeHeight, depth),
  }

  // Find the bounding box offset (same as IsoRectNode)
  const allPoints = Object.values(corners)
  const xs = allPoints.map(p => p.x)
  const ys = allPoints.map(p => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const padding = 5
  const offsetX = -minX + padding
  const offsetY = -minY + padding

  // Transform to absolute screen coordinates
  const t = (p: Point): Point => ({
    x: posX + p.x + offsetX,
    y: posY + p.y + offsetY,
  })

  // The bottom face diamond has these corners:
  // - frontLeft is the front/south tip
  // - frontRight is the right/east corner
  // - backRight is the back/north tip
  // - backLeft is the left/west corner
  const bottomCorners = {
    front: t(corners.frontLeft),   // Front/south corner
    right: t(corners.frontRight),  // Right/east corner
    back: t(corners.backRight),    // Back/north corner
    left: t(corners.backLeft),     // Left/west corner
  }

  // Calculate the CENTER of each SIDE (edge midpoints, not corners)
  // The diamond has 4 sides, we want the midpoint of each:
  //        back
  //       /    \
  //   leftBack  rightBack   <- these are the side midpoints
  //     |          |
  //   leftFront  rightFront
  //       \    /
  //       front
  const sideCenters = {
    // Right side: midpoint between back and right corners (screen-right direction)
    right: {
      x: (bottomCorners.back.x + bottomCorners.right.x) / 2,
      y: (bottomCorners.back.y + bottomCorners.right.y) / 2,
    },
    // Front side: midpoint between right and front corners (screen-down direction)
    front: {
      x: (bottomCorners.right.x + bottomCorners.front.x) / 2,
      y: (bottomCorners.right.y + bottomCorners.front.y) / 2,
    },
    // Left side: midpoint between front and left corners (screen-left direction)
    left: {
      x: (bottomCorners.front.x + bottomCorners.left.x) / 2,
      y: (bottomCorners.front.y + bottomCorners.left.y) / 2,
    },
    // Back side: midpoint between left and back corners (screen-up direction)
    back: {
      x: (bottomCorners.left.x + bottomCorners.back.x) / 2,
      y: (bottomCorners.left.y + bottomCorners.back.y) / 2,
    },
  }

  // Calculate center of bottom face
  const center = {
    x: (bottomCorners.front.x + bottomCorners.back.x) / 2,
    y: (bottomCorners.front.y + bottomCorners.back.y) / 2,
  }

  return { ...sideCenters, center, corners: bottomCorners }
}

/**
 * Calculate the angle difference between two angles (in degrees)
 * Returns a value between -180 and 180
 */
function angleDiff(a1: number, a2: number): number {
  let diff = a2 - a1
  while (diff > 180) diff -= 360
  while (diff < -180) diff += 360
  return Math.abs(diff)
}

/**
 * Determine which side center of the bottom face to connect to
 * based on the relative position of the other node.
 *
 * The bottom face is a diamond with 4 sides. We connect at the
 * center of each side, choosing the side that best faces the target.
 *
 * Instead of using fixed angle thresholds (which don't work for
 * isometric diamonds), we find the side whose center is closest
 * to the direction from source to target.
 */
function getIsoConnectionPoint(
  sourceNode: InternalNode,
  targetNode: InternalNode
): { point: Point; position: Position } {
  // Get isometric side centers
  const source = getIsoBottomCorners(sourceNode)
  const target = getIsoBottomCorners(targetNode)

  // Calculate direction from source center to target center
  const dx = target.center.x - source.center.x
  const dy = target.center.y - source.center.y
  const targetAngle = Math.atan2(dy, dx) * (180 / Math.PI)

  // Calculate the angle from source center to each side center
  const sides = [
    {
      name: 'right',
      point: source.right,
      position: Position.Right,
      angle: Math.atan2(
        source.right.y - source.center.y,
        source.right.x - source.center.x
      ) * (180 / Math.PI),
    },
    {
      name: 'front',
      point: source.front,
      position: Position.Bottom,
      angle: Math.atan2(
        source.front.y - source.center.y,
        source.front.x - source.center.x
      ) * (180 / Math.PI),
    },
    {
      name: 'left',
      point: source.left,
      position: Position.Left,
      angle: Math.atan2(
        source.left.y - source.center.y,
        source.left.x - source.center.x
      ) * (180 / Math.PI),
    },
    {
      name: 'back',
      point: source.back,
      position: Position.Top,
      angle: Math.atan2(
        source.back.y - source.center.y,
        source.back.x - source.center.x
      ) * (180 / Math.PI),
    },
  ]

  // Find the side whose angle is closest to the target direction
  let bestSide = sides[0]
  let bestDiff = angleDiff(sides[0].angle, targetAngle)

  for (const side of sides) {
    const diff = angleDiff(side.angle, targetAngle)
    if (diff < bestDiff) {
      bestDiff = diff
      bestSide = side
    }
  }

  return { point: bestSide.point, position: bestSide.position }
}

/**
 * Get edge parameters for floating isometric edges
 */
export function getIsoEdgeParams(
  sourceNode: InternalNode,
  targetNode: InternalNode
): EdgeParams {
  const source = getIsoConnectionPoint(sourceNode, targetNode)
  const target = getIsoConnectionPoint(targetNode, sourceNode)

  return {
    sx: source.point.x,
    sy: source.point.y,
    tx: target.point.x,
    ty: target.point.y,
    sourcePos: source.position,
    targetPos: target.position,
  }
}

/**
 * Calculate the intersection point of a line from node center to target
 * with the node's bounding rectangle.
 *
 * This is the official ReactFlow algorithm from:
 * https://reactflow.dev/examples/edges/floating-edges
 */
function getNodeIntersection(intersectionNode: InternalNode, targetNode: InternalNode): Point {
  const intersectionNodeWidth = intersectionNode.measured?.width ?? intersectionNode.width ?? 100
  const intersectionNodeHeight = intersectionNode.measured?.height ?? intersectionNode.height ?? 100
  const intersectionNodePosition = intersectionNode.internals?.positionAbsolute ?? intersectionNode.position
  const targetPosition = targetNode.internals?.positionAbsolute ?? targetNode.position
  const targetWidth = targetNode.measured?.width ?? targetNode.width ?? 100
  const targetHeight = targetNode.measured?.height ?? targetNode.height ?? 100

  const w = intersectionNodeWidth / 2
  const h = intersectionNodeHeight / 2

  const x2 = intersectionNodePosition.x + w
  const y2 = intersectionNodePosition.y + h
  const x1 = targetPosition.x + targetWidth / 2
  const y1 = targetPosition.y + targetHeight / 2

  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h)
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h)
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1)
  const xx3 = a * xx1
  const yy3 = a * yy1
  const x = w * (xx3 + yy3) + x2
  const y = h * (-xx3 + yy3) + y2

  return { x, y }
}

/**
 * Determine which edge position (top/right/bottom/left)
 * the intersection point is closest to.
 */
function getEdgePosition(node: InternalNode, intersectionPoint: Point): Position {
  const nodeX = node.internals?.positionAbsolute?.x ?? node.position.x
  const nodeY = node.internals?.positionAbsolute?.y ?? node.position.y
  const nodeWidth = node.measured?.width ?? node.width ?? 100
  const nodeHeight = node.measured?.height ?? node.height ?? 100

  const nx = Math.round(nodeX)
  const ny = Math.round(nodeY)
  const px = Math.round(intersectionPoint.x)
  const py = Math.round(intersectionPoint.y)

  if (px <= nx + 1) {
    return Position.Left
  }
  if (px >= nx + nodeWidth - 1) {
    return Position.Right
  }
  if (py <= ny + 1) {
    return Position.Top
  }
  if (py >= ny + nodeHeight - 1) {
    return Position.Bottom
  }

  return Position.Top
}

/**
 * Get edge parameters for flat (non-isometric) floating edges
 * Using the official ReactFlow intersection algorithm.
 */
export function getFlatEdgeParams(
  sourceNode: InternalNode,
  targetNode: InternalNode
): EdgeParams {
  const sourceIntersectionPoint = getNodeIntersection(sourceNode, targetNode)
  const targetIntersectionPoint = getNodeIntersection(targetNode, sourceNode)

  const sourcePos = getEdgePosition(sourceNode, sourceIntersectionPoint)
  const targetPos = getEdgePosition(targetNode, targetIntersectionPoint)

  return {
    sx: sourceIntersectionPoint.x,
    sy: sourceIntersectionPoint.y,
    tx: targetIntersectionPoint.x,
    ty: targetIntersectionPoint.y,
    sourcePos,
    targetPos,
  }
}

/**
 * Generate an isometric step path between two points.
 *
 * Instead of horizontal/vertical steps (screen space), this creates
 * steps that follow the isometric grid axes:
 * - Iso X-axis: down-right at 30° (screen direction: cos30°, sin30°)
 * - Iso Y-axis: down-left at 30° (screen direction: -cos30°, sin30°)
 *
 * This makes edges appear to lie on the "floor" of the isometric world.
 */
export function getIsoStepPath(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  options: { borderRadius?: number } = {}
): [path: string, labelX: number, labelY: number] {
  const { borderRadius = 5 } = options

  // Calculate the movement needed in screen space
  const dx = tx - sx
  const dy = ty - sy

  // Decompose screen movement into isometric X and Y components
  // Screen movement = a * isoX_direction + b * isoY_direction
  // where isoX_direction = (COS_ANGLE, SIN_ANGLE) = (0.866, 0.5)
  // and isoY_direction = (-COS_ANGLE, SIN_ANGLE) = (-0.866, 0.5)
  //
  // Solving the system:
  // dx = a * COS_ANGLE - b * COS_ANGLE = COS_ANGLE * (a - b)
  // dy = a * SIN_ANGLE + b * SIN_ANGLE = SIN_ANGLE * (a + b)
  //
  // a - b = dx / COS_ANGLE
  // a + b = dy / SIN_ANGLE
  // a = (dx/COS + dy/SIN) / 2
  // b = (dy/SIN - dx/COS) / 2

  const aPlusB = dy / SIN_ANGLE
  const aMinusB = dx / COS_ANGLE
  const a = (aMinusB + aPlusB) / 2 // Movement along iso X-axis
  const b = (aPlusB - aMinusB) / 2 // Movement along iso Y-axis

  // Calculate the midpoint (after moving along iso X, before iso Y)
  // Option 1: Go iso-X first, then iso-Y
  const midX = sx + a * COS_ANGLE
  const midY = sy + a * SIN_ANGLE

  // Label position at the midpoint
  const labelX = (sx + tx) / 2
  const labelY = (sy + ty) / 2

  // For very short paths, just draw a straight line
  if (Math.abs(a) < 1 && Math.abs(b) < 1) {
    return [`M ${sx} ${sy} L ${tx} ${ty}`, labelX, labelY]
  }

  // For paths that are mostly along one axis, simplify
  if (Math.abs(a) < 1) {
    // Only iso-Y movement needed
    return [`M ${sx} ${sy} L ${tx} ${ty}`, labelX, labelY]
  }
  if (Math.abs(b) < 1) {
    // Only iso-X movement needed
    return [`M ${sx} ${sy} L ${tx} ${ty}`, labelX, labelY]
  }

  // Create a step path with rounded corner at the midpoint
  // The corner should be tangent to both iso axes
  const r = Math.min(borderRadius, Math.abs(a) * 0.3, Math.abs(b) * 0.3)

  // Direction vectors (normalized)
  const isoXDir = { x: COS_ANGLE * Math.sign(a), y: SIN_ANGLE * Math.sign(a) }
  const isoYDir = { x: -COS_ANGLE * Math.sign(b), y: SIN_ANGLE * Math.sign(b) }

  // Points before and after the corner
  const beforeCorner = {
    x: midX - isoXDir.x * r,
    y: midY - isoXDir.y * r,
  }
  const afterCorner = {
    x: midX + isoYDir.x * r,
    y: midY + isoYDir.y * r,
  }

  // Build the path with a quadratic bezier for the rounded corner
  const path = [
    `M ${sx} ${sy}`,
    `L ${beforeCorner.x} ${beforeCorner.y}`,
    `Q ${midX} ${midY} ${afterCorner.x} ${afterCorner.y}`,
    `L ${tx} ${ty}`,
  ].join(' ')

  return [path, labelX, labelY]
}
