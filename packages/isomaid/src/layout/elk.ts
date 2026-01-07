/**
 * ELK layout engine for isomaid
 *
 * ELK (Eclipse Layout Kernel) properly handles compound/nested graphs
 * unlike dagre which has issues with edges between compound nodes.
 */

import ELK, { ElkNode, ElkExtendedEdge } from 'elkjs/lib/elk.bundled.js'
import type { Graph, Node, GridCoord, Port, PortSide } from '../model/types'
import { routeEdgesOrthogonal } from './orthogonal-router'
import { routeEdgesLibavoid, isLibavoidLoaded, type LibavoidRouterOptions } from './libavoid-router'
import { pixelToGrid, calculateLabelBounds } from '../grid'

export interface LayoutOptions {
  /** Direction: DOWN (top-bottom), UP, RIGHT, LEFT */
  direction?: 'DOWN' | 'UP' | 'RIGHT' | 'LEFT'
  /** Spacing between nodes */
  nodeSpacing?: number
  /** Spacing between layers/ranks */
  layerSpacing?: number
  /** Padding inside compound nodes */
  padding?: number
  /** View mode affects edge gap calculations */
  viewMode?: 'flat' | 'iso'
  /** Use libavoid for high-quality edge routing (requires WASM to be loaded) */
  useLibavoid?: boolean
  /** Options for libavoid router */
  libavoidOptions?: LibavoidRouterOptions
  /** Skip edge routing entirely (for ReactFlow dynamic edges) */
  skipEdgeRouting?: boolean
}

// Internal type for resolved options (all required except libavoidOptions)
type ResolvedLayoutOptions = {
  direction: 'DOWN' | 'UP' | 'RIGHT' | 'LEFT'
  nodeSpacing: number
  layerSpacing: number
  padding: number
  viewMode: 'flat' | 'iso'
  useLibavoid: boolean
  libavoidOptions?: LibavoidRouterOptions
  skipEdgeRouting: boolean
}

const DEFAULT_OPTIONS: ResolvedLayoutOptions = {
  direction: 'DOWN',
  nodeSpacing: 120,  // Extra spacing for port offsets + routing clearance
  layerSpacing: 120,
  padding: 30,
  viewMode: 'flat',
  useLibavoid: false,
  libavoidOptions: undefined,
  skipEdgeRouting: false,
}

/** Calculate base width for a node label */
function getBaseWidth(label: string): number {
  return Math.max(80, label.length * 10 + 40)
}

/** Default node dimensions based on shape, with optional uniform width override */
function getNodeDimensions(node: Node, uniformWidth?: number): { width: number; height: number } {
  const baseWidth = uniformWidth ?? getBaseWidth(node.label)

  switch (node.shape) {
    case 'cylinder':
      return { width: baseWidth, height: 60 }
    case 'diamond':
      return { width: baseWidth + 40, height: 60 }
    case 'circle':
      const size = Math.max(60, baseWidth)
      return { width: size, height: size }
    default:
      return { width: baseWidth, height: 40 }
  }
}

/** Calculate uniform width for all regular nodes (not subgraphs) */
function calculateUniformWidth(graph: Graph): number {
  let maxWidth = 80  // Minimum width

  for (const node of graph.nodes.values()) {
    // Skip subgraphs - they size to their contents
    if (node.isSubgraph) continue

    const baseWidth = getBaseWidth(node.label)

    // Account for shape-specific width additions
    let effectiveWidth = baseWidth
    if (node.shape === 'diamond') {
      effectiveWidth = baseWidth + 40
    } else if (node.shape === 'circle') {
      effectiveWidth = Math.max(60, baseWidth)
    }

    maxWidth = Math.max(maxWidth, effectiveWidth)
  }

  return maxWidth
}

/**
 * Generate ports for a node with three-level positioning:
 * - close: slightly inside node surface (a few pixels inset)
 * - far: extended for iso depth illusion
 * - corner: routing waypoint (minimal corner distance)
 *
 * For rectangles: 10 ports total (3 top, 2 right, 3 bottom, 2 left)
 */
