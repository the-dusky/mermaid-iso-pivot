# Reference

Reference documentation is **information-oriented** and provides technical descriptions. It describes the machinery and how to operate it. Reference material is accurate and complete.

## API Reference

### Core Types
- [Type Definitions](./types.md) - Node, Edge, Graph, and state types
- [Shape Types](./shapes.md) - Available node shapes and their SVG rendering

### Syntax
- [Mermaid Syntax Support](./mermaid-syntax.md) - Supported Mermaid flowchart subset
- [Custom Directives](./directives.md) - The `%%{arch: ...}%%` extension syntax
- [Edge Anchor Syntax](./edge-anchors.md) - Port constraints (`A -->|R:L| B`)

### Configuration
- [ViewMode Options](./view-modes.md) - `flat` vs `iso`
- [NavMode Options](./nav-modes.md) - `drill`, `layer`, `fold`
- [Styling Classes](./styling.md) - CSS classes and inline styles

### Internal APIs
- [Parser API](./parser-api.md) - `parse(mermaidSource) => Graph`
- [Layout API](./layout-api.md) - `layout(graph) => PositionedGraph`
- [Render API](./render-api.md) - `render(graph, options) => SVGElement`
- [Navigation API](./navigation-api.md) - State management for navigation

## Reference vs Explanation

- **Reference**: "Here are the available options and their values"
- **Explanation**: "Here's why we designed it this way"

Reference is for looking things up. Explanation is for understanding.
