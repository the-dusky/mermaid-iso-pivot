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
