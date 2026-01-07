/**
 * Subgraph node component for ReactFlow subflows
 *
 * In iso mode, renders as an isometric floor plane (diamond shape)
 * In flat mode, renders as a dashed rectangle container
 */

import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { AppNode } from './BaseNode'
import { project, adjustColor, ISO_MATRIX } from '../../utils/iso'

export function SubgraphNode({ data }: NodeProps<AppNode>) {
  const width = data.width ?? 300
  const height = data.height ?? 200
  const fill = data.fill ?? '#f8fafc'
  const stroke = data.stroke ?? '#94a3b8'
  const strokeWidth = data.strokeWidth ?? 2
  const opacity = data.opacity ?? 0.8
  const isIso = data.viewMode === 'iso'

  if (isIso) {
    // Isometric floor plane (flat diamond at z=0)
    // Project corners of the rectangle into isometric space
    const corners = {
      frontLeft: project(0, 0, 0),
      frontRight: project(width, 0, 0),
      backRight: project(width, height, 0),
      backLeft: project(0, height, 0),
    }

    // Calculate SVG bounds
    const allPoints = Object.values(corners)
    const xs = allPoints.map(p => p.x)
    const ys = allPoints.map(p => p.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)

    const padding = 10
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
      frontLeft: t(corners.frontLeft),
      frontRight: t(corners.frontRight),
      backRight: t(corners.backRight),
      backLeft: t(corners.backLeft),
    }

    // Floor plane as a diamond
    const floorPath = [
      c.frontLeft,
      c.frontRight,
      c.backRight,
      c.backLeft,
    ].map(p => `${p.x},${p.y}`).join(' ')

    // Slightly darker fill for floor
    const floorColor = adjustColor(fill, -5)

    // Calculate handle positions at side centers
    const sideCenters = {
      right: {
        x: (c.backRight.x + c.frontRight.x) / 2,
        y: (c.backRight.y + c.frontRight.y) / 2,
      },
      front: {
        x: (c.frontRight.x + c.frontLeft.x) / 2,
        y: (c.frontRight.y + c.frontLeft.y) / 2,
      },
      left: {
        x: (c.frontLeft.x + c.backLeft.x) / 2,
        y: (c.frontLeft.y + c.backLeft.y) / 2,
      },
      back: {
        x: (c.backLeft.x + c.backRight.x) / 2,
        y: (c.backLeft.y + c.backRight.y) / 2,
      },
    }

    // Label position near back corner
    const labelX = c.backLeft.x + 15
    const labelY = c.backLeft.y + 5

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
          {/* Floor plane */}
          <polygon
            points={floorPath}
            fill={floorColor}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeDasharray="8 4"
          />

          {/* Label with isometric transform */}
          <text
            x="0"
            y="0"
            fontSize="12"
            fontWeight="600"
            fill={stroke}
            transform={`translate(${labelX}, ${labelY}) ${ISO_MATRIX}`}
            style={{ userSelect: 'none', pointerEvents: 'none' }}
          >
            {data.label}
          </text>
        </svg>

        {/* Handles at isometric side centers */}
        <Handle
          type="target"
          position={Position.Top}
          id="back"
          style={{
            position: 'absolute',
            left: sideCenters.back.x,
            top: sideCenters.back.y,
            width: 8,
            height: 8,
            background: stroke,
            transform: 'translate(-50%, -50%)',
          }}
        />
        <Handle
          type="source"
          position={Position.Bottom}
          id="front"
          style={{
            position: 'absolute',
            left: sideCenters.front.x,
            top: sideCenters.front.y,
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

  // Flat appearance - dashed rectangle container
  return (
    <div
      style={{
        width: `${width}px`,
        height: `${height}px`,
        background: fill,
        border: `${strokeWidth}px dashed ${stroke}`,
        borderRadius: '8px',
        opacity,
        position: 'relative',
        boxSizing: 'border-box',
      }}
    >
      {/* Label at top of subgraph */}
      <div
        style={{
          position: 'absolute',
          top: '-12px',
          left: '12px',
          background: fill,
          padding: '0 8px',
          fontSize: '12px',
          fontWeight: 600,
          color: stroke,
          fontFamily: 'sans-serif',
        }}
      >
        {data.label}
      </div>

      {/* Handles on container edges */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: stroke, width: 8, height: 8 }}
      />
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: stroke, width: 8, height: 8 }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: stroke, width: 8, height: 8 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: stroke, width: 8, height: 8 }}
      />
    </div>
  )
}
