/**
 * isomaid - Interactive architecture diagram library
 *
 * Parse Mermaid syntax, layout with ELK, render as SVG
 * with flat or isometric views and drill/layer/fold navigation.
 */

// Core exports
export * from './model'
export * from './parser'
export * from './layout'
export * from './render'
export * from './grid'

// Convenience imports for main workflow
import { parseMermaid } from './parser'
import { layoutGraph, type LayoutOptions } from './layout'
import { render, type RenderOptions } from './render'
import type { Graph } from './model'

export interface DiagramOptions {
  layout?: LayoutOptions
  render?: RenderOptions
}

/**
 * Parse and render a Mermaid diagram to SVG in one step
 */
export async function diagram(
  source: string,
  options: DiagramOptions = {}
): Promise<string> {
  const graph = await parseMermaid(source)

  // Determine view mode from options or parsed config
  const viewMode = options.render?.viewMode ?? graph.config.view ?? 'flat'

  // Pass viewMode to layout so edge gaps are calculated correctly
  await layoutGraph(graph, { viewMode, ...options.layout })

  // Use view mode from parsed config if not specified
  const renderOpts = {
    viewMode: graph.config.view,
    ...options.render,
  }

  return render(graph, renderOpts)
}

/**
 * Parse, layout and return the graph (for custom rendering or manipulation)
 */
export async function parse(
  source: string,
  layoutOptions?: LayoutOptions
): Promise<Graph> {
  const graph = await parseMermaid(source)
  await layoutGraph(graph, layoutOptions)
  return graph
}
