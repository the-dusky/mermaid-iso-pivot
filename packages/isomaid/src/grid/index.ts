/**
 * Grid Coordinate System
 *
 * Provides unified grid coordinates that work across flat and isometric views.
 * All positions are stored as grid units, then projected to screen space for rendering.
 */

import type {
  GridCoord,
  GridBounds,
  GridConfig,
  ScreenCoord,
  LabelBounds,
  LayerInfo,
  Port,
  PortSide,
  EdgeSegment,
} from '../model/types'

// ============ Projection Functions ============

/**
 * Project grid coordinates to screen space (flat view)
 */
export function projectFlat(coord: GridCoord, cellSize: number): ScreenCoord {
  return {
    x: coord.gx * cellSize,
    y: coord.gy * cellSize,
  }
}

/**
 * Project grid coordinates to screen space (isometric view)
 */
export function projectIso(
  coord: GridCoord,
  cellSize: number,
  z: number = 0
): ScreenCoord {
  const x = coord.gx * cellSize
  const y = coord.gy * cellSize
  const cos30 = 0.866
  const sin30 = 0.5

  return {
    x: (x - y) * cos30,
    y: (x + y) * sin30 - z,
  }
}

/**
 * Project based on view mode
 */
export function project(
  coord: GridCoord,
  cellSize: number,
  viewMode: 'flat' | 'iso',
  z: number = 0
): ScreenCoord {
  return viewMode === 'iso'
    ? projectIso(coord, cellSize, z)
    : projectFlat(coord, cellSize)
}

// ============ Inverse Projection (Screen → Grid) ============

/**
 * Convert screen coordinates to grid coordinates (flat view)
 */
export function unprojectFlat(
  screen: ScreenCoord,
  cellSize: number,
  layer: string = 'root'
): GridCoord {
  return {
    gx: Math.round(screen.x / cellSize),
    gy: Math.round(screen.y / cellSize),
    layer,
  }
}

/**
 * Convert screen coordinates to grid coordinates (isometric view)
 * Note: z is assumed to be 0 for this inverse calculation
 */
export function unprojectIso(
  screen: ScreenCoord,
  cellSize: number,
  layer: string = 'root'
): GridCoord {
  const cos30 = 0.866
  const sin30 = 0.5

  // Inverse of: sx = (x - y) * cos30, sy = (x + y) * sin30
  // Solving: x = (sx/cos30 + sy/sin30) / 2, y = (sy/sin30 - sx/cos30) / 2
  const x = (screen.x / cos30 + screen.y / sin30) / 2
  const y = (screen.y / sin30 - screen.x / cos30) / 2

  return {
    gx: Math.round(x / cellSize),
    gy: Math.round(y / cellSize),
    layer,
  }
}

/**
 * Unproject based on view mode
 */
export function unproject(
  screen: ScreenCoord,
  cellSize: number,
  viewMode: 'flat' | 'iso',
  layer: string = 'root'
): GridCoord {
  return viewMode === 'iso'
    ? unprojectIso(screen, cellSize, layer)
    : unprojectFlat(screen, cellSize, layer)
}

// ============ Layer Coordinate Translation ============

/**
 * Convert a coordinate from parent layer to child layer
 * Used when drilling into a subgraph
 */
export function toChildCoord(
  parentCoord: GridCoord,
  childLayer: LayerInfo
): GridCoord {
  const { bounds, gridSize, id } = childLayer

  // Calculate relative position within parent bounds
  const parentWidth = bounds.max.gx - bounds.min.gx
  const parentHeight = bounds.max.gy - bounds.min.gy

  const relX = parentCoord.gx - bounds.min.gx
  const relY = parentCoord.gy - bounds.min.gy

  // Scale to child grid size
  return {
    gx: (relX / parentWidth) * gridSize,
    gy: (relY / parentHeight) * gridSize,
    layer: id,
  }
}

/**
 * Convert a coordinate from child layer to parent layer
 * Used when navigating up from a subgraph
 */
