/**
 * Mermaid parser for arch-explorer
 *
 * Parses Mermaid flowchart syntax and converts to our internal Graph model.
 * Also extracts our custom %%{arch: ...}%% directives.
 */

import mermaid from 'mermaid'
import type { Graph, GraphConfig, Node, Edge, ShapeType, ViewMode, NavMode, LayerInfo } from '../model/types'
import { createEmptyGraph, DEFAULT_GRID_CONFIG } from '../model/types'

// Initialize mermaid (don't auto-render, we just want parsing)
mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'loose',
})

/**
 * Extract our custom arch directive from Mermaid source
 * Format: %%{arch: {view: "iso", nav: "drill"}}%%
 */
function extractArchDirective(source: string): { config: Partial<GraphConfig>; cleanSource: string } {
  const archPattern = /%%\{arch:\s*(\{[^}]+\})\s*\}%%/
  const match = source.match(archPattern)

  if (!match) {
    return { config: {}, cleanSource: source }
  }

  try {
    const configStr = match[1]
    // Parse the JSON-like config (handle unquoted keys)
    const normalized = configStr
      .replace(/(\w+):/g, '"$1":')
      .replace(/'/g, '"')
    const parsed = JSON.parse(normalized)

    const config: Partial<GraphConfig> = {}
    if (parsed.view === 'iso' || parsed.view === 'flat') {
      config.view = parsed.view as ViewMode
    }
    if (parsed.nav === 'drill' || parsed.nav === 'layer' || parsed.nav === 'fold') {
      config.nav = parsed.nav as NavMode
    }

    const cleanSource = source.replace(archPattern, '').trim()
    return { config, cleanSource }
  } catch {
    console.warn('Failed to parse arch directive:', match[1])
    return { config: {}, cleanSource: source }
  }
}

/**
 * Map Mermaid shape syntax to our ShapeType
 */
function mapShape(mermaidShape: string | undefined): ShapeType {
  if (!mermaidShape) return 'rect'

  // Mermaid uses various shape indicators
  const shapeMap: Record<string, ShapeType> = {
    'rect': 'rect',
    'round': 'round',
    'stadium': 'stadium',
    'cylinder': 'cylinder',
    'circle': 'circle',
    'diamond': 'diamond',
    'hexagon': 'hexagon',
    'parallelogram': 'parallelogram',
    'trapezoid': 'trapezoid',
    'subroutine': 'subroutine',
    // Mermaid-specific shape names
    'square': 'rect',
    'odd': 'trapezoid',
    'lean_right': 'parallelogram',
    'lean_left': 'parallelogram',
    'database': 'cylinder',
  }

  return shapeMap[mermaidShape.toLowerCase()] || 'rect'
}

/**
 * Parse Mermaid source into our Graph model
 */
