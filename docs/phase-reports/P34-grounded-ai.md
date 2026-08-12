# P34 — Grounded AI layer

**Status:** implemented; automated boundary green, provider acceptance open

## Result

- Exported strict ride-intent validation for every model response; malformed
  output fails closed rather than reaching routing.
- Added deterministic route descriptions sourced only from `PlannedRoute`
  facts, with unsupported toll/surface/legal facts named explicitly.
- Added bounded spatial-first lexical search: geographic filtering happens
  before term scoring, with hard candidate and result caps.
- Existing corridor-adviser/provider paths remain hint-only and geocode/source
  validated; no AI output controls graph topology.

## Boundary

The Megaplex unit/build/browser gates are green. No current provider response,
community prompt-injection campaign, or production semantic-index benchmark is
claimed here.
