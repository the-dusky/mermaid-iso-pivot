/**
 * SVG renderer for arch-explorer
 *
 * Renders a positioned Graph to SVG elements.
 * Supports flat (2D) and isometric (3D) view modes.
 *
 * Isometric mode uses true isometric projection (Cloudcraft-style):
 * - No CSS transform hacks
 * - Proper 3D cube geometry with top/right/front faces
 * - Isometric grid floor for spatial context
 */

import type { Graph, Node, Edge, ViewMode } from '../model/types'
import { getShape, type ShapeResult } from './shapes'
import { getIsoShape, isoGrid, isoProject, isoDepth, adjustColor } from './iso-shapes'
import { getGraphBounds } from '../layout'
import { generateFlatGrid } from '../grid'

export interface RenderOptions {
  /** View mode: flat or isometric */
  viewMode?: ViewMode
  /** Padding around the graph */
  padding?: number
  /** Node fill color */
  nodeFill?: string
  /** Node stroke color */
  nodeStroke?: string
  /** Edge stroke color */
  edgeStroke?: string
  /** Subgraph fill color */
  subgraphFill?: string
  /** Font family */
  fontFamily?: string
  /** Font size */
  fontSize?: number
  /** Show grid in isometric mode */
  showGrid?: boolean
  /** Show port indicators on nodes */
  showPorts?: boolean
}

const DEFAULT_OPTIONS: Required<RenderOptions> = {
  viewMode: 'flat',
  padding: 40,
  nodeFill: '#ffffff',
  nodeStroke: '#333333',
  edgeStroke: '#666666',
  subgraphFill: '#f5f5f5',
  fontFamily: 'system-ui, sans-serif',
  fontSize: 14,
  showGrid: true,
  showPorts: true,
}

// Z-height for isometric node extrusion
const ISO_Z_HEIGHT = 20

/**
 * Convert ShapeResult to SVG string (for flat mode)
 */
