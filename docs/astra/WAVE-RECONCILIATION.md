# Wave reconciliation

Added 2026-09-05 during independent review of this package. `AGENTS.md` states the 2026-08 UX remediation campaign is closed (landed as PR #20, merged `082c549`) and that the **premium maps + routing wave (ADRs 0015–0022) opened 2026-08-29** and is the current authorized wave, sequenced in `docs/release/ROADMAP-WAVES.md`. This full refactor package, as originally written, does not reference that wave, its ADRs, or `ROADMAP-WAVES.md` anywhere. That omission needed a direct answer before anyone rearchitects from this package, not an assumption.

## This is not two competing efforts — it is the same code

`ROADMAP-WAVES.md`'s premium wave is mid-flight, roughly at phase 1–2 (Mapbox Standard renderer rollout; Standard/Terrain/Satellite, premium route ribbon, direct-manipulation work). The branches already merged into the reviewed baseline `63de8ef` on `tmp/merge-61` — `feat/route-advisor`, `ux/planner-workspace-hierarchy`, `ux/map-native-route-comparison`, `ux/map-native-route-sculpting` (PR #61) — are that phase's work. The Astra audit's S1 findings (fragmented ride intent, AI that cannot execute a mutation, Free Ride resetting constraints on transition) describe defects in the code the current wave is actively producing, not in a separate legacy system that this refactor would displace.

Two concrete consequences follow:

1. **ADR 0023 (route-advisor) and the sculpting/comparison work are not itemized in `ROADMAP-WAVES.md`'s 12 declared phases**, and none of the phase descriptions name route sculpting or an AI advisor. Either the roadmap document is stale relative to what is actually merged, or this is scope beyond what phase 0 approved. This needs an explicit owner decision, not a document assuming either answer.
2. **Downstream premium-wave phases depend on the foundation this package says is broken.** Phase 2 (route ribbon), phase 3 (follow camera), phase 6 (traffic evidence), phase 7 (candidate federation and rider-facing route roles), and phases 8–9 (Free Ride Discovery/Live v2) all sit on top of the same planner intent and Free Ride session ownership that U01/U02/U05/U14 document as unable to survive a refresh or a suggestion-accept transition. Shipping those phases on the current fragmented state means building premium features on a foundation that loses the user's intent.

## Recommendation

Do not run this package's Wave 0–8 backlog as a second, parallel roadmap alongside `ROADMAP-WAVES.md`. Insert [IMPLEMENTATION-BACKLOG](IMPLEMENTATION-BACKLOG.md) Wave 0 (truth/policy) and Wave 1 (one recoverable ride intent) as revised prerequisite phases inside the premium wave's existing sequence — logically before its phase 2, since phase 2's route ribbon and comparison work already depend on stable intent ownership. Waves 2–8 here then continue as the detailed design for the premium wave's later phases (2, 3, 6–9) rather than as a freestanding track.

This applies the same principle the architecture assessment already states for application state — "no second permanent state authority is allowed during migration" — to planning documents: there should be one authoritative sequencing document. Until an owner formally amends `ROADMAP-WAVES.md` (or explicitly declares this a separate authorized wave), treat that file as authoritative for phase order and this package as authoritative for the technical contracts each phase must satisfy.

## Open question for the product owner

Is this full-refactor package intended as the missing detail for the premium wave's remaining phases, or as a distinct wave that supersedes it? This document does not decide that; it makes the conflict explicit so wave 0 work does not proceed on an unstated assumption.
