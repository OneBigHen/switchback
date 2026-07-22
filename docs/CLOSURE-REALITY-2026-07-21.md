# Closure reality — 2026-07-21

This document replaces the stale “all debt closed” conclusions in the July 19 closure snapshots. The reconciliation branch `reconciliation/pre-reskin-20260721` preserves the incoming screenshots, minimized-planner patch, and sampled regional-bundle prototype. None of those artifacts were discarded or presented as production regional routing.

## Current disposition

| Area | Disposition | Evidence or remaining gate |
| --- | --- | --- |
| Planner composition and existing routing | Completed before this branch | Retained on current `main` baseline; full verification is rerun before release. |
| Minimized planner dock | Completed | Persistent app navigation remains visible while secondary planner actions collapse; focused unit and Playwright flows pass. |
| Sampled 6×6 regional graph | Superseded and isolated | Preserved only on the reconciliation branch. It is not merged as PA/NJ coverage. |
| Offline schema and API | Implemented | Wire-safe schema v2 validators; manifest endpoint; allowlisted immutable range/ETag tile endpoint; traversal and disclosure tests. |
| Offline builder | Implemented, artifact gate in progress | Reads all eligible PBF road ways through `osmium`, uses disk-backed indexes, rejects conditional/private access, and emits compressed spatial tiles plus build report. A small-PBF completeness test is green. |
| Offline install lifecycle | Implemented | Per-tile checksum, quota check, pause/resume, interrupted-download reuse, atomic activation, previous-version retention, and corrupt-update tests. |
| Offline routing | Implemented, production comparison still open | Worker protocol v2, directed traversal, incoming-edge-aware restrictions, shaping points, profiles, highway avoidance, bike compatibility, and road locks. Randomized PA/NJ parity and physical airplane-mode evidence are still required. |
| Offline basemap and place search | Explicitly deferred | Region graph tiles are routing data. Offline basemap/overlays and offline place search are not implied by them. |
| Visual source of truth | Completed | Four hashed EliteDesk boards, 11 mobile references, desktop/dark references, original scenic artwork, and `design/DESIGN-CONTRACT.md`. |
| Application shell | Implemented | Typed tab/overlay/theme reducer; mounted map retained through navigation; real local-first Record and Profile destinations. |
| Legacy styling removal | Partial | The new token/theme layer and scoped late visual layer are active, but deleting every superseded legacy selector remains a measured cleanup task rather than a release claim. |
| Public and device proof | Open until rerun | Desktop/mobile browser matrix, public health and return paths, and a real iPhone/PWA airplane-mode ride drill must be recorded against the exact deployed SHA. |

## Release rule

Do not label PA or NJ “available” from catalog constants. Availability comes only from a valid active manifest on the deployed origin. Do not label saved geometry/cues as offline rerouting. Do not close the physical iPhone gate from desktop emulation.