export async function parseMermaid(source: string): Promise<Graph> {
  const graph = createEmptyGraph()

  // Extract our custom directive
  const { config, cleanSource } = extractArchDirective(source)
  graph.config = {
    view: config.view || 'flat',
    nav: config.nav || 'drill',
    grid: { ...DEFAULT_GRID_CONFIG },
  }

  // Validate with Mermaid
  try {
    const parseResult = await mermaid.parse(cleanSource)
    if (!parseResult) {
      throw new Error('Failed to parse Mermaid diagram')
    }
  } catch (error) {
    console.error('Mermaid parse error:', error)
    throw error
  }

  // Mermaid doesn't expose a clean AST API, so we need to parse the syntax ourselves
  // for the flowchart subset. This is a simplified parser for flowchart TD/LR syntax.
  const lines = cleanSource.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'))

  let currentSubgraph: string | null = null
  const subgraphStack: string[] = []

  for (const line of lines) {
    // Skip flowchart declaration
    if (line.match(/^flowchart\s+(TD|TB|LR|RL|BT)/i)) {
      continue
    }

    // Subgraph start: subgraph ID["Label"]
    const subgraphMatch = line.match(/^subgraph\s+(\w+)(?:\["([^"]+)"\])?/)
    if (subgraphMatch) {
      const [, id, label] = subgraphMatch
      const parentLayerId = currentSubgraph || 'root'

      const node: Node = {
        id,
        label: label || id,
        shape: 'rect',
        isSubgraph: true,
        parent: currentSubgraph || undefined,
        children: [],
        // Grid position will be set by layout, but initialize layer
        gridPos: { gx: 0, gy: 0, layer: parentLayerId },
      }
      graph.nodes.set(id, node)

      // Create a layer for this subgraph
      const layerInfo: LayerInfo = {
        id,
        parentId: parentLayerId,
        bounds: {
          min: { gx: 0, gy: 0, layer: parentLayerId },
          max: { gx: 0, gy: 0, layer: parentLayerId }, // Will be set after layout
        },
        gridSize: graph.config.grid.defaultLayerSize,
      }
      graph.layers.set(id, layerInfo)

      if (currentSubgraph) {
        subgraphStack.push(currentSubgraph)
        const parent = graph.nodes.get(currentSubgraph)
        if (parent) {
          parent.children = parent.children || []
          parent.children.push(id)
        }
      } else {
        graph.rootNodes.push(id)
      }

      currentSubgraph = id
      continue
    }

    // Subgraph end
    if (line === 'end') {
      currentSubgraph = subgraphStack.pop() || null
      continue
    }

    // Edge: A --> B or A -->|label| B
    const edgeMatch = line.match(/^(\w+)\s*(-->|---|-\.\->|==>)\s*(?:\|([^|]+)\|)?\s*(\w+)/)
    if (edgeMatch) {
      const [, from, , label, to] = edgeMatch

      // Ensure nodes exist
      ensureNode(graph, from, currentSubgraph)
      ensureNode(graph, to, currentSubgraph)

      const edge: Edge = {
        id: `${from}-${to}-${graph.edges.length}`,
        from,
        to,
        label: label || undefined,
        toArrow: 'arrow',
      }
      graph.edges.push(edge)
      continue
    }

    // Node definition: A[Label] or A[(Database)] or A{Decision}
    const nodeMatch = line.match(/^(\w+)([\[\(\{<])([^\]\)\}>]+)([\]\)\}>])/)
    if (nodeMatch) {
      const [, id, openBracket, label, closeBracket] = nodeMatch
      const shape = detectShape(openBracket, closeBracket, label)

      const existingNode = graph.nodes.get(id)
      if (existingNode) {
        existingNode.label = label.replace(/^\(|\)$/g, '') // Clean cylinder syntax
        existingNode.shape = shape
      } else {
        const layerId = currentSubgraph || 'root'
        const node: Node = {
          id,
          label: label.replace(/^\(|\)$/g, ''),
          shape,
          isSubgraph: false,
          parent: currentSubgraph || undefined,
          gridPos: { gx: 0, gy: 0, layer: layerId }, // Will be set by layout
        }
        graph.nodes.set(id, node)

        if (currentSubgraph) {
          const parent = graph.nodes.get(currentSubgraph)
          if (parent) {
            parent.children = parent.children || []
            if (!parent.children.includes(id)) {
              parent.children.push(id)
            }
          }
        } else if (!graph.rootNodes.includes(id)) {
          graph.rootNodes.push(id)
        }
      }
    }
  }

  return graph
}

/**
 * Detect shape from Mermaid bracket syntax
 */
function detectShape(open: string, close: string, content: string): ShapeType {
  // [(text)] = cylinder (database)
  if (open === '[' && content.startsWith('(') && content.endsWith(')')) {
    return 'cylinder'
  }
  // [text] = rect
  if (open === '[' && close === ']') {
    return 'rect'
  }
  // (text) = round rect (stadium)
  if (open === '(' && close === ')') {
    return 'round'
  }
  // {text} = diamond
  if (open === '{' && close === '}') {
    return 'diamond'
  }
  // <text> = not standard, but treat as rect
  if (open === '<' && close === '>') {
    return 'rect'
  }
  return 'rect'
}

/**
 * Ensure a node exists in the graph (create placeholder if needed)
 */
function ensureNode(graph: Graph, id: string, currentSubgraph: string | null): void {
  if (graph.nodes.has(id)) return

  const layerId = currentSubgraph || 'root'
  const node: Node = {
    id,
    label: id,
    shape: 'rect',
    isSubgraph: false,
    parent: currentSubgraph || undefined,
    gridPos: { gx: 0, gy: 0, layer: layerId }, // Will be set by layout
  }
  graph.nodes.set(id, node)

  if (currentSubgraph) {
    const parent = graph.nodes.get(currentSubgraph)
    if (parent) {
      parent.children = parent.children || []
      if (!parent.children.includes(id)) {
        parent.children.push(id)
      }
    }
  } else if (!graph.rootNodes.includes(id)) {
    graph.rootNodes.push(id)
  }
}

export default parseMermaid
