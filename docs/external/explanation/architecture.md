# Architecture Overview

This document explains how arch-explorer transforms Mermaid syntax into interactive, navigable architecture diagrams.

## The Pipeline

```
Mermaid Input → Parser → Model → Layout → Render → UI
```

Each stage has a single responsibility:

### 1. Parser

**Input**: Raw Mermaid text with optional arch-explorer extensions
**Output**: Structured `Graph` object

The parser:
- Extracts `%%{arch: ...}%%` directives for config
- Uses the Mermaid library to parse flowchart syntax
- Converts Mermaid's internal representation to our `Node` and `Edge` types
- Builds the hierarchy (parent/children relationships for subgraphs)

### 2. Model

**Purpose**: In-memory representation of the diagram

The model provides:
- `Map<string, Node>` for O(1) node lookup
- Hierarchy traversal (get children, get ancestors)
- Edge management

Key insight: The model is **immutable during rendering**. Navigation changes what we *show*, not what we *have*.

### 3. Layout

**Input**: Graph with nodes and edges
**Output**: Same graph with x, y, width, height populated

Uses [dagre](https://github.com/dagrejs/dagre) to:
- Calculate optimal node positions
- Route edges around obstacles
- Respect hierarchy (subgraph containment)

### 4. Render

**Input**: Positioned graph + view mode
**Output**: SVG elements

Two rendering paths:
- **Flat**: Direct SVG shapes (rect, ellipse, polygon)
- **Isometric**: Same shapes with CSS transform applied

The isometric transform is a single matrix applied to the entire SVG:
```typescript
const ISO_MATRIX = 'matrix(0.866, 0.5, -0.866, 0.5, 0, 0)';
```

### 5. Navigation

**Purpose**: Manage what subset of the graph is visible

Three modes:
- **Drill**: Replace entire view with a subgraph's children
- **Layer**: Overlay children on top, ghost the parent
- **Fold**: Collapse/expand subgraphs in place

Navigation modifies `NavState`, which tells Render what to show.

### 6. UI (React)

**Purpose**: User controls and chrome

Components:
- `App.tsx` - Main container, SVG viewport
- `Controls.tsx` - View/nav mode toggles
- `Breadcrumbs.tsx` - Drill navigation trail
- `InfoPanel.tsx` - Selected node details

## Data Flow

```
User Action → NavState Update → Re-render → SVG Update
```

The graph itself doesn't change. Navigation changes *what we render from it*.

## Why This Architecture?

### Separation of Concerns

Each module can be tested independently:
- Parser tests: Mermaid in → Graph out
- Layout tests: Graph in → positioned Graph out
- Render tests: Graph + options → SVG elements

### Pure Functions Where Possible

Render functions are pure: `(node, options) => SVGElement`

This makes them:
- Easy to test
- Easy to compose
- Predictable

### React for UI, Not Rendering

React manages the controls and chrome. SVG rendering is done imperatively for performance. React doesn't re-render on every pan/zoom.

## File Structure

```
src/
├── parser/          # Mermaid → Graph
├── model/           # Types and hierarchy ops
├── layout/          # dagre wrapper
├── render/          # SVG generation
├── nav/             # Navigation state
└── ui/              # React components
```

Each directory has an `index.ts` that exports its public API.
