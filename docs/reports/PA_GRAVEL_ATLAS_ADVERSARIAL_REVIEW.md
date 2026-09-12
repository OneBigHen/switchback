# PA/NJ Gravel Atlas — adversarial architecture review

Date: 2026-09-11  
Branch: `feat/pa-gravel-atlas-routing`  
Draft PR: #123

## Decision

Use official road-surface datasets as **routing evidence**, not as routes and not as a replacement routing graph.

The implemented architecture is:

```text
PA PASDA / NJGIN official linework
  -> bounded deterministic source snapshot
  -> normalize + dedupe + preserve provenance
  -> source-fingerprinted staging SQLite
  -> exact motorcycle-routing build fingerprint
  -> bounded canonical OSM segment export near source evidence
  -> conservative geometry/direction reconciliation
  -> quarantine ambiguous / unmatched evidence
  -> graph + source-fingerprinted runtime SQLite
  -> bounded planning/viewport query
  -> select 1 / 2 / 3 corridors for Balanced / More / Maximum
  -> ordinary SwitchBack candidate routing
  -> live router remains authoritative for connectivity/access
  -> measure actual Atlas overlap + continuity on returned routes
  -> replace baseline only when improvement and detour guards pass
```

Do **not** turn official source geometry into must-use roads or inject statewide source geometry into GraphHopper requests.

## Source semantics

### Pennsylvania PASDA 2012

PASDA contributes historic unpaved-surface evidence. It does not establish present legal motorcycle access and excludes State/National Forest roads. Its redistribution terms are restrictive, so code requires explicit operator acknowledgement before fetching it. That acknowledgement is not permission or a license. Production PA activation remains conditional on independent authorization.

### New Jersey NJGIN

NJGIN road centerlines are admitted only when they are `Unimproved`, `Active`, and `Non-Restricted`. This is stronger access/status evidence than the PASDA layer but still does not promise current field conditions or passability.

## Adversarial findings and current disposition

### 1. Post-route enrichment cannot discover gravel — resolved

A route cannot earn gravel overlap if the provider never investigates that corridor.

**Implementation:** verified Atlas corridors participate in bounded candidate generation before final ranking. Ordinary A-to-B and Free Ride/round-trip flows are supported.

### 2. Generic ride GPX import is the wrong boundary — resolved

Road catalogues are evidence sets, not rides.

**Implementation:** Gravel Atlas has a dedicated official-source snapshot/staging/reconciliation/runtime pipeline independent from the imported ride library and visual Route Atlas.

### 3. Official geometry is not routing/access truth — fenced

Surface linework may be stale, private, gated, seasonally unavailable, disconnected, or offset from current OSM topology.

**Implementation:** source observations are reconciled conservatively to canonical motorcycle-routable OSM-directed segments. Ambiguous/unmatched observations are quarantined. Final candidate routing still goes through the normal provider, and returned-route overlap must be measured before the candidate may win.

### 4. Graph verification can go stale — resolved fail-closed

The active GraphHopper cache is stamped with a content fingerprint derived from the exact prepared PA+NJ motorcycle PBF, GraphHopper binary, canonical config, and sorted custom models. Atlas runtime rows carry the graph fingerprint. A mismatch yields zero Atlas evidence instead of silently reusing stale corridors.

### 5. Source evidence can go stale independently — resolved fail-closed

Official-source snapshots have a deterministic source fingerprint. Runtime rows and metadata carry it, and route/map reads require the configured source fingerprint to match. Updating source observations without rebuilding the runtime Atlas therefore disables stale evidence rather than mixing builds.

### 6. Provider edge IDs are not durable identity — resolved

GraphHopper edge IDs are transient only. Persisted graph proof uses stable SwitchBack canonical OSM way/from-node/to-node/direction identities.

### 7. Statewide geometry at request time is unsafe — resolved

ArcGIS source services are build-time only. Runtime SQLite queries are spatially bounded; map requests are viewport bounded; routing uses at most 1 / 2 / 3 selected Atlas corridors by intensity. No statewide source payload is sent to the browser or provider.

### 8. Total source miles can lie about local usefulness — resolved

Runtime/candidate logic evaluates usable local evidence, then the returned route is independently measured for Atlas overlap. A huge source feature does not win merely because its statewide length is large.

### 9. Fragment soup can beat a coherent ride under naive scoring — resolved

Continuous verified gravel receives explicit value and fragmented evidence is penalized. Candidate replacement also requires a real evidence gain over baseline.

### 10. Synthetic lateral shaping corrupts trusted source geometry — resolved

