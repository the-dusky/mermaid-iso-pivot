# Isometric Rendering

---

## Issue

We need to provide a "3D-looking" isometric view of architecture diagrams. This is a key differentiator from standard Mermaid rendering and needs to work with all node shapes and navigation modes.

## Decision

Use CSS transforms to create isometric projection:
1. Apply a 2D matrix transform to the entire SVG container
2. Replace flat shapes with 3-face polygons (top, left, right) for depth illusion
3. Toggle between modes with CSS transitions

The transform matrix: `matrix(0.866, 0.5, -0.866, 0.5, 0, 0)`

## Status

**Proposed**

## Group

Rendering

## Assumptions

- CSS transforms are GPU-accelerated in all target browsers
- SVG elements maintain interactivity after transformation
- Users expect immediate visual feedback when toggling modes
- Isometric shapes don't need true z-ordering (manual arrangement is acceptable)

## Constraints

- Must remain in SVG (no WebGL/Canvas switch)
- Must work with all existing node shapes
- Transitions should be smooth (not jarring)
- Must maintain click targets for navigation

## Positions

### 1. CSS transform on entire SVG
Apply matrix transform to container.
- Pros: Simple, one line of CSS, GPU-accelerated
- Cons: Everything tilts (may look odd at extremes)

### 2. Individual shape transformation
Transform each shape independently.
- Pros: Fine control per element
- Cons: Complex, many transforms to manage, potential performance issues

### 3. WebGL rendering for isometric
Switch to Three.js or similar.
- Pros: True 3D, real depth, camera control
- Cons: Massive complexity increase, loses SVG benefits, overkill for diagrams

### 4. Pre-rendered isometric sprites
Use pre-made isometric images.
- Pros: Guaranteed good look
- Cons: Inflexible, can't customize, large asset size

## Argument

**Position 1 (CSS transform on entire SVG)** is chosen because:

1. **Simplicity**: One transform rule handles the entire view
2. **Performance**: GPU-accelerated, handles hundreds of elements
3. **Maintainability**: No 3D engine complexity
4. **Reversibility**: Easy toggle between flat and iso

Combined with 3-face polygon shapes for individual elements, this creates a convincing isometric illusion without 3D engine overhead.

## Implications

- Each shape type needs an isometric variant (3 polygons vs 1)
- Color/shading logic needed for the three faces
- Edge routing may need adjustment in isometric view
- Subgraph containers need isometric treatment too
- Export needs to include the transform (or flatten it)

## Related Decisions

- [2025-12-20_01](./2025-12-20_01_basic-rendering.md) - Depends on basic rendering pipeline

## Related Requirements

- Milestone v0.2: Isometric
  - Isometric transform toggle
  - Isometric shape variants (3-face polygons)
  - Smooth transition between views

## Related Artifacts

- [README.md Isometric Transform](../../../README.md) - Transform formula
- [Explanation: Why Isometric](../../external/explanation/isometric-vs-3d.md)

## Related Principles

- Keep it simple (CSS transform vs WebGL)
- SVG over Canvas/WebGL (maintain text clarity, DOM events)

## Notes

### Isometric Shape Design

For each shape, create three faces:

```
     Top Face (brightest)
    /        \
   /          \
Left Face    Right Face
(medium)     (darkest)
```

Face colors derived from base color:
- Top: base color
- Left: 15% darker
- Right: 30% darker

### Shape Implementation Order

1. Rectangle (most common)
2. Cylinder (databases)
3. Diamond (decisions)
4. Others as needed

### Open Questions

1. How tall should isometric shapes be?
   - Proposal: Default height = width * 0.3
   - Could add `:::tall` class for emphasis

2. How to handle subgraph containers?
   - Option A: Just a border, no depth
   - Option B: Shallow box (subtle depth)
   - Lean toward B for visual grouping

3. Transition animation
   - CSS transition on transform works
   - Shapes morphing from flat to 3-face is harder
   - May need to crossfade between two renders

---

*Created: 2025-12-20*
*Last Updated: 2025-12-20*
