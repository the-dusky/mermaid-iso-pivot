/**
 * Isometric Projection Rendering
 *
 * Based on learnings from Isomer.js (jdan/isomer):
 * - Uses 30° isometric projection (π/6)
 * - Transformation matrix separates X and Y axis projections
 * - Depth calculation for proper z-ordering: x + y - 2*z
 * - Lighting via surface normals (simplified to face-based shading)
 *
 * Projection formulas:
 *   screenX = (x - y) * cos(30°) * scale
 *   screenY = -(x + y) * sin(30°) * scale - z * scale
 *
 * Note: Y is negated to flip coordinate system (canvas Y goes down)
 */

import type { Node } from '../model/types'

// Isometric projection constants (30° angle)
const ANGLE = Math.PI / 6 // 30 degrees
const COS_ANGLE = Math.cos(ANGLE) // ~0.866
const SIN_ANGLE = Math.sin(ANGLE) // 0.5

// Default scale for isometric projection
const ISO_SCALE = 1

// Default height for 3D extrusion
const DEFAULT_Z_HEIGHT = 25

// Light direction for shading (normalized vector pointing up-right)
const LIGHT_DIR = { x: 0.5, y: -0.5, z: 1 }

export interface IsoPoint {
  sx: number
  sy: number
}

export interface IsoShapeResult {
  faces: IsoFace[]
}

export interface IsoFace {
  type: 'top' | 'left' | 'right' | 'front' | 'bottom'
  points: string // SVG polygon points
  colorOffset: number // 0 = base, negative = darker
  depth: number // For z-ordering (higher = render later/in front)
}

/**
 * Project a 3D point to 2D isometric screen coordinates
 *
 * Cloudcraft-style projection:
 * - X axis goes toward bottom-right of screen (down-right at 30°)
 * - Y axis goes toward bottom-left of screen (down-left at 30°)
 * - Z axis goes straight up
 * - Camera is at bottom/front, looking toward the back (high x, high y)
 * - Higher (x+y) = further back = higher on screen (lower SVG y)
 * - Flat top-left (low x, low y) maps to iso front (bottom of screen)
 */
export function isoProject(x: number, y: number, z: number = 0): IsoPoint {
  return {
    sx: (x - y) * COS_ANGLE * ISO_SCALE,
    sy: (x + y) * SIN_ANGLE * ISO_SCALE - z * ISO_SCALE,
  }
}

/**
 * Calculate depth for z-ordering
 * Higher values should be rendered later (in front)
 * With our projection where sy = (x+y)*sin - z:
 * - Higher x+y moves objects DOWN on screen (closer to viewer)
 * - Higher z raises objects up
 * - Objects closer to viewer (higher x+y) should render on top
 */
export function isoDepth(x: number, y: number, z: number): number {
  return x + y + z
}

/**
 * Calculate face shading based on face orientation
 * Simplified lighting - uses predefined values for each face type
 * Light comes from upper-left (toward camera), matching Cloudcraft style
 */
function getFaceShading(faceType: IsoFace['type']): number {
  switch (faceType) {
    case 'top':
      return 0 // Base color (brightest)
    case 'left':
      return -20 // Medium (facing toward camera/light)
    case 'front':
      return -35 // Darker (facing more away from light)
    case 'right':
      return -40 // Darkest (facing away)
    case 'bottom':
      return -50
    default:
      return -25
  }
}

/**
 * Generate an isometric box (rectangular prism)
 */
export function isoBox(
  cx: number,
  cy: number,
  w: number,
  d: number,
  h: number = DEFAULT_Z_HEIGHT
): IsoShapeResult {
  const halfW = w / 2
  const halfD = d / 2

  // Define 8 corners of the box in 3D space
  // Bottom face (z = 0)
  const b_bl = { x: cx - halfW, y: cy - halfD, z: 0 } // back-left
  const b_br = { x: cx + halfW, y: cy - halfD, z: 0 } // back-right
  const b_fr = { x: cx + halfW, y: cy + halfD, z: 0 } // front-right
  const b_fl = { x: cx - halfW, y: cy + halfD, z: 0 } // front-left

  // Top face (z = h)
  const t_bl = { x: cx - halfW, y: cy - halfD, z: h }
  const t_br = { x: cx + halfW, y: cy - halfD, z: h }
  const t_fr = { x: cx + halfW, y: cy + halfD, z: h }
  const t_fl = { x: cx - halfW, y: cy + halfD, z: h }

  // Project all corners to screen coordinates
  const pb_bl = isoProject(b_bl.x, b_bl.y, b_bl.z)
  const pb_br = isoProject(b_br.x, b_br.y, b_br.z)
  const pb_fr = isoProject(b_fr.x, b_fr.y, b_fr.z)
  const pb_fl = isoProject(b_fl.x, b_fl.y, b_fl.z)
  const pt_bl = isoProject(t_bl.x, t_bl.y, t_bl.z)
  const pt_br = isoProject(t_br.x, t_br.y, t_br.z)
  const pt_fr = isoProject(t_fr.x, t_fr.y, t_fr.z)
  const pt_fl = isoProject(t_fl.x, t_fl.y, t_fl.z)

  const fmt = (p: IsoPoint) => `${p.sx},${p.sy}`

  // Calculate face depths for z-ordering (use center of each face)
  const topDepth = isoDepth(cx, cy, h)
  const rightDepth = isoDepth(cx + halfW, cy, h / 2)
  const frontDepth = isoDepth(cx, cy + halfD, h / 2)

  return {
    faces: [
      // With projection sx=(x-y), sy=(x+y)-z:
      // - Viewer is at bottom of screen (high x+y) looking up toward low x+y
      // - +X face (right side) faces toward viewer, appears on RIGHT of screen
      // - +Y face (front side) faces toward viewer, appears on LEFT of screen
      // - Top face always visible

      // Right face (+X side) - appears on RIGHT of screen
      {
        type: 'right',
        points: `${fmt(pt_br)} ${fmt(pt_fr)} ${fmt(pb_fr)} ${fmt(pb_br)}`,
        colorOffset: getFaceShading('right'),
        depth: rightDepth,
      },
      // Front face (+Y side) - appears on LEFT of screen
      {
        type: 'left',
        points: `${fmt(pt_fl)} ${fmt(pt_fr)} ${fmt(pb_fr)} ${fmt(pb_fl)}`,
        colorOffset: getFaceShading('left'),
        depth: frontDepth,
      },
      // Top face (facing up)
      {
        type: 'top',
        points: `${fmt(pt_bl)} ${fmt(pt_br)} ${fmt(pt_fr)} ${fmt(pt_fl)}`,
        colorOffset: getFaceShading('top'),
        depth: topDepth,
      },
    ],
  }
}

