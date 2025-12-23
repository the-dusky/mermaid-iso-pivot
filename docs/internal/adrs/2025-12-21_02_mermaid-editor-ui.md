# Mermaid Editor UI

## Issue

The current viewer only displays a hardcoded sample diagram. Users need the ability to write and edit Mermaid source code and see the rendered diagram update in real-time. This is essential for:
1. Testing and iterating on diagram designs
2. Learning the Mermaid syntax with immediate feedback
3. Developing and debugging the isomaid library itself

## Decision

Add a split-pane editor interface to the viewer:
- Left panel: Mermaid source code editor (textarea or code editor component)
- Right panel: Rendered diagram (current viewer)
- Real-time updates as the user types (with debounce)
- Resizable split between editor and diagram

## Status

**Implemented**

## Group

UI

## Assumptions

- A simple textarea is sufficient for MVP; can upgrade to Monaco/CodeMirror later
- Users want immediate visual feedback
- Syntax errors should be shown inline, not block rendering

## Constraints

- Must not significantly increase bundle size (avoid heavy code editors initially)
- Should work on mobile (stacked layout instead of side-by-side)
- Editor state should persist across page refreshes (localStorage)

## Positions

1. **Simple textarea**
   - Pros: Zero dependencies, fast, simple
   - Cons: No syntax highlighting, no line numbers

2. **Monaco Editor** (VS Code's editor)
   - Pros: Full IDE experience, Mermaid language support possible
   - Cons: Large bundle (~2MB), complex setup

3. **CodeMirror 6**
   - Pros: Modular, lighter than Monaco, good mobile support
   - Cons: Still adds bundle size, setup complexity

4. **Textarea with upgrade path** (chosen)
   - Pros: Start simple, can swap in CodeMirror later
   - Cons: Initial UX is basic

## Argument

Start with a simple textarea to get the feature working quickly. The editor component can be abstracted behind an interface, making it easy to swap in CodeMirror or Monaco later without changing the rest of the UI. This follows the "make it work, make it right, make it fast" principle.

## Implications

- Need state management for source code
- Need debounced re-render on source change
- Error handling must show parse errors gracefully
- localStorage persistence for editor content
- Responsive layout for mobile (stack vertically)

## Related Decisions

- [2025-12-20_01](./2025-12-20_01_basic-rendering.md) - Rendering pipeline the editor feeds into
- [2025-12-20_06](./2025-12-20_06_interactive-diagram-editing.md) - Future visual editing builds on this

## Related Requirements

- Real-time diagram preview while editing source
- Syntax error feedback
- Persistence of editor state

## Related Artifacts

- [apps/web/src/routes/viewer.tsx](../../../apps/web/src/routes/viewer.tsx) - Split-pane editor implementation

## Related Principles

- Start simple, iterate
- Progressive enhancement

## Notes

### Layout Structure

```
+------------------------------------------+
|  Toolbar (view toggle, settings)         |
+------------------+-----------------------+
|                  |                       |
|  Mermaid Editor  |   Diagram Viewer      |
|  (resizable)     |   (SVG output)        |
|                  |                       |
+------------------+-----------------------+
|  Status bar (errors, info)               |
+------------------------------------------+
```

### Editor Features (MVP)
- Monospace font
- Line numbers (CSS counter)
- Tab key inserts spaces
- Auto-resize height or fixed with scroll

### Editor Features (Future)
- Syntax highlighting (Mermaid grammar)
- Autocomplete for node IDs
- Error squiggles
- Fold markers for subgraphs

### Mobile Layout
- Stack vertically: editor on top, diagram below
- Toggle button to switch between edit/preview modes
- Swipe gestures to switch panels

---

*Created: 2025-12-21*
*Last Updated: 2025-12-21*
