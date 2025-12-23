# CLAUDE.md - Instructions for Claude Code

## Project Overview

arch-explorer is an interactive architecture diagram viewer that:
1. Parses Mermaid syntax (superset with custom extensions)
2. Renders as flat SVG or isometric (3D-looking) view
3. Supports drill-down, layer overlay, and fold navigation

## Key Design Decisions

### Isometric is NOT 3D
The isometric view is a CSS transform on 2D SVG:
```typescript
const ISO_MATRIX = 'matrix(0.866, 0.5, -0.866, 0.5, 0, 0)';
```
No Three.js, no WebGL. Just SVG + transform.

### Mermaid Superset
We extend Mermaid syntax, not replace it. Any valid Mermaid flowchart should work.
Our extensions use the `%%{arch: {...}}%%` directive.

### Navigation Modes
- **Drill**: Replace entire view with children of clicked subgraph
- **Layer**: Overlay children on top, ghost parent (30% opacity)
- **Fold**: Collapse/expand subgraphs in place

## Build Order

### Phase 1: Basic Rendering (do this first)
1. `src/parser/mermaid.ts` - Use mermaid library to parse flowchart into our model
2. `src/layout/dagre.ts` - Position nodes using dagre
3. `src/render/svg.ts` - Generate SVG elements
4. `src/ui/App.tsx` - Basic React shell with SVG container
5. Wire it up in `src/main.ts`

### Phase 2: Isometric
1. `src/render/iso.ts` - Isometric shape generators (3-face polygons)
2. Add view toggle to UI
3. CSS transition between flat/iso

### Phase 3: Drill Navigation
1. `src/nav/drill.ts` - Track current view root, handle clicks
2. `src/ui/Breadcrumbs.tsx` - Show path, allow jumping back
3. Transition animation when drilling

### Phase 4: Layer & Fold
1. `src/nav/layer.ts` - Stack management, ghost rendering
2. `src/nav/fold.ts` - Collapse state, layout recalculation

## Code Style

- TypeScript strict mode
- Functional components with hooks
- Keep render logic separate from navigation logic
- SVG generation should be pure functions: `(node, options) => SVGElement`

## Development Iteration Rules

**CRITICAL: Undo failed attempts, don't pile on code.**

1. **Try → Verify → Undo if it doesn't work**
   - Make a focused change to solve a specific problem
   - Verify it works (build, test, visual check)
   - If it doesn't work, **UNDO the change completely** before trying a different approach
   - Do NOT make "adjustments on top" of failed attempts - this leads to code bloat

2. **Commit working changes immediately**
   - As soon as something works, commit it with a clear message
   - This creates easy revert points
   - Small, incremental commits > large risky changes

3. **Avoid multi-file speculative changes**
   - Don't add 10 files at once hoping they solve a problem
   - Build incrementally: one working piece at a time
   - If a multi-file change fails, delete ALL of it and try a simpler approach

4. **Preferred workflow:**
   ```
   1. Make minimal change
   2. Test it
   3. Works? → Commit → Move to next piece
   4. Doesn't work? → git checkout/undo → Try different approach
   ```

## Testing Strategy

Use the sample diagram in `examples/sample.mmd` for manual testing.
Focus on getting visual output working before writing unit tests.

## Key Files

- `src/model/types.ts` - Core types (already created)
- `src/parser/mermaid.ts` - Start here
- `src/render/svg.ts` - Most visual work happens here
- `src/ui/App.tsx` - Main component

## Commands

```bash
npm install    # Install dependencies
npm run dev    # Start dev server
npm run build  # Production build
```
