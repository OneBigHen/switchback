# Switchback delivery waves

Post-remediation sequencing, locked 2026-08-28. Each wave is one or a few small
PRs with `npm run verify` green and a review before the next wave starts. This
replaces the mega-wave development mode used during the 2026-08 UX campaign.

Target: roughly 10–20 riders on `ride.henning.rodeo` over the public internet,
with anonymous route viewing. The open-source core stays fully usable with no
commercial API keys; the hosted instance is enriched by optional providers.

| Wave | Deliverable | Why now |
|---|---|---|
| 0 | Land PR #20 (route atlas + UX remediation) after ultra review and green core CI — **landed 2026-08-29, merged as `082c549`** | Freeze the remediation campaign |
| 1 | PostHog minimal telemetry (ADR 0011) | Baseline before new features so their value is measurable |
| 2 | TomTom Traffic v1 (ADR 0014): flow overlay + incident corridor delay into route comparison | First "decide differently because of traffic" capability |
| 3 | Traffic-signal / stop friction from OSM: lights-per-mile and an urban-friction metric | Cheap, uniquely rider-relevant, needs no provider |
| 4 | Route Intelligence v1 (ADR 0004, 0013): curves / elevation / traffic / signals / surface into an explainable Best-Ride comparison card | The core differentiator |
| 5 | Public sharing hardening (ADR 0012): snapshots, revoke, cheap/expensive rate-limit split, anonymous views | Make sharing safe on the public internet |
| 6 | Long Trip mode: fuel gaps, weather exposure, daylight/sunset ETA, lodging/camping, repair-service gaps | Multi-day trip preparation |
| 7 | TomTom routing bake-off (ADR 0001): benchmark thrilling / traffic-aware routing vs Switchback, A/B only — **absorbed into the premium wave below, phase 5** | Test rather than assume; no rewrite |

## Premium maps + routing wave — opened 2026-08-29

A deliberate new product wave, not a reopening of the closed remediation
campaign. Goal: a premium Mapbox-rendered planning and ride experience over a
traffic-aware, provider-federated decision engine, gated to the owner and a few
trusted riders. Decisions are ADRs 0015–0022. This wave absorbs wave 7 (the
TomTom routing bake-off becomes phase 5) and extends wave 2's traffic work.

Each phase is one reviewable PR: tests for the contract being changed, smallest
coherent slice, repository gates green, merge, then the next phase. No
100-file mega-branch, and a phase that meets its acceptance criteria is done —
it does not become another audit.

| Phase | Deliverable |
|---|---|
| 0 | ADRs 0015–0022, guardrail updates, recorded baseline — **this PR** |
| 1 | Mapbox Standard renderer behind an owner-only rollout flag, parity with MapLibre, no routing change |
| 2 | Standard / Terrain / Satellite experiences, light presets, premium route ribbon, road-character layer, map-pack migration |
| 3 | Look-ahead follow camera and Ride Focus presentation; real iPhone acceptance |
| 4 | Server-declared product capabilities and provider secret handling (ADR 0021) |
| 5 | TomTom capability bakeoff, recorded findings, and a tested server adapter — no route selection change yet |
| 6 | Traffic evidence and future departure time end to end |
| 7 | Candidate federation, `PA_NJ_ROUTE_POLICY_V2`, Protect the Ride cost, rider-facing route roles |
| 8 | Free Ride Discovery engine and API |
| 9 | Free Ride Discovery UX and Live v2 HUD; real iPhone acceptance |
| 10 | Google 3D cinematic preview |
| 11 | Remove migration debt: retire MapLibre and temporary flags, final polish |
| 12 | Deploy, production smoke, docs, and explicit wave closure |

Real-device acceptance is mandatory for phases 3, 9, and 12. Provider live
tests are explicit manual workflows, never ordinary PR blockers, and the
expanded Mobile QA matrix stays advisory under the existing policy.

## Operational gates (not architecture, still required)

- Production `SWITCHBACK_SESSION_SECRET` present and authentication verified.
- GraphHopper production provider healthy; `/api/health` green after restart.
- One real iPhone Safari / PWA smoke (including airplane mode) before broad
  sharing — not on every commit.
- React Doctor and the visual gate are advisory, not merge-blocking.

## Not in these waves — needs a new decision

Mapbox Directions or the Mapbox Navigation SDK, a learned route ranker, a
provider/plugin marketplace, billing or Free-vs-Pro plans and entitlement
tables, Redis, microservices, a social feed, native iOS/Android apps,
CarPlay/Android Auto as a core phase.

The Mapbox *renderer* migration is no longer on this list: it is decided in
ADR 0015 and scheduled above.