/**
 * Generate isometric diamond (for decision nodes)
 */
export function isoDiamond(
  cx: number,
  cy: number,
  w: number,
  d: number,
  h: number = DEFAULT_Z_HEIGHT * 0.8
): IsoShapeResult {
  const halfW = w / 2
  const halfD = d / 2

  // Diamond points at cardinal directions
  const b_n = { x: cx, y: cy - halfD, z: 0 } // north (back)
  const b_e = { x: cx + halfW, y: cy, z: 0 } // east (right)
  const b_s = { x: cx, y: cy + halfD, z: 0 } // south (front)
  const b_w = { x: cx - halfW, y: cy, z: 0 } // west (left)

  const t_n = { x: cx, y: cy - halfD, z: h }
  const t_e = { x: cx + halfW, y: cy, z: h }
  const t_s = { x: cx, y: cy + halfD, z: h }
  const t_w = { x: cx - halfW, y: cy, z: h }

  // Project
  const pb_n = isoProject(b_n.x, b_n.y, b_n.z)
  const pb_e = isoProject(b_e.x, b_e.y, b_e.z)
  const pb_s = isoProject(b_s.x, b_s.y, b_s.z)
  const pb_w = isoProject(b_w.x, b_w.y, b_w.z)
  const pt_n = isoProject(t_n.x, t_n.y, t_n.z)
  const pt_e = isoProject(t_e.x, t_e.y, t_e.z)
  const pt_s = isoProject(t_s.x, t_s.y, t_s.z)
  const pt_w = isoProject(t_w.x, t_w.y, t_w.z)

  const fmt = (p: IsoPoint) => `${p.sx},${p.sy}`

  return {
    faces: [
      // East face (+X direction, appears on right of screen)
      {
        type: 'right',
        points: `${fmt(pt_n)} ${fmt(pt_e)} ${fmt(pb_e)} ${fmt(pb_n)}`,
        colorOffset: getFaceShading('right'),
        depth: isoDepth(cx + halfW / 2, cy - halfD / 2, h / 2),
      },
      // South face (+Y direction, appears on left of screen)
      {
        type: 'left',
        points: `${fmt(pt_e)} ${fmt(pt_s)} ${fmt(pb_s)} ${fmt(pb_e)}`,
        colorOffset: getFaceShading('left'),
        depth: isoDepth(cx + halfW / 2, cy + halfD / 2, h / 2),
      },
      // Top face (diamond)
      {
        type: 'top',
        points: `${fmt(pt_n)} ${fmt(pt_e)} ${fmt(pt_s)} ${fmt(pt_w)}`,
        colorOffset: getFaceShading('top'),
        depth: isoDepth(cx, cy, h),
      },
    ],
  }
}

/**
 * Generate isometric hexagon
 */
