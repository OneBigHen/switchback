# Road Requirements Redesign

## Terminology

User-facing:

- Must use road
- Prefer road

Internal: `MatchedRoadRequirement`.

## Immediate containment

Until complete:

- feature-flag existing UI;
- remove exact claims from manual taps;
- disable Must;
- label Prefer experimental;
- prevent placeholder locks from provider models.

## Matching workflow

1. Rider selects entry and exit.
2. Browser calls `/api/road-matching`.
3. Server snaps to current graph.
4. Server computes a legal local path between anchors.
5. Return graph version, region, edge IDs, ordered geometry, road names, access/surface evidence, entry/exit, confidence, and ambiguity.
6. Rider confirms the matched road.

GPX import must map-match and report gaps. Image trace remains experimental and must never be called exact.

## Data model

```ts
interface MatchedRoadRequirement {
  id: string
  mode: "must" | "prefer"
  displayName: string
  graphVersion: string
  regionIds: string[]
  edgeIds: string[]
  entry: Coordinate
  exit: Coordinate
  geometry: Coordinate[]
  orderedAnchors: Coordinate[]
  accessEvidence: RoadAccessEvidence
  match: {
    status: "exact-edge" | "matched" | "approximate" | "unresolved"
    confidence: number
    maximumDriftMeters: number
  }
  provenance: "manual" | "gpx" | "image-trace" | "rematched"
  createdAt: string
  rematchedAt?: string
}
```

## Must semantics

Do not zero all edges outside a polygon.

Route ordered subproblems:

```text
start → entry → required edge chain → exit → next requirement/finish
```

Final validation confirms ordered traversal.

When unresolved/illegal, fail the new plan, retain previous route, and offer rematch, convert to Prefer, remove, or restore previous.

## Prefer semantics

Generate ordinary candidates and candidates shaped through the preferred road. Apply a bounded bonus. Do not globally penalize unrelated route sections.

Explain skip cost with actual miles, duration miss, closure, incompatibility, unresolved match, or backtracking.

## Rematching

On graph change:

1. Try exact edge reuse.
2. Match geometry/ordered anchors.
3. Calculate drift.
4. Require confirmation for low confidence, high drift, changed road identity/access, or parallel-road movement.

## UI

Mobile: inside full-screen Edit.

Desktop: list with mode, match/access state, graph version, highlight, reorder, edit, and remove. Highlight must reach the map.

## Acceptance tests

- Approach from outside corridor.
- Traverse requirement in order.
- Reject parallel-road substitution.
- Reject motorcycle-prohibited roads.
- Preserve multiple-road order.
- Prefer remains bounded.
- Rematch reports drift.