function shapeToSvg(shape: ShapeResult, extraAttrs: Record<string, string> = {}): string {
  const allAttrs = { ...shape.attrs, ...extraAttrs }
  const attrStr = Object.entries(allAttrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ')

  if (shape.children && shape.children.length > 0) {
    const childSvg = shape.children.map(c => shapeToSvg(c)).join('\n')
    return `<${shape.element} ${attrStr}>\n${childSvg}\n</${shape.element}>`
  }

  if (shape.element === 'g') {
    return `<${shape.element} ${attrStr}></${shape.element}>`
  }

  return `<${shape.element} ${attrStr} />`
}

/**
 * Helper to render ports for a node
 * Works for both flat and iso modes via coordinate transformation
 */
type CoordTransform = (x: number, y: number, z: number) => { sx: number; sy: number }

interface PortUsage {
  usedPorts: Set<string>  // port keys that have edges connected
  isTargetNode: boolean    // whether this node is a target of any edge
}

/**
 * Calculate which ports are used by edges
 */
function calculatePortUsage(node: Node, edges: Edge[]): PortUsage {
  const usedPorts = new Set<string>()
  let isTargetNode = false

  for (const edge of edges) {
    // Check if this node is a source (outgoing edge)
    if (edge.from === node.id && edge.points && edge.points.length > 0) {
      const firstPoint = edge.points[0]
      // Find the port closest to the first edge point (source port)
      if (node.ports) {
        for (const port of node.ports) {
          if (port.cornerX !== undefined && port.cornerY !== undefined) {
            const dist = Math.hypot(port.cornerX - firstPoint.x, port.cornerY - firstPoint.y)
            if (dist < 1) { // Tolerance for floating point comparison
              const portKey = `${port.nodeId}:${port.cornerX},${port.cornerY}`
              usedPorts.add(portKey)
              break
            }
          }
        }
      }
    }

    // Check if this node is a target (incoming edge)
    if (edge.to === node.id) {
      isTargetNode = true
      if (edge.points && edge.points.length > 0) {
        const lastPoint = edge.points[edge.points.length - 1]
        // Find the port closest to the last edge point (target port)
        if (node.ports) {
          for (const port of node.ports) {
            if (port.cornerX !== undefined && port.cornerY !== undefined) {
              const dist = Math.hypot(port.cornerX - lastPoint.x, port.cornerY - lastPoint.y)
              if (dist < 1) { // Tolerance for floating point comparison
                const portKey = `${port.nodeId}:${port.cornerX},${port.cornerY}`
                usedPorts.add(portKey)
                break
              }
            }
          }
        }
      }
    }
  }

  return { usedPorts, isTargetNode }
}

function renderNodePorts(
  node: Node,
  opts: Required<RenderOptions>,
  transform: CoordTransform,
  usage: PortUsage
): string {
  if (!node.ports || node.ports.length === 0) {
    return ''
  }

  let portsSvg = ''
  const isIso = opts.viewMode === 'iso'

  for (const port of node.ports) {
    const side = port.side || 'R'

    // Create a unique key for this port (using corner position)
    const portKey = `${port.nodeId}:${port.cornerX},${port.cornerY}`
    const isPortUsed = usage.usedPorts.has(portKey)

    // Get transformed positions
    const cornerPos = port.cornerX !== undefined && port.cornerY !== undefined
      ? transform(port.cornerX, port.cornerY, 0)
      : null
    const farPos = port.farX !== undefined && port.farY !== undefined
      ? transform(port.farX, port.farY, 0)
      : null
    const closePos = port.closeX !== undefined && port.closeY !== undefined
      ? transform(port.closeX, port.closeY, 0)
      : null

    // Draw connection lines (only if port is used by an edge)
    // Flat mode: All sides uniform (corner → far → close, arrow at close)
    // Iso mode: Top/Left (corner → far, arrow at far), Right/Bottom (corner → far → close, arrow at close)
    const useShortConnection = isIso && (side === 'T' || side === 'L')

    if (isPortUsed && useShortConnection) {
      // Top and Left in iso: line from corner to far, arrow at far
      if (cornerPos && farPos && port.cornerX !== undefined && port.cornerY !== undefined && port.farX !== undefined && port.farY !== undefined) {
        portsSvg += `<line
          x1="${cornerPos.sx}"
          y1="${cornerPos.sy}"
          x2="${farPos.sx}"
          y2="${farPos.sy}"
          stroke="${opts.edgeStroke}"
          stroke-width="1.5"
          class="port-connection"
        />`

        // Arrow at far position - only if this is a target node
        if (usage.isTargetNode) {
          // Calculate direction in world space (before projection)
          const dx = port.farX - port.cornerX
          const dy = port.farY - port.cornerY
          const len = Math.sqrt(dx * dx + dy * dy)
          if (len > 0) {
            const nx = dx / len
            const ny = dy / len
            const px = -ny
            const py = nx
            const arrowSize = 4
            const arrowExtend = 3  // Extend tip beyond line

            // Create arrow vertices in world space
            const tip3D = {
              x: port.farX + nx * arrowExtend,
              y: port.farY + ny * arrowExtend,
            }
            const left3D = {
              x: port.farX - nx * arrowSize + px * arrowSize,
              y: port.farY - ny * arrowSize + py * arrowSize,
            }
            const right3D = {
              x: port.farX - nx * arrowSize - px * arrowSize,
              y: port.farY - ny * arrowSize - py * arrowSize,
            }

            // Project each vertex
            const tipPos = transform(tip3D.x, tip3D.y, 0)
            const leftPos = transform(left3D.x, left3D.y, 0)
            const rightPos = transform(right3D.x, right3D.y, 0)

            portsSvg += `<polygon
              points="${tipPos.sx},${tipPos.sy} ${leftPos.sx},${leftPos.sy} ${rightPos.sx},${rightPos.sy}"
              fill="${opts.edgeStroke}"
              class="port-arrow"
            />`
          }
        }
      }
    } else if (isPortUsed) {
      // All other cases: line from corner to far to close, arrow at close
      if (cornerPos && farPos && closePos) {
        // Line: corner → far → close (single continuous path)
        portsSvg += `<polyline
          points="${cornerPos.sx},${cornerPos.sy} ${farPos.sx},${farPos.sy} ${closePos.sx},${closePos.sy}"
          fill="none"
          stroke="${opts.edgeStroke}"
          stroke-width="1.5"
          class="port-connection"
        />`

        // Arrow at close position - only if this is a target node
        if (usage.isTargetNode && port.closeX !== undefined && port.closeY !== undefined && port.farX !== undefined && port.farY !== undefined) {
          const dx = port.closeX - port.farX
          const dy = port.closeY - port.farY
          const len = Math.sqrt(dx * dx + dy * dy)
          if (len > 0) {
            const nx = dx / len
            const ny = dy / len
            const px = -ny
            const py = nx
            const arrowSize = 4
            const arrowExtend = 3  // Extend tip beyond line

            // Create arrow vertices in world space
            const tip3D = {
              x: port.closeX + nx * arrowExtend,
              y: port.closeY + ny * arrowExtend,
            }
            const left3D = {
              x: port.closeX - nx * arrowSize + px * arrowSize,
              y: port.closeY - ny * arrowSize + py * arrowSize,
            }
            const right3D = {
              x: port.closeX - nx * arrowSize - px * arrowSize,
              y: port.closeY - ny * arrowSize - py * arrowSize,
            }

            // Project each vertex
            const tipPos = transform(tip3D.x, tip3D.y, 0)
            const leftPos = transform(left3D.x, left3D.y, 0)
            const rightPos = transform(right3D.x, right3D.y, 0)

            portsSvg += `<polygon
              points="${tipPos.sx},${tipPos.sy} ${leftPos.sx},${leftPos.sy} ${rightPos.sx},${rightPos.sy}"
              fill="${opts.edgeStroke}"
              class="port-arrow"
            />`
          }
        }
      }
    }

    // Port circles - only show when showPorts is enabled
    if (opts.showPorts) {
      // Red corner port (routing waypoint)
      if (cornerPos) {
        portsSvg += `<circle
          cx="${cornerPos.sx}"
          cy="${cornerPos.sy}"
          r="4"
          fill="#ef4444"
          stroke="#dc2626"
          stroke-width="1.5"
          class="port port-corner"
        />`
      }

      // Blue far port (extended)
      if (farPos) {
        portsSvg += `<circle
          cx="${farPos.sx}"
          cy="${farPos.sy}"
          r="4"
          fill="#3b82f6"
          stroke="#2563eb"
          stroke-width="1.5"
          class="port port-far"
        />`
      }

      // Green close port (at surface)
      if (closePos) {
        portsSvg += `<circle
          cx="${closePos.sx}"
          cy="${closePos.sy}"
          r="4"
          fill="#22c55e"
          stroke="#16a34a"
          stroke-width="1.5"
          class="port port-close"
        />`
      }
    }
  }

  return portsSvg
}

/**
 * Render a node in flat mode
 */
function renderFlatNode(node: Node, opts: Required<RenderOptions>, edges: Edge[]): string {
  if (node.x === undefined || node.y === undefined) {
    console.warn(`Node ${node.id} has no position`)
    return ''
  }

  const fill = node.style?.fill || (node.isSubgraph ? opts.subgraphFill : opts.nodeFill)
  const stroke = node.style?.stroke || opts.nodeStroke
  const opacity = node.style?.opacity ?? 1

  const shape = getShape(node)
  const shapeAttrs = {
    fill,
    stroke,
    'stroke-width': String(node.style?.strokeWidth ?? 1.5),
  }

  const shapeSvg = shapeToSvg(shape, shapeAttrs)

  // Position text differently for subgraphs vs regular nodes
  // Subgraphs: text inside at bottom (so it won't be covered by inner nodes)
  // Regular nodes: text centered
  const nodeHeight = node.height || 40
  let textSvg: string
  if (node.isSubgraph) {
    const textOffsetY = nodeHeight / 2 - 16 // Inside, near bottom edge
    textSvg = `<text
      x="0"
      y="${textOffsetY}"
      text-anchor="middle"
      dominant-baseline="central"
      font-family="${opts.fontFamily}"
      font-size="${opts.fontSize}"
      fill="#333"
      font-weight="600"
    >${escapeHtml(node.label)}</text>`
  } else {
    textSvg = `<text
      x="0"
      y="0"
      text-anchor="middle"
      dominant-baseline="central"
      font-family="${opts.fontFamily}"
      font-size="${opts.fontSize}"
      fill="#333"
    >${escapeHtml(node.label)}</text>`
  }

  // Render ports - flat mode uses identity transform (relative to node center)
  const flatTransform: CoordTransform = (x, y, _z) => ({
    sx: x - node.x!,
    sy: y - node.y!,
  })
  const portUsage = calculatePortUsage(node, edges)
  const portsSvg = renderNodePorts(node, opts, flatTransform, portUsage)

  return `<g
    class="node ${node.isSubgraph ? 'subgraph' : ''}"
    data-id="${node.id}"
    transform="translate(${node.x}, ${node.y})"
    opacity="${opacity}"
  >
    ${shapeSvg}
    ${textSvg}
    ${portsSvg}
  </g>`
}

/**
 * Render a node in isometric mode as a 3D box
 */
function renderIsoNode(node: Node, opts: Required<RenderOptions>, edges: Edge[]): string {
  if (node.x === undefined || node.y === undefined) {
    console.warn(`Node ${node.id} has no position`)
    return ''
  }

  const isSubgraph = node.isSubgraph || false
  const fill = node.style?.fill || (isSubgraph ? opts.subgraphFill : opts.nodeFill)
  const stroke = node.style?.stroke || opts.nodeStroke
  const opacity = node.style?.opacity ?? 1

  // Get isometric shape - subgraphs render as flat platforms
  const isoShape = getIsoShape(node, isSubgraph)

  // Sort faces by depth (lower depth = render first = behind)
  const sortedFaces = [...isoShape.faces].sort((a, b) => a.depth - b.depth)

  // Render each face as a polygon
  const facesSvg = sortedFaces
    .map(face => {
      const faceFill = adjustColor(fill, face.colorOffset)
      return `<polygon
        points="${face.points}"
        fill="${faceFill}"
        stroke="${stroke}"
        stroke-width="1"
        class="iso-face iso-${face.type}"
      />`
    })
    .join('\n')

  // Position text differently for subgraphs vs 3D nodes
  // - Subgraphs: text inside container at bottom (so it won't be covered by inner nodes)
  // - 3D nodes: text on top of the box
  const nodeHeight = node.height || 40
  const nodeWidth = node.width || 100
  const cos30 = 0.866
  const sin30 = 0.5

  let textSvg: string
  if (isSubgraph) {
    // Subgraph: text inside container, positioned near the bottom-front edge
    // This ensures it won't be covered by inner containers/nodes
    // Position at bottom of container (high Y = front in iso), slightly inset
    const textOffsetY = nodeHeight / 2 - 16 // Inside, near bottom edge
    const textPos = isoProject(node.x, node.y + textOffsetY, 0)
    const isoMatrix = `matrix(${cos30}, ${sin30}, ${-cos30}, ${sin30}, ${textPos.sx}, ${textPos.sy})`
    textSvg = `<text
      x="0"
      y="0"
      text-anchor="middle"
      dominant-baseline="central"
      font-family="${opts.fontFamily}"
      font-size="${opts.fontSize}"
      fill="#333"
      font-weight="600"
      transform="${isoMatrix}"
    >${escapeHtml(node.label)}</text>`
  } else {
    // 3D node: text on top of the box
    const textPos = isoProject(node.x, node.y, ISO_Z_HEIGHT)
    const isoMatrix = `matrix(${cos30}, ${sin30}, ${-cos30}, ${sin30}, ${textPos.sx}, ${textPos.sy})`
    textSvg = `<text
      x="0"
      y="0"
      text-anchor="middle"
      dominant-baseline="central"
      font-family="${opts.fontFamily}"
      font-size="${opts.fontSize}"
      fill="#333"
      transform="${isoMatrix}"
    >${escapeHtml(node.label)}</text>`
  }

  // Render ports - iso mode uses isoProject transform
  // Ports are at Z=0 (flat on the ground)
  const portUsage = calculatePortUsage(node, edges)
  const portsSvg = renderNodePorts(node, opts, isoProject, portUsage)

  return `<g
    class="node iso-node ${node.isSubgraph ? 'subgraph' : ''}"
    data-id="${node.id}"
    opacity="${opacity}"
  >
    ${facesSvg}
    ${textSvg}
    ${portsSvg}
  </g>`
}

/**
 * Get edge style properties (stroke dash, width)
 */
function getEdgeStyle(edge: Edge): { strokeDasharray: string; strokeWidth: number } {
  let strokeDasharray = ''
  if (edge.style === 'dashed') strokeDasharray = '5,5'
  else if (edge.style === 'dotted') strokeDasharray = '2,2'

  const strokeWidth = edge.style === 'thick' ? 3 : 1.5

  return { strokeDasharray, strokeWidth }
}

/**
 * Render an edge in flat mode
 */
function renderFlatEdge(edge: Edge, opts: Required<RenderOptions>, edgeLabel?: string): string {
  if (!edge.points || edge.points.length < 2) {
    return ''
  }

  const { strokeDasharray, strokeWidth } = getEdgeStyle(edge)
  const hasArrow = edge.toArrow !== 'none'

  // Arrow dimensions
  const arrowLen = 10
  const arrowWidth = 5

  // Calculate path and arrow
  let pathPoints = edge.points
  let arrowSvg = ''

  if (hasArrow && edge.points.length >= 2) {
    const lastPt = edge.points[edge.points.length - 1]
    const prevPt = edge.points[edge.points.length - 2]

    // Calculate direction
    const dx = lastPt.x - prevPt.x
    const dy = lastPt.y - prevPt.y
    const len = Math.sqrt(dx * dx + dy * dy)

    if (len > 0) {
      // Normalize direction
      const nx = dx / len
      const ny = dy / len

      // Shorten path to make room for arrowhead
      const shortenedLast = {
        x: lastPt.x - nx * arrowLen,
        y: lastPt.y - ny * arrowLen
      }
      pathPoints = [...edge.points.slice(0, -1), shortenedLast]

      // Perpendicular for arrow width
      const px = -ny
      const py = nx

      // Arrow triangle points
      const tip = lastPt
      const left = {
        x: lastPt.x - nx * arrowLen + px * arrowWidth,
        y: lastPt.y - ny * arrowLen + py * arrowWidth
      }
      const right = {
        x: lastPt.x - nx * arrowLen - px * arrowWidth,
        y: lastPt.y - ny * arrowLen - py * arrowWidth
      }

      arrowSvg = `<polygon
        points="${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}"
        fill="#ff0000"
        class="edge-arrow"
      />`
    }
  }

  const pathD = pathPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ')

  let svg = `<path
    class="edge"
    data-from="${edge.from}"
    data-to="${edge.to}"
    d="${pathD}"
    fill="none"
    stroke="${opts.edgeStroke}"
    stroke-width="${strokeWidth}"
    stroke-dasharray="${strokeDasharray}"
  />`

  svg += arrowSvg

  // Draw bridge/hop indicators at crossings
  if (edge.crossings && edge.crossings.length > 0) {
    const bridgeRadius = 6
    for (const crossing of edge.crossings) {
      // Draw a small arc "bridge" over the crossing
      svg += `<path
        class="edge-bridge"
        d="M ${crossing.x - bridgeRadius} ${crossing.y}
           A ${bridgeRadius} ${bridgeRadius} 0 0 1 ${crossing.x + bridgeRadius} ${crossing.y}"
        fill="none"
        stroke="${opts.edgeStroke}"
        stroke-width="${strokeWidth}"
      />`
      // White background to "erase" the line underneath
      svg += `<line
        x1="${crossing.x - bridgeRadius}"
        y1="${crossing.y}"
        x2="${crossing.x + bridgeRadius}"
        y2="${crossing.y}"
        stroke="white"
        stroke-width="${strokeWidth + 4}"
      />`
    }
  }

  // Show edge label or debug label
  const labelToShow = edgeLabel || edge.label
  if (labelToShow && edge.points.length >= 2) {
    const midIdx = Math.floor(edge.points.length / 2)
    const midPoint = edge.points[midIdx]
    svg += `<text
      x="${midPoint.x}"
      y="${midPoint.y - 8}"
      text-anchor="middle"
      font-family="${opts.fontFamily}"
      font-size="${opts.fontSize - 2}"
      fill="${edgeLabel ? '#e44' : '#666'}"
    >${escapeHtml(labelToShow)}</text>`
  }

  return svg
}

/**
 * Render an edge in isometric mode
 *
 * Arrowheads use true isometric projection:
 * 1. Calculate direction in flat 2D space
 * 2. Define arrowhead triangle vertices in 3D space
 * 3. Project each vertex through isoProject()
 * This gives proper Cloudcraft-style isometric foreshortening
 */
function renderIsoEdge(edge: Edge, opts: Required<RenderOptions>, edgeLabel?: string): string {
  if (!edge.points || edge.points.length < 2) {
    return ''
  }

  // Project edge points to isometric at ground level (Z=0)
  // This matches the port positions which are also at Z=0
  const edgeZ = 0

  // Arrow dimensions
  const arrowLen = 12
  const arrowWidth = 5
  const hasArrow = edge.toArrow !== 'none'

  // Calculate shortened path if there's an arrowhead
  let pathPoints = edge.points
  let arrowSvg = ''

  if (hasArrow && edge.points.length >= 2) {
    const lastFlat = edge.points[edge.points.length - 1]
    const prevFlat = edge.points[edge.points.length - 2]

    // Calculate direction in flat 2D space (before projection)
    const dx = lastFlat.x - prevFlat.x
    const dy = lastFlat.y - prevFlat.y
    const len = Math.sqrt(dx * dx + dy * dy)

    if (len > 0) {
      // Normalize direction in flat space
      const nx = dx / len
      const ny = dy / len

      // Shorten the last point to stop at arrow base
      const shortenedLast = {
        x: lastFlat.x - nx * arrowLen,
        y: lastFlat.y - ny * arrowLen
      }
      pathPoints = [...edge.points.slice(0, -1), shortenedLast]

      // Perpendicular in flat space (for arrow base width)
      const px = -ny
      const py = nx

      // Define arrow triangle vertices in 3D space (at center height of boxes)
      // Tip is AT the endpoint (which already has isoGap from layout)
      const tip3D = { x: lastFlat.x, y: lastFlat.y, z: edgeZ }

      // Base center is behind the tip
      const baseCenterX = lastFlat.x - nx * arrowLen
      const baseCenterY = lastFlat.y - ny * arrowLen

      // Left and right base vertices (perpendicular to direction)
      const left3D = {
        x: baseCenterX + px * arrowWidth,
        y: baseCenterY + py * arrowWidth,
        z: edgeZ
      }
      const right3D = {
        x: baseCenterX - px * arrowWidth,
        y: baseCenterY - py * arrowWidth,
        z: edgeZ
      }

      // Project all vertices through isometric projection
      const tipIso = isoProject(tip3D.x, tip3D.y, tip3D.z)
      const leftIso = isoProject(left3D.x, left3D.y, left3D.z)
      const rightIso = isoProject(right3D.x, right3D.y, right3D.z)

      arrowSvg = `<polygon
        points="${tipIso.sx},${tipIso.sy} ${leftIso.sx},${leftIso.sy} ${rightIso.sx},${rightIso.sy}"
        fill="${opts.edgeStroke}"
        class="iso-arrow"
      />`
    }
  }

  // Project path points to isometric
  const isoPoints = pathPoints.map(p => isoProject(p.x, p.y, edgeZ))
  const pathD = isoPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.sx} ${p.sy}`)
    .join(' ')

  const { strokeDasharray, strokeWidth } = getEdgeStyle(edge)

  let svg = `<path
    class="edge iso-edge"
    data-from="${edge.from}"
    data-to="${edge.to}"
    d="${pathD}"
    fill="none"
    stroke="${opts.edgeStroke}"
    stroke-width="${strokeWidth}"
    stroke-dasharray="${strokeDasharray}"
  />`

  // Draw bridge/hop indicators at crossings in isometric space
  if (edge.crossings && edge.crossings.length > 0) {
    const bridgeRadius = 6
    for (const crossing of edge.crossings) {
      // Project crossing point and bridge ends to isometric
      const leftFlat = { x: crossing.x - bridgeRadius, y: crossing.y }
      const rightFlat = { x: crossing.x + bridgeRadius, y: crossing.y }
      const centerFlat = { x: crossing.x, y: crossing.y }

      const leftIso = isoProject(leftFlat.x, leftFlat.y, edgeZ)
      const rightIso = isoProject(rightFlat.x, rightFlat.y, edgeZ)
      const centerIso = isoProject(centerFlat.x, centerFlat.y, edgeZ)

      // For isometric, we approximate the bridge arc with a quadratic curve
      // The peak of the arc rises above the crossing point
      const peakIso = isoProject(centerFlat.x, centerFlat.y, edgeZ + bridgeRadius)

      // White background to "erase" the line underneath
      svg += `<line
        x1="${leftIso.sx}"
        y1="${leftIso.sy}"
        x2="${rightIso.sx}"
        y2="${rightIso.sy}"
        stroke="white"
        stroke-width="${strokeWidth + 4}"
      />`

      // Draw a small arc "bridge" over the crossing using quadratic bezier
      svg += `<path
        class="edge-bridge iso-bridge"
        d="M ${leftIso.sx} ${leftIso.sy} Q ${peakIso.sx} ${peakIso.sy} ${rightIso.sx} ${rightIso.sy}"
        fill="none"
        stroke="${opts.edgeStroke}"
        stroke-width="${strokeWidth}"
      />`
    }
  }

  svg += arrowSvg

  // Show edge label or debug label
  const labelToShow = edgeLabel || edge.label
  if (labelToShow && isoPoints.length >= 2) {
    const midIdx = Math.floor(isoPoints.length / 2)
    const midPoint = isoPoints[midIdx]
    // Apply isometric transform to edge labels too
    const cos30 = 0.866
    const sin30 = 0.5
    const isoMatrix = `matrix(${cos30}, ${sin30}, ${-cos30}, ${sin30}, ${midPoint.sx}, ${midPoint.sy - 8})`
    svg += `<text
      x="0"
      y="0"
      text-anchor="middle"
      font-family="${opts.fontFamily}"
      font-size="${opts.fontSize - 2}"
      fill="${edgeLabel ? '#e44' : '#666'}"
      transform="${isoMatrix}"
    >${escapeHtml(labelToShow)}</text>`
  }

  return svg
}

/**
 * Calculate isometric viewBox bounds
 */
function getIsoBounds(graph: Graph): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const node of graph.nodes.values()) {
    if (node.x === undefined || node.y === undefined) continue

    const w = node.width || 100
    const h = node.height || 40

    // Project all corners of the node's bounding box
    const corners = [
      isoProject(node.x - w / 2, node.y - h / 2, 0),
      isoProject(node.x + w / 2, node.y - h / 2, 0),
      isoProject(node.x + w / 2, node.y + h / 2, 0),
      isoProject(node.x - w / 2, node.y + h / 2, 0),
      isoProject(node.x - w / 2, node.y - h / 2, ISO_Z_HEIGHT),
      isoProject(node.x + w / 2, node.y - h / 2, ISO_Z_HEIGHT),
      isoProject(node.x + w / 2, node.y + h / 2, ISO_Z_HEIGHT),
      isoProject(node.x - w / 2, node.y + h / 2, ISO_Z_HEIGHT),
    ]

    for (const corner of corners) {
      minX = Math.min(minX, corner.sx)
      minY = Math.min(minY, corner.sy)
      maxX = Math.max(maxX, corner.sx)
      maxY = Math.max(maxY, corner.sy)
    }
  }

  return { minX, minY, maxX, maxY }
}

/**
 * Render complete graph to SVG string
 */
export function renderToSvg(graph: Graph, options: RenderOptions = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  if (opts.viewMode === 'iso') {
    return renderIsoSvg(graph, opts)
  } else {
    return renderFlatSvg(graph, opts)
  }
}

/**
 * Generate layer-based edge labels like "1-1", "2-1", "2-2", etc.
 * Edges are grouped by the layer of their source node (based on y position)
 */
function generateEdgeLabels(graph: Graph): Map<Edge, string> {
  const labels = new Map<Edge, string>()

  // Get unique y positions (layers) for source nodes
  const layerYs: number[] = []
  for (const edge of graph.edges) {
    const fromNode = graph.nodes.get(edge.from)
    if (fromNode?.y !== undefined && !layerYs.includes(fromNode.y)) {
      layerYs.push(fromNode.y)
    }
  }
  layerYs.sort((a, b) => a - b)

  // Create a map from y position to layer number
  const yToLayer = new Map<number, number>()
  layerYs.forEach((y, i) => yToLayer.set(y, i + 1))

  // Count edges per layer
  const layerEdgeCounts = new Map<number, number>()

  for (const edge of graph.edges) {
    const fromNode = graph.nodes.get(edge.from)
    if (fromNode?.y !== undefined) {
      const layer = yToLayer.get(fromNode.y) || 1
      const edgeNum = (layerEdgeCounts.get(layer) || 0) + 1
      layerEdgeCounts.set(layer, edgeNum)
      labels.set(edge, `${layer}-${edgeNum}`)
    }
  }

  return labels
}

/**
 * Render flat (2D) SVG
 */
function renderFlatSvg(graph: Graph, opts: Required<RenderOptions>): string {
  const bounds = getGraphBounds(graph)

  const width = bounds.width + opts.padding * 2
  const height = bounds.height + opts.padding * 2

  const offsetX = -bounds.x + opts.padding
  const offsetY = -bounds.y + opts.padding

  const subgraphs: Node[] = []
  const regularNodes: Node[] = []

  for (const node of graph.nodes.values()) {
    if (node.isSubgraph) {
      subgraphs.push(node)
    } else {
      regularNodes.push(node)
    }
  }

  // Generate grid if enabled
  const gridSvg = opts.showGrid
    ? generateFlatGrid(bounds.width + 100, bounds.height + 100, 40)
    : ''

  const subgraphsSvg = subgraphs.map(n => renderFlatNode(n, opts, graph.edges)).join('\n')
  const edgesSvg = graph.edges.map(e => renderFlatEdge(e, opts)).join('\n')
  const nodesSvg = regularNodes.map(n => renderFlatNode(n, opts, graph.edges)).join('\n')

  return `<svg
    xmlns="http://www.w3.org/2000/svg"
    width="${width}"
    height="${height}"
    viewBox="0 0 ${width} ${height}"
    class="isomaid-diagram"
    data-view-mode="flat"
  >
    <defs>
      <marker
        id="arrowhead"
        markerWidth="10"
        markerHeight="7"
        refX="10"
        refY="3.5"
        orient="auto"
      >
        <polygon points="0 0, 10 3.5, 0 7" fill="${opts.edgeStroke}" />
      </marker>
    </defs>
    <g transform="translate(${offsetX}, ${offsetY})">
      ${gridSvg}
      <g class="subgraphs">${subgraphsSvg}</g>
      <g class="edges">${edgesSvg}</g>
      <g class="nodes">${nodesSvg}</g>
    </g>
  </svg>`
}

/**
 * Render isometric (3D) SVG
 */
function renderIsoSvg(graph: Graph, opts: Required<RenderOptions>): string {
  const flatBounds = getGraphBounds(graph)
  const isoBounds = getIsoBounds(graph)

  // Add padding to isometric bounds
  const padding = opts.padding * 2
  const width = (isoBounds.maxX - isoBounds.minX) + padding * 2
  const height = (isoBounds.maxY - isoBounds.minY) + padding * 2

  const offsetX = -isoBounds.minX + padding
  const offsetY = -isoBounds.minY + padding

  // Collect nodes and sort by depth for proper layering
  // In isometric view, nodes with higher (x + y) should be rendered later (in front)
  const subgraphs: Node[] = []
  const regularNodes: Node[] = []

  for (const node of graph.nodes.values()) {
    if (node.isSubgraph) {
      subgraphs.push(node)
    } else {
      regularNodes.push(node)
    }
  }

  // Sort by depth (back to front)
  const sortByDepth = (a: Node, b: Node) => {
    const depthA = (a.x || 0) + (a.y || 0)
    const depthB = (b.x || 0) + (b.y || 0)
    return depthA - depthB
  }

  regularNodes.sort(sortByDepth)

  // Generate grid
  const gridSvg = opts.showGrid
    ? isoGrid(flatBounds.width + 200, flatBounds.height + 200, 40)
    : ''

  // Render elements
  const subgraphsSvg = subgraphs.map(n => renderIsoNode(n, opts, graph.edges)).join('\n')
  const edgesSvg = graph.edges.map(e => renderIsoEdge(e, opts)).join('\n')
  const nodesSvg = regularNodes.map(n => renderIsoNode(n, opts, graph.edges)).join('\n')

  return `<svg
    xmlns="http://www.w3.org/2000/svg"
    width="${width}"
    height="${height}"
    viewBox="0 0 ${width} ${height}"
    class="isomaid-diagram isomaid-iso"
    data-view-mode="iso"
  >
    <g transform="translate(${offsetX}, ${offsetY})">
      ${gridSvg}
      <g class="subgraphs">${subgraphsSvg}</g>
      <g class="edges">${edgesSvg}</g>
      <g class="nodes">${nodesSvg}</g>
    </g>
  </svg>`
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Main render function - returns SVG string
 */
export function render(graph: Graph, options?: RenderOptions): string {
  return renderToSvg(graph, options)
}

export default render
