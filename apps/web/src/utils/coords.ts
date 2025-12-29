/**
 * Coordinate transformation utilities for converting between screen and graph coordinates.
 * Handles both flat and isometric view modes.
 */

/**
 * Transform screen coordinates to graph coordinates (flat mode).
 * Uses the SVG's CTM (current transform matrix) to properly account for
 * pan, zoom, and any other transforms.
 */
export function screenToGraphFlat(
  screenX: number,
  screenY: number,
  svgElement: SVGSVGElement,
  transformGroup: SVGGraphicsElement
): { x: number; y: number } {
  const ctm = transformGroup.getScreenCTM()
  if (!ctm) {
    throw new Error('No CTM available for coordinate transformation')
  }

  // Create a point in screen coordinates
  const point = svgElement.createSVGPoint()
  point.x = screenX
  point.y = screenY

  // Apply inverse transform to get graph coordinates
  const graphPoint = point.matrixTransform(ctm.inverse())
  return { x: graphPoint.x, y: graphPoint.y }
}

/**
 * Transform screen coordinates to graph coordinates (isometric mode).
 * First transforms to SVG space, then applies the inverse isometric projection.
 *
 * The isometric projection is:
 *   screenX = (graphX - graphY) * cos30
 *   screenY = (graphX + graphY) * sin30
 *
 * Solving for graphX and graphY:
 *   graphX = (screenX/cos30 + screenY/sin30) / 2
 *   graphY = (screenY/sin30 - screenX/cos30) / 2
 */
export function screenToGraphIso(
  screenX: number,
  screenY: number,
  svgElement: SVGSVGElement,
  transformGroup: SVGGraphicsElement
): { x: number; y: number } {
  // First get the point in SVG space (after pan/zoom but before iso transform)
  const svgPoint = screenToGraphFlat(screenX, screenY, svgElement, transformGroup)

  // Isometric matrix constants
  const cos30 = 0.866
  const sin30 = 0.5

  // Apply inverse isometric projection
  // The isometric transform is applied to content, so we need to reverse it
  const graphX = (svgPoint.x / cos30 + svgPoint.y / sin30) / 2
  const graphY = (svgPoint.y / sin30 - svgPoint.x / cos30) / 2

  return { x: graphX, y: graphY }
}

/**
 * Transform screen coordinates to graph coordinates.
 * Automatically selects the appropriate transform based on view mode.
 */
export function screenToGraph(
  screenX: number,
  screenY: number,
  svgElement: SVGSVGElement,
  transformGroup: SVGGraphicsElement,
  viewMode: 'flat' | 'iso'
): { x: number; y: number } {
  return viewMode === 'iso'
    ? screenToGraphIso(screenX, screenY, svgElement, transformGroup)
    : screenToGraphFlat(screenX, screenY, svgElement, transformGroup)
}

/**
 * Calculate the distance from a point to a line segment.
 * Used for hit-testing edge segments when adding waypoints.
 */
export function pointToSegmentDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const lengthSq = dx * dx + dy * dy

  // Handle degenerate case where segment is a point
  if (lengthSq === 0) {
    return Math.hypot(px - x1, py - y1)
  }

  // Calculate projection parameter t, clamped to [0, 1]
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq))

  // Calculate closest point on segment
  const projX = x1 + t * dx
  const projY = y1 + t * dy

  // Return distance from point to closest point
  return Math.hypot(px - projX, py - projY)
}

/**
 * Find the closest point on a line segment to a given point.
 * Used for determining where to insert a new waypoint.
 */
export function closestPointOnSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): { x: number; y: number } {
  const dx = x2 - x1
  const dy = y2 - y1
  const lengthSq = dx * dx + dy * dy

  // Handle degenerate case
  if (lengthSq === 0) {
    return { x: x1, y: y1 }
  }

  // Calculate projection parameter t, clamped to [0, 1]
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq))

  return {
    x: x1 + t * dx,
    y: y1 + t * dy,
  }
}

/**
 * Determine if an orthogonal segment is horizontal or vertical.
 * Returns 'horizontal', 'vertical', or 'point' if degenerate.
 */
export function getSegmentOrientation(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): 'horizontal' | 'vertical' | 'point' {
  const dx = Math.abs(x2 - x1)
  const dy = Math.abs(y2 - y1)

  // Use a small threshold for floating point comparison
  const threshold = 0.1

  if (dx < threshold && dy < threshold) {
    return 'point'
  }

  // For orthogonal edges, one dimension should dominate
  return dx > dy ? 'horizontal' : 'vertical'
}

/**
 * For perpendicular segment dragging:
 * Given a drag delta and segment orientation, constrain the drag
 * to the perpendicular direction only.
 *
 * - Horizontal segment -> only allow vertical movement (dy)
 * - Vertical segment -> only allow horizontal movement (dx)
 */
export function constrainToPerpendicular(
  dx: number,
  dy: number,
  orientation: 'horizontal' | 'vertical' | 'point'
): { dx: number; dy: number } {
  if (orientation === 'horizontal') {
    // Horizontal segment: only allow vertical drag
    return { dx: 0, dy }
  } else if (orientation === 'vertical') {
    // Vertical segment: only allow horizontal drag
    return { dx, dy: 0 }
  }
  // Point or unknown: no movement
  return { dx: 0, dy: 0 }
}

/**
 * Hit test: find the edge segment closest to a point.
 * Returns the edge ID, segment index (between waypoints), and distance.
 * Segment index i means the segment between points[i] and points[i+1].
 */
export interface SegmentHitResult {
  edgeId: string
  segmentIndex: number
  distance: number
  orientation: 'horizontal' | 'vertical' | 'point'
}

export function findNearestSegment(
  px: number,
  py: number,
  edges: Array<{ id: string; points?: Array<{ x: number; y: number }> }>,
  maxDistance: number = 15
): SegmentHitResult | null {
  let nearest: SegmentHitResult | null = null

  for (const edge of edges) {
    if (!edge.points || edge.points.length < 2) continue

    for (let i = 0; i < edge.points.length - 1; i++) {
      const p1 = edge.points[i]
      const p2 = edge.points[i + 1]

      const dist = pointToSegmentDistance(px, py, p1.x, p1.y, p2.x, p2.y)

      if (dist <= maxDistance && (!nearest || dist < nearest.distance)) {
        nearest = {
          edgeId: edge.id,
          segmentIndex: i,
          distance: dist,
          orientation: getSegmentOrientation(p1.x, p1.y, p2.x, p2.y)
        }
      }
    }
  }

  return nearest
}
