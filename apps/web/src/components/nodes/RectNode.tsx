/**
 * Rectangle node component
 *
 * In iso mode, renders with proper isometric projection (30° angles)
 * In flat mode, renders as a simple rectangle
 */

import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { AppNode } from './BaseNode'
import { project, adjustColor, getFaceShading, DEFAULT_Z_HEIGHT, ISO_MATRIX } from '../../utils/iso'

export function RectNode({ data }: NodeProps<AppNode>) {
  const width = data.width ?? 120
  const height = data.height ?? 60
  const fill = data.fill ?? '#e3f2fd'
  const stroke = data.stroke ?? '#93c5fd'
  const strokeWidth = data.strokeWidth ?? 2
  const opacity = data.opacity ?? 1
  const isIso = data.viewMode === 'iso'

  if (isIso) {
    // Proper isometric projection with 30° angles
    const depth = DEFAULT_Z_HEIGHT

    // Calculate corners using isometric projection
    // +X goes toward "right" of screen (down-right at 30°)
    // +Y goes toward "left" of screen (down-left at 30°)
    // +Z goes up
    const corners = {
      // Bottom face (z = 0)
      frontLeft: project(0, 0, 0),
      frontRight: project(width, 0, 0),
      backRight: project(width, height, 0),
      backLeft: project(0, height, 0),
      // Top face (z = depth)
      topFrontLeft: project(0, 0, depth),
      topFrontRight: project(width, 0, depth),
      topBackRight: project(width, height, depth),
      topBackLeft: project(0, height, depth),
    }

    // Calculate SVG bounds from projected corners
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
      frontLeft: t(corners.frontLeft),
      frontRight: t(corners.frontRight),
      backRight: t(corners.backRight),
      backLeft: t(corners.backLeft),
      topFrontLeft: t(corners.topFrontLeft),
      topFrontRight: t(corners.topFrontRight),
      topBackRight: t(corners.topBackRight),
      topBackLeft: t(corners.topBackLeft),
    }

    // Create faces with proper isometric geometry
    // Right face (+X edge) - appears on RIGHT of screen
    const rightFace = [
      c.topFrontRight,
      c.topBackRight,
      c.backRight,
      c.frontRight,
    ].map(p => `${p.x},${p.y}`).join(' ')

    // Left face (+Y edge) - appears on LEFT of screen
    const leftFace = [
      c.topBackLeft,
      c.topBackRight,
      c.backRight,
      c.backLeft,
    ].map(p => `${p.x},${p.y}`).join(' ')

    // Top face (diamond shape from above)
    const topFace = [
      c.topFrontLeft,
      c.topFrontRight,
      c.topBackRight,
      c.topBackLeft,
    ].map(p => `${p.x},${p.y}`).join(' ')

    // Apply proper shading for 3D illusion
    const topColor = adjustColor(fill, getFaceShading('top'))
    const leftColor = adjustColor(fill, getFaceShading('left'))
    const rightColor = adjustColor(fill, getFaceShading('right'))

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

    // Label position at center of top face
    const topCenterX = (c.topFrontLeft.x + c.topFrontRight.x + c.topBackRight.x + c.topBackLeft.x) / 4
    const topCenterY = (c.topFrontLeft.y + c.topFrontRight.y + c.topBackRight.y + c.topBackLeft.y) / 4

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
          {/* Render faces back-to-front for proper layering */}
          <polygon points={rightFace} fill={rightColor} />
          <polygon points={leftFace} fill={leftColor} />
          <polygon points={topFace} fill={topColor} />

          {/* Label on top face with isometric transform */}
          <text
            x="0"
            y="0"
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="14"
            fill="#333"
            fontWeight="600"
            transform={`translate(${topCenterX}, ${topCenterY}) ${ISO_MATRIX}`}
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
            background: '#555',
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
            background: '#555',
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
            background: '#555',
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
            background: '#555',
            transform: 'translate(-50%, -50%)',
          }}
        />
      </div>
    )
  }

  // Flat appearance - simple rectangle
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
