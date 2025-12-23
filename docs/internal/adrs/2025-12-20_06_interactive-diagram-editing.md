# Interactive Diagram Editing

## Issue

Users need the ability to adjust diagrams visually after the automatic layout has been applied. Currently, diagrams are rendered from Mermaid source with automatic layout, but there's no way to fine-tune positions, edge routing, or styling without modifying source code parameters.

## Decision

Implement an interactive diagram editing mode that allows users to visually adjust:
1. **Node positions** - Drag nodes to reposition them manually
2. **Edge routing** - Adjust edge paths and bend points
3. **Visual styling** - Change colors, sizes, stroke widths interactively
4. **Layout parameters** - Tweak spacing, gaps, padding with live preview

## Status

**Proposed**

## Group

UI

## Assumptions

- Users want quick visual adjustments without modifying source
- Layout adjustments should be exportable (back to enhanced Mermaid or as JSON state)
- The base Mermaid source should remain the source of truth for structure
- Position overrides layer on top of auto-layout

## Constraints

- Must work with both flat and isometric views
- Edge routing must recalculate when nodes move
- Must not break existing auto-layout pipeline
- Changes should be serializable for persistence
- Mobile/touch support is desirable but not required initially
- **Unified grid system** - Same grid in flat and iso views for interoperability

## Positions

1. **Canvas-based drawing editor**
   - Pros: Full pixel control, high performance for large diagrams
   - Cons: Complex implementation, loses SVG benefits (accessibility, CSS styling, printing)

2. **SVG with drag-and-drop** (chosen)
   - Pros: Maintains SVG pipeline, CSS styling works, simpler implementation
   - Cons: Performance limits on very large diagrams

3. **External editor integration**
   - Pros: Reuse existing tools (Excalidraw, Draw.io)
   - Cons: Loses isometric mode, different mental model, complex data sync

4. **Code-only adjustments**
   - Pros: Simplest, no new UI
   - Cons: Poor UX, steep learning curve for tweaking positions

## Argument

SVG drag-and-drop provides the best balance:
- Leverages existing SVG rendering pipeline
- Familiar interaction model (drag nodes, bend edges)
- CSS styling and accessibility maintained
- Can serialize position overrides to Mermaid comments or external JSON
- Isometric mode transforms apply naturally

## Implications

- Need to track "position overrides" separate from auto-layout positions
- Edge routing must re-run when nodes are manually moved
- UI needs edit/view mode toggle
- Need persistence strategy (localStorage, export to file, embed in Mermaid)
- May need undo/redo stack

## Related Decisions

- [2025-12-20_01](./2025-12-20_01_basic-rendering.md) - SVG rendering foundation
- [2025-12-20_02](./2025-12-20_02_isometric-rendering.md) - Must work with iso transforms

## Related Requirements

- Interactive diagram adjustment without code changes
- Export adjusted positions for reproducibility

## Related Artifacts

- None yet

## Related Principles

- Keep it simple - start with node dragging, add edge editing later
- SVG over Canvas/WebGL - maintain existing approach
- Pure functions where possible - position overrides as data layer

## Notes

### Unified Grid System
- Both flat and iso views share the same underlying coordinate grid
- All positions stored as grid coordinates (not screen pixels)
- Flat view renders grid as 2D squares
- Iso view projects the same grid through isometric transform
- This ensures diagrams edited in one view work correctly in the other

### Layered Grids (Drill Navigation)
- Each subgraph/container has its own grid layer (like floors in a building)
- Drilling into a subgraph = going down a floor to that layer's grid
- Child nodes are positioned on their parent's grid
- Iso view naturally represents this as Z-depth (floors stacking)
- Makes drill navigation intuitive: you're navigating grid layers

**Grid scaling between layers:**
- Parent level: subgraph occupies small bounds, e.g. `(1,1)` to `(5,5)` = 4x4 cells
- Child level: that same space expands to full grid, e.g. `(1,1)` to `(250,250)` = 249x249 cells
- The parent's bounding box IS the child's entire coordinate space
- Coordinates translate via scale factor: `childCoord = parentCoord * (childGridSize / parentCellSize)`

### Snap-to-Grid (mandatory, not optional)
Everything snaps to grid coordinates:
- **Node centers** - Snap to grid intersections
- **Edge vertices/turns** - Every bend point has a grid coordinate
- **Manual edge adjustments** - Adding a turn creates a vertex at a grid point

This makes flat ↔ iso transposition trivial since all coordinates are grid-based.

### Label Collision Boxes
- Node labels and edge labels have invisible bounding rectangles
- These rectangles are treated as obstacles for edge routing
- Edges must route around label areas, not through them
- Label bounds are calculated from text metrics (font size, string length)
- Keeps diagrams readable by preventing edge/text overlap

### Implementation Notes
- Consider using a library like `@dnd-kit` for drag interactions
- In isometric mode, dragging should move in the iso plane (not screen plane)
- Could add alignment guides (snap to other node edges)

---

*Created: 2025-12-20*
*Last Updated: 2025-12-20*