export function isoHexagon(
  cx: number,
  cy: number,
  w: number,
  d: number,
  h: number = DEFAULT_Z_HEIGHT
): IsoShapeResult {
  const halfW = w / 2
  const halfD = d / 2
  const inset = w * 0.2

  // Hexagon points (6 corners) - numbered clockwise from back-left
  const pts3D = [
    { x: cx - halfW + inset, y: cy - halfD, z: 0 }, // 0: back-left
    { x: cx + halfW - inset, y: cy - halfD, z: 0 }, // 1: back-right
    { x: cx + halfW, y: cy, z: 0 }, // 2: right
    { x: cx + halfW - inset, y: cy + halfD, z: 0 }, // 3: front-right
    { x: cx - halfW + inset, y: cy + halfD, z: 0 }, // 4: front-left
    { x: cx - halfW, y: cy, z: 0 }, // 5: left
  ]

  // Project bottom and top
  const bottom = pts3D.map(p => isoProject(p.x, p.y, 0))
  const top = pts3D.map(p => isoProject(p.x, p.y, h))

  const fmt = (p: IsoPoint) => `${p.sx},${p.sy}`

  return {
    faces: [
      // Right face (1-2) - +X side, appears on right of screen
      {
        type: 'right',
        points: `${fmt(top[1])} ${fmt(top[2])} ${fmt(bottom[2])} ${fmt(bottom[1])}`,
        colorOffset: getFaceShading('right'),
        depth: isoDepth(cx + halfW, cy - halfD / 2, h / 2),
      },
      // Front-right face (2-3) - between +X and +Y
      {
        type: 'right',
        points: `${fmt(top[2])} ${fmt(top[3])} ${fmt(bottom[3])} ${fmt(bottom[2])}`,
        colorOffset: getFaceShading('right') - 5,
        depth: isoDepth(cx + halfW, cy + halfD / 2, h / 2),
      },
      // Front face (3-4) - +Y side, appears on left of screen
      {
        type: 'left',
        points: `${fmt(top[3])} ${fmt(top[4])} ${fmt(bottom[4])} ${fmt(bottom[3])}`,
        colorOffset: getFaceShading('left'),
        depth: isoDepth(cx, cy + halfD, h / 2),
      },
      // Top face (hexagon)
      {
        type: 'top',
        points: top.map(fmt).join(' '),
        colorOffset: getFaceShading('top'),
        depth: isoDepth(cx, cy, h),
      },
    ],
  }
}

/**
 * Generate a flat isometric platform (just the top face, no walls)
 * Used for subgraphs/containers
 */
export function isoPlatform(
  cx: number,
  cy: number,
  w: number,
  d: number
): IsoShapeResult {
  const halfW = w / 2
  const halfD = d / 2

  // Just the floor at z=0
  const corners = [
    isoProject(cx - halfW, cy - halfD, 0), // back-left
    isoProject(cx + halfW, cy - halfD, 0), // back-right
    isoProject(cx + halfW, cy + halfD, 0), // front-right
    isoProject(cx - halfW, cy + halfD, 0), // front-left
  ]

  const fmt = (p: IsoPoint) => `${p.sx},${p.sy}`

  return {
    faces: [
      {
        type: 'top',
        points: corners.map(fmt).join(' '),
        colorOffset: 0,
        depth: isoDepth(cx, cy, 0),
      },
    ],
  }
}

/**
 * Get isometric shape for a node
 */
export function getIsoShape(node: Node, isSubgraph: boolean = false): IsoShapeResult {
  const cx = node.x || 0
  const cy = node.y || 0
  const w = node.width || 100
  const d = node.height || 40

  // Subgraphs render as flat platforms (no walls)
  if (isSubgraph) {
    return isoPlatform(cx, cy, w, d)
  }

  switch (node.shape) {
    case 'diamond':
      return isoDiamond(cx, cy, w, d)
    case 'hexagon':
      return isoHexagon(cx, cy, w, d)
    case 'cylinder':
      // Cylinder approximated as box for now
      return isoBox(cx, cy, w, d)
    default:
      return isoBox(cx, cy, w, d)
  }
}

/**
 * Generate isometric grid lines for the floor
 */
export function isoGrid(
  width: number,
  height: number,
  spacing: number = 40
): string {
  const lines: string[] = []
  const gridColor = '#e0e0e0'
  const gridWidth = 0.5

  // Grid bounds
  const startX = -width / 2
  const endX = width * 1.5
  const startY = -height / 2
  const endY = height * 1.5

  // Lines parallel to Y axis
  for (let x = startX; x <= endX; x += spacing) {
    const start = isoProject(x, startY, 0)
    const end = isoProject(x, endY, 0)
    lines.push(
      `<line x1="${start.sx}" y1="${start.sy}" x2="${end.sx}" y2="${end.sy}" stroke="${gridColor}" stroke-width="${gridWidth}" />`
    )
  }

  // Lines parallel to X axis
  for (let y = startY; y <= endY; y += spacing) {
    const start = isoProject(startX, y, 0)
    const end = isoProject(endX, y, 0)
    lines.push(
      `<line x1="${start.sx}" y1="${start.sy}" x2="${end.sx}" y2="${end.sy}" stroke="${gridColor}" stroke-width="${gridWidth}" />`
    )
  }

  return `<g class="iso-grid">${lines.join('\n')}</g>`
}

/**
 * Adjust color brightness for face shading
 */
export function adjustColor(hexColor: string, percent: number): string {
  let hex = hexColor.replace('#', '')
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
  }

  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)

  const adjust = (c: number) => {
    const adjusted = c + (c * percent) / 100
    return Math.min(255, Math.max(0, Math.round(adjusted)))
  }

  return `#${adjust(r).toString(16).padStart(2, '0')}${adjust(g).toString(16).padStart(2, '0')}${adjust(b).toString(16).padStart(2, '0')}`
}
