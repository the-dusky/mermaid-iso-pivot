# Architecture Decision Records

This directory contains ADRs (Architecture Decision Records) for arch-explorer.

## Naming Convention

```
YYYY-MM-DD_##_title.md
```

- **Date**: When the ADR was created
- **Sequence**: Order within the same day, 1-based (01, 02, etc.)
- **Title**: Kebab-case description

## Process

1. **Before implementing**: Create an ADR for any significant feature or change
2. **Review**: Discuss the ADR, find issues and edge cases
3. **Refine**: If problems are found, fix the plan first
4. **Implement**: Only proceed when the plan is solid
5. **Update**: If implementation reveals new insights, update the ADR

## Status Values

- **Proposed** - Under discussion, not yet approved
- **Accepted** - Approved for implementation
- **Implemented** - Development complete
- **Superseded** - Replaced by another ADR
- **Deprecated** - No longer relevant

## Index

| Date | Title | Status | Group |
|------|-------|--------|-------|
| [Template](./0000-00-00_01_template.md) | ADR Template | - | - |
| [2025-12-20_01](./2025-12-20_01_basic-rendering.md) | Basic Rendering Pipeline | Implemented | Core |
| [2025-12-20_02](./2025-12-20_02_isometric-rendering.md) | Isometric Rendering | Implemented | Rendering |
| [2025-12-20_03](./2025-12-20_03_drill-navigation.md) | Unified Navigation Model | Proposed | Navigation |
| [2025-12-20_04](./2025-12-20_04_monorepo-structure.md) | Monorepo Structure | Implemented | Core |
| [2025-12-20_05](./2025-12-20_05_entity-centric-architecture.md) | Entity-Centric Architecture | Proposed | Core |
| [2025-12-20_06](./2025-12-20_06_interactive-diagram-editing.md) | Interactive Diagram Editing | Proposed | UI |
| [2025-12-21_01](./2025-12-21_01_unified-grid-system.md) | Unified Grid Coordinate System | Implemented | Core |
| [2025-12-21_02](./2025-12-21_02_mermaid-editor-ui.md) | Mermaid Editor UI | Implemented | UI |

## Groups

- **Core** - Fundamental architecture decisions
- **Parsing** - Mermaid parsing and extensions
- **Rendering** - SVG and isometric rendering
- **Navigation** - Drill, layer, fold navigation
- **UI** - React components and interactions
