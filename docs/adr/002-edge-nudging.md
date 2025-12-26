# ADR-002: Edge Nudging Post-Processing

## Status
Proposed (Long-term)

## Context

After edge routing, multiple edges may share path segments or run very close together:
- Overlapping edges are hard to distinguish
- Parallel edges look like a single thick line
- Edge crossings become ambiguous

Current behavior:
- Edges are routed independently
- No awareness of other edge paths
- Crossings detected but not minimized

Commercial tools apply **nudging** as a post-process to separate edges.

## Decision

Implement edge nudging as a post-processing step after edge routing:

### Algorithm Overview

1. **Detect Shared Segments**
   - Find edge segments that are collinear and overlapping
   - Group edges that share path corridors

2. **Calculate Offsets**
   - For n edges sharing a corridor, space them evenly
   - Offset = corridor_width / (n + 1)
   - Center group within available space

3. **Apply Nudges**
   - Shift each edge perpendicular to shared segment
   - Maintain orthogonal path structure
   - Adjust connecting segments to accommodate offset

### Data Structures

```typescript
interface SharedSegment {
  edges: Edge[]
  start: Point
  end: Point
  direction: 'horizontal' | 'vertical'
}

interface NudgeResult {
  edge: Edge
  offset: number  // perpendicular offset from original
}

function findSharedSegments(edges: Edge[]): SharedSegment[] {
  // Group edges by overlapping collinear segments
}

function calculateNudges(segment: SharedSegment): NudgeResult[] {
  // Distribute edges evenly across available space
}

function applyNudges(edges: Edge[], nudges: Map<Edge, NudgeResult[]>): void {
  // Modify edge points to apply perpendicular offsets
}
```

### Nudging Strategy

```
Before nudging:          After nudging:
     ═══════════              ─────────
     ═══════════              ═════════
     ═══════════              ─────────
     (3 overlapping)          (3 separated)
```

For vertical segments:
```
Before:    After:
  │││        │ │ │
  │││        │ │ │
  │││        │ │ │
```

### Corridor Constraints

- Nudged edges must stay within port corridors
- If corridor too narrow, reduce spacing (minimum 2px)
- Edges entering same port get stacked vertically before port

## Consequences

### Positive
- **Clearer diagrams** - edges visually distinct
- **Fewer ambiguities** - easier to trace edge paths
- **Professional appearance** - matches commercial tool output

### Negative
- Additional processing time
- Increased path complexity (more points)
- May need wider port corridors to accommodate

### Risks
- Edge nudging may conflict with geofence constraints
- Complex cases with many edges meeting at one point
- Performance with many edges (O(n²) segment comparisons)

## Implementation Plan

1. Implement shared segment detection
2. Add nudge calculation logic
3. Implement point adjustment (maintaining orthogonality)
4. Handle corner cases (edges meeting at nodes)
5. Add configurable nudge spacing
6. Optimize with spatial indexing if needed

## Future Enhancements

- **Edge bundling**: Group related edges into bundles
- **Crossing minimization**: Reorder edges to reduce crossings
- **Curved routing**: Bezier curves instead of orthogonal paths

## References

- [Edge Bundling](https://www.aviz.fr/wiki/uploads/Teach/edgebundling.pdf)
- [Orthogonal Graph Drawing](https://link.springer.com/chapter/10.1007/3-540-37623-2_1)
- [yFiles Edge Routing Details](https://docs.yworks.com/yfileshtml/#/dguide/polyline_edge_router)
