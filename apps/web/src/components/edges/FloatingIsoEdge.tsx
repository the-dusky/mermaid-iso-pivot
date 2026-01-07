/**
 * Floating isometric edge component
 *
 * Calculates connection points dynamically based on node positions,
 * connecting at the bottom face corners of the isometric box.
 */

import { memo } from 'react'
import { useInternalNode, type EdgeProps } from '@xyflow/react'
import type { AppEdge } from './types'
import { getIsoEdgeParams, getIsoStepPath } from '../../utils/floating-edge-utils'

function FloatingIsoEdgeComponent({
  id,
  source,
  target,
  markerEnd,
  markerStart,
  style,
  data,
}: EdgeProps<AppEdge>) {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)

  if (!sourceNode || !targetNode) {
    return null
  }

  const { sx, sy, tx, ty } = getIsoEdgeParams(sourceNode, targetNode)

  // Use isometric step path that follows the iso grid axes
  const [edgePath, labelX, labelY] = getIsoStepPath(sx, sy, tx, ty, {
    borderRadius: 8,
  })

  return (
    <>
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        fill="none"
        stroke="#b1b1b7"
        strokeWidth={2}
        markerEnd={markerEnd}
        markerStart={markerStart}
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

export const FloatingIsoEdge = memo(FloatingIsoEdgeComponent)
