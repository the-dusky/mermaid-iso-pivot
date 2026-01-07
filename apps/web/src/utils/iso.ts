/**
 * Shared isometric utilities for ReactFlow components
 *
 * Reuses the projection and color functions from isomaid to ensure
 * consistency with the non-ReactFlow renderer.
 */

import { isoProject, adjustColor } from 'isomaid'

// Re-export the canonical projection function
export { isoProject, adjustColor }

// Isometric constants (matching isomaid)
export const ANGLE = Math.PI / 6 // 30 degrees
export const COS_ANGLE = Math.cos(ANGLE) // ~0.866
export const SIN_ANGLE = Math.sin(ANGLE) // 0.5

// Default height for 3D extrusion (matching isomaid)
export const DEFAULT_Z_HEIGHT = 25

// Isometric matrix for CSS/SVG transforms (for text, edges)
export const ISO_MATRIX = `matrix(${COS_ANGLE}, ${SIN_ANGLE}, ${-COS_ANGLE}, ${SIN_ANGLE}, 0, 0)`

/**
 * Face shading values (matching isomaid's getFaceShading)
 * Returns percentage adjustment for color brightness
 */
export function getFaceShading(faceType: 'top' | 'left' | 'right'): number {
  switch (faceType) {
    case 'top':
      return 0 // Base color (brightest)
    case 'left':
      return -20 // Medium (facing toward camera/light)
    case 'right':
      return -40 // Darkest (facing away)
    default:
      return -25
  }
}

/**
 * Project a point and return in {x, y} format for ReactFlow compatibility
 * (isomaid uses {sx, sy})
 */
export function project(x: number, y: number, z: number = 0): { x: number; y: number } {
  const p = isoProject(x, y, z)
  return { x: p.sx, y: p.sy }
}

/**
 * Calculate depth for z-ordering (matching isomaid)
 * Higher values should be rendered later (in front)
 */
export function isoDepth(x: number, y: number, z: number): number {
  return x + y + z
}

/**
 * Convert screen coordinates to isometric coordinates (inverse projection)
 *
 * The isometric projection is:
 *   screenX = isoX * cos(30) - isoY * cos(30)
 *   screenY = isoX * sin(30) + isoY * sin(30)
 *
 * Solving for isoX, isoY:
 *   isoX = (screenX / cos30 + screenY / sin30) / 2
 *   isoY = (screenY / sin30 - screenX / cos30) / 2
 */
export function screenToIso(screenX: number, screenY: number): { isoX: number; isoY: number } {
  const isoX = (screenX / COS_ANGLE + screenY / SIN_ANGLE) / 2
  const isoY = (screenY / SIN_ANGLE - screenX / COS_ANGLE) / 2
  return { isoX, isoY }
}

/**
 * Convert isometric coordinates to screen coordinates (forward projection at z=0)
 */
export function isoToScreen(isoX: number, isoY: number): { screenX: number; screenY: number } {
  const screenX = isoX * COS_ANGLE - isoY * COS_ANGLE
  const screenY = isoX * SIN_ANGLE + isoY * SIN_ANGLE
  return { screenX, screenY }
}

/**
 * Calculate the offset of the iso diamond's origin within a parent's DOM element.
 * This is needed because the SubgraphNode creates an SVG container that's larger
 * than the diamond to accommodate all projected corners.
 *
 * Returns the (x, y) position of the iso origin (frontLeft corner at flat 0,0)
 * within the parent's DOM element.
 */
export function getIsoParentOffset(parentWidth: number, parentHeight: number, padding: number = 10): { offsetX: number; offsetY: number } {
  // Calculate the same corners as SubgraphNode
  const corners = {
    frontLeft: project(0, 0, 0),
    frontRight: project(parentWidth, 0, 0),
    backRight: project(parentWidth, parentHeight, 0),
    backLeft: project(0, parentHeight, 0),
  }

  // Find bounds
  const allPoints = Object.values(corners)
  const xs = allPoints.map(p => p.x)
  const ys = allPoints.map(p => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)

  // The offset applied in SubgraphNode
  const offsetX = -minX + padding
  const offsetY = -minY + padding

  return { offsetX, offsetY }
}
