/**
 * Base component for custom ReactFlow nodes
 */

import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'

export type NodeData = {
  label: string
  width?: number
  height?: number
  fill?: string
  stroke?: string
  strokeWidth?: number
  opacity?: number
  isSubgraph?: boolean
  children?: string[]
  parent?: string
  ports?: any[]
  viewMode?: 'flat' | 'iso'
}

// Full node type for ReactFlow v12 compatibility
export type AppNode = Node<NodeData, string>

export function BaseNode({ data }: NodeProps<AppNode>) {
  const width = data.width ?? 120
  const height = data.height ?? 60
  const fill = data.fill ?? '#f0f0f0'
  const stroke = data.stroke ?? '#333'
  const strokeWidth = data.strokeWidth ?? 2
  const opacity = data.opacity ?? 1

  return (
    <div
      style={{
        width: `${width}px`,
        height: `${height}px`,
        background: fill,
        border: `${strokeWidth}px solid ${stroke}`,
        borderRadius: '4px',
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
      {/* Handles for connections */}
      <Handle type="target" position={Position.Top} style={{ background: '#555' }} />
      <Handle type="target" position={Position.Left} style={{ background: '#555' }} />
      <Handle type="source" position={Position.Bottom} style={{ background: '#555' }} />
      <Handle type="source" position={Position.Right} style={{ background: '#555' }} />

      {/* Label */}
      <div style={{ textAlign: 'center', wordBreak: 'break-word' }}>
        {data.label}
      </div>
    </div>
  )
}
