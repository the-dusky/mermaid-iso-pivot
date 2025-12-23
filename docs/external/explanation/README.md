# Explanation

Explanation documentation is **understanding-oriented** and provides background, context, and discussion. It clarifies and illuminates a topic, helping readers understand "why" rather than just "how."

## Conceptual Topics

### Architecture & Design
- [Architecture Overview](./architecture.md) - How the system fits together
- [Data Flow](./data-flow.md) - From Mermaid source to rendered SVG

### Design Decisions
- [Why Isometric, Not True 3D](./isometric-vs-3d.md) - CSS transforms vs WebGL
- [Why Mermaid Superset](./mermaid-superset.md) - Extending vs replacing
- [SVG Over Canvas](./svg-choice.md) - Why pure SVG rendering

### Navigation Concepts
- [Navigation Modes Explained](./navigation-modes.md) - Drill vs Layer vs Fold philosophy
- [Semantic Zoom](./semantic-zoom.md) - Different detail levels at different zooms

### Rendering Concepts
- [The Isometric Transform](./isometric-transform.md) - How `matrix(0.866, 0.5, -0.866, 0.5, 0, 0)` works
- [Shape Rendering](./shape-rendering.md) - 2D shapes vs isometric 3-face polygons
- [Layout Algorithm](./layout-algorithm.md) - How dagre positions nodes

## Explanation vs How-to

- **How-to**: "Follow these steps to enable isometric mode"
- **Explanation**: "Isometric projection creates a 3D illusion by applying a 2D matrix transform to the SVG. Here's why this approach was chosen over WebGL..."

Explanation helps you understand context and make informed decisions.
