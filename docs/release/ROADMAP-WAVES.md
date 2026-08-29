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
| 7 | TomTom routing bake-off (ADR 0001): benchmark thrilling / traffic-aware routing vs Switchback, A/B only | Test rather than assume; no rewrite |

## Operational gates (not architecture, still required)

- Production `SWITCHBACK_SESSION_SECRET` present and authentication verified.
- GraphHopper production provider healthy; `/api/health` green after restart.
- One real iPhone Safari / PWA smoke (including airplane mode) before broad
  sharing — not on every commit.
- React Doctor and the visual gate are advisory, not merge-blocking.

## Not in these waves — needs a new decision

Mapbox migration, a provider/plugin marketplace, billing or Free-vs-Pro plans
and entitlement tables, Redis, microservices, a social feed, native iOS/Android
apps, CarPlay/Android Auto as a core phase.
