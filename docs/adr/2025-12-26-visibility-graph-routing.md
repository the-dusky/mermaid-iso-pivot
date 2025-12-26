# ADR 2025-12-26: Visibility Graph Edge Routing

## Status
Proposed (Medium-term)

## Context

The current edge routing implementation uses A* pathfinding on a pixel grid:
- Grid cell size: 8px
- Grid created for entire graph bounds
- Each edge requires a fresh grid clone
- Obstacles marked by filling grid cells

This approach has performance issues:
- **Memory**: Large grids for big diagrams (1000x1000 = 1M cells)
- **Speed**: A* on pixel grid explores many redundant nodes
- **Scaling**: O(n²) with diagram size

Commercial tools (yFiles, GoJS) use **Visibility Graph** routing instead.

## Decision

Replace pixel-grid A* with visibility graph routing:

### Algorithm Overview

1. **Build Visibility Graph** (once per layout)
   - Collect all obstacle corners as graph nodes
   - Add port opening corners as nodes
   - For each node pair, test if line-of-sight exists (no obstacle intersection)
   - Store visible connections as graph edges

2. **Route Each Edge**
   - Add source/target ports as temporary nodes
   - Find shortest path through visibility graph (Dijkstra/A*)
   - Path will have much fewer nodes than pixel grid

### Data Structures

```typescript
interface VisibilityNode {
  id: string
  x: number
  y: number
  type: 'corner' | 'port' | 'waypoint'
}

interface VisibilityGraph {
  nodes: Map<string, VisibilityNode>
  edges: Map<string, string[]>  // adjacency list
}

function buildVisibilityGraph(geofenceData: GeofenceData): VisibilityGraph {
  // 1. Collect all obstacle corners
  // 2. Collect all port corridor corners
  // 3. For each pair, check line-of-sight
  // 4. Build adjacency list
}

function routeEdge(
  source: { x: number; y: number },
  target: { x: number; y: number },
  visGraph: VisibilityGraph
): Point[] {
  // 1. Add source/target as temporary nodes
  // 2. Find visible connections to existing nodes
  // 3. Run Dijkstra to find shortest path
  // 4. Return path points
}
```

### Line-of-Sight Test

```typescript
function hasLineOfSight(
  p1: Point,
  p2: Point,
  obstacles: GeofenceData
): boolean {
  // Check if segment p1->p2 intersects any geofence
  // Must respect port corridor openings
}
```

## Consequences

### Positive
- **10-100x faster** for large diagrams
- **Less memory** - graph nodes << grid cells
- **Better paths** - direct lines where possible, not grid-snapped

### Negative
- More complex implementation
- Need efficient line-segment intersection tests
- Rebuilding visibility graph on layout change

### Risks
- Edge cases in line-of-sight with complex geofence shapes
- May need spatial indexing (R-tree) for many obstacles

## Implementation Plan

1. Add line-segment intersection utilities
2. Implement visibility graph builder
3. Implement Dijkstra on visibility graph
4. Add orthogonalization pass (convert any-angle to 90°)
5. Benchmark against current pixel grid approach
6. Replace if ≥5x improvement

## References

- [Visibility Graphs](https://en.wikipedia.org/wiki/Visibility_graph)
- [Shortest Path Among Obstacles](https://www.cs.cmu.edu/~motMDlab/pubs/visibility.pdf)
- [yFiles Edge Routing](https://www.yworks.com/products/yfiles/features#edge-routing)