function generateNodePorts(
  node: Node,
  cellSize: number,
  farOffset: number,
  layerId: string
): Port[] {
  if (node.x === undefined || node.y === undefined) return []

  const x = node.x
  const y = node.y
  const halfW = (node.width || 100) / 2
  const halfH = (node.height || 40) / 2

  // close offset: a few pixels outside the edge
  const closeOffset = 3

  // corner offset: routing waypoint distance
  const cornerOffset = farOffset + 15

  const ports: Port[] = []

  // Top side: 3 ports (left, center, right)
  const topSpacing = halfW / 2  // Divide width into thirds
  for (let i = 0; i < 3; i++) {
    const offsetX = -halfW + topSpacing + (i * topSpacing)
    const portX = x + offsetX
    ports.push({
      coord: pixelToGrid(portX, y - halfH - cornerOffset, cellSize, layerId),
      side: 'T',
      nodeId: node.id,
      closeX: portX,
      closeY: y - halfH - closeOffset,
      farX: portX,
      farY: y - halfH - farOffset,
      cornerX: portX,
      cornerY: y - halfH - cornerOffset,
      x: portX,
      y: y - halfH - cornerOffset,
    })
  }

  // Right side: 2 ports (top, bottom)
  const rightSpacing = halfH / 1.5  // Divide height into thirds
  for (let i = 0; i < 2; i++) {
    const offsetY = -halfH / 2 + (i * rightSpacing)
    const portY = y + offsetY
    ports.push({
      coord: pixelToGrid(x + halfW + cornerOffset, portY, cellSize, layerId),
      side: 'R',
      nodeId: node.id,
      closeX: x + halfW + closeOffset,
      closeY: portY,
      farX: x + halfW + farOffset,
      farY: portY,
      cornerX: x + halfW + cornerOffset,
      cornerY: portY,
      x: x + halfW + cornerOffset,
      y: portY,
    })
  }

  // Bottom side: 3 ports (left, center, right)
  for (let i = 0; i < 3; i++) {
    const offsetX = -halfW + topSpacing + (i * topSpacing)
    const portX = x + offsetX
    ports.push({
      coord: pixelToGrid(portX, y + halfH + cornerOffset, cellSize, layerId),
      side: 'B',
      nodeId: node.id,
      closeX: portX,
      closeY: y + halfH + closeOffset,
      farX: portX,
      farY: y + halfH + farOffset,
      cornerX: portX,
      cornerY: y + halfH + cornerOffset,
      x: portX,
      y: y + halfH + cornerOffset,
    })
  }

  // Left side: 2 ports (top, bottom)
  for (let i = 0; i < 2; i++) {
    const offsetY = -halfH / 2 + (i * rightSpacing)
    const portY = y + offsetY
    ports.push({
      coord: pixelToGrid(x - halfW - cornerOffset, portY, cellSize, layerId),
      side: 'L',
      nodeId: node.id,
      closeX: x - halfW - closeOffset,
      closeY: portY,
      farX: x - halfW - farOffset,
      farY: portY,
      cornerX: x - halfW - cornerOffset,
      cornerY: portY,
      x: x - halfW - cornerOffset,
      y: portY,
    })
  }

  return ports
}

/**
 * Find the lowest common ancestor container for two nodes
 */
function findLowestCommonAncestor(
  graph: Graph,
  nodeId1: string,
  nodeId2: string
): string | null {
  // Get ancestors of node1
  const ancestors1 = new Set<string>()
  let current = graph.nodes.get(nodeId1)?.parent
  while (current) {
    ancestors1.add(current)
    current = graph.nodes.get(current)?.parent
  }

  // Find first ancestor of node2 that's in ancestors1
  current = graph.nodes.get(nodeId2)?.parent
  while (current) {
    if (ancestors1.has(current)) {
      return current
    }
    current = graph.nodes.get(current)?.parent
  }

  // Check if they share root
  const node1 = graph.nodes.get(nodeId1)
  const node2 = graph.nodes.get(nodeId2)

  // If both are root nodes or both have same parent
  if (!node1?.parent && !node2?.parent) {
    return null // Both at root level
  }

  if (node1?.parent === node2?.parent) {
    return node1?.parent || null
  }

  return null
}

/**
 * Convert our Graph to ELK format
 */
