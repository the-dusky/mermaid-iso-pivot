/**
 * Core types for arch-explorer
 * These define the internal representation after parsing
 */

// ============ Grid System ============

/** Grid coordinate - the foundational position type */
export interface GridCoord {
  gx: number        // Grid X position
  gy: number        // Grid Y position
  layer: string     // Layer ID ('root' or subgraph ID)
}

/** Bounding box in grid coordinates */
export interface GridBounds {
  min: GridCoord
  max: GridCoord
}

/** Grid system configuration */
export interface GridConfig {
  cellSize: number          // Pixels per grid cell (for rendering)
  defaultLayerSize: number  // Default grid size for new layers (e.g., 250)
}

/** Label bounding box for collision detection */
export interface LabelBounds {
  center: GridCoord
  width: number   // In grid units
  height: number  // In grid units
}

/** Screen coordinates after projection */
export interface ScreenCoord {
  x: number
  y: number
}

/** Port side on a node */
export type PortSide = 'T' | 'R' | 'B' | 'L'

/** Connection port on a node edge */
export interface Port {
  coord: GridCoord     // Grid position of the port
  side: PortSide       // Which edge of the node
  nodeId: string       // Owner node
  edgeId?: string      // Edge using this port (for allocation tracking)
}

/** Edge segment for collision detection */
export interface EdgeSegment {
  from: GridCoord
  to: GridCoord
  edgeId: string
}

// ============ Nodes ============

export type ShapeType = 
  | 'rect'       // default rectangle
  | 'round'      // rounded rectangle
  | 'stadium'    // pill shape
  | 'cylinder'   // database
  | 'circle'     // circle
  | 'diamond'    // decision
  | 'hexagon'    // hexagon
  | 'parallelogram'
  | 'trapezoid'
  | 'subroutine' // double border rect

export interface NodeStyle {
  fill?: string
  stroke?: string
  strokeWidth?: number
  opacity?: number
}

export interface Node {
  id: string
  label: string
  shape: ShapeType
  style?: NodeStyle

  // Hierarchy
  parent?: string      // parent subgraph id
  children?: string[]  // child node ids (if this is a subgraph)
  isSubgraph: boolean

  // Grid coordinates (primary positioning)
  gridPos?: GridCoord           // Position in grid units
  gridWidth?: number            // Width in grid units
  gridHeight?: number           // Height in grid units
  labelBounds?: LabelBounds     // Label collision box

  // Legacy pixel coordinates (populated by layout engine, will be derived from grid)
  x?: number
  y?: number
  width?: number
  height?: number
}

// ============ Edges ============

export type EdgeStyle = 'solid' | 'dashed' | 'dotted' | 'thick'
export type ArrowType = 'arrow' | 'open' | 'circle' | 'cross' | 'none'

export interface Edge {
  id: string
  from: string          // source node id
  to: string            // target node id
  label?: string

  // Arrow styles
  fromArrow?: ArrowType
  toArrow?: ArrowType
  style?: EdgeStyle

  // Port constraints (our extension)
  fromPort?: PortSide
  toPort?: PortSide

  // Grid coordinates for edge vertices (primary positioning)
  gridPoints?: GridCoord[]        // Vertices in grid units (including bends)
  labelBounds?: LabelBounds       // Label collision box

  // Legacy pixel coordinates (populated by layout engine, will be derived from grid)
  points?: Array<{ x: number; y: number }>

  // Edge crossings (for rendering bridges/hops)
  crossings?: Array<{ x: number; y: number }>
}

// ============ Graph ============

export type ViewMode = 'flat' | 'iso'
export type NavMode = 'drill' | 'layer' | 'fold'

export interface GraphConfig {
  view: ViewMode
  nav: NavMode
  grid: GridConfig      // Grid system configuration
}

/** Layer information for hierarchical grids */
export interface LayerInfo {
  id: string                    // 'root' or subgraph ID
  parentId: string | null       // Parent layer ID
  bounds: GridBounds            // Bounds within parent layer
  gridSize: number              // This layer's grid size (e.g., 250)
}

export interface Graph {
  config: GraphConfig
  nodes: Map<string, Node>
  edges: Edge[]
  rootNodes: string[]           // top-level nodes (no parent)
  layers: Map<string, LayerInfo>  // Layer hierarchy
}

// ============ Navigation State ============

export interface NavState {
  // Current view root (for drill mode)
  currentRoot: string | null  // null = show all rootNodes
  
  // Breadcrumb trail (for drill mode)
  breadcrumbs: string[]
  
  // Layer stack (for layer mode)
  layers: string[]  // stack of subgraph ids being shown as layers
  
  // Fold state (for fold mode)
  collapsed: Set<string>  // set of collapsed subgraph ids
}

// ============ Render State ============

export interface RenderState {
  viewMode: ViewMode
  zoom: number
  panX: number
  panY: number
}

// ============ App State ============

export interface AppState {
  graph: Graph | null
  nav: NavState
  render: RenderState
  hoveredNode: string | null
  selectedNode: string | null
}

// ============ Helpers ============

/** Default grid configuration */
export const DEFAULT_GRID_CONFIG: GridConfig = {
  cellSize: 20,           // 20 pixels per grid cell
  defaultLayerSize: 250,  // 250x250 grid for each layer
}

export function createEmptyGraph(): Graph {
  return {
    config: {
      view: 'flat',
      nav: 'drill',
      grid: { ...DEFAULT_GRID_CONFIG },
    },
    nodes: new Map(),
    edges: [],
    rootNodes: [],
    layers: new Map([
      ['root', {
        id: 'root',
        parentId: null,
        bounds: {
          min: { gx: 0, gy: 0, layer: 'root' },
          max: { gx: 250, gy: 250, layer: 'root' },
        },
        gridSize: 250,
      }],
    ]),
  }
}

export function createInitialNavState(): NavState {
  return {
    currentRoot: null,
    breadcrumbs: [],
    layers: [],
    collapsed: new Set(),
  }
}

export function createInitialRenderState(): RenderState {
  return {
    viewMode: 'flat',
    zoom: 1,
    panX: 0,
    panY: 0,
  }
}

export function createInitialAppState(): AppState {
  return {
    graph: null,
    nav: createInitialNavState(),
    render: createInitialRenderState(),
    hoveredNode: null,
    selectedNode: null,
  }
}
