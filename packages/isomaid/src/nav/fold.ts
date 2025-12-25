/**
 * Fold navigation for isomaid diagrams
 *
 * Fold mode shows all nodes, but allows collapsing/expanding subgraphs in place.
 * Collapsed subgraphs hide their children but remain visible themselves.
 */

import type { Graph, NavState } from '../model/types'

/**
 * Toggle the collapsed state of a subgraph
 */
export function toggleFold(navState: NavState, subgraphId: string): NavState {
  const collapsed = new Set(navState.collapsed)

  if (collapsed.has(subgraphId)) {
    collapsed.delete(subgraphId)
  } else {
    collapsed.add(subgraphId)
  }

  return {
    ...navState,
    collapsed,
  }
}

/**
 * Expand a subgraph (show its children)
 */
export function expandSubgraph(navState: NavState, subgraphId: string): NavState {
  const collapsed = new Set(navState.collapsed)
  collapsed.delete(subgraphId)

  return {
    ...navState,
    collapsed,
  }
}

/**
 * Collapse a subgraph (hide its children)
 */
export function collapseSubgraph(navState: NavState, subgraphId: string): NavState {
  const collapsed = new Set(navState.collapsed)
  collapsed.add(subgraphId)

  return {
    ...navState,
    collapsed,
  }
}

/**
 * Expand all subgraphs
 */
export function expandAll(navState: NavState): NavState {
  return {
    ...navState,
    collapsed: new Set(),
  }
}

/**
 * Collapse all subgraphs
 */
export function collapseAll(graph: Graph, navState: NavState): NavState {
  const allSubgraphs = new Set<string>()

  for (const [nodeId, node] of graph.nodes) {
    if (node.isSubgraph) {
      allSubgraphs.add(nodeId)
    }
  }

  return {
    ...navState,
    collapsed: allSubgraphs,
  }
}

/**
 * Get all nodes that should be visible in fold mode
 *
 * A node is visible if:
 * 1. It's a root node, OR
 * 2. All of its ancestors are expanded (not collapsed)
 */
export function getVisibleNodesInFoldMode(graph: Graph, navState: NavState): string[] {
  const visible: string[] = []

  function isNodeVisible(nodeId: string): boolean {
    const node = graph.nodes.get(nodeId)
    if (!node) return false

    // Root nodes are always visible
    if (!node.parent) return true

    // Check if parent is collapsed
    if (navState.collapsed.has(node.parent)) {
      return false
    }

    // Recursively check ancestors
    return isNodeVisible(node.parent)
  }

  // Check all nodes
  for (const nodeId of graph.nodes.keys()) {
    if (isNodeVisible(nodeId)) {
      visible.push(nodeId)
    }
  }

  return visible
}

/**
 * Get edges that should be visible in fold mode
 *
 * An edge is visible if both its source and target nodes are visible
 */
export function getVisibleEdgesInFoldMode(graph: Graph, navState: NavState): typeof graph.edges {
  const visibleNodeIds = new Set(getVisibleNodesInFoldMode(graph, navState))

  return graph.edges.filter(edge =>
    visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to)
  )
}
