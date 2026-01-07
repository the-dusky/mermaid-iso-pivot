/**
 * Custom background component that supports both flat and isometric grids
 *
 * Isometric grid follows the project's isometric projection:
 * - X axis: (COS_30°, SIN_30°) = (0.866, 0.5) goes down-right
 * - Y axis: (-COS_30°, SIN_30°) = (-0.866, 0.5) goes down-left
 */

import { useStore, type ReactFlowState } from '@xyflow/react'
import { useMemo } from 'react'

// Isometric constants (must match iso.ts)
const COS_30 = Math.cos(Math.PI / 6) // ~0.866
const SIN_30 = Math.sin(Math.PI / 6) // 0.5

interface IsoBackgroundProps {
  isometric?: boolean
  gap?: number
  color?: string
}

const selector = (s: ReactFlowState) => ({
  transform: s.transform,
})

export function IsoBackground({
  isometric = false,
  gap = 20,
  color = '#e0e0e0',
}: IsoBackgroundProps) {
  const { transform } = useStore(selector)
  const [x, y, scale] = transform

  const scaledGap = gap * scale
  const patternId = isometric ? 'iso-grid-pattern' : 'flat-grid-pattern'

  // For isometric grid:
  // - One set of lines follows X direction: going down-right (slope = SIN_30/COS_30 ≈ 0.577)
  // - One set of lines follows Y direction: going down-left (slope = -SIN_30/COS_30 ≈ -0.577)
  //
  // Pattern dimensions to create a rhombus tile:
  // - Width: 2 * COS_30 * gap (horizontal span of one grid unit in both directions)
  // - Height: SIN_30 * gap (vertical span for one grid unit)
  const isoPatternWidth = scaledGap * COS_30 * 2
  const isoPatternHeight = scaledGap * SIN_30 * 2

  const flatPattern = useMemo(
    () => (
      <pattern
        id={patternId}
        x={x % scaledGap}
        y={y % scaledGap}
        width={scaledGap}
        height={scaledGap}
        patternUnits="userSpaceOnUse"
      >
        <path
          d={`M ${scaledGap} 0 L 0 0 0 ${scaledGap}`}
          fill="none"
          stroke={color}
          strokeWidth={1}
        />
      </pattern>
    ),
    [patternId, x, y, scaledGap, color]
  )

  const isoPattern = useMemo(
    () => {
      // Calculate the offset within the pattern for seamless tiling
      const offsetX = ((x % isoPatternWidth) + isoPatternWidth) % isoPatternWidth
      const offsetY = ((y % isoPatternHeight) + isoPatternHeight) % isoPatternHeight

      return (
        <pattern
          id={patternId}
          x={offsetX}
          y={offsetY}
          width={isoPatternWidth}
          height={isoPatternHeight}
          patternUnits="userSpaceOnUse"
        >
          {/* Isometric grid with correct 30° angles */}
          {/* Lines must go corner to corner for slope = H/W = SIN_30/COS_30 = 0.577 */}

          {/* Down-right line (following X axis direction) */}
          <line
            x1={0}
            y1={0}
            x2={isoPatternWidth}
            y2={isoPatternHeight}
            stroke={color}
            strokeWidth={1}
          />

          {/* Down-left line (following Y axis direction) */}
          <line
            x1={isoPatternWidth}
            y1={0}
            x2={0}
            y2={isoPatternHeight}
            stroke={color}
            strokeWidth={1}
          />
        </pattern>
      )
    },
    [patternId, x, y, isoPatternWidth, isoPatternHeight, color]
  )

  return (
    <svg
      className="react-flow__background"
      style={{
        position: 'absolute',
        width: '100%',
        height: '100%',
        top: 0,
        left: 0,
        pointerEvents: 'none',
      }}
    >
      <defs>{isometric ? isoPattern : flatPattern}</defs>
      <rect x="0" y="0" width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  )
}
