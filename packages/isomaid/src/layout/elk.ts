/**
 * ELK layout engine for isomaid
 *
 * ELK (Eclipse Layout Kernel) properly handles compound/nested graphs
 * unlike dagre which has issues with edges between compound nodes.
 */

import ELK, { ElkNode, ElkExtendedEdge } from 'elkjs/lib/elk.bundled.js'
import type { Graph, Node, GridCoord } from '../model/types'
import { routeEdgesOrthogonal } from './orthogonal-router'
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
}

const DEFAULT_OPTIONS: Required<LayoutOptions> = {
  direction: 'DOWN',
  nodeSpacing: 55,  // Slightly off from component height to avoid iso alignment issues
  layerSpacing: 55,
  padding: 30,
  viewMode: 'flat',
}

/** Default node dimensions based on shape */
function getNodeDimensions(node: Node): { width: number; height: number } {
  const labelLength = node.label.length
  const baseWidth = Math.max(80, labelLength * 10 + 40)

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
function graphToElk(graph: Graph, opts: Required<LayoutOptions>): ElkNode {
  const processedNodes = new Set<string>()

  // Helper to convert a node (and its children) to ELK format
  function convertNode(nodeId: string): ElkNode | null {
    if (processedNodes.has(nodeId)) return null
    processedNodes.add(nodeId)

    const node = graph.nodes.get(nodeId)
    if (!node) return null

    const dims = getNodeDimensions(node)

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
    },
    children: elkNodes,
    edges: allEdges,
  }
}

/**
 * Apply ELK layout results back to our Graph
 */
function applyElkLayout(graph: Graph, elkGraph: ElkNode, opts: Required<LayoutOptions>): void {
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

  // Use A* pathfinding for orthogonal edge routing around obstacles
  routeEdgesOrthogonal(graph, { viewMode: opts.viewMode })

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
