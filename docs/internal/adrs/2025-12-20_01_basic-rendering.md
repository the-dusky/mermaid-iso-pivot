# Basic Rendering Pipeline

---

## Issue

We need to establish the core pipeline that transforms Mermaid syntax into rendered SVG diagrams. This is the foundation that all other features (isometric, navigation) will build upon.

## Decision

Implement a four-stage pipeline:
1. **Parser**: Use the Mermaid library to parse flowchart syntax into our internal model
2. **Model**: Store nodes, edges, and hierarchy in typed structures
3. **Layout**: Use dagre to compute node positions and edge routes
4. **Render**: Generate SVG elements from positioned graph data

Each stage is a pure transformation with clear inputs and outputs.

## Status

**Proposed**

## Group

Core

## Assumptions

- Mermaid library can parse flowchart syntax reliably
- Mermaid's internal representation can be converted to our model
- dagre handles hierarchical graphs (subgraphs) correctly
- Target browsers support modern SVG features
- Diagrams will have <500 nodes (no virtualization needed yet)

## Constraints

- Must use Mermaid for parsing (LLMs know it, existing diagrams exist)
- Pure SVG rendering (no Canvas, no WebGL)
- Must work in modern browsers (Chrome, Firefox, Safari, Edge)
- Bundle size should stay reasonable (<500KB gzipped)

## Positions

### 1. Use Mermaid library + custom renderer
Parse with Mermaid, layout with dagre, render ourselves.
- Pros: Full control over rendering, can add isometric later, leverage Mermaid parsing
- Cons: Duplicates some Mermaid rendering logic

### 2. Fork Mermaid entirely
Full fork with modified rendering.
- Pros: Complete control
- Cons: Maintenance burden, divergence over time, large codebase

### 3. Use Mermaid end-to-end with post-processing
Let Mermaid render, then transform the SVG.
- Pros: Minimal code
- Cons: Fragile (depends on Mermaid's SVG structure), hard to add navigation

### 4. Build parser from scratch
Custom Mermaid-compatible parser.
- Pros: No dependency on Mermaid internals
- Cons: Massive effort, compatibility issues, feature parity work

## Argument

**Position 1 (Mermaid library + custom renderer)** is chosen because:

1. **Parsing is solved**: Mermaid's parser handles the complex syntax
2. **Rendering flexibility**: Custom SVG generation allows isometric shapes and navigation
3. **Clear separation**: Each stage can be tested independently
4. **Future-proof**: Can extend without fighting Mermaid's architecture

Position 3 was seriously considered but rejected because SVG post-processing would be fragile and navigation (drill/layer/fold) requires deep control over what gets rendered.

## Implications

- Need to understand Mermaid's internal AST/model to extract data
- May need to track Mermaid version updates for parser changes
- Custom renderer means we implement all shape types ourselves
- Need comprehensive tests to verify Mermaid compatibility

## Related Decisions

- [2025-12-20_02](./2025-12-20_02_isometric-rendering.md) - Builds on this renderer

## Related Requirements

- Milestone v0.1: Basic Rendering
  - Parse Mermaid flowchart subset
  - Layout with dagre
  - Render flat SVG
  - Pan/zoom

## Related Artifacts

- [types.ts](../../../types.ts) - Core type definitions
- [sample.mmd](../../../sample.mmd) - Test diagram
- [README.md Architecture section](../../../README.md) - Pipeline diagram

## Related Principles

- Separation of concerns (parser, model, layout, render are distinct)
- Pure functions where possible (render is stateless)
- Mermaid superset (extend, don't replace)

## Notes

### Open Questions

1. How do we access Mermaid's parsed representation?
   - Option A: Use `mermaid.parse()` API
   - Option B: Hook into internal diagram registration
   - Need to investigate Mermaid's API

2. How do we handle unsupported Mermaid features?
   - Proposal: Graceful degradation with console warning

3. Should we cache parsed/layouted graphs?
   - Probably yes for large diagrams
   - Defer until performance issues arise

### Implementation Order

Per CLAUDE.md Build Order:
1. `src/parser/mermaid.ts` - Mermaid parsing
2. `src/layout/dagre.ts` - dagre wrapper
3. `src/render/svg.ts` - SVG generation
4. `src/ui/App.tsx` - React shell
5. Wire up in `src/main.ts`

---

*Created: 2025-12-20*
*Last Updated: 2025-12-20*
