/**
 * Diamond (decision) node component
 */

import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { AppNode } from './BaseNode'

export function DiamondNode({ data }: NodeProps<AppNode>) {
  const width = data.width ?? 100
  const height = data.height ?? 100
  const fill = data.fill ?? '#fff3e0'
  const stroke = data.stroke ?? '#ff9800'
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
        {/* Diamond shape */}
        <path
          d={`M ${width/2} ${strokeWidth} L ${width - strokeWidth} ${height/2} L ${width/2} ${height - strokeWidth} L ${strokeWidth} ${height/2} Z`}
          fill={fill}
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
