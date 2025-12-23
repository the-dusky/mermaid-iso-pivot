# Unified Navigation Model

---

## Issue

Architecture diagrams can be deeply nested, and with entity-centric design, users also navigate between components. We need a unified navigation model that handles:
1. **Drilling** into subgraphs within a view
2. **Linking** between components via `[[wikilinks]]`
3. **Browsing** the component graph

How do we enable these navigation modes while maintaining orientation?

## Decision

Implement a two-layer navigation model:

### Layer 1: Component Navigation (Entity-Centric)
- Click `[[wikilink]]` nodes to navigate to that component's page
- Each component has views (architecture, sequence, etc.)
- Backlinks show "what references this component?"
- Graph view shows all components and connections

### Layer 2: View Navigation (Drill)
- Within a component's view, click subgraphs to drill in
- Show breadcrumb trail for drill history
- Animate transition to maintain spatial context
- Edges crossing drill boundary are hidden

```
NavState = {
  currentComponent: "Auth" | null,     // Layer 1: which component
  currentView: "architecture" | null,   // which view of that component
  drillPath: ["Frontend", "WebApp"],   // Layer 2: drill path within view
  history: [...]                        // back button stack
}
```

## Status

**Proposed**

## Group

Navigation

## Assumptions

- Users want to focus on one subsystem at a time
- Breadcrumbs provide sufficient context for navigation
- Subgraphs have meaningful, drillable content
- Most diagrams are 2-4 levels deep
- Components are defined in `.arch.md` files with `[[wikilinks]]`
- Users navigate between components frequently

## Constraints

- Must work with both flat and isometric views
- Can't break existing zoom/pan behavior
- Need clear visual indication of drillable vs linkable elements
- Back navigation must be discoverable
- Component navigation must integrate with view navigation seamlessly

## Positions

### View Navigation (within a component)

#### 1a. Full view replacement (drill) - Chosen
Click replaces entire view with subgraph contents.
- Pros: Maximum focus, cleaner view, simpler rendering
- Cons: Loses parent context, requires mental model of hierarchy

#### 1b. In-place expansion (fold)
Subgraph expands inline.
- Pros: Maintains context, see relationships to siblings
- Cons: Can get cluttered, layout shifts are disorienting

#### 1c. Overlay (layer)
Children float above, parent ghosts.
- Pros: See parent context while focusing on children
- Cons: More complex rendering, Z-ordering issues

### Component Navigation (between components)

#### 2a. Wikilink click navigation - Chosen
Click `[[ComponentName]]` to navigate to that component's page.
- Pros: Intuitive (like wiki), bidirectional linking, Roam-proven
- Cons: New concept for mermaid users

#### 2b. Hover menu navigation
Hover shows a menu with "Go to component" option.
- Pros: Doesn't override click behavior
- Cons: Extra step, less discoverable

#### 2c. No cross-component navigation
Keep diagrams isolated.
- Pros: Simpler
- Cons: Loses the core value of entity-centric design

## Argument

**Two-layer model (1a + 2a)** is chosen because:

1. **Clear separation**: Subgraphs drill, wikilinks navigate - different visual treatment makes intent obvious
2. **Roam-proven**: Wikilink navigation is intuitive once learned
3. **Composable**: Each layer works independently but combines naturally
4. **Progressive**: Can implement drill first, add wikilinks later

Visual distinction:
- **Subgraphs** (drillable): Border/container, click to drill
- **`[[Wikilinks]]`** (navigable): Distinct style (underline, icon), click to navigate

## Implications

### Layer 1: Component Navigation
- Need `NavState.currentComponent` to track which component page we're on
- Need `NavState.currentView` to track which view (architecture, sequence, etc.)
- Need `ComponentGraph` for backlinks and connections
- Need routing between component pages
- Need visual distinction for `[[wikilink]]` nodes

### Layer 2: View Navigation (Drill)
- Need `NavState.drillPath` array for drill history within current view
- Need `hierarchy.ts` functions: `getChildren()`, `getAncestors()`
- Visual design needed for drillable subgraph indicators
- Edge handling: hide edges to/from nodes outside current view

### Unified
- Need `NavState.history` stack for back button across both layers
- Breadcrumbs show: `Component > View > DrillPath`

## Related Decisions

- [2025-12-20_01](./2025-12-20_01_basic-rendering.md) - Renderer must support partial graph rendering
- [2025-12-20_05](./2025-12-20_05_entity-centric-architecture.md) - Defines component model and wikilinks
- Future: Layer Navigation ADR
- Future: Fold Navigation ADR

## Related Requirements

- Milestone v0.3: Drill Navigation
  - Click subgraph to drill in
  - Breadcrumb trail
  - Back button

- Milestone v0.4+: Component Navigation (from ADR-05)
  - Wikilink parsing and preprocessing
  - Component page routing
  - Backlinks panel

## Related Artifacts

- [types.ts NavState](../../../types.ts) - Navigation state types
- [Entity-Centric Concept](../concept-docs/2025-12-20_01_ENTITY_CENTRIC_DESIGN.md) - Full navigation model

## Related Principles

- Separation of concerns (navigation state vs rendering)
- Keep it simple (drill is simplest navigation mode)
- Two-layer navigation (component vs view) for clarity

## Notes

### Click Target Design

**Subgraphs (drillable):**
- Hover shows "drill" icon or subtle highlight
- Cursor changes to indicate action
- Border/container style distinguishes from regular nodes

**Wikilink nodes (navigable):**
- Distinct visual style (underline, subtle glow, or icon)
- Different cursor (pointer vs drill icon)
- Clear that clicking navigates away from current view

Proposal: Visual distinction is critical since both are clickable but do different things

### Edge Handling

When drilled into a subgraph:
- Internal edges: Show normally
- External edges (to parent/siblings): Options:
  - Hide completely (clean but loses context)
  - Show as "stubs" at boundary (preserves awareness)
  - Show ghosted (visible but de-emphasized)

Proposal: Hide for v0.3, add ghosted stubs in future

### Transition Animation

When drilling:
1. Clicked subgraph zooms to fill viewport
2. Other elements fade out
3. Children fade in

CSS transitions on transform + opacity should work.

### Breadcrumb Design

```
Root > Frontend > WebApp > [Auth Module]
```

Each segment clickable to jump back. Consider:
- Truncation for deep hierarchies
- Icons vs text
- Keyboard navigation (Escape = back?)

### Open Questions

1. Double-click vs single-click for drill?
   - Single-click more discoverable
   - But may conflict with selection
   - Proposal: Single-click drills, right-click shows context menu

2. How to handle root-level diagrams (no subgraphs)?
   - Drill mode should degrade gracefully
   - Just render full diagram, no navigation needed

3. Keyboard navigation?
   - Escape = back one level
   - Backspace = back one level
   - Consider for accessibility

4. What if a node is both a subgraph AND a wikilink?
   - e.g., `subgraph [[Auth]]` - it's a container and a linked component
   - Proposal: Wikilink takes precedence (navigates), drill via context menu
   - Or: First click = navigate, long-press/right-click = drill

5. Unified back button behavior?
   - Should "back" undo the last action regardless of layer?
   - Or separate: Escape = drill back, Browser back = component back?
   - Proposal: Single unified history stack

---

*Created: 2025-12-20*
*Last Updated: 2025-12-20*