export function toParentCoord(
  childCoord: GridCoord,
  childLayer: LayerInfo
): GridCoord {
  const { bounds, gridSize, parentId } = childLayer

  if (!parentId) {
    throw new Error('Cannot convert to parent: layer has no parent')
  }

  const parentWidth = bounds.max.gx - bounds.min.gx
  const parentHeight = bounds.max.gy - bounds.min.gy

  // Scale from child grid to parent bounds
  return {
    gx: bounds.min.gx + (childCoord.gx / gridSize) * parentWidth,
    gy: bounds.min.gy + (childCoord.gy / gridSize) * parentHeight,
    layer: parentId,
  }
}

// ============ Snapping ============

/**
 * Snap a coordinate to the nearest grid intersection
 */
export function snapToGrid(coord: GridCoord): GridCoord {
  return {
    gx: Math.round(coord.gx),
    gy: Math.round(coord.gy),
    layer: coord.layer,
  }
}

/**
 * Snap to a custom grid resolution (e.g., snap to every 5 units)
 */
export function snapToResolution(coord: GridCoord, resolution: number): GridCoord {
  return {
    gx: Math.round(coord.gx / resolution) * resolution,
    gy: Math.round(coord.gy / resolution) * resolution,
    layer: coord.layer,
  }
}

// ============ Grid Bounds Utilities ============

/**
 * Check if a coordinate is within bounds
 */
export function isWithinBounds(coord: GridCoord, bounds: GridBounds): boolean {
  return (
    coord.gx >= bounds.min.gx &&
    coord.gx <= bounds.max.gx &&
    coord.gy >= bounds.min.gy &&
    coord.gy <= bounds.max.gy &&
    coord.layer === bounds.min.layer
  )
}

/**
 * Get the center of bounds
 */
export function getBoundsCenter(bounds: GridBounds): GridCoord {
  return {
    gx: (bounds.min.gx + bounds.max.gx) / 2,
    gy: (bounds.min.gy + bounds.max.gy) / 2,
    layer: bounds.min.layer,
  }
}

/**
 * Get bounds dimensions
 */
export function getBoundsDimensions(bounds: GridBounds): { width: number; height: number } {
  return {
    width: bounds.max.gx - bounds.min.gx,
    height: bounds.max.gy - bounds.min.gy,
  }
}

/**
 * Create bounds from center and dimensions
 */
export function createBounds(
  center: GridCoord,
  width: number,
  height: number
): GridBounds {
  const halfW = width / 2
  const halfH = height / 2
  return {
    min: { gx: center.gx - halfW, gy: center.gy - halfH, layer: center.layer },
    max: { gx: center.gx + halfW, gy: center.gy + halfH, layer: center.layer },
  }
}

/**
 * Check if two bounds overlap (for collision detection)
 */
export function boundsOverlap(a: GridBounds, b: GridBounds): boolean {
  if (a.min.layer !== b.min.layer) return false

  return !(
    a.max.gx < b.min.gx ||
    a.min.gx > b.max.gx ||
    a.max.gy < b.min.gy ||
    a.min.gy > b.max.gy
  )
}

/**
 * Expand bounds by padding
 */
export function expandBounds(bounds: GridBounds, padding: number): GridBounds {
  return {
    min: {
      gx: bounds.min.gx - padding,
      gy: bounds.min.gy - padding,
      layer: bounds.min.layer,
    },
    max: {
      gx: bounds.max.gx + padding,
      gy: bounds.max.gy + padding,
      layer: bounds.max.layer,
    },
  }
}

// ============ Label Bounds ============

/**
 * Calculate label bounds from text
 */
export function calculateLabelBounds(
  text: string,
  center: GridCoord,
  fontSize: number,
  cellSize: number
): LabelBounds {
  // Approximate text metrics
  const charWidth = fontSize * 0.6
  const pixelWidth = text.length * charWidth
  const pixelHeight = fontSize * 1.4

  // Convert to grid units and add padding
  const padding = 0.5 // Half a grid cell padding
  return {
    center,
    width: Math.ceil(pixelWidth / cellSize) + padding * 2,
    height: Math.ceil(pixelHeight / cellSize) + padding * 2,
  }
}

