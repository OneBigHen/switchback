# Phase 5 — Live Road Intelligence

## Goal
Replace misleading “traffic/closures” naming with an honest, normalized live conditions layer for Switchback’s initial PA/NJ operating area.

## Architecture

Create a shared domain service concept:

```text
RoadConditionsService
 ├─ PennDotProvider
 ├─ Nj511Provider
 ├─ NwsWeatherProvider
 └─ future commercial provider
```

Exact class/function names may follow repository conventions.

## Normalized concepts

At minimum:
```ts
type RoadConditionKind =
  | "crash"
  | "closure"
  | "construction"
  | "lane-restriction"
  | "winter-condition"
  | "flooding"
  | "weather"
  | "other"
```

Normalized event should include where available:
- id,
- provider/source,
- kind,
- title,
- geometry/point,
- start/end time,
- severity,
- affected direction/lanes,
- closure state,
- detour information,
- speed restriction,
- updated time,
- confidence/freshness.

## Pennsylvania

Use PennDOT’s official developer/event data interfaces where credentials and terms permit.

Target:
- active events,
- planned events,
- winter conditions,
- coordinates,
- lane status,
- affected lanes,
- detours,
- speed restrictions.

Do not assume INRIX traffic speed data is available to this project.

## New Jersey

Use an appropriate 511NJ / NJDOT public incident source for:
- active incidents,
- closures,
- construction/detours where available,
- coordinates,
- weather-related road impacts.

## Weather

NWS remains the weather authority for alerts in the initial region.
Route UX should eventually answer:
- “Will this warning affect my route?”
- “At approximately what point/time?”

## Rename existing static layers

If current data is:
- OSM traffic signals / restrictions → label `Traffic controls`, not `Traffic`.
- OSM construction tags → label `Construction context`, not `Live closures`.
- telecom tower locations → do not label as actual cell coverage.

## Consumption

The same normalized service must feed:
- map layer,
- route detail,
- route warning summary,
- navigation warnings,
- Free Ride scoring/suppression/opportunities.

Do not write separate provider fetch logic inside each UI.

## Cache / freshness
Define:
- fetch TTL,
- stale data behavior,
- provider unavailable behavior,
- last updated indicator.

Never present stale data as live without qualification.

## Acceptance tests
- provider response normalization fixture tests;
- malformed provider event ignored/fails safely;
- stale status displayed;
- map toggles events;
- route warning intersects fixture corridor;
- missing provider does not prevent route planning;
- static OSM layer copy is corrected.

## External-source policy
Do not add a paid commercial traffic dependency in this phase without explicit approval.
