# Glossary: Graph Drawing Algorithms

This glossary covers key concepts in orthogonal graph layout algorithms, particularly relevant to edge routing and diagram rendering.

---

## Topology-Shape-Metrics (TSM) Approach

The classic approach to orthogonal graph drawing, breaking the problem into three phases:

### Planarization

**Definition**: Compute an embedding of the graph with few crossings.

This phase transforms a nonplanar graph into a planar representation by inserting **dummy vertices** at edge crossings. This enables planar drawing techniques to be applied to general graphs.

- Input: Abstract graph (nodes and edges)
- Output: Planar embedding with crossing points marked as dummy vertices
- Goal: Minimize edge crossings (each crossing reduces readability)

### Orthogonalization

**Definition**: Compute a shape of the graph with few bends.

This phase assigns horizontal and vertical directions to edges, determining *where* bends occur and in which direction. Creates rectilinear drawings with edges running parallel to coordinate axes.

- Input: Planar embedding from planarization
- Output: Orthogonal representation specifying bend sequences for each edge
- Goal: Minimize total number of bends

### Compaction

**Definition**: Assign vertex and bend coordinates to minimize area or total edge length.

This phase assigns actual (x, y) coordinates to all vertices and bend points, producing a compact layout while respecting the shape from orthogonalization.

- Input: Orthogonal representation from orthogonalization
- Output: Final coordinates for all elements
- Goal: Minimize drawing area or total edge length

---

## Core Concepts

### Planar Embedding

The assignment of edges to face regions that defines the cyclic ordering of edges around each vertex in a planar representation.

### Dummy Vertices

Artificial vertices introduced at edge crossings during planarization. These convert a nonplanar graph into an equivalent planar structure suitable for standard layout algorithms.

### Rectilinear Layout

A drawing style where all edges follow horizontal or vertical directions only. Commonly used in UML diagrams, flowcharts, and entity-relationship diagrams.

### Orthogonal Routing

Edge routing where all segments are either horizontal or vertical - no diagonal lines. This is the standard for technical diagrams, flowcharts, and architecture diagrams.

### Waypoint

A bend point along an edge path. In orthogonal routing, waypoints mark where an edge changes from horizontal to vertical direction (or vice versa).

### Port

A connection point on a node where edges can attach. Ports are typically located on node edges (top, right, bottom, left) and determine where edge paths begin and end.

---

## References

### Academic
- [OGDF Chapter - Graph Drawing Handbook](https://cs.brown.edu/people/rtamassi/gdhandbook/chapters/ogdf.pdf) - Comprehensive reference on graph drawing algorithms
- [OGDF - Open Graph Drawing Framework](https://github.com/ogdf/ogdf) - C++ library implementing these algorithms

### Practical
- [Routing Orthogonal Diagram Connectors in JavaScript](https://medium.com/swlh/routing-orthogonal-diagram-connectors-in-javascript-191dc2c5ff70) - Implementation guide
- [Interactive orthogonal connector routing (Gist)](https://gist.github.com/jose-mdz/4a8894c152383b9d7a870c24a04447e4) - Code example
