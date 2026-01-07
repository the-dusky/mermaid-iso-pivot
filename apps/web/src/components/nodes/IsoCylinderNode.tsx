/**
 * Isometric cylinder (database) node component
 *
 * Uses shared projection utilities from isomaid.
 */

import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { AppNode } from './BaseNode'
import { project, adjustColor, COS_ANGLE, DEFAULT_Z_HEIGHT, ISO_MATRIX } from '../../utils/iso'

export function IsoCylinderNode({ data }: NodeProps<AppNode>) {
  const width = data.width ?? 120
  const height = data.height ?? 80
  const depth = DEFAULT_Z_HEIGHT + 15 // Cylinders are taller
  const fill = data.fill ?? '#e8f5e9'

  const radiusX = width / 2
  const radiusY = height * 0.15

  // Project ellipse centers
  const topCenter = project(width / 2, height / 2, depth)
  const bottomCenter = project(width / 2, height / 2, 0)

  const padding = 40
  const svgWidth = width * COS_ANGLE * 2 + padding * 2
  const svgHeight = depth + height * 0.5 + radiusY * 2 + padding * 2
  const offsetX = svgWidth / 2
  const offsetY = padding + radiusY

  const topShade = adjustColor(fill, 0)
  const sideShade = adjustColor(fill, -20)

  return (
    <div
      style={{
        width: `${svgWidth}px`,
        height: `${svgHeight}px`,
        position: 'relative',
      }}
    >
      <svg width={svgWidth} height={svgHeight} style={{ overflow: 'visible' }}>
        {/* Bottom ellipse */}
        <ellipse
          cx={offsetX + bottomCenter.x}
          cy={offsetY + bottomCenter.y}
          rx={radiusX * COS_ANGLE}
          ry={radiusY}
          fill={sideShade}
        />

        {/* Cylinder sides */}
        <path
          d={`
            M ${offsetX + bottomCenter.x - radiusX * COS_ANGLE} ${offsetY + bottomCenter.y}
            L ${offsetX + topCenter.x - radiusX * COS_ANGLE} ${offsetY + topCenter.y}
            L ${offsetX + topCenter.x + radiusX * COS_ANGLE} ${offsetY + topCenter.y}
            L ${offsetX + bottomCenter.x + radiusX * COS_ANGLE} ${offsetY + bottomCenter.y}
            Z
          `}
          fill={sideShade}
        />

        {/* Top ellipse */}
        <ellipse
          cx={offsetX + topCenter.x}
          cy={offsetY + topCenter.y}
          rx={radiusX * COS_ANGLE}
          ry={radiusY}
          fill={topShade}
        />

        {/* Label with isometric transform */}
        <text
          x="0"
          y="0"
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="14"
          fill="#333"
          fontWeight="600"
          transform={`translate(${offsetX + topCenter.x}, ${offsetY + topCenter.y}) ${ISO_MATRIX}`}
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          {data.label}
        </text>
      </svg>

      {/* Handles for ReactFlow connection system */}
      {/* These are small but interactive; floating edges calculate visual connection points */}
      <Handle
        type="target"
        position={Position.Top}
        id="target"
        style={{
          width: 8,
          height: 8,
          background: '#555',
        }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="source"
        style={{
          width: 8,
          height: 8,
          background: '#555',
        }}
      />
    </div>
  )
}
