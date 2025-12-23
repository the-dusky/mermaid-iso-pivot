# Entity-Centric Architecture

## Issue

Current diagram-centric approach treats mermaid files as top-level artifacts. This creates problems:
- Same component in multiple diagrams has no shared identity
- No way to see "what references this component?"
- Architecture knowledge is scattered across unconnected files
- Navigation is limited to within a single diagram

We need a way to connect architecture knowledge across diagrams, making components (not diagrams) the primary artifacts.

## Decision

Adopt an entity-centric model inspired by Roam Research:

1. **Components are first-class**: Each system component gets a `.arch.md` file containing description, connections, and embedded mermaid views
2. **Wikilinks in mermaid**: `[[ComponentName]]` syntax inside mermaid creates explicit identity linking
3. **Bidirectional connections**: Backlinks are auto-computed from all references
4. **Views, not documents**: Diagrams become views of components, not standalone artifacts

```mermaid
flowchart TD
    [[Auth]] --> [[API]]
```

Both `[[Auth]]` references across all diagrams point to the same component. Clicking navigates to the component page.

## Status

**Proposed**

## Group

Core

## Assumptions

- Users have multiple diagrams referencing the same components
- Component identity matters for navigation and understanding
- Markdown is acceptable as the component file format
- File-based storage (not database) is sufficient initially

## Constraints

- Must remain compatible with standard mermaid syntax (wikilinks are additive)
- Existing rendering pipeline (SVG, dagre, isometric) stays unchanged
- Can be adopted incrementally (Phase 1 works with current setup)

## Positions

### 1. Document-centric (Current)
Diagrams are standalone files. No explicit component identity.
- Pros: Simple, familiar, no new concepts
- Cons: No cross-diagram navigation, duplicate definitions, no backlinks

### 2. Entity-centric with wikilinks (Chosen)
Components are files, diagrams are views, `[[wikilinks]]` create connections.
- Pros: Connected knowledge, backlinks, component-focused navigation, Roam-like discovery
- Cons: New concepts to learn, more complex data model, file format commitment

### 3. Database-backed entity store
Components stored in a database with full graph queries.
- Pros: Powerful queries, real-time sync potential
- Cons: Heavier infrastructure, harder to version control, overkill for initial use

## Argument

The wikilink approach balances power with simplicity:
- **Incremental adoption**: Phase 1 (wikilink parsing) can be added without changing the current flow
- **Standard tools**: `.arch.md` files are markdown, versionable in git, editable anywhere
- **Proven model**: Roam Research validated this approach for knowledge management
- **Minimal rendering changes**: Existing SVG/dagre/iso pipeline stays the same

The key insight is that `[[wikilinks]]` inside mermaid give us explicit component identity without inventing new diagram syntax.

## Implications

### New Modules Required
| Module | Purpose |
|--------|---------|
| `parser/wikilinks.ts` | Extract and preprocess `[[links]]` |
| `parser/markdown.ts` | Parse `.arch.md` files |
| `model/graph.ts` | Bidirectional link index |
| `ui/ComponentPage.tsx` | Roam-like component view |
| `ui/Backlinks.tsx` | Backlinks panel |
| `ui/GraphView.tsx` | Full system graph |

### Modules Updated (Minor Changes)
| Module | Change |
|--------|--------|
| `model/types.ts` | Add Component, Connection, Backlink types |
| `parser/mermaid.ts` | Preprocess wikilinks before parsing |
| `nav/drill.ts` | Extend for component navigation |

### Modules Unchanged
- `render/svg.ts` - Still rendering SVG
- `render/shapes.ts` - Shape generators unchanged
- `layout/dagre.ts` - Still using dagre

## Implementation Phases

### Phase 1: Wikilink Parser (Minimal Change)
Add `[[wikilink]]` support to mermaid parsing. Clicking a linked node logs the component ID.

### Phase 2: Component Files
Add `.arch.md` parsing with frontmatter and mermaid block extraction.

### Phase 3: Component Index
Build bidirectional link graph, compute backlinks.

### Phase 4: Component Page UI
The Roam-like page view with views, connections, and backlinks.

### Phase 5: Graph View
Visual overview of entire system.

## Related Decisions

- [2025-12-20_01](./2025-12-20_01_basic-rendering.md) - Basic rendering pipeline this extends
- [2025-12-20_03](./2025-12-20_03_drill-navigation.md) - Drill navigation this integrates with

## Related Requirements

- Cross-diagram component navigation
- "What uses this component?" discovery
- Unified architecture knowledge base

## Related Artifacts

- [Concept Document](../concept-docs/2025-12-20_01_ENTITY_CENTRIC_DESIGN.md) - Full design details

## Related Principles

- Components as first-class entities
- Bidirectional linking (Roam model)
- Incremental adoption (each phase delivers value)
- Keep rendering simple (SVG over WebGL)

## Notes

### Open Questions
1. **Auto-create components?** If `[[NewThing]]` doesn't exist, create stub or error?
2. **Canonical labels**: How to handle label mismatches between file title and diagram reference?
3. **Nested wikilinks**: Support `[[Frontend]]/Auth` for subcomponents?
4. **External links**: Support `[[https://docs.example.com|External Docs]]`?

### Risk Assessment
- **Low risk**: Phase 1-2 are isolated additions, no breaking changes
- **Medium risk**: Phase 3-4 introduce new navigation model
- **Mitigation**: Each phase is deployable independently

---

*Created: 2025-12-20*
*Last Updated: 2025-12-20*
