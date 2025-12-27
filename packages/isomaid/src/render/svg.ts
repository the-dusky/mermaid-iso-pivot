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
import { generateGeofences, type GeofenceData, type NodeGeofence } from '../layout/geofence'

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
  /** Show geofence zones around nodes */
  showGeofences?: boolean
  /** Show debug coordinates at edge waypoints and turns */
  showEdgeCoords?: boolean
  /** Show debug coordinates at port connections */
  showPortCoords?: boolean
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
  showPorts: false,
  showGeofences: false,
  showEdgeCoords: false,
  showPortCoords: false,
}

// Z-height for isometric node extrusion
const ISO_Z_HEIGHT = 25

// Muted color palette for flat subgraphs
const SUBGRAPH_COLORS = [
  '#E3F2FD', // Light blue
  '#F3E5F5', // Light purple
  '#E8F5E9', // Light green
  '#FFF3E0', // Light orange
  '#FCE4EC', // Light pink
  '#E0F2F1', // Light teal
  '#FFF9C4', // Light yellow
  '#F1F8E9', // Light lime
]

/**
 * Simple hash function for consistent color selection
 */
function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return hash
}

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

/**
 * Render collapse/expand icon for subgraphs
 * Shows in bottom-right corner
 */
function renderCollapseIcon(
  node: Node & { _collapsed?: boolean; _hasChildren?: boolean },
  transform: CoordTransform,
  nodeWorldX: number,
  nodeWorldY: number,
  useIsoMatrix: boolean = false
): string {
  // Only show icon for subgraphs that have children
  if (!node.isSubgraph || !node._hasChildren) {
    return ''
  }

  const nodeWidth = node.width || 100
  const nodeHeight = node.height || 40

  // Position in bottom-right corner (with some padding)
  // Calculate offset from node center
  const iconOffsetX = nodeWidth / 2 - 20
  const iconOffsetY = nodeHeight / 2 - 20

  // Convert to world coordinates
  const iconWorldX = nodeWorldX + iconOffsetX
  const iconWorldY = nodeWorldY + iconOffsetY

  // For collapsed subgraphs in iso mode, elevate the icon to sit on top of the 3D box
  const isCollapsed = node._collapsed ?? false
  const zOffset = (useIsoMatrix && isCollapsed) ? ISO_Z_HEIGHT : 0

  const pos = transform(iconWorldX, iconWorldY, zOffset)

  const iconSize = 16

  // Create icon based on collapsed state
  // Collapsed (+): expand icon
  // Expanded (-): collapse icon
  const icon = isCollapsed
    ? // Plus icon for collapsed (click to expand)
      `<line x1="-4" y1="0" x2="4" y2="0" stroke="#666" stroke-width="2" />
       <line x1="0" y1="-4" x2="0" y2="4" stroke="#666" stroke-width="2" />`
    : // Minus icon for expanded (click to collapse)
      `<line x1="-4" y1="0" x2="4" y2="0" stroke="#666" stroke-width="2" />`

  // For isometric mode, apply the iso matrix transformation to icon contents
  if (useIsoMatrix) {
    const cos30 = 0.866
    const sin30 = 0.5
    const isoMatrix = `matrix(${cos30}, ${sin30}, ${-cos30}, ${sin30}, 0, 0)`

    return `<g class="collapse-icon" data-node-id="${node.id}" transform="translate(${pos.sx}, ${pos.sy})" style="cursor: pointer;">
      <g transform="${isoMatrix}">
        <rect x="-8" y="-8" width="${iconSize}" height="${iconSize}" fill="white" stroke="#ccc" stroke-width="1" rx="2" />
        ${icon}
      </g>
    </g>`
  }

  // Flat mode: no matrix transformation
  return `<g class="collapse-icon" data-node-id="${node.id}" transform="translate(${pos.sx}, ${pos.sy})" style="cursor: pointer;">
    <rect x="-8" y="-8" width="${iconSize}" height="${iconSize}" fill="white" stroke="#ccc" stroke-width="1" rx="2" />
    ${icon}
  </g>`
}

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

/**
 * Render debug port circles (only when showPorts is enabled)
 *
 * Port connection lines are now part of unified edge rendering.
 * This function only shows the debug visualization of port positions.
 */