/**
 * Convert label bounds to grid bounds for collision detection
 */
export function labelToGridBounds(label: LabelBounds): GridBounds {
  const halfW = label.width / 2
  const halfH = label.height / 2
  return {
    min: {
      gx: label.center.gx - halfW,
      gy: label.center.gy - halfH,
      layer: label.center.layer,
    },
    max: {
      gx: label.center.gx + halfW,
      gy: label.center.gy + halfH,
      layer: label.center.layer,
    },
  }
}

// ============ Pixel ↔ Grid Conversion ============

/**
 * Convert pixel coordinates to grid coordinates
 */
export function pixelToGrid(
  x: number,
  y: number,
  cellSize: number,
  layer: string = 'root'
): GridCoord {
  return {
    gx: x / cellSize,
    gy: y / cellSize,
    layer,
  }
}

/**
 * Convert grid coordinates to pixel coordinates
 */
export function gridToPixel(
  coord: GridCoord,
  cellSize: number
): { x: number; y: number } {
  return {
    x: coord.gx * cellSize,
    y: coord.gy * cellSize,
  }
}

// ============ Grid Generation (for rendering) ============

/**
 * Generate flat grid lines for rendering
 * @param width - Total width in pixels
 * @param height - Total height in pixels
 * @param cellSize - Spacing between grid lines in pixels (default 40)
 */
export function generateFlatGrid(
  width: number,
  height: number,
  cellSize: number = 40
): string {
  const lines: string[] = []
  const stroke = '#e8e8e8'
  const strokeWidth = 0.5

  // Vertical lines
  for (let x = 0; x <= width; x += cellSize) {
    lines.push(
      `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="${stroke}" stroke-width="${strokeWidth}" />`
    )
  }

  // Horizontal lines
  for (let y = 0; y <= height; y += cellSize) {
    lines.push(
      `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${stroke}" stroke-width="${strokeWidth}" />`
    )
  }

  return `<g class="grid flat-grid">${lines.join('\n')}</g>`
}

// ============ Port Generation ============

/**
 * Generate ports for a node based on its grid bounds
 * Ports are placed at each interior grid point along edges (excluding corners)
 */
export function generatePorts(nodeId: string, bounds: GridBounds): Port[] {
  const ports: Port[] = []
  const { min, max } = bounds
  const layer = min.layer

  // Top edge (exclude corners)
  for (let gx = Math.ceil(min.gx) + 1; gx < Math.floor(max.gx); gx++) {
    ports.push({
      coord: { gx, gy: min.gy, layer },
      side: 'T',
      nodeId,
    })
  }

  // Right edge (exclude corners)
  for (let gy = Math.ceil(min.gy) + 1; gy < Math.floor(max.gy); gy++) {
    ports.push({
      coord: { gx: max.gx, gy, layer },
      side: 'R',
      nodeId,
    })
  }

  // Bottom edge (exclude corners)
  for (let gx = Math.ceil(min.gx) + 1; gx < Math.floor(max.gx); gx++) {
    ports.push({
      coord: { gx, gy: max.gy, layer },
      side: 'B',
      nodeId,
    })
  }

  // Left edge (exclude corners)
  for (let gy = Math.ceil(min.gy) + 1; gy < Math.floor(max.gy); gy++) {
    ports.push({
      coord: { gx: min.gx, gy, layer },
      side: 'L',
      nodeId,
    })
  }

  return ports
}

/**
 * Get ports on a specific side of a node
 */
export function getPortsOnSide(ports: Port[], side: PortSide): Port[] {
  return ports.filter(p => p.side === side)
}

/**
 * Find the nearest available port to a target coordinate
 */
export function findNearestPort(
  ports: Port[],
  target: GridCoord,
  excludeAllocated: boolean = true
): Port | null {
  const available = excludeAllocated
    ? ports.filter(p => !p.edgeId)
    : ports

  if (available.length === 0) return null

  let nearest = available[0]
  let minDist = gridDistance(nearest.coord, target)

  for (const port of available) {
    const dist = gridDistance(port.coord, target)
    if (dist < minDist) {
      minDist = dist
      nearest = port
    }
  }

  return nearest
}

