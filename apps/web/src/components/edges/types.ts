/**
 * Edge type definitions for ReactFlow
 */

import type { Edge } from '@xyflow/react'

// Edge data type
export type EdgeData = {
  label?: string
  points?: Array<{ x: number; y: number }>
  fromArrow?: string
  toArrow?: string
  style?: string
  sourcePort?: any
  targetPort?: any
  crossings?: Array<{ x: number; y: number }>
  viewMode?: 'flat' | 'iso'
}

// Full edge type for ReactFlow v12 compatibility
export type AppEdge = Edge<EdgeData, string>
