# Hybrid Renderer Architecture: ReactFlow + Three.js

---

## Issue

The current approach of bolting isometric rendering onto ReactFlow creates fundamental coordinate system conflicts. ReactFlow calculates positions in 2D screen space, but isometric projection warps that coordinate system. This causes:

1. **Drag behavior issues**: Mouse movement doesn't match node movement due to coordinate mismatch
2. **Bounds checking failures**: Parent-child containment can't be enforced because ReactFlow's `extent: 'parent'` works in rectangular DOM bounds, not isometric diamond bounds
3. **Per-node iso rendering complexity**: Each node renders its own iso projection with different offsets, making global coordinate math extremely complex

We need an architecture that provides clean isometric/3D visualization without fighting against the underlying framework.

## Decision

Implement a **hybrid renderer architecture**:

1. **Flat view**: Continue using ReactFlow (battle-tested, great UX for 2D diagrams)
2. **Isometric view**: Use react-three-fiber with an OrthographicCamera at the isometric angle
3. **3D view**: Use react-three-fiber with a PerspectiveCamera and OrbitControls
4. **Shared data model**: All views share the same node/edge graph structure

The key insight is that Three.js handles coordinate transformations natively - you place objects at logical (x, y) coordinates mapped to 3D space (x, 0, z), and the camera projection handles the rest.

## Status

**Proposed**

## Group

Rendering

## Assumptions

- react-three-fiber is mature enough for production use
- Three.js OrthographicCamera provides true isometric projection without manual math
- Bundle size increase from Three.js is acceptable for the value delivered
- Users expect smooth, professional interactions in all view modes
- POC quality needs to be impressive enough for fundraising

## Constraints

- Must maintain compatibility with existing Mermaid parser and graph data model
- Must support node dragging in all view modes
- Must support parent-child bounds enforcement
- Must work in modern browsers without WebGL2 requirement (Three.js handles fallback)
- Should have smooth transitions between view modes (nice-to-have)

## Positions

### 1. Per-node CSS/SVG isometric rendering (Current approach)
Each node renders its own isometric projection using CSS transforms or SVG polygons.

- **Pros**: No new dependencies, works within ReactFlow ecosystem
- **Cons**: Coordinate system mismatch causes drag/bounds issues, complex offset calculations, fighting against ReactFlow's architecture

### 2. CSS transform on entire ReactFlow canvas
Apply isometric CSS matrix transform to the whole ReactFlow viewport.

- **Pros**: Simple implementation, nodes/edges transform together
- **Cons**: Drag interactions break (need inverse transform math), still 2D rendering (no true depth), limited visual appeal

### 3. Custom SVG renderer (no ReactFlow)
Build our own interaction layer from scratch optimized for isometric.

- **Pros**: Full control over coordinate systems, iso-first design
- **Cons**: Massive effort reinventing drag/pan/zoom/selection, maintenance burden, delays MVP

### 4. Hybrid: ReactFlow (flat) + react-three-fiber (iso/3D) ✓
Use the right tool for each view mode, share the data model.

- **Pros**:
  - True 3D rendering with proper depth sorting, lighting, shadows
  - Smooth native interactions (Three.js handles all coordinate math)
  - Bounds checking works naturally in 3D space
  - Extensible to full 3D view with orbit controls
  - Professional visual quality
  - ReactFlow remains for flat view (known-good solution)
- **Cons**:
  - Two rendering systems to maintain
  - Bundle size increase (~150KB gzipped for Three.js)
  - Team needs Three.js/react-three-fiber knowledge

## Argument

Position 4 (Hybrid) is selected because:

1. **Technical soundness**: Three.js is designed for 3D coordinate transformations. Isometric is just an orthographic camera at a specific angle - the math is handled by the engine, not by us.

2. **Interaction quality**: Dragging, panning, zooming all work natively in Three.js because the coordinate system is consistent. No inverse transform hacks needed.

3. **Bounds enforcement**: Parent-child containment becomes 3D collision detection, which Three.js handles naturally.

4. **Visual polish**: True 3D rendering enables shadows, lighting, depth effects - important for a "wow factor" POC.

5. **Future extensibility**: Adding a full 3D perspective view is essentially free (just swap camera type). This opens up orbit controls, fly-through animations, etc.

6. **Risk mitigation**: Keeping ReactFlow for flat view means we have a known-working solution for 2D. We're not betting everything on a new renderer.

The bundle size cost (~150KB) is acceptable given that:
- Modern web apps routinely include larger dependencies
- The value delivered (professional 3D visualization) justifies the cost
- Three.js is highly optimized and tree-shakeable

## Implications

1. **New route needed**: Create `/viewer-threejs` route alongside existing `/viewer-reactflow`
2. **Shared components**: Graph adapter, parser integration, toolbar can be shared
3. **Node/edge renderers**: Need Three.js versions (3D boxes, tube edges)
4. **Drag handling**: Implement raycasting-based drag on XZ plane
5. **Camera controls**: Need custom controls for iso (pan/zoom only), orbit for 3D
6. **View mode state**: May want to animate camera transitions between modes
7. **Documentation**: Team needs react-three-fiber knowledge

## Related Decisions

- [2025-12-20_02](./2025-12-20_02_isometric-rendering.md) - Original isometric rendering approach (superseded for Three.js views)
- [2025-12-20_06](./2025-12-20_06_interactive-diagram-editing.md) - Drag/edit interactions (informs Three.js implementation)

## Related Requirements

- Professional visual quality for investor demos
- Smooth drag interactions in all view modes
- Parent-child bounds enforcement
- Support for flat, isometric, and 3D views

## Related Artifacts

- ReactFlow POC: `/apps/web/src/routes/viewer-reactflow.tsx`
- Isometric utilities: `/apps/web/src/utils/iso.ts`
- Node components: `/apps/web/src/components/nodes/`

## Related Principles

- **Use the right tool for the job**: ReactFlow for 2D, Three.js for 3D
- **Don't fight the framework**: Instead of hacking iso onto ReactFlow, use a 3D engine
- **Shared data model**: Keep the graph representation consistent across renderers
- **Progressive enhancement**: Start with flat view, add iso/3D as enhanced modes

## Notes

- Consider whether to eventually deprecate ReactFlow entirely if Three.js flat view works well
- May want to investigate drei (react-three-fiber helpers) for common patterns
- Camera transition animations would be impressive but are lower priority than core functionality
- MiniMap equivalent in Three.js would need custom implementation

---

*Created: 2026-01-07*
*Last Updated: 2026-01-07*
