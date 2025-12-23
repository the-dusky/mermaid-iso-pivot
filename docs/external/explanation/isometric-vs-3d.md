# Why Isometric, Not True 3D

A key design decision in arch-explorer is using CSS transforms for the "3D" look rather than actual 3D rendering. This document explains why.

## The Illusion

When you toggle to isometric mode, the diagram appears three-dimensional. Boxes become cubes. The view tilts. It feels spatial.

But there's no 3D engine. No WebGL. No Three.js.

It's just this:

```typescript
const ISO_MATRIX = 'matrix(0.866, 0.5, -0.866, 0.5, 0, 0)';
svg.style.transform = isometric ? ISO_MATRIX : 'none';
```

## What Is Isometric Projection?

Isometric projection is a 2D representation of 3D space where:
- All three axes appear equal length
- Parallel lines remain parallel (no perspective vanishing)
- The viewing angle is ~35.26 degrees from horizontal

It's widely used in:
- Technical drawings
- Video games (SimCity, Civilization)
- Architecture diagrams (Cloudcraft, diagrams.net)

## Why Not True 3D?

### Complexity vs. Value

True 3D would require:
- WebGL or Canvas 2D
- A 3D scene graph
- Camera controls (orbit, dolly, pan)
- Z-buffer for depth sorting
- 3D pick/select logic

For architecture diagrams, this complexity provides little additional value. Users want to:
- See relationships between components
- Navigate hierarchies
- Export clean images

None of these require actual depth.

### SVG Advantages

By staying in SVG, we get:
- **Crisp text at any zoom** - Vector, not rasterized
- **CSS styling** - Use familiar selectors and properties
- **DOM events** - Click handlers, hover states
- **Easy export** - SVG is already an image format
- **Accessibility** - Screen readers can parse SVG
- **Small bundle** - No heavy 3D library

### Performance

The CSS transform is GPU-accelerated. Transforming an SVG with hundreds of elements is instant.

A WebGL scene with the same elements would need:
- Geometry buffers
- Shader compilation
- Draw calls per element

For our use case (diagrams, not games), SVG wins.

## The Transform Explained

The isometric matrix:

```
matrix(0.866, 0.5, -0.866, 0.5, 0, 0)
```

This is a 2D affine transform that:
1. Skews the X axis 30 degrees up
2. Skews the Y axis 30 degrees down
3. Scales both to maintain proportion

The values come from trigonometry:
- `0.866 = cos(30°)`
- `0.5 = sin(30°)`

## Isometric Shapes

For the illusion to work, shapes need three visible faces:
- Top face (lighter)
- Left face (medium)
- Right face (darker)

In flat mode, a rectangle is one polygon. In isometric mode, it becomes three:

```typescript
function isoRect(x, y, width, height, depth) {
  const top = polygon([...])    // fill: lighter
  const left = polygon([...])   // fill: medium
  const right = polygon([...])  // fill: darker
  return group([top, left, right])
}
```

The depth is fake - just an offset in 2D space that looks like height.

## Trade-offs

What we give up:
- True perspective (objects don't get smaller with distance)
- Camera rotation (viewing angle is fixed)
- Occlusion (manual z-ordering required)

What we gain:
- Simplicity
- Performance
- Compatibility
- Maintainability

For architecture diagrams, this is the right trade-off.

## Inspiration

This approach is inspired by:
- [Cloudcraft](https://cloudcraft.co/) - AWS architecture diagrams
- [diagrams.net isometric shapes](https://www.diagrams.net/)
- [JointJS isometric article](https://www.jointjs.com/blog/isometric-diagrams)

All use the same technique: 2D SVG with clever transforms.
