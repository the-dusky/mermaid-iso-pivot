# Type Definitions

Core TypeScript types that define the internal representation of diagrams.

## Nodes

### ShapeType

Available node shapes:

```typescript
type ShapeType =
  | 'rect'           // Default rectangle
  | 'round'          // Rounded rectangle
  | 'stadium'        // Pill shape
  | 'cylinder'       // Database
  | 'circle'         // Circle
  | 'diamond'        // Decision
  | 'hexagon'        // Hexagon
  | 'parallelogram'  // Parallelogram
  | 'trapezoid'      // Trapezoid
  | 'subroutine'     // Double border rectangle
```

### NodeStyle

```typescript
interface NodeStyle {
  fill?: string        // Fill color
  stroke?: string      // Border color
  strokeWidth?: number // Border width
  opacity?: number     // 0-1 transparency
}
```

### Node

```typescript
interface Node {
  id: string
  label: string
  shape: ShapeType
  style?: NodeStyle

  // Hierarchy
  parent?: string       // Parent subgraph ID
  children?: string[]   // Child node IDs (if subgraph)
  isSubgraph: boolean

  // Layout (populated by dagre)
  x?: number
  y?: number
  width?: number
  height?: number
}
```

## Edges

### EdgeStyle

```typescript
type EdgeStyle = 'solid' | 'dashed' | 'dotted' | 'thick'
```

### ArrowType

```typescript
type ArrowType = 'arrow' | 'open' | 'circle' | 'cross' | 'none'
```

### PortSide

For explicit edge anchoring (custom extension):

```typescript
type PortSide = 'T' | 'R' | 'B' | 'L'  // Top, Right, Bottom, Left
```

### Edge

```typescript
interface Edge {
  id: string
  from: string       // Source node ID
  to: string         // Target node ID
  label?: string

  // Arrow styles
  fromArrow?: ArrowType
  toArrow?: ArrowType
  style?: EdgeStyle

  // Port constraints (custom extension)
  fromPort?: PortSide
  toPort?: PortSide

  // Layout (populated by dagre)
  points?: Array<{ x: number; y: number }>
}
```

## Graph

### ViewMode

```typescript
type ViewMode = 'flat' | 'iso'
```

### NavMode

```typescript
type NavMode = 'drill' | 'layer' | 'fold'
```

### GraphConfig

```typescript
interface GraphConfig {
  view: ViewMode
  nav: NavMode
}
```

### Graph

```typescript
interface Graph {
  config: GraphConfig
  nodes: Map<string, Node>
  edges: Edge[]
  rootNodes: string[]   // Top-level nodes (no parent)
}
```

## State Types

### NavState

```typescript
interface NavState {
  currentRoot: string | null  // Current drill position (null = root)
  breadcrumbs: string[]       // Trail for drill mode
  layers: string[]            // Stack for layer mode
  collapsed: Set<string>      // Collapsed subgraphs for fold mode
}
```

### RenderState

```typescript
interface RenderState {
  viewMode: ViewMode
  zoom: number
  panX: number
  panY: number
}
```

### AppState

```typescript
interface AppState {
  graph: Graph | null
  nav: NavState
  render: RenderState
  hoveredNode: string | null
  selectedNode: string | null
}
```

## Helper Functions

### createEmptyGraph()

Returns a new empty Graph with default config.

### createInitialNavState()

Returns initial navigation state (at root, nothing collapsed).

### createInitialRenderState()

Returns initial render state (flat view, zoom 1, no pan).

### createInitialAppState()

Returns complete initial application state.
