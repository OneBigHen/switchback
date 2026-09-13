# OpenGravel

OpenGravel is a **motorcycle trip decision engine**. Google Maps answers "what
is the practical route?" OpenGravel answers "which route will I actually want
to ride, and what should I know before committing to it?"

It plans real road geometry, generates genuinely different motorcycle-specific
candidates, explains why each one differs, and prepares the ride — offline
packs, weather, surface evidence — before you leave. Rides are saved locally on
your device; no account is required to plan, ride, or export.

The default deployable routing region is **Pennsylvania plus New Jersey**. The
basemap and place search are broader; a route request outside the installed
graph returns an explicit coverage error rather than drawing a fake straight
line.

> Ride guidance is an early browser-based aid, not a safety-critical navigation
> system. Keep your attention on the road, obey posted restrictions, and verify
> Adventure routes before riding — map surface and access data can be
> incomplete or stale.

## What it does today

**Plan.** Quick, Balanced, Twisty, Scenic, and Adventure profiles (Gravel is an
Adventure surface policy, Avoid Highways is a per-ride option, and Neural is
personalization over eligible candidates — not separate engine profiles).
Free-form requests like "two-hour gravel loop from Carlisle with a brewery
stop" through a deterministic local interpreter, optionally enhanced by a
configured model. Address, place, and map-picked points; routed shaping stops;
draggable start/finish/via markers; finger/stylus/mouse route sketching; and a
50-step undo/redo edit history.

**Decide.** Best Ride is the default, with Fastest and Balanced one tap away
and the added minutes always shown. Comparison rejects near-duplicates,
preserves genuinely distinct same-profile alternatives, and explains the
tradeoff across distance, time, turn density, overlap, road mix, and surface
mix. Every candidate passes eligibility, enrichment, traffic evidence, scoring,
dedupe, and role assignment — providers propose, OpenGravel decides.

**Prepare.** National Weather Service forecasts and alerts sampled along the
route, Pennsylvania DEP unpaved-road corridor evidence, curvy-road and
topographic/imagery/terrain/access/rider-stop overlays, GPX 1.1 import and
export, offline route packs and regional data, and PWA installation.

**Ride.** A high-contrast ride view with browser GPS, heading- and
continuity-aware progress, spoken maneuvers, weather alerts, automatic
off-route recovery, and a screen wake lock where available. Free Ride records
an unplanned ride and offers at most one workload-aware suggestion ahead.

**Share, optionally.** Opaque-link read-only route snapshots and a
passkey-gated pseudonymous identity for publishing and encrypted sync. Not a
social network: no feed, followers, or DMs.

## Quick start

Needs Node 24+, Java 17+, `curl`, `osmium-tool`, and roughly 4 GB free disk.

```bash
npm ci
cp .env.example .env.local
npm run data:bootstrap     # pinned GraphHopper 11 jar + PA/NJ extracts
npm run routing:import     # several minutes; replaces data/graph-cache
```

Then run the router and the app in separate terminals:

```bash
npm run routing:start
npm run dev
```

Open `http://localhost:3000`. `localhost` counts as a secure browser context; a
phone on a raw LAN URL does not, so phone GPS and wake lock need the HTTPS
setup in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Architecture

One Next.js process owns the UI and the server-side provider boundary. The
browser only ever calls `/api/*`; routing providers stay on the server side of
that boundary and are never exposed to the LAN or internet.

| Layer | Choice | Why |
| --- | --- | --- |
| App | Next.js 16, React 19, TypeScript | One production process for UI and the provider boundary |
| Renderer | Mapbox GL JS v3 (Mapbox Standard) is the decided primary renderer; MapLibre GL JS + OpenFreeMap ships as the default and the migration rollback path | ADR [0015](docs/adr/0015-mapbox-primary-renderer.md). Mapbox is enabled per deployment by `NEXT_PUBLIC_SWITCHBACK_PREMIUM_MAPBOX` plus a browser token; a missing token can never enable it, so an unconfigured deployment renders through MapLibre rather than a blank canvas. MapLibre retires at roadmap phase 11, after rollout evidence — it is not a permanent dual-renderer framework |
| Router | Self-hosted GraphHopper 11 primary, optional Valhalla fallback, optional TomTom candidates | ADR [0001](docs/adr/0001-routing-provider-architecture.md), [0017](docs/adr/0017-federated-route-candidates.md). GraphHopper must be able to answer alone; the core needs no commercial key. Mapbox Directions is **not** a routing source — it exposes no motorcycle profile |
| Route quality | GraphHopper custom models + SQLite curvature data | ADR [0004](docs/adr/0004-fun-road-scoring.md). Deterministic and explainable; no learned ranker |
| Traffic | Optional TomTom adapter; OSM signal/stop density as the key-free baseline | ADR [0002](docs/adr/0002-traffic-data-strategy.md), [0019](docs/adr/0019-protect-the-ride.md). Traffic informs scoring but never wins; closures still hard-fail |
| Place search | Google Places Text Search when configured, location-biased Photon otherwise | Precision when a server-only key exists, no-key-safe otherwise |
| Weather | National Weather Service API | Hourly conditions and alerts with no weather key |
| Identity | Same-origin WebAuthn passkeys + local SQLite | No Clerk/Auth0/Supabase/Firebase, no session-store service |
| Rider data | Dexie/IndexedDB | Local-first saved routes with no sign-in gate |