Gravel Atlas anchors come from the verified corridor itself; they are not synthetically swung away from the road supplying the evidence.

### 11. Data availability is not rider consent — resolved

Atlas defaults OFF and only compatible Adventure/Gravel requests may activate it. Map-layer visibility is deliberately separate from routing preference.

### 12. Route caching can erase feature semantics — resolved

Atlas OFF, Balanced, More, and Maximum occupy distinct normalized/cache semantics.

### 13. Duplicate evidence can consume bounded candidate budget — resolved

Stable identities are deduplicated deterministically before the result cap.

### 14. ArcGIS service pagination can silently truncate source snapshots — resolved

PASDA advertises a 1,000-row maximum. The collector uses the effective source-policy page size for offsets and EOF detection rather than the caller's larger requested page size. Incomplete max-page walks fail instead of producing partial snapshots.

### 15. One provider failure can erase unrelated map layers — resolved

The map-feature path separates local Gravel Atlas from public OSM/weather providers and reports provider unavailability independently, preserving successful features from the other side.

### 16. Legacy layer persistence can create duplicate/invalid state — resolved

The old `unpaved` layer identity migrates to `gravel-atlas`, including sparse persisted settings/map packs, while preserving the existing storage implementation.

### 17. Generic feature styling makes gravel evidence unreadable — resolved

Gravel Atlas has a dedicated tan dashed line treatment matching its legend instead of inheriting a generic feature-layer style.

### 18. Graph-export process can hang after a fast child exit — resolved with regression coverage

The `osmium` exporter originally registered its `close` listener only after draining stdout, allowing a fast process to close before the listener existed.

**Implementation:** completion/error listeners are registered immediately after `spawn()`, stdout is then drained, and the already-captured completion promise is awaited afterward.

### 19. One-command NJ refresh could fail at the final runtime step — resolved with regression coverage

The runtime builder requires `--input=data/gravel-atlas-verified.json`; the first orchestration string omitted it.

**Implementation:** `gravel-atlas:refresh:nj` now passes the reconciliation output explicitly, with a unit contract preventing regression.

## Remaining adversarial risk: build-compatible versus internal-edge proof

The canonical exporter reads the **exact prepared PBF** used by GraphHopper and mirrors hard motorcycle access/one-way eligibility while requiring the active graph-cache fingerprint to match those inputs. This is strong build provenance, but it does not inspect every internal GraphHopper edge after parser/subnetwork processing.

This is deliberately fenced rather than hidden:

- the live activation runbook requires sampling retained corridors against the running GraphHopper service;
- every route candidate still must route successfully through GraphHopper;
- candidate replacement requires measured returned-route overlap;
- stale graph/source fingerprints disable Atlas evidence;
- meaningful exporter-vs-router discrepancies discovered during live validation are a release blocker and should strengthen reconciliation rather than weaken the gate.

## Product implementation status

The branch now includes:

- official PASDA and NJGIN adapters;
- deterministic source snapshot/staging database and source fingerprint;
- GraphHopper input fingerprinting and graph-cache stamping;
- bounded canonical OSM segment export;
- conservative source reconciliation and quarantine;
- source+graph-fingerprinted runtime SQLite;
- bounded runtime route/map queries;
- A-to-B and Free Ride/round-trip Atlas attraction;
- actual returned-route overlap/continuity evidence;
- detour/duration/evidence-improvement guards;
- `Favor known gravel` + Balanced/More/Maximum UI;
- independent `Known gravel roads` quick map layer;
- legacy layer/map-pack migration;
- dedicated gravel rendering and provider-specific load state;
- operator commands and activation/rollback runbook.

The remaining work is **not missing feature code**. It is real-data/live-environment activation and validation, which CI cannot honestly substitute for.

## Release acceptance criteria

Before PR #123 leaves draft status, record real evidence for:

- activated source scope (`NJ-only` or independently authorized `PA+NJ`);
- source and graph fingerprints;
- official observations accepted/rejected;
- canonical segments retained;
- corridors reconciled and observations quarantined;
- at least one useful A-to-B Atlas improvement;
- at least one Free Ride Atlas case;
- at least one correct no-change case;
- actual verified overlap and longest continuous run;
- distance/duration delta against Atlas OFF;
- stale source/graph fingerprint fail-closed behavior;
- representative retained-corridor checks against the active GraphHopper service;
- mobile/desktop UI and independent map-layer/routing-toggle behavior;
- complete exact-head protected CI checks.

Full operational steps and rollback requirements are in `docs/operations/GRAVEL_ATLAS_ACTIVATION.md`.
