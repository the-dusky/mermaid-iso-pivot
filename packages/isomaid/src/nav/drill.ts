/**
 * Drill navigation for isomaid diagrams
 *
 * Drill mode replaces the entire view with the children of a clicked subgraph.
 * Users can navigate back using breadcrumbs.
 */

import type { Graph, NavState, Node } from '../model/types'

/**
 * Drill down into a subgraph
 * Returns updated NavState
 */
export function drillInto(graph: Graph, navState: NavState, subgraphId: string): NavState {
  const node = graph.nodes.get(subgraphId)

  // Can only drill into subgraphs
  if (!node || !node.isSubgraph) {
    console.warn(`Cannot drill into ${subgraphId}: not a subgraph`)
    return navState
  }

  // Build new breadcrumb trail
  const newBreadcrumbs = [...navState.breadcrumbs, subgraphId]

  return {
    ...navState,
    currentRoot: subgraphId,
    breadcrumbs: newBreadcrumbs,
  }
}

/**
 * Navigate back one level (pop breadcrumb)
 * Returns updated NavState
 */
export function drillOut(navState: NavState): NavState {
  if (navState.breadcrumbs.length === 0) {
    // Already at top level
    return navState
  }

  // Remove last breadcrumb
  const newBreadcrumbs = navState.breadcrumbs.slice(0, -1)
  const newRoot = newBreadcrumbs.length > 0
    ? newBreadcrumbs[newBreadcrumbs.length - 1]
    : null

  return {
    ...navState,
    currentRoot: newRoot,
    breadcrumbs: newBreadcrumbs,
  }
}

/**
 * Jump to a specific level in the breadcrumb trail
 * index 0 = root level, 1 = first subgraph, etc.
 * Returns updated NavState
 */
export function drillToLevel(navState: NavState, index: number): NavState {
  if (index < 0 || index > navState.breadcrumbs.length) {
    console.warn(`Invalid breadcrumb index: ${index}`)
    return navState
  }

  // index 0 means go to root
  if (index === 0) {
    return {
      ...navState,
      currentRoot: null,
      breadcrumbs: [],
    }
  }

  // Otherwise, trim breadcrumbs to the specified level
  const newBreadcrumbs = navState.breadcrumbs.slice(0, index)
  const newRoot = newBreadcrumbs[newBreadcrumbs.length - 1]

  return {
    ...navState,
    currentRoot: newRoot,
    breadcrumbs: newBreadcrumbs,
  }
}

/**
 * Get the nodes that should be visible in the current drill view
 *
 * If currentRoot is null, returns only root-level nodes.
 * Otherwise, returns the children of the current root subgraph.
 *
 * Subgraphs are rendered as collapsed nodes - their children are NOT shown
 * unless you drill into them.
 */
export function getVisibleNodes(graph: Graph, navState: NavState): string[] {
  if (navState.currentRoot === null) {
    // At top level - show only root nodes (top-level containers)
    return graph.rootNodes
  }

  // Inside a subgraph - show its immediate children only
  const rootNode = graph.nodes.get(navState.currentRoot)
  if (!rootNode || !rootNode.isSubgraph) {
    console.warn(`Current root ${navState.currentRoot} is not a subgraph`)
    return graph.rootNodes
  }

  return rootNode.children || []
}

/**
 * Get edges that should be visible in the current drill view
 *
 * An edge is visible if both its source and target are in the visible node set.
 */
export function getVisibleEdges(graph: Graph, navState: NavState): typeof graph.edges {
  const visibleNodeIds = new Set(getVisibleNodes(graph, navState))

  return graph.edges.filter(edge =>
    visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to)
  )
}

/**
 * Build breadcrumb trail for display
 * Returns array of {id, label} for each level
 */
export function getBreadcrumbTrail(graph: Graph, navState: NavState): Array<{ id: string | null; label: string }> {
  const trail: Array<{ id: string | null; label: string }> = [
    { id: null, label: 'Root' }
  ]

  for (const nodeId of navState.breadcrumbs) {
    const node = graph.nodes.get(nodeId)
    trail.push({
      id: nodeId,
      label: node?.label || nodeId,
    })
  }

  return trail
}
