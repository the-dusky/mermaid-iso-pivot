# ReactFlow POC Instructions

## Goal

Replace our custom SVG rendering and interaction handling with ReactFlow (@xyflow/react) to get modern, performant drag/zoom/pan interactions while keeping our Mermaid parser and isometric view capabilities.

## Current Problem

Our custom SVG implementation has poor interaction performance:
- Drag feels sluggish compared to modern tools like FigJam
- Manual coordinate transforms for mouse events
- Complex state management for editing overrides
- "Feels like a 2000s product"

## What ReactFlow Provides

- 60fps drag/zoom/pan out of the box
- Built-in minimap, controls, background grid
- Selection handling (click, multi-select, lasso)
- Node/edge interaction events
- Optimized rendering with virtualization

## Architecture

### Keep (from packages/isomaid)
- `src/parser/mermaid.ts` - Mermaid parsing to Graph model
- `src/model/types.ts` - Graph, Node, Edge types
- `src/layout/dagre.ts` - Initial node positioning
- `src/layout/orthogonal-router.ts` - Edge routing logic

### Replace (in apps/web)
- `src/routes/viewer.tsx` - Replace with ReactFlow-based viewer
- `src/utils/coords.ts` - ReactFlow handles coordinate transforms
- Custom drag/zoom handlers - ReactFlow built-in

### New Custom Components
- Custom node components for each shape (rectangle, cylinder, etc.)
- Custom edge component using our orthogonal routing
- Isometric wrapper (CSS transform on ReactFlow viewport)

## Implementation Steps

### Phase 1: Basic ReactFlow Setup
1. Install `@xyflow/react`
2. Create basic ReactFlow viewer component
3. Convert our Graph model to ReactFlow nodes/edges format
4. Verify basic rendering works

### Phase 2: Custom Nodes
1. Create custom node components for each shape
2. Port shape rendering from `svg.ts` to React components
3. Support subgraph/container rendering

### Phase 3: Custom Edges
1. Create custom edge component
2. Integrate orthogonal router for edge paths
3. Support edge labels and arrows

### Phase 4: Isometric View
1. Wrap ReactFlow in a container with CSS transform
2. Test zoom/pan behavior in iso mode
3. Adjust interaction coordinates if needed

### Phase 5: Features
1. Port collapse/expand for subgraphs
2. Add minimap
3. Export/save functionality

## Key Files to Reference

In the main repo (`/Users/the_dusky/code/sandbox/isomaid`):

- `packages/isomaid/src/model/types.ts` - Core type definitions
- `packages/isomaid/src/parser/mermaid.ts` - Parser implementation
- `packages/isomaid/src/layout/dagre.ts` - Layout algorithm
- `packages/isomaid/src/layout/orthogonal-router.ts` - Edge routing
- `packages/isomaid/src/render/svg.ts` - Shape rendering reference
- `apps/web/src/routes/viewer.tsx` - Current viewer (replace this)

## ReactFlow Basics

```tsx
import { ReactFlow, Node, Edge, useNodesState, useEdgesState } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

function Viewer() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={customNodeTypes}
      edgeTypes={customEdgeTypes}
      fitView
    />
  )
}
```

## Custom Node Example

```tsx
import { Handle, Position, NodeProps } from '@xyflow/react'

function RectangleNode({ data }: NodeProps) {
  return (
    <div style={{
      width: data.width,
      height: data.height,
      background: data.fill,
      border: `2px solid ${data.stroke}`,
      borderRadius: 4,
    }}>
      <Handle type="target" position={Position.Top} />
      <div className="label">{data.label}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}
```

## Conversion Function

```typescript
// Convert our Graph model to ReactFlow format
function graphToReactFlow(graph: Graph): { nodes: Node[], edges: Edge[] } {
  const nodes: Node[] = []

  for (const [id, node] of graph.nodes) {
    nodes.push({
      id,
      type: node.shape || 'rectangle',
      position: { x: node.x ?? 0, y: node.y ?? 0 },
      data: {
        label: node.label,
        width: node.width,
        height: node.height,
        fill: node.style?.fill,
        stroke: node.style?.stroke,
      }
    })
  }

  const edges: Edge[] = graph.edges.map(edge => ({
    id: `${edge.from}->${edge.to}`,
    source: edge.from,
    target: edge.to,
    type: 'orthogonal',
    data: { points: edge.points }
  }))

  return { nodes, edges }
}
```

## Success Criteria

1. Diagrams render correctly with ReactFlow
2. Drag nodes with smooth 60fps performance
3. Zoom/pan feels modern and responsive
4. Isometric view still works via CSS transform
5. Mermaid source updates reflect in diagram
6. Edge routing produces same orthogonal paths

## Commands

```bash
cd /Users/the_dusky/code/sandbox/isomaid-reactflow-poc
pnpm install
pnpm add @xyflow/react --filter web
pnpm run dev
```

Dev server: http://localhost:5173