/**
 * Calculate Manhattan distance between two grid coordinates
 */
export function gridDistance(a: GridCoord, b: GridCoord): number {
  return Math.abs(a.gx - b.gx) + Math.abs(a.gy - b.gy)
}

/**
 * Calculate Euclidean distance between two grid coordinates
 */
export function gridDistanceEuclidean(a: GridCoord, b: GridCoord): number {
  const dx = a.gx - b.gx
  const dy = a.gy - b.gy
  return Math.sqrt(dx * dx + dy * dy)
}

// ============ Edge Segment Collision ============

/**
 * Check if two horizontal/vertical edge segments overlap
 * Segments must be axis-aligned (orthogonal routing)
 */
export function segmentsOverlap(a: EdgeSegment, b: EdgeSegment): boolean {
  // Must be in same layer
  if (a.from.layer !== b.from.layer) return false

  const aHorizontal = a.from.gy === a.to.gy
  const bHorizontal = b.from.gy === b.to.gy

  // Both horizontal
  if (aHorizontal && bHorizontal) {
    // Must be on same row
    if (a.from.gy !== b.from.gy) return false

    // Check X overlap
    const aMinX = Math.min(a.from.gx, a.to.gx)
    const aMaxX = Math.max(a.from.gx, a.to.gx)
    const bMinX = Math.min(b.from.gx, b.to.gx)
    const bMaxX = Math.max(b.from.gx, b.to.gx)
    return aMinX < bMaxX && bMinX < aMaxX
  }

  const aVertical = a.from.gx === a.to.gx
  const bVertical = b.from.gx === b.to.gx

  // Both vertical
  if (aVertical && bVertical) {
    // Must be on same column
    if (a.from.gx !== b.from.gx) return false

    // Check Y overlap
    const aMinY = Math.min(a.from.gy, a.to.gy)
    const aMaxY = Math.max(a.from.gy, a.to.gy)
    const bMinY = Math.min(b.from.gy, b.to.gy)
    const bMaxY = Math.max(b.from.gy, b.to.gy)
    return aMinY < bMaxY && bMinY < aMaxY
  }

  // One horizontal, one vertical - check intersection point
  if (aHorizontal && bVertical) {
    return segmentsCross(a, b)
  }

  if (aVertical && bHorizontal) {
    return segmentsCross(b, a)
  }

  return false
}

/**
 * Check if a horizontal and vertical segment cross
 * First segment must be horizontal, second must be vertical
 */
function segmentsCross(horizontal: EdgeSegment, vertical: EdgeSegment): boolean {
  const hMinX = Math.min(horizontal.from.gx, horizontal.to.gx)
  const hMaxX = Math.max(horizontal.from.gx, horizontal.to.gx)
  const hY = horizontal.from.gy

  const vMinY = Math.min(vertical.from.gy, vertical.to.gy)
  const vMaxY = Math.max(vertical.from.gy, vertical.to.gy)
  const vX = vertical.from.gx

  // Check if intersection point is within both segments
  return vX > hMinX && vX < hMaxX && hY > vMinY && hY < vMaxY
}

/**
 * Convert edge points to segments for collision detection
 */
export function edgePointsToSegments(
  points: GridCoord[],
  edgeId: string
): EdgeSegment[] {
  const segments: EdgeSegment[] = []

  for (let i = 0; i < points.length - 1; i++) {
    segments.push({
      from: points[i],
      to: points[i + 1],
      edgeId,
    })
  }

  return segments
}

/**
 * Find all overlapping segment pairs between two edges
 */
export function findOverlappingSegments(
  segmentsA: EdgeSegment[],
  segmentsB: EdgeSegment[]
): Array<[EdgeSegment, EdgeSegment]> {
  const overlaps: Array<[EdgeSegment, EdgeSegment]> = []

  for (const a of segmentsA) {
    for (const b of segmentsB) {
      if (segmentsOverlap(a, b)) {
        overlaps.push([a, b])
      }
    }
  }

  return overlaps
}
