# Monorepo Structure

---

## Issue

We need to build isomaid as both:
1. A standalone open-source library (like mermaid.js) - publishable to npm
2. A demo/cloud service website using TanStack Start

How should we structure the codebase to support both use cases cleanly?

## Decision

Use Turborepo monorepo with the following structure:

```
isomaid/
├── apps/
│   └── web/              # TanStack Start demo site → cloud service
├── packages/
│   └── isomaid/          # Core library (npm publishable)
├── turbo.json
├── package.json          # Workspace root
└── docs/                 # Documentation (shared)
```

## Status

**Proposed**

## Group

Core

## Assumptions

- Library will be published to npm as `isomaid` or `@isomaid/core`
- Demo site will consume the library like any other user would
- We want to test the library in a real-world context
- Future: may add more packages (e.g., `@isomaid/react`, `@isomaid/vue`)

## Constraints

- Must work with npm workspaces
- Library must be framework-agnostic (vanilla JS/TS)
- Demo site uses TanStack Start (React)
- Build system must support both library bundling and app bundling

## Positions

### 1. Turborepo monorepo
Separate packages with shared tooling.
- Pros: Clean separation, proper npm workflow, scales well, industry standard
- Cons: Initial setup overhead, learning curve

### 2. Single package with multiple entry points
One package.json with `exports` for different builds.
- Pros: Simpler, one package to manage
- Cons: Muddled concerns, harder to test as consumer, messy builds

### 3. Separate repositories
Completely separate repos for library and demo.
- Pros: Maximum isolation
- Cons: Coordination overhead, version sync pain, slower iteration

## Argument

**Position 1 (Turborepo)** is chosen because:

1. **Industry standard**: Most successful open-source projects use this pattern
2. **Clean testing**: Demo site consumes library exactly like external users
3. **Scalability**: Easy to add more packages (`@isomaid/react`, etc.)
4. **Tooling**: Turborepo handles caching, parallel builds, dependency graph

## Implications

- Need to restructure current code into `apps/web` and `packages/isomaid`
- Library needs its own build config (tsup or unbuild for library bundling)
- Root package.json manages workspaces
- CI/CD needs to handle both library publishing and app deployment

## Related Decisions

- [2025-12-20_01](./2025-12-20_01_basic-rendering.md) - Library architecture

## Related Requirements

- Open source library distribution
- Demo site for testing and showcasing
- Future cloud service

## Related Artifacts

- turbo.json configuration
- Workspace package.json

## Related Principles

- Separation of concerns
- Eat your own dog food (demo uses library like real users)

## Notes

### Package naming options
- `isomaid` (simple, if available)
- `@isomaid/core` (scoped, more flexibility)

### Build tooling for library
- **tsup**: Fast, simple, works well for libraries
- **unbuild**: Also good, used by UnJS ecosystem

---

*Created: 2025-12-20*
*Last Updated: 2025-12-20*
