/**
 * Isometric rectangle node component with 3D box rendering
 *
 * Uses the same projection and face geometry as isomaid's iso-shapes.ts
 * to ensure visual consistency with the non-ReactFlow renderer.
 */

import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { AppNode } from './BaseNode'
import { project, adjustColor, getFaceShading, DEFAULT_Z_HEIGHT, ISO_MATRIX } from '../../utils/iso'

export function IsoRectNode({ data }: NodeProps<AppNode>) {
  const width = data.width ?? 120
  const height = data.height ?? 60
  const depth = DEFAULT_Z_HEIGHT
  const fill = data.fill ?? '#e3f2fd'

  // Calculate corners in local coordinates (0,0 is front-left corner)
  // Match isomaid's coordinate convention:
  // - +X goes toward "right" of screen (down-right at 30°)
  // - +Y goes toward "left" of screen (down-left at 30°)
  // - +Z goes up
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

  // Create faces matching isomaid's isoBox:
  // - Right face (+X side): frontRight to backRight edge
  // - Left face (+Y side, appears on left of screen): backLeft to backRight edge (the "front" in viewer's perspective)
  // - Top face: all top corners

  // Right face (+X edge) - appears on RIGHT of screen
  const rightFace = [
    c.topFrontRight,
    c.topBackRight,
    c.backRight,
    c.frontRight,
  ].map(p => `${p.x},${p.y}`).join(' ')

  // Left face (+Y edge) - appears on LEFT of screen
  // This is the "front" face from the viewer's perspective
  const leftFace = [
    c.topBackLeft,
    c.topBackRight,
    c.backRight,
    c.backLeft,
  ].map(p => `${p.x},${p.y}`).join(' ')

  // Top face
  const topFace = [
    c.topFrontLeft,
    c.topFrontRight,
    c.topBackRight,
    c.topBackLeft,
  ].map(p => `${p.x},${p.y}`).join(' ')

  // Apply shading (using adjustColor from isomaid)
  const topColor = adjustColor(fill, getFaceShading('top'))
  const leftColor = adjustColor(fill, getFaceShading('left'))
  const rightColor = adjustColor(fill, getFaceShading('right'))

  return (
    <div
      style={{
        width: `${svgWidth}px`,
        height: `${svgHeight}px`,
        position: 'relative',
      }}
    >
      <svg width={svgWidth} height={svgHeight} style={{ overflow: 'visible' }}>
        {/* Render faces back-to-front for proper layering */}
        {/* Right face (+X side) */}
        <polygon
          points={rightFace}
          fill={rightColor}
        />
        {/* Left face (+Y side, appears on left of screen) */}
        <polygon
          points={leftFace}
          fill={leftColor}
        />
        {/* Top face (always on top) */}
        <polygon
          points={topFace}
          fill={topColor}
        />

        {/* Label on top face - use isometric matrix transform */}
        {(() => {
          // Calculate center of top face in projected coordinates
          const topCenterX = (c.topFrontLeft.x + c.topFrontRight.x + c.topBackRight.x + c.topBackLeft.x) / 4
          const topCenterY = (c.topFrontLeft.y + c.topFrontRight.y + c.topBackRight.y + c.topBackLeft.y) / 4
          return (
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
          )
        })()}
      </svg>

      {/* Handles positioned at the CENTER of each SIDE of the bottom diamond */}
      {/* Calculate side centers (midpoints between corners) */}
      {(() => {
        const sideCenters = {
          // Right side: midpoint between backRight and frontRight
          right: {
            x: (c.backRight.x + c.frontRight.x) / 2,
            y: (c.backRight.y + c.frontRight.y) / 2,
          },
          // Front side: midpoint between frontRight and frontLeft
          front: {
            x: (c.frontRight.x + c.frontLeft.x) / 2,
            y: (c.frontRight.y + c.frontLeft.y) / 2,
          },
          // Left side: midpoint between frontLeft and backLeft
          left: {
            x: (c.frontLeft.x + c.backLeft.x) / 2,
            y: (c.frontLeft.y + c.backLeft.y) / 2,
          },
          // Back side: midpoint between backLeft and backRight
          back: {
            x: (c.backLeft.x + c.backRight.x) / 2,
            y: (c.backLeft.y + c.backRight.y) / 2,
          },
        }
        return (
          <>
            {/* Back side center (north) - target */}
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
            {/* Front side center (south) - source */}
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
            {/* Left side center (west) */}
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
            {/* Right side center (east) */}
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
          </>
        )
      })()}
    </div>
  )
}
