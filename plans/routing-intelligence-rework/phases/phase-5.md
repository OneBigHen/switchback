---
type: planning
entity: phase
plan: "routing-intelligence-rework"
phase: 5
status: pending
created: "2026-07-22"
updated: "2026-07-22"
---

# Phase 5: You.com Corridor Adviser

> Part of [routing-intelligence-rework](../plan.md)

## Objective

Provide source-backed named-road and anchor suggestions for fun motorcycle corridors without placing external research in the primary route's critical path.

## Scope

### Includes

- Current You.com Search/Research HTTP adapters.
- Structured corridor-hint schema and source preservation.
- Strict timeouts, cancellation, seven-day caching, and no-key fallback.
- Source, response-shape, URL, and geocoding validation boundaries; Phase 4 owns all geographic-envelope and routability checks.
- Focused adapter, schema, cache, timeout, and malformed-response tests.

### Excludes (deferred to later phases)

- Final corridor ranking and geometry generation.
- Trusting AI-generated coordinates or geometry.
- UI redesign or live deployment.

## Prerequisites

- [ ] Phase 1 corridor-hint contract is merged.
- [ ] Confirm current You.com credentials by presence only; never print secrets.

## Deliverables

- [ ] Production HTTP adapter using current endpoints.
- [ ] Structured, source-preserving corridor hints.
- [ ] Persistent or durable seven-day cache keyed by coarse ride intent.
- [ ] Validation pipeline that emits hints only, never routes.

## Acceptance Criteria

- [ ] Primary routing succeeds unchanged when You.com is absent, slow, malformed, or unauthorized.
- [ ] No external request is started by ordinary Quick routes without research need.
- [ ] Every adviser hint has source URLs and geocoded anchors; Phase 4 proves final corridor-envelope and routability validity before use.
- [ ] Hallucinated/ungeocodable names are discarded.
- [ ] The automatic adviser obeys the alternatives deadline and cancellation signal.

## Dependencies on Other Phases

| Phase | Relationship | Notes |
|-------|-------------|-------|
| 1 | blocked-by | Uses shared hint contract |
| 2 | parallel | Background invocation integrates after both merge |
| 4 | feeds | Phase 4 consumes validated hints |
| 7 | blocks | Live provider behavior is release-tested |

## Notes

This is the preferred bounded GLM 5.2 implementation package. A senior agent must review endpoint accuracy, cache behavior, and every safety boundary before integration.