function graphToElk(graph: Graph, opts: ResolvedLayoutOptions): ElkNode {
  const processedNodes = new Set<string>()

  // Calculate uniform width for all regular nodes (consistency across views)
  const uniformWidth = calculateUniformWidth(graph)

  // Helper to convert a node (and its children) to ELK format
  function convertNode(nodeId: string): ElkNode | null {
    if (processedNodes.has(nodeId)) return null
    processedNodes.add(nodeId)

    const node = graph.nodes.get(nodeId)
    if (!node) return null

    // Use uniform width for regular nodes, let subgraphs size naturally
    const dims = node.isSubgraph
      ? getNodeDimensions(node)
      : getNodeDimensions(node, uniformWidth)

    const elkNode: ElkNode = {
      id: nodeId,
      labels: [{ text: node.label }],
      width: dims.width,
      height: dims.height,
    }

    // If this is a subgraph, recursively add children
    if (node.isSubgraph && node.children && node.children.length > 0) {
      elkNode.children = []
      // Extra top padding for label, extra bottom for iso 3D height clearance
      elkNode.layoutOptions = {
        'elk.padding': `[top=${opts.padding + 20},left=${opts.padding},bottom=${opts.padding + 20},right=${opts.padding}]`,
        'elk.spacing.nodeNode': String(opts.nodeSpacing),
        'elk.layered.spacing.nodeNodeBetweenLayers': String(opts.layerSpacing),
        // Node placement: use Brandes-Koepf with balanced alignment for better centering
        'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
        'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
        // Center children within the subgraph
        'elk.contentAlignment': 'H_CENTER V_CENTER',
        'elk.alignment': 'CENTER',
      }

      for (const childId of node.children) {
        const childElk = convertNode(childId)
        if (childElk) {
          elkNode.children.push(childElk)
        }
      }
    }

    return elkNode
  }

  // Convert root nodes
  const elkNodes: ElkNode[] = []
  for (const rootId of graph.rootNodes) {
    const elkNode = convertNode(rootId)
    if (elkNode) {
      elkNodes.push(elkNode)
    }
  }

  // ALL edges go at root level - ELK with INCLUDE_CHILDREN will route them
  const allEdges: ElkExtendedEdge[] = graph.edges.map(edge => ({
    id: `${edge.from}->${edge.to}`,
    sources: [edge.from],
    targets: [edge.to],
  }))

  return {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': opts.direction,
      'elk.spacing.nodeNode': String(opts.nodeSpacing),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(opts.layerSpacing),
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      // Edge routing options
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '15',
      'elk.layered.spacing.edgeNodeBetweenLayers': '15',
      // Node placement: use Brandes-Koepf with balanced alignment for better centering
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
      // Center nodes within layers
      'elk.alignment': 'CENTER',
    },
    children: elkNodes,
    edges: allEdges,
  }
}

/**
 * Apply ELK layout results back to our Graph
 */
