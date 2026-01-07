/**
 * Floating edge component
 *
 * In flat mode: uses ReactFlow's smooth step path
 * In iso mode: uses isometric step paths following the iso grid axes
 */

import { memo } from 'react'
import { getSmoothStepPath, useInternalNode, type EdgeProps } from '@xyflow/react'
import type { AppEdge } from './types'
import { getFlatEdgeParams, getIsoEdgeParams, getIsoStepPath } from '../../utils/floating-edge-utils'

function FloatingFlatEdgeComponent({
  id,
  source,
  target,
  style,
  data,
}: EdgeProps<AppEdge>) {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)

  if (!sourceNode || !targetNode) {
    return null
  }

  const isIso = data?.viewMode === 'iso'

  // Edge styling - thicker and darker
  const strokeColor = '#1e293b' // slate-800
  const strokeWidth = 2.5

  if (isIso) {
    // Isometric edge - follows iso grid axes
    const { sx, sy, tx, ty } = getIsoEdgeParams(sourceNode, targetNode)
    const [edgePath, labelX, labelY] = getIsoStepPath(sx, sy, tx, ty, { borderRadius: 8 })

    return (
      <>
        {/* Arrow marker definition */}
        <defs>
          <marker
            id={`arrowhead-${id}`}
            markerWidth="12"
            markerHeight="12"
            refX="10"
            refY="6"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path
              d="M2,2 L10,6 L2,10 L4,6 Z"
              fill={strokeColor}
            />
          </marker>
        </defs>
        <path
          id={id}
          className="react-flow__edge-path"
          d={edgePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          markerEnd={`url(#arrowhead-${id})`}
          style={style}
        />
        {data?.label && (
          <text
            x={labelX}
            y={labelY - 10}
            textAnchor="middle"
            style={{ fontSize: '12px', fill: '#555' }}
          >
            {data.label}
          </text>
        )}
      </>
    )
  }

  // Flat edge - orthogonal step path
  const { sx, sy, tx, ty, sourcePos, targetPos } = getFlatEdgeParams(
    sourceNode,
    targetNode
  )

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: sourcePos,
    targetX: tx,
    targetY: ty,
    targetPosition: targetPos,
    offset: 25,
  })

  return (
    <>
      {/* Arrow marker definition */}
      <defs>
        <marker
          id={`arrowhead-${id}`}
          markerWidth="12"
          markerHeight="12"
          refX="10"
          refY="6"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path
            d="M2,2 L10,6 L2,10 L4,6 Z"
            fill={strokeColor}
          />
        </marker>
      </defs>
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        markerEnd={`url(#arrowhead-${id})`}
        style={style}
      />
      {data?.label && (
        <text
          x={labelX}
          y={labelY - 10}
          textAnchor="middle"
          style={{ fontSize: '12px', fill: '#555' }}
        >
          {data.label}
        </text>
      )}
    </>
  )
}

export const FloatingFlatEdge = memo(FloatingFlatEdgeComponent)
