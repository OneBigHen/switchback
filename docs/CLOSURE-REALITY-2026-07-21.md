# Closure reality — 2026-07-21

This document replaces the stale “all debt closed” conclusions in the July 19 closure snapshots. The reconciliation branch `reconciliation/pre-reskin-20260721` preserves the incoming screenshots, minimized-planner patch, and sampled regional-bundle prototype. None of those artifacts were discarded or presented as production regional routing.

## Current disposition

| Area | Disposition | Evidence or remaining gate |
| --- | --- | --- |
| Planner composition and existing routing | Completed before this branch | Retained on current `main` baseline; full verification is rerun before release. |
| Minimized planner dock | Completed | Persistent app navigation remains visible while secondary planner actions collapse; focused unit and Playwright flows pass. |
| Sampled 6×6 regional graph | Superseded and isolated | Preserved only on the reconciliation branch. It is not merged as PA/NJ coverage. |
| Offline schema and API | Implemented | Wire-safe schema v2 validators; manifest endpoint; allowlisted immutable range/ETag tile endpoint; traversal and disclosure tests. |
| Offline builder | Implemented; PA/NJ artifacts active | Reads all eligible PBF road ways through `osmium`, uses disk-backed indexes, rejects conditional/private access, and emits compressed spatial tiles plus build report. The active PA build contains 258 tiles / 22,377,338 directed edges; NJ contains 55 tiles / 8,293,289 directed edges. Every tile byte count, SHA-256, and manifest inventory checksum was verified before release. |
| Offline install lifecycle | Implemented | Per-tile checksum, quota check, pause/resume, interrupted-download reuse, atomic activation, previous-version retention, and corrupt-update tests. |
| Offline routing | Implemented; production comparison still open | Worker protocol v2, directed traversal, incoming-edge-aware restrictions, shaping points, profiles, highway avoidance, bike compatibility, and road locks. A cold PA-to-NJ New Hope/Lambertville bundle route crossed the state boundary in 2.03 seconds. The 200-pair randomized parity run and physical airplane-mode evidence are still required. |
| Offline basemap and place search | Explicitly deferred | Region graph tiles are routing data. Offline basemap/overlays and offline place search are not implied by them. |
| Visual source of truth | Completed | Four hashed EliteDesk boards, 11 mobile references, desktop/dark references, original scenic artwork, and `design/DESIGN-CONTRACT.md`. |
| Application shell | Implemented | Typed tab/overlay/theme reducer; mounted map retained through navigation; real local-first Record and Profile destinations. |
| Legacy styling removal | Partial | The new token/theme layer and scoped late visual layer are active, but deleting every superseded legacy selector remains a measured cleanup task rather than a release claim. |
| Public and device proof | Browser/public complete; physical device open | The 20-test desktop/portrait/landscape matrix, public health, Home/Library/Record/Profile/download surfaces, live provider routing, public manifests, and ranged tile delivery passed against release `1c48c64`. A real iPhone/PWA airplane-mode ride drill is still required. |

## Release rule

Do not label PA or NJ “available” from catalog constants. Availability comes only from a valid active manifest on the deployed origin. Do not label saved geometry/cues as offline rerouting. Do not close the physical iPhone gate from desktop emulation.
