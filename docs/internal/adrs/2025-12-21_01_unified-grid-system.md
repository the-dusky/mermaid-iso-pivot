# Unified Grid Coordinate System

## Issue

The diagram system needs a foundational coordinate system that:
1. Works identically in flat and isometric views
2. Supports hierarchical layers (drill navigation)
3. Enables snap-to-grid editing
4. Provides collision detection for edge routing around labels

Currently, positions are stored as pixel coordinates which makes view interoperability difficult and doesn't support the layered grid concept needed for drill navigation.

## Decision

Implement a unified grid coordinate system as the foundation for all positioning:

1. **Grid coordinates** - All positions stored as grid units, not pixels
2. **Layered grids** - Each subgraph has its own grid layer (like building floors)
3. **View projection** - Flat and iso views project the same grid differently
4. **Collision system** - Labels have invisible bounding boxes for edge routing

## Status

**Implemented**

## Group

Core

## Assumptions

- Grid cell size can be configurable but defaults to a reasonable value
- Text metrics can be calculated for label bounding boxes
- The grid system must not break existing auto-layout (ELK positions get snapped to grid)

## Constraints

- Must be backward compatible with current pixel-based rendering
- Grid resolution must balance precision vs. performance
- Label collision boxes must work in both view modes

## Positions

1. **Pixel coordinates with snap-on-edit**
   - Pros: Minimal changes to existing code
   - Cons: Doesn't solve view interoperability, complex layer math

2. **Grid coordinates throughout** (chosen)
   - Pros: Clean abstraction, trivial view switching, natural layer hierarchy
   - Cons: Requires refactoring existing position handling

3. **Dual coordinate systems**
   - Pros: Backward compatible
   - Cons: Complexity, potential sync issues

## Argument

Grid coordinates throughout provides the cleanest foundation:
- Single source of truth for positions
- View modes become pure projection functions
- Layer scaling is simple multiplication
- Snap-to-grid is implicit (positions ARE grid coords)
- Edge routing uses same coordinate space as nodes

## Implications

- Need to define `GridCoord` type: `{ gx: number, gy: number, layer: string }`
- ELK layout output must be converted to grid coordinates
- Rendering functions receive grid coords, project to screen space
- Edge routing operates in grid space
- Existing tests may need updates for coordinate changes

## Related Decisions

- [2025-12-20_01](./2025-12-20_01_basic-rendering.md) - Rendering pipeline will use grid coords
- [2025-12-20_02](./2025-12-20_02_isometric-rendering.md) - Iso projection from grid coords
- [2025-12-20_03](./2025-12-20_03_drill-navigation.md) - Drill uses grid layers
- [2025-12-20_06](./2025-12-20_06_interactive-diagram-editing.md) - Editing snaps to grid

## Related Requirements

- Flat ↔ iso view switching without position drift
- Drill navigation between subgraph layers
- Interactive diagram editing with snap-to-grid

## Related Artifacts

- [packages/isomaid/src/model/types.ts](../../../packages/isomaid/src/model/types.ts) - GridCoord, GridBounds, LayerInfo types
- [packages/isomaid/src/grid/index.ts](../../../packages/isomaid/src/grid/index.ts) - Projection, snapping, and bounds utilities
- [packages/isomaid/src/layout/elk.ts](../../../packages/isomaid/src/layout/elk.ts) - Grid coordinate population after layout

## Related Principles

- Single source of truth
- Separation of concerns (coordinates vs. projection)
- Pure functions (projection is stateless transform)

## Notes

### Grid Coordinate Types

```typescript
interface GridCoord {
  gx: number        // Grid X position
  gy: number        // Grid Y position
  layer: string     // Layer ID (root, or subgraph ID)
}

interface GridBounds {
  min: GridCoord
  max: GridCoord
}

interface GridConfig {
  cellSize: number  // Pixels per grid cell (for rendering)
  defaultLayerSize: number  // Default grid size for new layers (e.g., 250)
}
```

### Layer Hierarchy

```
Root Layer: (0,0) to (100,100)
├── SubgraphA at (10,10) to (30,30) in root
│   └── SubgraphA Layer: (0,0) to (250,250)  // Expanded
│       ├── NodeA1 at (50,50)
│       └── NodeA2 at (150,100)
└── SubgraphB at (50,50) to (80,80) in root
    └── SubgraphB Layer: (0,0) to (250,250)
```

### Coordinate Translation

```typescript
// Parent grid coord → Child grid coord
function toChildCoord(
  parentCoord: GridCoord,
  parentBounds: GridBounds,  // Subgraph bounds in parent
  childLayerSize: number     // e.g., 250
): GridCoord {
  const parentWidth = parentBounds.max.gx - parentBounds.min.gx
  const parentHeight = parentBounds.max.gy - parentBounds.min.gy

  const relX = parentCoord.gx - parentBounds.min.gx
  const relY = parentCoord.gy - parentBounds.min.gy

  return {
    gx: (relX / parentWidth) * childLayerSize,
    gy: (relY / parentHeight) * childLayerSize,
    layer: childLayerId
  }
}
```

