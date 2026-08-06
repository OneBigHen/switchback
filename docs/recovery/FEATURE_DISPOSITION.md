# Feature Disposition

**Date:** 2026-08-05
Classifies each major surface per `00_EXECUTION_ORDER.md` Step 2. Every cut records implementation, reason, impact, and replacement.

## Keep and harden

| Feature | Current implementation | Action |
|---|---|---|
| GraphHopper-primary routing | `src/lib/routing/graphhopper.ts` | Harden via normalized request/eligibility (Phase 1) |
| Optional Valhalla fallback | `src/lib/routing/hybrid.ts`, `valhalla.ts` | Keep where semantics match; structured degradation |
| Destination / loop / timeboxed planning | `src/lib/routing/planner.ts` | Fix timebox fallback wording + eligibility |
| Route comparison | `src/components/planner/RouteComparison.tsx` | Keep; ensure only eligible candidates |
| GPX import/export | `src/lib/routing/gpx*.ts`, import worker | Keep; map-match road requirements |
| Local route/ride libraries | `src/lib/storage/*` | Keep; add migrations |
| Recording and replay | `src/lib/client/recording-session.ts`, replay | Keep |
| Weather / route evidence | `src/lib/weather/*`, evidence panels | Keep; add evidence provenance |
| Offline route packs / regional data | `src/lib/offline/*`, `src/lib/storage/offline-*` | Fix large-download, suite, rebuild, readiness |
| PWA installation | `public/sw.js`, manifest | Rewrite cache policy (bounded caches) |
| Bike-specific constraints | `src/lib/routing/bike-profiles.ts` | Unify with stable bike identity |
| Mobile ride HUD | `src/components/planner/RideHud.tsx` | Keep; confirmations + wake-lock recovery |
| Desktop route editing | `src/components/planner/MapStage.tsx` | Rebuild as three-pane workspace (Phase 5) |
| Explicit local preference learning | `src/lib/intelligence/rider-preferences.ts` | Rewrite signed model (Phase 6) |

## Rewrite

| Feature | Current defect | Replacement |
|---|---|---|
| Road locks/requirements | No snap, empty edge IDs, "exact" claim, Must zero-priority | Graph-matched `MatchedRoadRequirement`; ordered Must traversal; bounded Prefer (Phase 2) |
| Free Ride recommendation | Synthetic road class/scenic/traffic/legal-access/confidence | Graph-backed candidates, direction + expiry + workload gating (Phase 6); Experimental until then |
| Preference learning | Dislikes averaged into affinity; name-keyed identity | Signed `PreferenceModel`, stable `bike.id` |
| Rider settings / bike identity | 7 of 9 settings stored but never read; duplicate bike config | One versioned `RiderSettings` source (Phase 4) |
| Planner orchestration | 1,440-line god component | `PlannerSessionController` + state machines (Phase 4) |
| Offline region management | Recursive confirm, no-op suite/rebuild, unverified Wi-Fi | `OfflineDataController`, atomic activation, readiness (Phase 3) |
| Privacy-zone sharing | Instructions/street names leak | Full redaction + rebased metrics (Phase 2) |
| Timeboxed eligibility/fallback | Failed-gate candidate called "safe" | Eligibility before ranking (Phase 1) |
| Segmented request propagation | Drops bike/locks/toll per leg | Normalized constraints per leg (Phase 1) |
| Service-worker cache policy | Cache-first, unbounded tiles | Network-first shell, bounded tile cache (Phase 3) |

## Experimental (label + kill switch + no safety claims)

| Feature | Notes |
|---|---|
| Free Ride suggestions | Keep Experimental; label "Experimental suggestion"; graph-backed in Phase 6 or removed |
| Image-derived road requirements | `createImageTraceRoadLock`; keep approximate label, never "exact" |
| Personalized/neural ranking | `neural` profile is conventional today; label as personalization over eligible candidates, not an engine profile |
| Route research / corridor adviser | `src/lib/ai/*`; keep behind explicit user action, no unsupported claims |
| Any traffic/incident intelligence | Only live-source backed; otherwise unavailable |

## Remove or defer

| Item | Reason | Impact / replacement |
|---|---|---|
| "Neural Map" branding (`FreeRideHud.tsx:94`) | No ML engine exists | Replace with neutral copy |
| "Premium motorcycle routing" (`AppNavigation.tsx:32`) | No premium tier | Replace with "Motorcycle routing" |
| "Tap a road… snaps to the nearest routable edge" (`MapStage.tsx:1402`) | No snap exists | Replace with honest "choose entry and exit" copy until graph matching ships |
| Separate Gravel / Avoid Highways top-level profiles | Policies, not profiles | Fold into Adventure surface policy + option |
| Separate Neural top-level profile | Personalization over eligible candidates | Keep `neural` as ranking policy on eligible routes |
| Static scenic gallery / generic route imagery | Implies unsupported evidence | Remove or label "illustrative" |
| No-op suite controls (`RegionSuitePicker`) | Presentational only | Wired: suite is a region-selection preset (Phase 3) |
| No-op "Rebuild now" corridor control | `onBuildCorridor` never passed | Wired to PlannerShell `handleBuildCorridor` (Phase 3) |
| No-op download-mode picker | `onDownloadModeChange` never passed | Removed — OfflinePackModal owns download mode (Phase 3) |
| Duplicate bike config (ProfilePanel vs BikeProfilePicker) | Two sources of truth | One `RiderSettings.bikes[]` (Phase 4) |
| Unsupported "exact"/"safe"/"verified" labels | False claims | Remove until evidence-backed (Phase 0) |
| Accounts, cloud sync, community, public backend, subscriptions | Out of scope | Deferred permanently |

## Deferred (explicit)

Accounts, cloud sync, collaboration, community ratings, social features, subscriptions, public route backend, national-scale optimization, additional route profiles, learned pairwise ranker, paid traffic provider.