function renderNodePorts(
  node: Node,
  opts: Required<RenderOptions>,
  transform: CoordTransform,
  _usage: PortUsage  // No longer used for connection lines
): string {
  // Only render port circles when debug mode is enabled
  if (!opts.showPorts || !node.ports || node.ports.length === 0) {
    return ''
  }

  let portsSvg = ''

  for (const port of node.ports) {
    // Get transformed positions for visual indicators
    const cornerPos = port.cornerX !== undefined && port.cornerY !== undefined
      ? transform(port.cornerX, port.cornerY, 0)
      : null
    const farPos = port.farX !== undefined && port.farY !== undefined
      ? transform(port.farX, port.farY, 0)
      : null
    const closePos = port.closeX !== undefined && port.closeY !== undefined
      ? transform(port.closeX, port.closeY, 0)
      : null

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

  return portsSvg
}

/**
 * Render geofence for a single node (flat mode)
 * Shows red exclusion zone with caution stripes, and openings at ports
 */
function renderFlatGeofence(geofence: NodeGeofence): string {
  const { outer, inner, openings } = geofence

  // Build a path that represents the geofence band (outer minus inner minus openings)
  // Create the geofence shape using path with holes
  // Outer boundary (clockwise)
  let pathD = `M ${outer.left} ${outer.top} `
  pathD += `L ${outer.right} ${outer.top} `
  pathD += `L ${outer.right} ${outer.bottom} `
  pathD += `L ${outer.left} ${outer.bottom} Z `

  // Inner hole (counter-clockwise to create hole)
  pathD += `M ${inner.left} ${inner.top} `
  pathD += `L ${inner.left} ${inner.bottom} `
  pathD += `L ${inner.right} ${inner.bottom} `
  pathD += `L ${inner.right} ${inner.top} Z `

  // Opening holes (counter-clockwise)
  for (const opening of openings) {
    const ox = opening.x
    const oy = opening.y
    const ow = opening.width
    const oh = opening.height
    pathD += `M ${ox} ${oy} `
    pathD += `L ${ox} ${oy + oh} `
    pathD += `L ${ox + ow} ${oy + oh} `
    pathD += `L ${ox + ow} ${oy} Z `
  }

  return `<g class="geofence" data-node-id="${geofence.nodeId}">
    <path
      d="${pathD}"
      fill="url(#geofence-pattern)"
      fill-opacity="0.4"
      stroke="#dc2626"
      stroke-width="1"
      stroke-dasharray="4,2"
    />
  </g>`
}

/**
 * Render geofence for a single node (iso mode)
 * Transforms flat geofence coordinates through isometric projection
 */
function renderIsoGeofence(geofence: NodeGeofence): string {
  const { outer, inner, openings } = geofence
  const cos30 = 0.866
  const sin30 = 0.5
  const isoMatrix = `matrix(${cos30}, ${sin30}, ${-cos30}, ${sin30}, 0, 0)`

  // Build the same path as flat, but we'll apply iso transform to the group
  let pathD = `M ${outer.left} ${outer.top} `
  pathD += `L ${outer.right} ${outer.top} `
  pathD += `L ${outer.right} ${outer.bottom} `
  pathD += `L ${outer.left} ${outer.bottom} Z `

  // Inner hole
  pathD += `M ${inner.left} ${inner.top} `
  pathD += `L ${inner.left} ${inner.bottom} `
  pathD += `L ${inner.right} ${inner.bottom} `
  pathD += `L ${inner.right} ${inner.top} Z `

  // Opening holes
  for (const opening of openings) {
    const ox = opening.x
    const oy = opening.y
    const ow = opening.width
    const oh = opening.height
    pathD += `M ${ox} ${oy} `
    pathD += `L ${ox} ${oy + oh} `
    pathD += `L ${ox + ow} ${oy + oh} `
    pathD += `L ${ox + ow} ${oy} Z `
  }

  return `<g class="geofence iso-geofence" data-node-id="${geofence.nodeId}" transform="${isoMatrix}">
    <path
      d="${pathD}"
      fill="url(#geofence-pattern)"
      fill-opacity="0.4"
      stroke="#dc2626"
      stroke-width="1"
      stroke-dasharray="4,2"
    />
  </g>`
}

/**
 * Generate SVG defs for geofence pattern (caution stripes)
 */
function getGeofencePatternDef(): string {
  return `<pattern id="geofence-pattern" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
    <rect width="5" height="10" fill="#dc2626" />
    <rect x="5" width="5" height="10" fill="#fca5a5" />
  </pattern>
  <pattern id="label-geofence-pattern" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
    <rect width="4" height="8" fill="#f97316" />
    <rect x="4" width="4" height="8" fill="#fed7aa" />
  </pattern>`
}

/**
 * Render label geofence (flat mode)
 * Simple rectangle for text protection
 */
function renderFlatLabelGeofence(labelGeofence: { labelId: string; bounds: { left: number; right: number; top: number; bottom: number } }): string {
  const { bounds } = labelGeofence
  const width = bounds.right - bounds.left
  const height = bounds.bottom - bounds.top

  return `<rect
    class="label-geofence"
    data-label-id="${labelGeofence.labelId}"
    x="${bounds.left}"
    y="${bounds.top}"
    width="${width}"
    height="${height}"
    fill="url(#label-geofence-pattern)"
    fill-opacity="0.3"
    stroke="#f97316"
    stroke-width="1"
    stroke-dasharray="3,2"
  />`
}

/**
 * Render label geofence (iso mode)
 */
function renderIsoLabelGeofence(labelGeofence: { labelId: string; bounds: { left: number; right: number; top: number; bottom: number } }): string {
  const { bounds } = labelGeofence
  const cos30 = 0.866
  const sin30 = 0.5
  const isoMatrix = `matrix(${cos30}, ${sin30}, ${-cos30}, ${sin30}, 0, 0)`

  const width = bounds.right - bounds.left
  const height = bounds.bottom - bounds.top

  return `<g class="label-geofence iso-label-geofence" data-label-id="${labelGeofence.labelId}" transform="${isoMatrix}">
    <rect
      x="${bounds.left}"
      y="${bounds.top}"
      width="${width}"
      height="${height}"
      fill="url(#label-geofence-pattern)"
      fill-opacity="0.3"
      stroke="#f97316"
      stroke-width="1"
      stroke-dasharray="3,2"
    />
  </g>`
}

/**
 * Render a node in flat mode
 */
function renderFlatNode(node: Node, opts: Required<RenderOptions>, edges: Edge[]): string {
  if (node.x === undefined || node.y === undefined) {
    console.warn(`Node ${node.id} has no position`)
    return ''
  }

  // Check if this is a collapsed subgraph - render as regular node
  const nodeExt = node as Node & { _collapsed?: boolean; _hasChildren?: boolean }
  const isCollapsedSubgraph = node.isSubgraph && nodeExt._collapsed && nodeExt._hasChildren

  console.log(`[RENDER FLAT] ${node.id}: isSubgraph=${node.isSubgraph}, _collapsed=${nodeExt._collapsed}, _hasChildren=${nodeExt._hasChildren}, isCollapsedSubgraph=${isCollapsedSubgraph}`)

  // For collapsed subgraphs: keep original dimensions but render as solid box (not container)
  const renderNode: Node = isCollapsedSubgraph
    ? { ...node, isSubgraph: false }  // Keep width/height from expanded layout
    : node

  if (isCollapsedSubgraph) {
    console.log(`[RENDER FLAT] ${node.id} will render as regular box (not subgraph platform)`)
  }

  // For expanded subgraphs: use colorful muted colors, no stroke, 80% opacity, rounded corners
  const isExpandedSubgraph = renderNode.isSubgraph && !isCollapsedSubgraph

  let fill = renderNode.style?.fill || opts.nodeFill
  let stroke = renderNode.style?.stroke || opts.nodeStroke
  let opacity = renderNode.style?.opacity ?? 1

  if (isExpandedSubgraph) {
    // Pick a color based on node ID for consistency
    const colorIndex = Math.abs(hashCode(node.id)) % SUBGRAPH_COLORS.length
    fill = SUBGRAPH_COLORS[colorIndex]
    stroke = 'none'
    opacity = 0.7
  }

  const shape = getShape(renderNode)
  const shapeAttrs = {
    fill,
    stroke,
    'stroke-width': isExpandedSubgraph ? '0' : String(renderNode.style?.strokeWidth ?? 1.5),
    rx: isExpandedSubgraph ? '4' : String(shape.attrs.rx || '0'),
    ry: isExpandedSubgraph ? '4' : String(shape.attrs.ry || '0'),
  }

  const shapeSvg = shapeToSvg(shape, shapeAttrs)

  // Position text differently for subgraphs vs regular nodes
  // Subgraphs: text inside at bottom (so it won't be covered by inner nodes)
  // Regular nodes: text centered
  const nodeHeight = renderNode.height || 40
  let textSvg: string
  if (renderNode.isSubgraph && !isCollapsedSubgraph) {
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
    >${escapeHtml(renderNode.label)}</text>`
  } else {
    textSvg = `<text
      x="0"
      y="0"
      text-anchor="middle"
      dominant-baseline="central"
      font-family="${opts.fontFamily}"
      font-size="${opts.fontSize}"
      fill="#333"
    >${escapeHtml(renderNode.label)}</text>`
  }

  // Render ports - flat mode uses identity transform (relative to node center)
  const flatTransform: CoordTransform = (x, y, _z) => ({
    sx: x - renderNode.x!,
    sy: y - renderNode.y!,
  })
  const portUsage = calculatePortUsage(renderNode, edges)
  const portsSvg = renderNodePorts(renderNode, opts, flatTransform, portUsage)

  // Render collapse icon for subgraphs (use original node to check _collapsed state)
  const collapseIconSvg = renderCollapseIcon(nodeExt, flatTransform, renderNode.x!, renderNode.y!, false)

  return `<g
    class="node ${node.isSubgraph ? 'subgraph' : ''} ${isCollapsedSubgraph ? 'collapsed' : ''}"
    data-id="${node.id}"
    transform="translate(${renderNode.x}, ${renderNode.y})"
    opacity="${opacity}"
  >
    ${shapeSvg}
    ${textSvg}
    ${portsSvg}
    ${collapseIconSvg}
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

  // Check if this is a collapsed subgraph - render as regular 3D node
  const nodeExt = node as Node & { _collapsed?: boolean; _hasChildren?: boolean }
  const isCollapsedSubgraph = node.isSubgraph && nodeExt._collapsed && nodeExt._hasChildren

  console.log(`[RENDER ISO] ${node.id}: isSubgraph=${node.isSubgraph}, _collapsed=${nodeExt._collapsed}, _hasChildren=${nodeExt._hasChildren}, isCollapsedSubgraph=${isCollapsedSubgraph}`)

  // For collapsed subgraphs: keep original dimensions but render as solid 3D box
  const renderNode: Node = isCollapsedSubgraph
    ? { ...node, isSubgraph: false }  // Keep width/height from expanded layout
    : node

  const isSubgraph = renderNode.isSubgraph || false

  if (isCollapsedSubgraph) {
    console.log(`[RENDER ISO] ${node.id} will render as 3D box: isSubgraph=${isSubgraph}`)
  }

  // For expanded subgraphs: use colorful muted colors, no stroke, 80% opacity
  const isExpandedSubgraph = renderNode.isSubgraph && !isCollapsedSubgraph

  let fill = renderNode.style?.fill || opts.nodeFill
  let stroke = renderNode.style?.stroke || opts.nodeStroke
  let opacity = renderNode.style?.opacity ?? 1

  if (isExpandedSubgraph) {
    // Pick a color based on node ID for consistency
    const colorIndex = Math.abs(hashCode(node.id)) % SUBGRAPH_COLORS.length
    fill = SUBGRAPH_COLORS[colorIndex]
    stroke = 'none'
    opacity = 0.7
  }

  // Get isometric shape - subgraphs render as flat platforms, collapsed subgraphs as 3D boxes
  const isoShape = getIsoShape(renderNode, isSubgraph)

  // Sort faces by depth (lower depth = render first = behind)
  const sortedFaces = [...isoShape.faces].sort((a, b) => a.depth - b.depth)

  // Render each face as a polygon
  const facesSvg = sortedFaces
    .map(face => {
      const faceFill = adjustColor(fill, face.colorOffset)
      return `<polygon
        points="${face.points}"
        fill="${faceFill}"
        stroke="none"
        stroke-width="0"
        class="iso-face iso-${face.type}"
      />`
    })
    .join('\n')

  // Position text differently for subgraphs vs 3D nodes
  // - Subgraphs: text inside container at bottom (so it won't be covered by inner nodes)
  // - 3D nodes: text on top of the box
  const nodeHeight = renderNode.height || 40
  const nodeWidth = renderNode.width || 100
  const nodeX = renderNode.x!  // Guaranteed by check at start of function
  const nodeY = renderNode.y!  // Guaranteed by check at start of function
  const cos30 = 0.866
  const sin30 = 0.5

  let textSvg: string
  if (isSubgraph && !isCollapsedSubgraph) {
    // Subgraph: text inside container, positioned near the bottom-front edge
    // This ensures it won't be covered by inner containers/nodes
    // Position at bottom of container (high Y = front in iso), slightly inset
    const textOffsetY = nodeHeight / 2 - 16 // Inside, near bottom edge
    const textPos = isoProject(nodeX, nodeY + textOffsetY, 0)
    const isoMatrix = `matrix(${cos30}, ${sin30}, ${-cos30}, ${sin30}, ${textPos.sx}, ${textPos.sy})`
    textSvg = `<text
      x="0"
      y="0"
      text-anchor="middle"
      dominant-baseline="central"
      font-family="${opts.fontFamily}"
      font-size="${opts.fontSize}"
      fill="#666"
      font-weight="700"
      transform="${isoMatrix}"
    >${escapeHtml(renderNode.label)}</text>`
  } else {
    // 3D node: text on top of the box
    const textPos = isoProject(nodeX, nodeY, ISO_Z_HEIGHT)
    const isoMatrix = `matrix(${cos30}, ${sin30}, ${-cos30}, ${sin30}, ${textPos.sx}, ${textPos.sy})`
    textSvg = `<text
      x="0"
      y="0"
      text-anchor="middle"
      dominant-baseline="central"
      font-family="${opts.fontFamily}"
      font-size="${opts.fontSize}"
      fill="#666"
      font-weight="700"
      transform="${isoMatrix}"
    >${escapeHtml(renderNode.label)}</text>`
  }

  // Render ports - iso mode uses isoProject transform
  // Ports are at Z=0 (flat on the ground)
  const portUsage = calculatePortUsage(renderNode, edges)
  const portsSvg = renderNodePorts(renderNode, opts, isoProject, portUsage)

  // Render collapse icon for subgraphs (use original node to check _collapsed state)
  const collapseIconSvg = renderCollapseIcon(nodeExt, isoProject, nodeX, nodeY, true)

  return `<g
    class="node iso-node ${node.isSubgraph ? 'subgraph' : ''} ${isCollapsedSubgraph ? 'collapsed' : ''}"
    data-id="${node.id}"
    opacity="${opacity}"
  >
    ${facesSvg}
    ${textSvg}
    ${portsSvg}
    ${collapseIconSvg}
  </g>`
}

/**
 * Get edge style properties (stroke dash, width)
 */
function getEdgeStyle(edge: Edge): { strokeDasharray: string; strokeWidth: number } {
  let strokeDasharray = ''
  if (edge.style === 'dashed') strokeDasharray = '5,5'
  else if (edge.style === 'dotted') strokeDasharray = '2,2'

  const strokeWidth = edge.style === 'thick' ? 7 : 5.5

  return { strokeDasharray, strokeWidth }
}

/**
 * Render an edge in flat mode
 *
 * Edges are extended from corner (red) ports to close (green) ports at both ends,
 * creating a unified line from source surface to target surface.
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

  // Extend path with close port coordinates for unified rendering
  // In flat mode: always use close (green) ports at both ends
  let extendedPoints = [...edge.points]

  // Prepend source close port (if available)
  if (edge.sourcePort?.closeX !== undefined && edge.sourcePort?.closeY !== undefined) {
    extendedPoints = [
      { x: edge.sourcePort.closeX, y: edge.sourcePort.closeY },
      ...extendedPoints
    ]
  }

  // Append target close port (if available)
  if (edge.targetPort?.closeX !== undefined && edge.targetPort?.closeY !== undefined) {
    extendedPoints = [
      ...extendedPoints,
      { x: edge.targetPort.closeX, y: edge.targetPort.closeY }
    ]
  }

  // Calculate path and arrow
  let pathPoints = extendedPoints
  let arrowSvg = ''

  if (hasArrow && extendedPoints.length >= 2) {
    const lastPt = extendedPoints[extendedPoints.length - 1]
    const prevPt = extendedPoints[extendedPoints.length - 2]

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
      pathPoints = [...extendedPoints.slice(0, -1), shortenedLast]

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
        fill="${opts.edgeStroke}"
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
  if (labelToShow && extendedPoints.length >= 2) {
    const midIdx = Math.floor(extendedPoints.length / 2)
    const midPoint = extendedPoints[midIdx]
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
 * Check if a node is an expanded (flat) subgraph vs a 3D block
 * - Expanded subgraphs are flat containers → use close port
 * - Collapsed subgraphs and regular nodes are 3D blocks → use far port for Top/Left
 */
function isExpandedSubgraph(nodes: Map<string, Node>, nodeId: string): boolean {
  const node = nodes.get(nodeId)
  if (!node) return false

  const nodeExt = node as Node & { _collapsed?: boolean; _hasChildren?: boolean }
  // An expanded subgraph is a subgraph that is NOT collapsed
  // (collapsed subgraphs render as 3D blocks)
  return node.isSubgraph && !nodeExt._collapsed
}

/**
 * Render an edge in isometric mode using matrix transform
 *
 * Uses the isometric matrix transform so strokes lay flat on the ground plane.
 * Port selection depends on node type:
 * - Expanded subgraphs (flat containers): always close port
 * - Collapsed subgraphs / regular nodes (3D blocks): far for Top/Left, close for Right/Bottom
 */
function renderIsoEdge(
  edge: Edge,
  opts: Required<RenderOptions>,
  nodes: Map<string, Node>,
  edgeLabel?: string
): string {
  if (!edge.points || edge.points.length < 2) {
    return ''
  }

  const cos30 = 0.866
  const sin30 = 0.5
  const isoMatrix = `matrix(${cos30}, ${sin30}, ${-cos30}, ${sin30}, 0, 0)`

  // Arrow dimensions
  const arrowLen = 12
  const arrowWidth = 5
  const hasArrow = edge.toArrow !== 'none'

  // Check if source/target are expanded subgraphs (flat) vs 3D blocks
  const sourceIsFlat = isExpandedSubgraph(nodes, edge.from)
  const targetIsFlat = isExpandedSubgraph(nodes, edge.to)

  // Extend path with appropriate port coordinates for unified rendering
  // Flat containers: always use close port
  // 3D blocks: close for Right/Bottom, far for Top/Left
  let extendedPoints = [...edge.points]

  // Prepend source port endpoint
  if (edge.sourcePort) {
    const useSourceFar = !sourceIsFlat && (edge.fromPort === 'T' || edge.fromPort === 'L')
    if (useSourceFar && edge.sourcePort.farX !== undefined && edge.sourcePort.farY !== undefined) {
      extendedPoints = [
        { x: edge.sourcePort.farX, y: edge.sourcePort.farY },
        ...extendedPoints
      ]
    } else if (edge.sourcePort.closeX !== undefined && edge.sourcePort.closeY !== undefined) {
      extendedPoints = [
        { x: edge.sourcePort.closeX, y: edge.sourcePort.closeY },
        ...extendedPoints
      ]
    }
  }

  // Append target port endpoint
  if (edge.targetPort) {
    const useTargetFar = !targetIsFlat && (edge.toPort === 'T' || edge.toPort === 'L')
    if (useTargetFar && edge.targetPort.farX !== undefined && edge.targetPort.farY !== undefined) {
      extendedPoints = [
        ...extendedPoints,
        { x: edge.targetPort.farX, y: edge.targetPort.farY }
      ]
    } else if (edge.targetPort.closeX !== undefined && edge.targetPort.closeY !== undefined) {
      extendedPoints = [
        ...extendedPoints,
        { x: edge.targetPort.closeX, y: edge.targetPort.closeY }
      ]
    }
  }

  // Calculate shortened path if there's an arrowhead
  let pathPoints = extendedPoints
  let arrowSvg = ''

  if (hasArrow && extendedPoints.length >= 2) {
    const lastFlat = extendedPoints[extendedPoints.length - 1]
    const prevFlat = extendedPoints[extendedPoints.length - 2]

    // Calculate direction in flat 2D space
    const dx = lastFlat.x - prevFlat.x
    const dy = lastFlat.y - prevFlat.y
    const len = Math.sqrt(dx * dx + dy * dy)

    if (len > 0) {
      // Normalize direction
      const nx = dx / len
      const ny = dy / len

      // Shorten the last point to stop at arrow base
      const shortenedLast = {
        x: lastFlat.x - nx * arrowLen,
        y: lastFlat.y - ny * arrowLen
      }
      pathPoints = [...extendedPoints.slice(0, -1), shortenedLast]

      // Perpendicular (for arrow base width)
      const px = -ny
      const py = nx

      // Arrow triangle vertices in flat space
      const tipX = lastFlat.x
      const tipY = lastFlat.y
      const baseCenterX = lastFlat.x - nx * arrowLen
      const baseCenterY = lastFlat.y - ny * arrowLen
      const leftX = baseCenterX + px * arrowWidth
      const leftY = baseCenterY + py * arrowWidth
      const rightX = baseCenterX - px * arrowWidth
      const rightY = baseCenterY - py * arrowWidth

      arrowSvg = `<polygon
        points="${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}"
        fill="${opts.edgeStroke}"
        class="iso-arrow"
      />`
    }
  }

  // Create path from flat coordinates
  const pathD = pathPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ')

  const { strokeDasharray, strokeWidth } = getEdgeStyle(edge)

  let edgeContent = `<path
    class="edge iso-edge"
    data-from="${edge.from}"
    data-to="${edge.to}"
    d="${pathD}"
    fill="none"
    stroke="${opts.edgeStroke}"
    stroke-width="${strokeWidth}"
    stroke-dasharray="${strokeDasharray}"
  />`

  // Draw bridge/hop indicators at crossings in flat space
  if (edge.crossings && edge.crossings.length > 0) {
    const bridgeRadius = 6
    for (const crossing of edge.crossings) {
      const leftX = crossing.x - bridgeRadius
      const rightX = crossing.x + bridgeRadius
      const centerY = crossing.y
      const peakY = centerY - bridgeRadius / 2

      // White background to "erase" the line underneath
      edgeContent += `<line
        x1="${leftX}"
        y1="${centerY}"
        x2="${rightX}"
        y2="${centerY}"
        stroke="white"
        stroke-width="${strokeWidth + 4}"
      />`

      // Draw a small arc "bridge" over the crossing
      edgeContent += `<path
        class="edge-bridge iso-bridge"
        d="M ${leftX} ${centerY} Q ${crossing.x} ${peakY} ${rightX} ${centerY}"
        fill="none"
        stroke="${opts.edgeStroke}"
        stroke-width="${strokeWidth}"
      />`
    }
  }

  edgeContent += arrowSvg

  // Show edge label or debug label
  const labelToShow = edgeLabel || edge.label
  if (labelToShow && pathPoints.length >= 2) {
    const midIdx = Math.floor(pathPoints.length / 2)
    const midPoint = pathPoints[midIdx]
    edgeContent += `<text
      x="${midPoint.x}"
      y="${midPoint.y - 8}"
      text-anchor="middle"
      font-family="${opts.fontFamily}"
      font-size="${opts.fontSize - 2}"
      fill="${edgeLabel ? '#e44' : '#666'}"
    >${escapeHtml(labelToShow)}</text>`
  }

  // Wrap everything in a group with isometric transform
  return `<g transform="${isoMatrix}">${edgeContent}</g>`
}

/**
 * Render debug coordinate labels for edge waypoints and turns
 */
function renderEdgeCoords(
  edge: Edge,
  opts: Required<RenderOptions>,
  isIso: boolean = false
): string {
  if (!opts.showEdgeCoords || !edge.points || edge.points.length === 0) {
    return ''
  }

  let svg = ''
  const fontSize = 9
  const cos30 = 0.866
  const sin30 = 0.5

  const points = edge.points

  // Detect turns (where direction changes)
  const turns: Set<number> = new Set()
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    const next = points[i + 1]

    const dx1 = curr.x - prev.x
    const dy1 = curr.y - prev.y
    const dx2 = next.x - curr.x
    const dy2 = next.y - curr.y

    const isHorizontal1 = Math.abs(dx1) > Math.abs(dy1)
    const isHorizontal2 = Math.abs(dx2) > Math.abs(dy2)

    if (isHorizontal1 !== isHorizontal2) {
      turns.add(i)
    }
  }

  for (let i = 0; i < points.length; i++) {
    const pt = points[i]
    const isTurn = turns.has(i)

    // Color: orange for turns, gray for waypoints
    const color = isTurn ? '#f97316' : '#888'
    const bgColor = isTurn ? '#fff7ed' : '#f3f4f6'
    const label = isTurn
      ? `⤷${Math.round(pt.x)},${Math.round(pt.y)}`
      : `${Math.round(pt.x)},${Math.round(pt.y)}`

    // Alternate offset direction based on point index to spread labels out
    const offsetDir = (i % 2 === 0) ? -1 : 1
    const offsetX = offsetDir * 35
    const offsetY = -15

    const bgPadding = 2
    const labelWidth = label.length * 5.5

    if (isIso) {
      const isoMatrix = `matrix(${cos30}, ${sin30}, ${-cos30}, ${sin30}, 0, 0)`
      svg += `<g transform="${isoMatrix}">
        <line x1="${pt.x}" y1="${pt.y}" x2="${pt.x + offsetX}" y2="${pt.y + offsetY}" stroke="${color}" stroke-width="0.5" stroke-dasharray="2,1"/>
        <circle cx="${pt.x}" cy="${pt.y}" r="2" fill="${color}"/>
        <rect x="${pt.x + offsetX - labelWidth/2 - bgPadding}" y="${pt.y + offsetY - fontSize/2 - bgPadding}" width="${labelWidth + bgPadding*2}" height="${fontSize + bgPadding*2}" fill="${bgColor}" fill-opacity="0.95" rx="2" stroke="${color}" stroke-width="0.5"/>
        <text x="${pt.x + offsetX}" y="${pt.y + offsetY}" text-anchor="middle" dominant-baseline="middle" font-family="monospace" font-size="${fontSize}" fill="${color}" font-weight="bold">${label}</text>
      </g>`
    } else {
      svg += `<line x1="${pt.x}" y1="${pt.y}" x2="${pt.x + offsetX}" y2="${pt.y + offsetY}" stroke="${color}" stroke-width="0.5" stroke-dasharray="2,1"/>
        <circle cx="${pt.x}" cy="${pt.y}" r="2" fill="${color}"/>
        <rect x="${pt.x + offsetX - labelWidth/2 - bgPadding}" y="${pt.y + offsetY - fontSize/2 - bgPadding}" width="${labelWidth + bgPadding*2}" height="${fontSize + bgPadding*2}" fill="${bgColor}" fill-opacity="0.95" rx="2" stroke="${color}" stroke-width="0.5"/>
        <text x="${pt.x + offsetX}" y="${pt.y + offsetY}" text-anchor="middle" dominant-baseline="middle" font-family="monospace" font-size="${fontSize}" fill="${color}" font-weight="bold">${label}</text>`
    }
  }

  return svg
}

/**
 * Render debug coordinate labels for port connections (source and target)
 */
function renderPortCoords(
  edge: Edge,
  opts: Required<RenderOptions>,
  isIso: boolean = false
): string {
  if (!opts.showPortCoords) {
    return ''
  }

  let svg = ''
  const fontSize = 9
  const cos30 = 0.866
  const sin30 = 0.5

  const bgPadding = 2

  // Source port (green) - offset to upper-left
  if (edge.sourcePort?.closeX !== undefined && edge.sourcePort?.closeY !== undefined) {
    const pt = { x: edge.sourcePort.closeX, y: edge.sourcePort.closeY }
    const label = `S:${Math.round(pt.x)},${Math.round(pt.y)}`
    const offsetX = -40
    const offsetY = -25
    const labelWidth = label.length * 5.5

    if (isIso) {
      const isoMatrix = `matrix(${cos30}, ${sin30}, ${-cos30}, ${sin30}, 0, 0)`
      svg += `<g transform="${isoMatrix}">
        <line x1="${pt.x}" y1="${pt.y}" x2="${pt.x + offsetX}" y2="${pt.y + offsetY}" stroke="#22c55e" stroke-width="0.5" stroke-dasharray="2,1"/>
        <circle cx="${pt.x}" cy="${pt.y}" r="3" fill="#22c55e"/>
        <rect x="${pt.x + offsetX - labelWidth/2 - bgPadding}" y="${pt.y + offsetY - fontSize/2 - bgPadding}" width="${labelWidth + bgPadding*2}" height="${fontSize + bgPadding*2}" fill="#dcfce7" fill-opacity="0.95" rx="2" stroke="#22c55e" stroke-width="0.5"/>
        <text x="${pt.x + offsetX}" y="${pt.y + offsetY}" text-anchor="middle" dominant-baseline="middle" font-family="monospace" font-size="${fontSize}" fill="#15803d" font-weight="bold">${label}</text>
      </g>`
    } else {
      svg += `<line x1="${pt.x}" y1="${pt.y}" x2="${pt.x + offsetX}" y2="${pt.y + offsetY}" stroke="#22c55e" stroke-width="0.5" stroke-dasharray="2,1"/>
        <circle cx="${pt.x}" cy="${pt.y}" r="3" fill="#22c55e"/>
        <rect x="${pt.x + offsetX - labelWidth/2 - bgPadding}" y="${pt.y + offsetY - fontSize/2 - bgPadding}" width="${labelWidth + bgPadding*2}" height="${fontSize + bgPadding*2}" fill="#dcfce7" fill-opacity="0.95" rx="2" stroke="#22c55e" stroke-width="0.5"/>
        <text x="${pt.x + offsetX}" y="${pt.y + offsetY}" text-anchor="middle" dominant-baseline="middle" font-family="monospace" font-size="${fontSize}" fill="#15803d" font-weight="bold">${label}</text>`
    }
  }

  // Target port (red) - offset to upper-right
  if (edge.targetPort?.closeX !== undefined && edge.targetPort?.closeY !== undefined) {
    const pt = { x: edge.targetPort.closeX, y: edge.targetPort.closeY }
    const label = `T:${Math.round(pt.x)},${Math.round(pt.y)}`
    const offsetX = 40
    const offsetY = -25
    const labelWidth = label.length * 5.5

    if (isIso) {
      const isoMatrix = `matrix(${cos30}, ${sin30}, ${-cos30}, ${sin30}, 0, 0)`
      svg += `<g transform="${isoMatrix}">
        <line x1="${pt.x}" y1="${pt.y}" x2="${pt.x + offsetX}" y2="${pt.y + offsetY}" stroke="#ef4444" stroke-width="0.5" stroke-dasharray="2,1"/>
        <circle cx="${pt.x}" cy="${pt.y}" r="3" fill="#ef4444"/>
        <rect x="${pt.x + offsetX - labelWidth/2 - bgPadding}" y="${pt.y + offsetY - fontSize/2 - bgPadding}" width="${labelWidth + bgPadding*2}" height="${fontSize + bgPadding*2}" fill="#fee2e2" fill-opacity="0.95" rx="2" stroke="#ef4444" stroke-width="0.5"/>
        <text x="${pt.x + offsetX}" y="${pt.y + offsetY}" text-anchor="middle" dominant-baseline="middle" font-family="monospace" font-size="${fontSize}" fill="#b91c1c" font-weight="bold">${label}</text>
      </g>`
    } else {
      svg += `<line x1="${pt.x}" y1="${pt.y}" x2="${pt.x + offsetX}" y2="${pt.y + offsetY}" stroke="#ef4444" stroke-width="0.5" stroke-dasharray="2,1"/>
        <circle cx="${pt.x}" cy="${pt.y}" r="3" fill="#ef4444"/>
        <rect x="${pt.x + offsetX - labelWidth/2 - bgPadding}" y="${pt.y + offsetY - fontSize/2 - bgPadding}" width="${labelWidth + bgPadding*2}" height="${fontSize + bgPadding*2}" fill="#fee2e2" fill-opacity="0.95" rx="2" stroke="#ef4444" stroke-width="0.5"/>
        <text x="${pt.x + offsetX}" y="${pt.y + offsetY}" text-anchor="middle" dominant-baseline="middle" font-family="monospace" font-size="${fontSize}" fill="#b91c1c" font-weight="bold">${label}</text>`
    }
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

  console.log(`[RENDER] viewMode=${opts.viewMode}, using ${opts.viewMode === 'iso' ? 'renderIsoSvg' : 'renderFlatSvg'}`)

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
    // Skip hidden nodes (children of collapsed subgraphs)
    const nodeExt = node as Node & { _hidden?: boolean }
    if (nodeExt._hidden) continue

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

  // Generate geofences if enabled
  let geofencesSvg = ''
  let labelGeofencesSvg = ''
  if (opts.showGeofences) {
    const geofenceData = generateGeofences(graph)
    geofencesSvg = Array.from(geofenceData.nodeGeofences.values())
      .map(gf => renderFlatGeofence(gf))
      .join('\n')
    labelGeofencesSvg = geofenceData.labelGeofences
      .map(lf => renderFlatLabelGeofence(lf))
      .join('\n')
  }

  const subgraphsSvg = subgraphs.map(n => renderFlatNode(n, opts, graph.edges)).join('\n')
  const edgesSvg = graph.edges.map(e => renderFlatEdge(e, opts)).join('\n')
  const nodesSvg = regularNodes.map(n => renderFlatNode(n, opts, graph.edges)).join('\n')

  // Generate debug coordinates if enabled
  const edgeCoordsSvg = opts.showEdgeCoords
    ? graph.edges.map(e => renderEdgeCoords(e, opts, false)).join('\n')
    : ''
  const portCoordsSvg = opts.showPortCoords
    ? graph.edges.map(e => renderPortCoords(e, opts, false)).join('\n')
    : ''

  // Include geofence pattern in defs if geofences are shown
  const geofencePatternDef = opts.showGeofences ? getGeofencePatternDef() : ''

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
      ${geofencePatternDef}
    </defs>
    <g transform="translate(${offsetX}, ${offsetY})">
      ${gridSvg}
      <g class="subgraphs">${subgraphsSvg}</g>
      <g class="geofences">${geofencesSvg}</g>
      <g class="label-geofences">${labelGeofencesSvg}</g>
      <g class="edges">${edgesSvg}</g>
      <g class="nodes">${nodesSvg}</g>
      <g class="edge-coords">${edgeCoordsSvg}</g>
      <g class="port-coords">${portCoordsSvg}</g>
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
    // Skip hidden nodes (children of collapsed subgraphs)
    const nodeExt = node as Node & { _hidden?: boolean }
    if (nodeExt._hidden) continue

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

  // Generate geofences if enabled
  let geofencesSvg = ''
  let labelGeofencesSvg = ''
  if (opts.showGeofences) {
    const geofenceData = generateGeofences(graph)
    geofencesSvg = Array.from(geofenceData.nodeGeofences.values())
      .map(gf => renderIsoGeofence(gf))
      .join('\n')
    labelGeofencesSvg = geofenceData.labelGeofences
      .map(lf => renderIsoLabelGeofence(lf))
      .join('\n')
  }

  // Render elements
  const subgraphsSvg = subgraphs.map(n => renderIsoNode(n, opts, graph.edges)).join('\n')
  const edgesSvg = graph.edges.map(e => renderIsoEdge(e, opts, graph.nodes)).join('\n')
  const nodesSvg = regularNodes.map(n => renderIsoNode(n, opts, graph.edges)).join('\n')

  // Generate debug coordinates if enabled
  const edgeCoordsSvg = opts.showEdgeCoords
    ? graph.edges.map(e => renderEdgeCoords(e, opts, true)).join('\n')
    : ''
  const portCoordsSvg = opts.showPortCoords
    ? graph.edges.map(e => renderPortCoords(e, opts, true)).join('\n')
    : ''

  // Include geofence pattern in defs if geofences are shown
  const geofencePatternDef = opts.showGeofences ? getGeofencePatternDef() : ''

  return `<svg
    xmlns="http://www.w3.org/2000/svg"
    width="${width}"
    height="${height}"
    viewBox="0 0 ${width} ${height}"
    class="isomaid-diagram isomaid-iso"
    data-view-mode="iso"
  >
    <defs>
      ${geofencePatternDef}
    </defs>
    <g transform="translate(${offsetX}, ${offsetY})">
      ${gridSvg}
      <g class="subgraphs">${subgraphsSvg}</g>
      <g class="geofences">${geofencesSvg}</g>
      <g class="label-geofences">${labelGeofencesSvg}</g>
      <g class="edges">${edgesSvg}</g>
      <g class="nodes">${nodesSvg}</g>
      <g class="edge-coords">${edgeCoordsSvg}</g>
      <g class="port-coords">${portCoordsSvg}</g>
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