### Label Collision Boxes

```typescript
interface LabelBounds {
  center: GridCoord
  width: number   // In grid units
  height: number  // In grid units
}

function getLabelBounds(
  text: string,
  position: GridCoord,
  fontSize: number,
  gridCellSize: number
): LabelBounds {
  // Calculate text metrics, convert to grid units
  const charWidth = fontSize * 0.6  // Approximate
  const pixelWidth = text.length * charWidth
  const pixelHeight = fontSize * 1.2

  return {
    center: position,
    width: Math.ceil(pixelWidth / gridCellSize),
    height: Math.ceil(pixelHeight / gridCellSize)
  }
}
```

### View Projection

```typescript
// Grid → Screen (Flat)
function projectFlat(coord: GridCoord, cellSize: number): { x: number, y: number } {
  return {
    x: coord.gx * cellSize,
    y: coord.gy * cellSize
  }
}

// Grid → Screen (Isometric)
function projectIso(coord: GridCoord, cellSize: number): { sx: number, sy: number } {
  const x = coord.gx * cellSize
  const y = coord.gy * cellSize
  const cos30 = 0.866
  const sin30 = 0.5
  return {
    sx: (x - y) * cos30,
    sy: (x + y) * sin30
  }
}
```

### Grid-Based Ports

Nodes have discrete connection points (ports) at grid intervals along their edges.
This prevents edges from overlapping at connection points and enables clean routing.

```
For a node at grid bounds (1,1) to (5,5):

        (2,1)  (3,1)  (4,1)
           ↓      ↓      ↓
    +------+------+------+------+
    |                           |
(1,2)→                          ←(5,2)
    |                           |
(1,3)→         NODE             ←(5,3)
    |                           |
(1,4)→                          ←(5,4)
    |                           |
    +------+------+------+------+
           ↑      ↑      ↑
        (2,5)  (3,5)  (4,5)
```

```typescript
interface Port {
  coord: GridCoord     // Grid position of the port
  side: 'T' | 'R' | 'B' | 'L'  // Which edge of the node
  nodeId: string       // Owner node
}

/**
 * Generate ports for a node based on its grid bounds
 * Ports are placed at each interior grid point along edges
 */
function generatePorts(
  nodeId: string,
  bounds: GridBounds
): Port[] {
  const ports: Port[] = []
  const { min, max } = bounds

  // Top edge (exclude corners)
  for (let gx = min.gx + 1; gx < max.gx; gx++) {
    ports.push({ coord: { gx, gy: min.gy, layer: min.layer }, side: 'T', nodeId })
  }

  // Right edge (exclude corners)
  for (let gy = min.gy + 1; gy < max.gy; gy++) {
    ports.push({ coord: { gx: max.gx, gy, layer: min.layer }, side: 'R', nodeId })
  }

  // Bottom edge (exclude corners)
  for (let gx = min.gx + 1; gx < max.gx; gx++) {
    ports.push({ coord: { gx, gy: max.gy, layer: min.layer }, side: 'B', nodeId })
  }

  // Left edge (exclude corners)
  for (let gy = min.gy + 1; gy < max.gy; gy++) {
    ports.push({ coord: { gx: min.gx, gy, layer: min.layer }, side: 'L', nodeId })
  }

  return ports
}
```

### Edge-to-Edge Collision Prevention

Edges must not overlap each other. This is enforced by:
1. **Port allocation** - Each port can only be used by one edge
2. **Grid-based routing** - Edge segments travel along grid lines
3. **Segment collision detection** - Parallel segments on the same grid line must be offset

```typescript
interface EdgeSegment {
  from: GridCoord
  to: GridCoord
  edgeId: string
}

/**
 * Check if two horizontal/vertical segments overlap
 */
function segmentsOverlap(a: EdgeSegment, b: EdgeSegment): boolean {
  // Same layer check
  if (a.from.layer !== b.from.layer) return false

  // Both horizontal
  if (a.from.gy === a.to.gy && b.from.gy === b.to.gy) {
    if (a.from.gy !== b.from.gy) return false
    // Check X overlap
    const aMinX = Math.min(a.from.gx, a.to.gx)
    const aMaxX = Math.max(a.from.gx, a.to.gx)
    const bMinX = Math.min(b.from.gx, b.to.gx)
    const bMaxX = Math.max(b.from.gx, b.to.gx)
    return aMinX < bMaxX && bMinX < aMaxX
  }

  // Both vertical
  if (a.from.gx === a.to.gx && b.from.gx === b.to.gx) {
    if (a.from.gx !== b.from.gx) return false
    // Check Y overlap
    const aMinY = Math.min(a.from.gy, a.to.gy)
    const aMaxY = Math.max(a.from.gy, a.to.gy)
    const bMinY = Math.min(b.from.gy, b.to.gy)
    const bMaxY = Math.max(b.from.gy, b.to.gy)
    return aMinY < bMaxY && bMinY < aMaxY
  }

  return false
}
```

---

*Created: 2025-12-21*
*Last Updated: 2025-12-21*
