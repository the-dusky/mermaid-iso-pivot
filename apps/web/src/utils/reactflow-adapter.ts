/**
 * Converts our Graph model to ReactFlow nodes and edges format
 */

import type { Node as RFNode, Edge as RFEdge } from '@xyflow/react'
import type { Graph, Node } from 'isomaid'

export interface ConversionResult {
  nodes: RFNode[]
  edges: RFEdge[]
}

/**
 * Calculate the depth of a node in the hierarchy (0 = root level)
 */
function getNodeDepth(node: Node, allNodes: Map<string, Node>): number {
  let depth = 0
  let current = node
  while (current.parent) {
    depth++
    const parent = allNodes.get(current.parent)
    if (!parent) break
    current = parent
  }
  return depth
}

/**
 * Convert our Graph model to ReactFlow format
 */
export function graphToReactFlow(graph: Graph, viewMode: 'flat' | 'iso' = 'flat'): ConversionResult {
  const nodes: RFNode[] = []
  const edges: RFEdge[] = []

  // First pass: collect parent positions for relative positioning
  const parentPositions = new Map<string, { x: number; y: number }>()
  for (const [id, node] of graph.nodes) {
    if (node.isSubgraph) {
      parentPositions.set(id, { x: node.x ?? 0, y: node.y ?? 0 })
    }
  }

  // Convert nodes - subgraphs first, then children
  // ReactFlow requires parent nodes to be defined before children
  const sortedNodes = Array.from(graph.nodes.entries()).sort(([, a], [, b]) => {
    // Subgraphs come first
    if (a.isSubgraph && !b.isSubgraph) return -1
    if (!a.isSubgraph && b.isSubgraph) return 1
    // Among subgraphs, parents come before children (by depth)
    const aDepth = getNodeDepth(a, graph.nodes)
    const bDepth = getNodeDepth(b, graph.nodes)
    return aDepth - bDepth
  })

  for (const [id, node] of sortedNodes) {
    // Determine the node type (string to allow 'subgraph' which isn't a ShapeType)
    let nodeType: string = node.shape || 'rect'
    if (node.isSubgraph) {
      nodeType = 'subgraph'
    }

    // Get node dimensions
    const width = node.width ?? 100
    const height = node.height ?? 40

    // Calculate position - convert from CENTER (graph model) to TOP-LEFT (ReactFlow)
    // Our graph model stores positions as center coordinates, but ReactFlow uses top-left
    let position = {
      x: (node.x ?? 0) - width / 2,
      y: (node.y ?? 0) - height / 2,
    }

    if (node.parent) {
      const parentPos = parentPositions.get(node.parent)
      const parent = graph.nodes.get(node.parent)
      if (parentPos && parent) {
        // Parent position is also center, convert both to get relative position
        const parentWidth = parent.width ?? 100
        const parentHeight = parent.height ?? 40
        const parentTopLeft = {
          x: parentPos.x - parentWidth / 2,
          y: parentPos.y - parentHeight / 2,
        }
        // Position is relative to parent's top-left in ReactFlow
        position = {
          x: position.x - parentTopLeft.x,
          y: position.y - parentTopLeft.y,
        }
      }
    }

    const rfNode: RFNode = {
      id,
      type: nodeType,
      position,
      data: {
        label: node.label,
        width: node.width,
        height: node.height,
        fill: node.style?.fill,
        stroke: node.style?.stroke,
        strokeWidth: node.style?.strokeWidth,
        opacity: node.style?.opacity,
        isSubgraph: node.isSubgraph,
        children: node.children,
        ports: node.ports,
        viewMode, // Pass viewMode for conditional 3D rendering
      },
      // ReactFlow properties
      draggable: true,
      selectable: true,
    }

    // Set parent for ReactFlow subflow hierarchy
    if (node.parent) {
      rfNode.parentId = node.parent
      // Extent controls how far child can be dragged outside parent
      rfNode.extent = 'parent'
    }

    nodes.push(rfNode)
  }

  // Convert edges
  for (const edge of graph.edges) {
    edges.push({
      id: `${edge.from}->${edge.to}`,
      source: edge.from,
      target: edge.to,
      type: 'floating', // Use floating edges for dynamic connection points
      data: {
        label: edge.label,
        points: edge.points,
        fromArrow: edge.fromArrow,
        toArrow: edge.toArrow,
        style: edge.style,
        sourcePort: edge.sourcePort,
        targetPort: edge.targetPort,
        crossings: edge.crossings,
        viewMode, // Pass viewMode for isometric edge rendering
      },
      // ReactFlow properties - add arrow marker
      markerEnd: 'arrowhead',
      animated: false,
      selectable: true,
    })
  }

  return { nodes, edges }
}

/**
 * Convert ReactFlow node positions back to our Graph model
 */
export function updateGraphFromReactFlow(
  graph: Graph,
  rfNodes: RFNode[]
): Graph {
  const updatedNodes = new Map(graph.nodes)

  for (const rfNode of rfNodes) {
    const node = updatedNodes.get(rfNode.id)
    if (node) {
      updatedNodes.set(rfNode.id, {
        ...node,
        x: rfNode.position.x,
        y: rfNode.position.y,
      })
    }
  }

  return {
    ...graph,
    nodes: updatedNodes,
  }
}
