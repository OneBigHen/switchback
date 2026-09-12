# TomTom traffic evidence foundation

**Status:** Approved for implementation

**Date:** 2026-09-12

**Related decisions:** ADR 0014, ADR 0018, ADR 0019

## Goal

Add TomTom as an optional, server-side traffic evidence provider without making it a second planner authority. SwitchBack continues to own route generation, eligibility, ranking, and rider-facing route choice. TomTom supplies evidence that can later change that choice.

The first production slice must be useful independently: given a planned route geometry, return normalized live incident evidence for a bounded corridor around that route. It must fail open for route planning and must never translate missing traffic data into an invented "clear" condition.

## Product behavior

When traffic evidence is configured and available, later UI work can present rider-centered facts such as:

- traffic delay along the planned corridor;
- closures and lane closures;
- roadworks and crashes;
- the roads and route locations affected.

The clean map remains clean by default. Traffic is a deliberate Trip/Traffic-mode capability, not permanent visual noise.

This slice does **not** change route selection or scoring. It establishes the evidence contract that phases 6-7 can consume safely.

## Provider choice

New integrations use TomTom Orbis Traffic API v2 for incident details. The adapter keeps the provider/version boundary explicit because ADR 0018 requires a capability bakeoff before TomTom routing or Thrilling candidates can affect route selection.

Authentication uses the `TomTom-Api-Key` request header. `TOMTOM_API_KEY` is server-only and must never appear in client bundles, API payloads, diagnostics, fixtures, or committed configuration.

## Request contract

`POST /api/route-traffic`

```json
{
  "points": [
    { "lat": 40.177, "lon": -75.106 },
    { "lat": 40.241, "lon": -75.283 }
  ]
}
```

Constraints:

- 2-400 ordered route points;
- latitude/longitude bounds are validated;
- request body is size-bounded;
- the server, not the client, derives TomTom query boxes;
- provider fan-out is bounded to protect quota and latency.

## Evidence contract

The API returns a normalized `RouteTrafficEvidence` object:

- `provider: "tomtom"`;
- `status: "available" | "unknown" | "degraded"`;
- `observedAt`;
- `totalDelaySeconds` (`null` when evidence is not trustworthy);
- `hasClosure`;
- `incidents[]` with stable ID, normalized kind, delay, affected length, road numbers, human description, endpoints, and provider geometry.

Semantics:

- `available`: TomTom successfully answered every corridor query. Zero incidents means genuinely no returned incidents in those boxes at that observation time.
- `degraded`: at least one corridor query failed. Successful incident data may be returned, but aggregate delay is `null` because coverage is incomplete.
- `unknown`: TomTom is not configured, no valid corridor can be queried, or the provider cannot be used at all. This is never represented as zero delay.

## Corridor strategy

TomTom Incident Details accepts bounding boxes, not an arbitrary route polyline. SwitchBack therefore derives a small set of contiguous route-corridor boxes from the route geometry, expands them by a small buffer, and enforces TomTom's bounding-box area limit.

The initial implementation targets PA/NJ-sized rides and caps provider fan-out. If a geometry cannot be represented safely within those bounds, traffic evidence becomes `unknown` rather than silently querying a huge unrelated area.

## Failure and quota behavior

- No API key: return `unknown`; ordinary routing remains unaffected.
- 4xx/5xx, timeout, malformed provider response: mark that corridor failed; do not leak provider details to the client.
- Partial success: return `degraded`, preserve deduplicated incidents, aggregate delay `null`.
- All provider calls fail: return `unknown`.
- Incidents crossing adjacent corridor boxes are deduplicated by TomTom incident ID.
- API route has a conservative per-IP rate limit and private/no-store cache semantics appropriate to live traffic.

A short circuit breaker is a follow-up once live measurements establish useful thresholds; it must not be guessed into this first slice.

## Explicit non-goals for this PR

- traffic flow map tiles / overlay;
- future-departure route timing;
- Protect the Ride scoring changes;
- TomTom Thrilling candidate generation;
- adding `tomtom` to `PlannedRoute.provider`;
- replacing GraphHopper or Valhalla;
- rider-facing reroute decisions.

Those depend on this evidence boundary proving reliable first.

## Acceptance criteria

1. `TOMTOM_API_KEY` remains server-only.
2. Route traffic works through a same-origin SwitchBack API only.
3. Invalid geometry is rejected before any provider call.
4. Provider calls use Orbis v2 and header-based auth.
5. Query fan-out is bounded and boxes respect the provider area limit.
6. Duplicate incidents are collapsed.
7. Missing/partial traffic cannot appear as a false "clear" result.
8. GraphHopper/Valhalla behavior is unchanged when TomTom is absent or failing.
9. Unit/API tests cover request validation, normalization, deduplication, no-key behavior, partial failure, and total failure.

## Next slices

1. Add same-origin TomTom Traffic Flow vector-tile proxy and Mapbox traffic presentation behind server-declared capability gating.
2. Attach `RouteTrafficEvidence` to comparison cards and future-departure analysis.
3. Feed bounded traffic cost into Protect the Ride under ADR 0019, with closures as hard failure evidence where appropriate.
4. Run the ADR 0018 TomTom routing/Thrilling bakeoff, record PA/NJ behavior, then add TomTom only as another candidate source if it earns that role.
