/**
 * Cylinder (database) node component
 */

import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { AppNode } from './BaseNode'

export function CylinderNode({ data }: NodeProps<AppNode>) {
  const width = data.width ?? 120
  const height = data.height ?? 80
  const fill = data.fill ?? '#e8f5e9'
  const stroke = data.stroke ?? '#4caf50'
  const strokeWidth = data.strokeWidth ?? 2
  const opacity = data.opacity ?? 1

  return (
    <div
      style={{
        width: `${width}px`,
        height: `${height}px`,
        position: 'relative',
        opacity,
      }}
    >
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Cylinder body */}
        <ellipse
          cx={width / 2}
          cy={height * 0.15}
          rx={width / 2 - strokeWidth}
          ry={height * 0.15}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
        <rect
          x={strokeWidth}
          y={height * 0.15}
          width={width - strokeWidth * 2}
          height={height * 0.7}
          fill={fill}
          stroke="none"
        />
        <ellipse
          cx={width / 2}
          cy={height * 0.85}
          rx={width / 2 - strokeWidth}
          ry={height * 0.15}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
        {/* Side lines */}
        <line
          x1={strokeWidth}
          y1={height * 0.15}
          x2={strokeWidth}
          y2={height * 0.85}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
        <line
          x1={width - strokeWidth}
          y1={height * 0.15}
          x2={width - strokeWidth}
          y2={height * 0.85}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />

        {/* Label */}
        <text
          x={width / 2}
          y={height / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="14"
          fill="#000"
        >
          {data.label}
        </text>
      </svg>

      <Handle type="target" position={Position.Top} style={{ background: '#555' }} />
      <Handle type="target" position={Position.Left} style={{ background: '#555' }} />
      <Handle type="source" position={Position.Bottom} style={{ background: '#555' }} />
      <Handle type="source" position={Position.Right} style={{ background: '#555' }} />
    </div>
  )
}
