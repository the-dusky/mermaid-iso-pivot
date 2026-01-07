/**
 * Export all custom edge types
 */

import { FloatingFlatEdge } from './FloatingFlatEdge'

// Flat edge types (using floating edges for dynamic connection points)
export const flatEdgeTypes = {
  floating: FloatingFlatEdge,
  default: FloatingFlatEdge,
}

// Isometric edge types - use the SAME edge component as flat!
// The iso nodes have handles positioned on their 3D shapes,
// and the edges should just connect those handles the same way as flat.
// This ensures consistent edge rendering between views.
export const isoEdgeTypes = {
  floating: FloatingFlatEdge,
  default: FloatingFlatEdge,
}

// Default export for backwards compatibility
export const edgeTypes = flatEdgeTypes

// Re-export types
export type { EdgeData, AppEdge } from './types'

export { FloatingFlatEdge }
