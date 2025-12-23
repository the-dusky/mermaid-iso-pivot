/**
 * SVG shape generators for different node types
 */

import type { Node } from '../model/types'

export interface ShapeResult {
  element: string // SVG element type (e.g., 'rect', 'path', 'g')
  attrs: Record<string, string | number>
  children?: ShapeResult[]
}

/**
 * Generate SVG for a rectangle node
 */
function rect(node: Node): ShapeResult {
  const w = node.width || 100
  const h = node.height || 40
  return {
    element: 'rect',
    attrs: {
      x: -w / 2,
      y: -h / 2,
      width: w,
      height: h,
      rx: 0,
      ry: 0,
    },
  }
}

/**
 * Generate SVG for a rounded rectangle node
 */
function round(node: Node): ShapeResult {
  const w = node.width || 100
  const h = node.height || 40
  return {
    element: 'rect',
    attrs: {
      x: -w / 2,
      y: -h / 2,
      width: w,
      height: h,
      rx: 10,
      ry: 10,
    },
  }
}

/**
 * Generate SVG for a stadium (pill) shape
 */
function stadium(node: Node): ShapeResult {
  const w = node.width || 100
  const h = node.height || 40
  return {
    element: 'rect',
    attrs: {
      x: -w / 2,
      y: -h / 2,
      width: w,
      height: h,
      rx: h / 2,
      ry: h / 2,
    },
  }
}

/**
 * Generate SVG for a cylinder (database) shape
 */
function cylinder(node: Node): ShapeResult {
  const w = node.width || 80
  const h = node.height || 60
  const ry = 8 // ellipse height for top/bottom

  // Path for cylinder: top ellipse + sides + bottom ellipse arc
  const d = [
    `M ${-w / 2} ${-h / 2 + ry}`, // Start left side below top ellipse
    `A ${w / 2} ${ry} 0 0 1 ${w / 2} ${-h / 2 + ry}`, // Top ellipse (right half)
    `A ${w / 2} ${ry} 0 0 1 ${-w / 2} ${-h / 2 + ry}`, // Top ellipse (left half, back)
    `L ${-w / 2} ${h / 2 - ry}`, // Left side down
    `A ${w / 2} ${ry} 0 0 0 ${w / 2} ${h / 2 - ry}`, // Bottom ellipse
    `L ${w / 2} ${-h / 2 + ry}`, // Right side up
  ].join(' ')

  return {
    element: 'g',
    attrs: {},
    children: [
      {
        element: 'path',
        attrs: { d, fill: 'inherit', stroke: 'inherit' },
      },
      // Top ellipse (visible lid)
      {
        element: 'ellipse',
        attrs: {
          cx: 0,
          cy: -h / 2 + ry,
          rx: w / 2,
          ry: ry,
          fill: 'inherit',
          stroke: 'inherit',
        },
      },
    ],
  }
}

/**
 * Generate SVG for a diamond (decision) shape
 */
function diamond(node: Node): ShapeResult {
  const w = node.width || 100
  const h = node.height || 60
  const points = [
    `0,${-h / 2}`, // top
    `${w / 2},0`, // right
    `0,${h / 2}`, // bottom
    `${-w / 2},0`, // left
  ].join(' ')

  return {
    element: 'polygon',
    attrs: { points },
  }
}

/**
 * Generate SVG for a circle shape
 */
function circle(node: Node): ShapeResult {
  const r = Math.min(node.width || 60, node.height || 60) / 2
  return {
    element: 'circle',
    attrs: { cx: 0, cy: 0, r },
  }
}

/**
 * Generate SVG for a hexagon shape
 */
function hexagon(node: Node): ShapeResult {
  const w = node.width || 100
  const h = node.height || 50
  const inset = w * 0.2
  const points = [
    `${-w / 2 + inset},${-h / 2}`,
    `${w / 2 - inset},${-h / 2}`,
    `${w / 2},0`,
    `${w / 2 - inset},${h / 2}`,
    `${-w / 2 + inset},${h / 2}`,
    `${-w / 2},0`,
  ].join(' ')

  return {
    element: 'polygon',
    attrs: { points },
  }
}

/**
 * Generate SVG for a parallelogram shape
 */
function parallelogram(node: Node): ShapeResult {
  const w = node.width || 100
  const h = node.height || 40
  const skew = 15
  const points = [
    `${-w / 2 + skew},${-h / 2}`,
    `${w / 2 + skew},${-h / 2}`,
    `${w / 2 - skew},${h / 2}`,
    `${-w / 2 - skew},${h / 2}`,
  ].join(' ')

  return {
    element: 'polygon',
    attrs: { points },
  }
}

/**
 * Generate SVG for a trapezoid shape
 */
function trapezoid(node: Node): ShapeResult {
  const w = node.width || 100
  const h = node.height || 40
  const inset = 15
  const points = [
    `${-w / 2 + inset},${-h / 2}`,
    `${w / 2 - inset},${-h / 2}`,
    `${w / 2},${h / 2}`,
    `${-w / 2},${h / 2}`,
  ].join(' ')

  return {
    element: 'polygon',
    attrs: { points },
  }
}

/**
 * Generate SVG for a subroutine (double-bordered rect) shape
 */
function subroutine(node: Node): ShapeResult {
  const w = node.width || 100
  const h = node.height || 40
  const inset = 8

  return {
    element: 'g',
    attrs: {},
    children: [
      {
        element: 'rect',
        attrs: {
          x: -w / 2,
          y: -h / 2,
          width: w,
          height: h,
        },
      },
      {
        element: 'line',
        attrs: {
          x1: -w / 2 + inset,
          y1: -h / 2,
          x2: -w / 2 + inset,
          y2: h / 2,
          stroke: 'inherit',
        },
      },
      {
        element: 'line',
        attrs: {
          x1: w / 2 - inset,
          y1: -h / 2,
          x2: w / 2 - inset,
          y2: h / 2,
          stroke: 'inherit',
        },
      },
    ],
  }
}

/**
 * Get the shape generator for a node
 */
export function getShape(node: Node): ShapeResult {
  const generators: Record<string, (n: Node) => ShapeResult> = {
    rect,
    round,
    stadium,
    cylinder,
    circle,
    diamond,
    hexagon,
    parallelogram,
    trapezoid,
    subroutine,
  }

  const generator = generators[node.shape] || rect
  return generator(node)
}