Data stays local by default: saved and imported routes live in the browser's
IndexedDB on that device, GPX export is generated in the browser, and live
location is read by the ride view without being persisted. Clearing site data
removes the local route library — export rides as GPX first. Analytics are ~15
deliberate PII-free events with `TELEMETRY_ENABLED=false` available to
self-hosters (ADR [0011](docs/adr/0011-product-analytics.md)).

## Configuration

Copy [.env.example](.env.example) to `.env.local` for development, or
`.env.production` before `npm run build`. That file is the authoritative
reference for every variable — routing endpoints, optional provider keys,
WebAuthn trust values, and data paths — with defaults and security notes
inline. Secrets are server-only; the only `NEXT_PUBLIC_*` values are the map
style URL and the browser-authorized Mapbox token.

## Testing

```bash
npm run verify              # lint, typecheck, unit/component tests, production build
npm run test:e2e            # desktop Chromium + mobile WebKit browser flows
npm run test:e2e:critical   # the PR merge gate's rider journeys
npm run test:e2e:mobile-qa  # Level A mobile gate (advisory)
```

Playwright WebKit is not iOS Safari and does not prove an installed iOS PWA.
Release summaries keep those boundaries separate and say `NOT RUN` when
real-device evidence is unavailable. Visual baselines live in
`tests/e2e/visual/*-snapshots/` and are compared on every `visual` CI job;
`artifacts/` is generated run output and is not a baseline.

## Canonical documentation

| Topic | Where |
| --- | --- |
| Product guardrails and frozen decisions | [AGENTS.md](AGENTS.md) |
| Architecture decisions | [docs/adr/](docs/adr/README.md) |
| Delivery sequencing | [docs/release/ROADMAP-WAVES.md](docs/release/ROADMAP-WAVES.md) |
| Product/interaction/architecture direction | [docs/astra/FULL-REFACTOR-SPEC.md](docs/astra/FULL-REFACTOR-SPEC.md) |
| Visual and interaction contract | [design/DESIGN-CONTRACT.md](design/DESIGN-CONTRACT.md) |
| Deployment and routing coverage | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| Container stack | [deployment/README.md](deployment/README.md) |
| CI architecture | [docs/CI-ARCHITECTURE.md](docs/CI-ARCHITECTURE.md), [docs/SELF-HOSTED-CI.md](docs/SELF-HOSTED-CI.md) |
| Quality workflow and gates | [docs/quality/README.md](docs/quality/README.md) |
| Retained legacy shims | [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) |
| Security policy | [SECURITY.md](SECURITY.md) |

## Project layout

```text
src/app/api/            Next server boundary: routing, geocoding, ride intent, weather, GPX, overlays
src/components/planner/ Planner, map workspace, comparison, and ride surfaces
src/components/rides/   Rides destination and route library surfaces
src/lib/domain/         Ride intent ownership, eligibility, and routing contracts
src/lib/routing/        Profiles, provider adapters, orchestration, scoring, GPX
src/lib/roads/          Road Intelligence Graph: evidence, corridors, road locks
src/lib/offline/        Offline packs, tiles, and the routing worker protocol
src/lib/storage/        IndexedDB libraries and persisted-data migrations
infra/                  GraphHopper config, optional Valhalla, Caddy, systemd, CI runner
deployment/             Production Docker Compose stack and backup/restore
scripts/                Data bootstrap, normalization, validation, QA tooling
tests/                  Unit, component, and end-to-end coverage
```

## License

[MIT](LICENSE).