function applyElkLayout(graph: Graph, elkGraph: ElkNode, opts: ResolvedLayoutOptions): void {
  const cellSize = graph.config.grid.cellSize
  const fontSize = 14 // Default font size for label bounds

  function applyToNode(
    elkNode: ElkNode,
    offsetX: number = 0,
    offsetY: number = 0,
    layerId: string = 'root'
  ): void {
    const node = graph.nodes.get(elkNode.id)
    if (node && elkNode.x !== undefined && elkNode.y !== undefined) {
      // ELK gives top-left corner, we want center
      node.x = offsetX + elkNode.x + (elkNode.width || 0) / 2
      node.y = offsetY + elkNode.y + (elkNode.height || 0) / 2
      node.width = elkNode.width
      node.height = elkNode.height

      // Calculate grid coordinates
      const gridPos = pixelToGrid(node.x, node.y, cellSize, layerId)
      node.gridPos = gridPos
      node.gridWidth = (node.width || 0) / cellSize
      node.gridHeight = (node.height || 0) / cellSize

      // Calculate label bounds for collision detection
      node.labelBounds = calculateLabelBounds(node.label, gridPos, fontSize, cellSize)

      // Update layer bounds for subgraphs
      if (node.isSubgraph) {
        const layer = graph.layers.get(elkNode.id)
        if (layer) {
          const halfW = (node.width || 0) / 2
          const halfH = (node.height || 0) / 2
          layer.bounds = {
            min: pixelToGrid(node.x - halfW, node.y - halfH, cellSize, layerId),
            max: pixelToGrid(node.x + halfW, node.y + halfH, cellSize, layerId),
          }
        }
      }
    }

    // Recursively apply to children
    if (elkNode.children) {
      const childOffsetX = offsetX + (elkNode.x || 0)
      const childOffsetY = offsetY + (elkNode.y || 0)
      // Children are in the subgraph's layer
      const childLayerId = node?.isSubgraph ? elkNode.id : layerId

      for (const child of elkNode.children) {
        applyToNode(child, childOffsetX, childOffsetY, childLayerId)
      }
    }
  }

  // Apply to all root nodes
  if (elkGraph.children) {
    for (const child of elkGraph.children) {
      applyToNode(child, 0, 0, 'root')
    }
  }

  // Generate ports for all nodes
  // Port offset is CONSTANT across view modes - coordinates must match!
  // Set to accommodate iso depth (ISO_Z_HEIGHT = 25px) plus clearance
  const portOffset = 30
  for (const node of graph.nodes.values()) {
    const layerId = node.gridPos?.layer || 'root'
    node.ports = generateNodePorts(node, cellSize, portOffset, layerId)
  }

  // Route edges: skip if skipEdgeRouting is true (for ReactFlow dynamic edges)
  if (!opts.skipEdgeRouting) {
    if (opts.useLibavoid && isLibavoidLoaded()) {
      routeEdgesLibavoid(graph, opts.libavoidOptions)
    } else {
      // Fallback to simple orthogonal router
      routeEdgesOrthogonal(graph, { viewMode: opts.viewMode })
    }
  }

  // Convert edge points to grid coordinates
  for (const edge of graph.edges) {
    if (edge.points && edge.points.length > 0) {
      // Determine the layer for this edge (use source node's layer)
      const fromNode = graph.nodes.get(edge.from)
      const layerId = fromNode?.gridPos?.layer || 'root'

      edge.gridPoints = edge.points.map(p => pixelToGrid(p.x, p.y, cellSize, layerId))

      // Calculate label bounds if edge has a label
      if (edge.label && edge.points.length >= 2) {
        const midIdx = Math.floor(edge.points.length / 2)
        const midPoint = edge.points[midIdx]
        const midGridPos = pixelToGrid(midPoint.x, midPoint.y, cellSize, layerId)
        edge.labelBounds = calculateLabelBounds(edge.label, midGridPos, fontSize - 2, cellSize)
      }
    }
  }
}

/**
 * Layout the graph using ELK
 * Mutates the graph in place, adding x, y, width, height to nodes
 * and points to edges
 */
export async function layoutGraph(graph: Graph, options: LayoutOptions = {}): Promise<Graph> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const elk = new ELK()

  // Convert to ELK format
  const elkGraph = graphToElk(graph, opts)

  // Run ELK layout
  const layoutedGraph = await elk.layout(elkGraph)

  // Apply results back to our graph
  applyElkLayout(graph, layoutedGraph, opts)

  return graph
}

/**
 * Get the bounding box of the laid-out graph
 */
export function getGraphBounds(graph: Graph): {
  x: number
  y: number
  width: number
  height: number
} {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const node of graph.nodes.values()) {
    if (node.x !== undefined && node.y !== undefined && node.width && node.height) {
      const left = node.x - node.width / 2
      const right = node.x + node.width / 2
      const top = node.y - node.height / 2
      const bottom = node.y + node.height / 2

      minX = Math.min(minX, left)
      minY = Math.min(minY, top)
      maxX = Math.max(maxX, right)
      maxY = Math.max(maxY, bottom)
    }
  }

  // Handle edge points too
  for (const edge of graph.edges) {
    if (edge.points) {
      for (const p of edge.points) {
        minX = Math.min(minX, p.x)
        minY = Math.min(minY, p.y)
        maxX = Math.max(maxX, p.x)
        maxY = Math.max(maxY, p.y)
      }
    }
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

export default layoutGraph
