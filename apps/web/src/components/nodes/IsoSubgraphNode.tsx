/**
 * Isometric subgraph node component for ReactFlow subflows
 *
 * Renders as a flat rectangle that is isometrically projected using ISO_MATRIX.
 * This creates a rhombus shape that aligns with the isometric grid.
 * Uses 0.8 opacity for better visibility of contained nodes.
 */

import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { AppNode } from './BaseNode'
import { project, ISO_MATRIX } from '../../utils/iso'

export function IsoSubgraphNode({ data }: NodeProps<AppNode>) {
  const width = data.width ?? 300
  const height = data.height ?? 200
  const fill = data.fill ?? '#f8f9fa'
  const stroke = data.stroke ?? '#6c757d'
  const strokeWidth = data.strokeWidth ?? 2
  const opacity = data.opacity ?? 0.8

  // Project the corners of the flat rectangle into isometric space
  const corners = {
    topLeft: project(0, 0, 0),
    topRight: project(width, 0, 0),
    bottomRight: project(width, height, 0),
    bottomLeft: project(0, height, 0),
  }

  // Calculate SVG bounds
  const allPoints = Object.values(corners)
  const xs = allPoints.map(p => p.x)
  const ys = allPoints.map(p => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  const padding = 5
  const svgWidth = maxX - minX + padding * 2
  const svgHeight = maxY - minY + padding * 2
  const offsetX = -minX + padding
  const offsetY = -minY + padding

  // Transform to SVG coordinates
  const t = (p: { x: number; y: number }) => ({
    x: p.x + offsetX,
    y: p.y + offsetY,
  })

  const c = {
    topLeft: t(corners.topLeft),
    topRight: t(corners.topRight),
    bottomRight: t(corners.bottomRight),
    bottomLeft: t(corners.bottomLeft),
  }

  // Create the projected rhombus shape
  const rhombusPoints = [
    c.topLeft,
    c.topRight,
    c.bottomRight,
    c.bottomLeft,
  ].map(p => `${p.x},${p.y}`).join(' ')

  // Calculate side centers for handles (on the rhombus edges)
  const sideCenters = {
    // Top edge of rhombus (going from topLeft to topRight = down-right direction)
    top: {
      x: (c.topLeft.x + c.topRight.x) / 2,
      y: (c.topLeft.y + c.topRight.y) / 2,
    },
    // Right edge (going from topRight to bottomRight = down-left direction)
    right: {
      x: (c.topRight.x + c.bottomRight.x) / 2,
      y: (c.topRight.y + c.bottomRight.y) / 2,
    },
    // Bottom edge (going from bottomLeft to bottomRight)
    bottom: {
      x: (c.bottomLeft.x + c.bottomRight.x) / 2,
      y: (c.bottomLeft.y + c.bottomRight.y) / 2,
    },
    // Left edge (going from topLeft to bottomLeft)
    left: {
      x: (c.topLeft.x + c.bottomLeft.x) / 2,
      y: (c.topLeft.y + c.bottomLeft.y) / 2,
    },
  }

  // Label position at center of rhombus
  const labelX = (c.topLeft.x + c.bottomRight.x) / 2
  const labelY = (c.topLeft.y + c.bottomRight.y) / 2

  return (
    <div
      style={{
        width: `${svgWidth}px`,
        height: `${svgHeight}px`,
        position: 'relative',
        opacity,
      }}
    >
      <svg width={svgWidth} height={svgHeight} style={{ overflow: 'visible' }}>
        {/* Projected flat rectangle (rhombus) */}
        <polygon
          points={rhombusPoints}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray="4 2"
        />

        {/* Label at center with isometric transform */}
        <text
          x="0"
          y="0"
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="12"
          fill={stroke}
          fontWeight="600"
          transform={`translate(${labelX}, ${labelY - 20}) ${ISO_MATRIX}`}
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          {data.label}
        </text>
      </svg>

      {/* Handles at side centers */}
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        style={{
          position: 'absolute',
          left: sideCenters.top.x,
          top: sideCenters.top.y,
          width: 8,
          height: 8,
          background: stroke,
          transform: 'translate(-50%, -50%)',
        }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        style={{
          position: 'absolute',
          left: sideCenters.bottom.x,
          top: sideCenters.bottom.y,
          width: 8,
          height: 8,
          background: stroke,
          transform: 'translate(-50%, -50%)',
        }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        style={{
          position: 'absolute',
          left: sideCenters.left.x,
          top: sideCenters.left.y,
          width: 8,
          height: 8,
          background: stroke,
          transform: 'translate(-50%, -50%)',
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        style={{
          position: 'absolute',
          left: sideCenters.right.x,
          top: sideCenters.right.y,
          width: 8,
          height: 8,
          background: stroke,
          transform: 'translate(-50%, -50%)',
        }}
      />
    </div>
  )
}
