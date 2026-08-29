# ADR 0018: TomTom traffic and routing are optional premium adapters

## Status

Advances the future scope recorded in [ADR 0014](0014-tomtom-traffic-adapter.md).

## Decision

TomTom becomes two related optional capabilities: traffic evidence with
traffic-aware and future-departure routing, and Thrilling candidate generation
for motorcycle road quality — the A/B benchmark ADR 0014 deferred is now adopted
as a candidate source, still subject to ADR 0017's ranking pipeline.

Provider documentation disagrees across TomTom's map/product generations —
notably that hilliness and windingness are supported for Thrilling routes but
not with the Orbis map. So the exact production endpoints are chosen by a
recorded capability bakeoff (motorcycle travel mode, `departAt`, traffic-aware
duration, thrilling, hilliness/windingness, guidance geometry, PA/NJ coverage),
not by assumption. Using one TomTom product for Thrilling candidates and another
for traffic evidence is acceptable because Switchback normalizes both.

`TOMTOM_API_KEY` stays server-only: never in props, browser code, diagnostics,
or fixtures. Any live traffic tiles go through a narrow same-origin proxy.

## Consequences

A checked-in bakeoff document and sanitized fixtures record what the provider
actually honored, so later work does not re-litigate provider behavior from
memory. Quota exhaustion or outage trips a short circuit breaker, marks the
capability degraded, and leaves GraphHopper routing intact — traffic becomes
`unknown`, never an invented "clear".
