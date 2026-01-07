/**
 * Rounded rectangle node component
 */

import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { AppNode } from './BaseNode'

export function RoundNode({ data }: NodeProps<AppNode>) {
  const width = data.width ?? 120
  const height = data.height ?? 60
  const fill = data.fill ?? '#f3e5f5'
  const stroke = data.stroke ?? '#9c27b0'
  const strokeWidth = data.strokeWidth ?? 2
  const opacity = data.opacity ?? 1

  return (
    <div
      style={{
        width: `${width}px`,
        height: `${height}px`,
        background: fill,
        border: `${strokeWidth}px solid ${stroke}`,
        borderRadius: '16px', // More rounded than rect
        opacity,
        padding: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '14px',
        fontFamily: 'sans-serif',
        color: '#000',
        boxSizing: 'border-box',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: '#555' }} />
      <Handle type="target" position={Position.Left} style={{ background: '#555' }} />
      <Handle type="source" position={Position.Bottom} style={{ background: '#555' }} />
      <Handle type="source" position={Position.Right} style={{ background: '#555' }} />

      <div style={{ textAlign: 'center', wordBreak: 'break-word' }}>
        {data.label}
      </div>
    </div>
  )
}
