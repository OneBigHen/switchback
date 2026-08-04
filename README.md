# Switchback

Switchback is a map-first motorcycle route planner for riders who care more about the road than the shortest ETA. It plans real road geometry, compares motorcycle-specific route styles, explains their tradeoffs, saves rides locally, imports and exports GPX, and provides a distraction-reduced ride view.

The default deployable routing region is **Pennsylvania plus New Jersey**. The basemap and place search are broader; route requests outside the installed graph return an explicit coverage error instead of drawing a fake straight line.

## What works

- Quick, Twisty, Scenic, and Adventure routing profiles
- Route comparison that rejects near-duplicates, preserves genuinely distinct same-profile alternatives, and explains why each option differs
- Motorcycle-specific way/node access and turn restrictions, including explicit `motorcycle=no`
- Free-form destination, address, and loop requests such as “Route me to 10 W Main St, New Hope, PA” or “two-hour gravel loop from Carlisle with a brewery stop,” with a deterministic local interpreter and optional OpenRouter enhancement
- A modular free-form waypoint resolver that acquires browser location when a fresh session has no start, then location-biases destination lookup from the origin that will actually be routed
- Google Places Text Search for precise destinations when configured, with location-biased Photon fallback when Google is absent, empty, or unavailable
- GraphHopper-primary hybrid routing with optional distinct Valhalla alternatives/fallback for supported point-to-point requests, route-level provider provenance, and independently degradable elevation enrichment
- Timeboxed 60/90/120/180-minute loops using GraphHopper's native round-trip algorithm, measured-duration feedback, varied seeds, and headings
- Timeboxed point-to-point rides: a direct baseline plus up to four curvature/GPX/research corridors shaped inside a safe envelope, scored by a maximum-twisties formula with hard duration, backtracking, and self-overlap gates
- Source-backed corridor hints from the optional You.com adviser (`/api/ride-corridors`), validated by URL and geocoding and cached for seven days — research never blocks the primary route
- Continuous planner progress with elapsed time and Cancel from the ride prompt, while the previous route stays visible (dimmed) during replan and alternatives merge without changing your selection
- Address/place search, map-picked points, routed shaping stops, and draggable start/finish/via markers
- Finger, stylus, and mouse rough-route sketching that turns a traced corridor into a legal route with at most six editable shaping stops
- A 50-step route-edit history with undo/redo, shaping-stop reordering, route reversal, deletion, and draggable fine-tuning
- Explicit highway avoidance that removes motorway and trunk candidates at the routing engine
- Side-by-side route comparison with distance, time, turn density, overlap, road mix, and surface mix
- Optional viewport-bounded curvy-road overlay
- Pennsylvania DEP corridor evidence that biases Adventure candidates, a toggleable official-road overlay, live topographic, imagery, terrain, access, weather, and rider-stop layers, and Clean, Explorer, and Night OpenFreeMap styles
- National Weather Service forecasts sampled along the selected route plus active weather alerts
- Local route library in IndexedDB; no account required
- GPX 1.1 import/export plus an optional server-side project GPX catalog
- High-contrast ride preview with browser GPS, heading/continuity-aware progress, spoken maneuvers, weather alerts, automatic off-route recovery, and a screen wake lock when available
- Desktop sidebar and touch-oriented mobile layout
- App/provider health endpoint that reports GraphHopper and optional Valhalla independently, plus actionable provider errors

Ride guidance is an early browser-based aid, not a safety-critical navigation system. Keep your attention on the road, obey posted restrictions, and verify Adventure routes before riding; map surface/access data can be incomplete or stale.

GraphHopper 11's configurable road model uses its car access parser. Before graph import, Switchback creates a derived OSM extract that projects explicit `motorcycle=*` tags onto the parser's access keys while retaining the original tags for auditability. Conditional-only motorcycle access is excluded conservatively: a static graph cannot safely interpret every time-of-day, seasonal, or free-text condition at ride time.

## Planning a ride

Choose a start, then either pick a destination or switch to **Loop** and choose a ride-time target. You can also describe the whole trip in the ride prompt. Switchback recognizes concise place names, city/state pairs, full addresses, explicit origins, duration, loop/destination intent, riding style, highway avoidance, and brewery, coffee, or food stops. If no start is available in a fresh browser, planning explicitly asks for current location before searching for the destination. Destination search is biased from that resolved origin. When a stop is requested, Switchback first plans the ride, searches within 35 km of the route midpoint, rejects distant/non-POI results, adds a compatible result as a routed shaping waypoint, and plans again.

To shape the trip directly, choose **Sketch route** and drag one rough line over the roads or area you want to ride. Switchback reduces the trace to the routing provider's waypoint budget, preserves the start/destination or loop anchors and current preferences, then requests normal legal road geometry. The generated shaping stops remain visible and editable; the sketch itself is guidance, not synthetic route geometry.

Route-point edits are recoverable. Use **Undo** and **Redo** after adding, deleting, reordering, dragging, reversing, or replacing shaping points with a sketch. The latest 50 point states remain in memory for the active planning session; making a new edit after undo intentionally starts a new branch.

For a loop without shaping stops, Switchback gives GraphHopper one start point plus a target distance estimated from the requested duration and profile. It measures the returned duration and retries bounded seed/heading/distance variants when the first line misses the timebox. Comparison profiles explore genuinely different directions. Adding a shaping stop converts the loop into an explicit start → shape anchors/stops → start route, preserving the original loop character while allowing the markers to be dragged and re-routed. Fixed shaping points that cannot meet the target produce an explicit warning rather than pretending the timebox still matches.

Adventure selection strongly favors gravel and other unpaved surfaces reported by GraphHopper's OpenStreetMap details. It also submits up to four simplified candidate corridors to the Pennsylvania DEP “Unpaved Roads 2009_07” service, measures only aligned contiguous matches, and uses that positive official evidence to choose among already-routable candidates. The same dataset is available as a map overlay at zoom 9 or closer. Because the source is from 2009, it never establishes public access, overrides GraphHopper routability, or replaces current road-condition checks. Treat every unpaved route as a candidate to verify before riding.

## Why this stack

| Layer | Choice | Reason |
| --- | --- | --- |
| App | Next.js 16, React 19, TypeScript | One production process for the UI and server-side provider boundary |
| Map | MapLibre GL JS + OpenFreeMap | Open rendering stack with a replaceable style URL and no required map token |
| Router | Self-hosted GraphHopper 11 primary + optional Valhalla | GraphHopper owns motorcycle profiles and native loops; Valhalla can add distinct supported alternatives or preserve a supported point-to-point request during a GraphHopper failure |
| Route quality | GraphHopper custom models + SQLite curvature data | Makes Twisty, Scenic, and Adventure behavior controllable instead of relying on car-only profiles |
| Place search | Google Places Text Search + Photon fallback | Uses Google for destination precision when a server-only key is configured and keeps no-key/outage-safe, location-biased search through Photon |
| Ride intent | Local parser + optional OpenRouter | Keeps core planning available without a cloud key while supporting richer free-form requests when configured |
| Weather | National Weather Service API | Hourly conditions and active alerts for route samples without a weather API key |
| PA unpaved intelligence | PASDA / Pennsylvania DEP ArcGIS service | Cached route-corridor evidence plus viewport-bounded official reference lines |
| Rider data | Dexie/IndexedDB | Fast local-first saved routes without a sign-in gate |

GraphHopper is always attempted first. When `VALHALLA_URL` is configured, eligible non-Adventure, non-round-trip requests are also sent to Valhalla and distinct candidates are merged with route-level provider/version provenance. If GraphHopper fails, a successful Valhalla result preserves that supported request; optional-provider failure becomes a warning rather than deleting valid GraphHopper geometry. Native round trips and Adventure remain GraphHopper-only because their current semantics are not interchangeable. `VALHALLA_ELEVATION_URL` is independent and may enrich any returned geometry through `/height`; an elevation outage leaves the route intact.

Mapbox is not the routing core because its Directions API does not expose a motorcycle profile. Google two-wheel routing is region-limited and does not provide the custom curvy/scenic weighting this product needs. Google Places is used only for search quality when configured. The provider boundaries remain configuration-driven.

## Requirements

- Linux or macOS
- Node.js 22 or newer
- npm 10 or newer
- Java 17 or newer
- Approximately 2 GB RAM to serve the router and at least 6 GB available during graph import
- Roughly 4 GB free disk for the Pennsylvania/New Jersey extracts, GraphHopper jar, and imported graph
- `curl` for automatic data downloads
- `osmium-tool` for the motorcycle access normalization pass

## First run

```bash
git clone <your-switchback-repository> switchback
cd switchback
npm ci
cp .env.example .env.local
npm run data:bootstrap
npm run routing:import
```

`data:bootstrap` first reuses compatible files from known local Vibe projects, then downloads the pinned GraphHopper 11 jar and current Pennsylvania and New Jersey Geofabrik extracts when needed. It merges them and creates `data/pa-nj-motorcycle.osm.pbf` with motorcycle-specific access normalized for GraphHopper. The curvature database is optional; without it, normal routing still works and the overlay reports that its data is unavailable.

The first `routing:import` can take several minutes and uses up to 5 GB of heap. It **replaces `data/graph-cache`**, so do not run it while the router is serving traffic.

Start the router and app in separate terminals:

```bash
npm run routing:start
```

```bash
npm run dev
```

Open `http://localhost:3000`. `localhost` is treated as a secure browser context for development; a phone opening a raw LAN URL such as `http://192.168.1.40:3000` is not. Use the HTTPS setup below for phone GPS and wake lock.

## Configuration

Copy [.env.example](.env.example) to `.env.local` for development or `.env.production` before `npm run build` for production.

| Variable | Default | Purpose |
| --- | --- | --- |
| `GRAPHHOPPER_URL` | `http://127.0.0.1:8989` | Server-only GraphHopper endpoint |
| `VALHALLA_URL` | unset | Optional server-only Valhalla endpoint for supplemental alternatives and supported-request fallback; it does not replace GraphHopper |
| `VALHALLA_ELEVATION_URL` | unset | Optional server-only Valhalla `/height` source; may be configured independently from Valhalla routing |
| `PHOTON_URL` | `https://photon.komoot.io/api/` | Server-only Photon-compatible search endpoint |
| `GOOGLE_MAPS_API_KEY` | unset | Optional server-only key for Google Places Text Search and rider-stop ideas; never expose it through `NEXT_PUBLIC_*` |
| `OPENROUTER_API_KEY` | unset | Optional server-only key for enhanced free-form ride interpretation; without it, the local parser is used |
| `OPENROUTER_MODEL` | `openrouter/free` | OpenRouter model/router used when a key is configured |
| `NWS_USER_AGENT` | built-in Switchback identifier | Deployment identifier sent to `api.weather.gov`; configure a contact-bearing value for your instance |
| `CURVATURE_DB_PATH` | `<repo>/data/segments.db` | Absolute or repo-relative path to the optional curvature SQLite database |
| `CORRIDOR_CACHE_PATH` | `<repo>/data/route-research-cache.sqlite` | Server-side 7-day cache of validated corridor hints for `/api/ride-corridors` and the timeboxed destination planner |
| `GPX_LIBRARY_PATH` | `<repo>/data/gpx-library` | Server-side catalog scanned by `/api/gpx-library`; separate from each browser's IndexedDB routes |
| `NEXT_PUBLIC_MAP_STYLE_URL` | OpenFreeMap Positron | Browser-visible MapLibre style URL for the Clean map; set this before building |
| `SPOTIFY_CLIENT_ID` | unset | Public Spotify application ID used by the optional remote player controls |
| `SPOTIFY_REDIRECT_URI` | unset | Exact registered callback URL, normally `https://your-switchback-host/callback` |
| `SPOTIFY_SESSION_SECRET` | unset | Server-only, 32+ character key used to encrypt Spotify PKCE and refresh-token cookies |

When `GOOGLE_MAPS_API_KEY` is configured, deliberate destination searches use Google Places Text Search with a location bias from the resolved start. Empty results and provider errors fall back to Photon. The public Photon endpoint is convenient for a personal deployment; for heavier or multi-user traffic, run a Photon instance you control and set `PHOTON_URL` rather than treating the public service as an unlimited production API.

Valhalla is optional. The pinned [Valhalla Compose contract](infra/valhalla/README.md) builds Pennsylvania/New Jersey tiles from the same normalized extract and binds the service to `127.0.0.1:8002`; it is not required by the default GraphHopper startup. Enable `VALHALLA_URL` and/or `VALHALLA_ELEVATION_URL` only after the documented local route, status, and elevation checks pass. When `VALHALLA_URL` is configured, `/api/health` reports that routing provider independently; a Valhalla outage marks the app degraded while GraphHopper readiness remains authoritative. An elevation-only endpoint is not currently a separate health probe.

`OPENROUTER_API_KEY` is optional. When it is absent, invalid, rate-limited, or returns unusable structured output, Switchback falls back to its local ride-intent parser. Keep the key only in `.env.local`, `.env.production`, or your service manager's protected environment; never use a `NEXT_PUBLIC_` name for it. The default `openrouter/free` router may choose different free models over time, so set `OPENROUTER_MODEL` to a specific compatible model if reproducibility matters.

### Spotify mini-player

The optional player uses Spotify's Authorization Code with PKCE flow and Web API playback controls. It never needs `SPOTIFY_CLIENT_SECRET`; do not add or deploy one. Register the exact value of `SPOTIFY_REDIRECT_URI` in the Spotify Developer Dashboard, set the three variables above, rebuild/restart Next, and choose **Connect Spotify** in the player dock. Generate `SPOTIFY_SESSION_SECRET` independently from any Spotify credential:

```bash
openssl rand -base64 32
```

Production callbacks must use HTTPS. For local development, Spotify requires an explicit loopback IP such as `http://127.0.0.1:3000/callback`; `localhost` is not accepted. The configured URI, including path, case, port, and trailing slash, must match the dashboard entry exactly.

Switchback keeps the PKCE verifier and Spotify refresh token in encrypted `httpOnly`, `SameSite=Lax` cookies. The OAuth return uses a short-lived, one-time handoff so the same browser can establish the encrypted session without putting Spotify credentials in the URL. Token and playback responses are private and `no-store`. Access tokens refresh silently before expiry, refresh-token rotation is retained when Spotify supplies it, and an expired or revoked refresh token returns the player to the connect prompt. Spotify currently documents a six-month refresh-token lifetime, so eventual reauthorization is expected.

Switchback controls the Spotify app or Connect device that is already active; it does not transfer protected audio into the browser. Open Spotify and start a song once if no active device is shown. Spotify's playback-control endpoints require an eligible Premium account, and Development Mode limits who can use the registered app. Review the current [playback-state API](https://developer.spotify.com/documentation/web-api/reference/get-information-about-the-users-current-playback), [PKCE flow](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow), and [Development Mode limits](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide) before sharing the deployment.

The weather and Pennsylvania unpaved-road adapters use fixed public provider endpoints. They need no API keys. Set `NWS_USER_AGENT` to an application identifier with a real contact before relying on the public NWS service, and expect both external overlays to degrade gracefully when their providers are unavailable.

Bootstrap downloads can also be overridden for one command:

```bash
SWITCHBACK_PBF_URL=https://example.test/pennsylvania.osm.pbf \
SWITCHBACK_NJ_PBF_URL=https://example.test/new-jersey.osm.pbf \
SWITCHBACK_GRAPHHOPPER_JAR_URL=https://example.test/graphhopper-web-11.0.jar \
npm run data:bootstrap
```

Do not expose GraphHopper or Valhalla directly to the LAN or internet. The browser only calls Next.js `/api/*` routes, and Next talks to routing providers over the server-side network boundary.

## Public deployment notes

Sharing the app publicly adds abuse and cost exposure; the code ships with
defense in depth, but the proxy contract must be respected:

- **Secrets stay server-only.** No API key reaches the browser bundle
  (`NEXT_PUBLIC_*` is only the non-secret map style URL). Env files are
  gitignored; provision them outside the repo (e.g. `/etc/switchback/`).
- **Rate limiting.** Every public endpoint is limited per caller IP
  (`src/lib/server/rate-limiter.ts`), with tighter windows on paid-key routes
  (ride-intent/OpenRouter, ride-research + ride-corridors/You.com,
  geocode + place-ideas/Google, route-weather/NWS, map-features/Overpass).
  The routing provider queue is bounded and returns 429 when saturated.
- **The proxy must own the client-IP headers.** Caddy's example strips
  client-supplied `X-Forwarded-For`/`X-Real-IP`/`Cf-Connecting-Ip` and
  rewrites them from the real socket peer; without that, per-IP limits are
  spoofable. Behind Cloudflare, set `TRUST_CF_CONNECTING_IP=1` on the app
  and keep the origin firewalled to Cloudflare's IP ranges.
- **Firewall the origin.** Do not expose the Next port (or the router ports)
  beyond your proxy; the Cloudflare host service that binds `0.0.0.0:3100`
  is only safe when the edge/firewall is restricted to Cloudflare IPs.
- **TLS.** Replace `tls internal` with a real ACME certificate and set an
  email in the Caddy global block. The app sends HSTS, CSP, nosniff and
  frame/object restrictions on every response in production.
- **GPX library paths are scrubbed** from the public catalog response; the
  project catalog under `GPX_LIBRARY_PATH` is still visible to anyone — only
  publish routes you intend to share.

## Production on a LAN with HTTPS

Geolocation, screen wake lock, service workers, and other installable-web-app capabilities require a [secure browser context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts). `localhost` is a development exception; a phone connecting to a LAN IP over plain HTTP is not. The supplied Caddy example terminates HTTPS and proxies only the Next app.

### 1. Build and run the two application services

For a durable host install, deploy into a path readable by an unprivileged service account rather than running from `/root`:

```bash
sudo useradd --system --home /opt/switchback --shell /usr/sbin/nologin switchback
sudo install -d -o switchback -g switchback /opt/switchback /opt/switchback/data /etc/switchback
sudo rsync -a --delete --exclude node_modules --exclude .next --exclude data ./ /opt/switchback/
sudo -u switchback bash -lc 'cd /opt/switchback && npm ci && cp .env.example .env.production && npm run build'
```

Materialize the routing files under `/opt/switchback/data`; do not leave production symlinks pointing into `/root/Vibe`. Import the graph as the service user if it was not copied from a compatible GraphHopper 11 install:

```bash
sudo -u switchback bash -lc 'cd /opt/switchback && npm run data:bootstrap && npm run routing:import'
```

Review `/opt/switchback/.env.production`, then install the example units:

```bash
sudo cp infra/systemd/switchback-app.service /etc/systemd/system/switchback-app.service
sudo cp infra/systemd/switchback-router.service /etc/systemd/system/switchback-router.service
sudo systemctl daemon-reload
sudo systemctl enable --now switchback-router switchback-app
```

The checked-in example binds Next to `127.0.0.1:3100`; GraphHopper must bind its application connector to `127.0.0.1:8989`, and an optional Valhalla service should likewise remain loopback-only. The current `switchback-cloudflare` host service uses `0.0.0.0:3100` for its existing Cloudflare origin topology while both router ports remain loopback-only; do not mistake that host-specific service for the safer generic example. Confirm the actual listeners before enabling a proxy:

```bash
ss -ltnp | grep -E ':(3100|8989)\b'
curl --fail http://127.0.0.1:3100/
curl --fail http://127.0.0.1:3100/api/health
```

### 2. Give the app a LAN name

Create a local DNS record, for example:

```text
switchback.home.arpa -> 192.168.1.40
```

`.home.arpa` is reserved for home networks. Every phone that will use Switchback must resolve that name to the Caddy host.

### 3. Install Caddy and the HTTPS site

Install Caddy using its official package for your operating system, then:

```bash
sudo cp infra/caddy/Caddyfile.example /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

The example uses Caddy's local certificate authority. Export its root certificate from the host (the package install commonly stores it at `/var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt`) and explicitly trust it on each phone. On iOS, installing the profile is not enough: also enable full trust under **Settings → General → About → Certificate Trust Settings**. Android menus vary by vendor; install it as a trusted CA certificate. The certificate is meant to be distributed to your devices; Caddy's corresponding private root key is sensitive and must stay on the server.

If you own a real DNS name, a publicly trusted certificate is preferable. Point a name at the LAN host (split DNS) and replace `tls internal` in the example with your ACME/DNS-challenge configuration. Do not port-forward GraphHopper, Valhalla, or the Next origin port.

Finally, open `https://switchback.home.arpa` on the phone and grant location access. Add it to the home screen from the browser if desired. Offline routing is available only for regions whose v2 manifest and complete immutable tile inventory have been published under `data/offline-regions`; selected-route guidance is not presented as arbitrary offline rerouting. Offline basemap and place search remain separate, explicitly incomplete capabilities.

### Offline region artifacts

Build a complete spatially sharded region from an OSM PBF without sampled route responses:

```bash
node --max-old-space-size=2048 scripts/build-offline-v2.mjs \
  data/pennsylvania-motorcycle.osm.pbf data/offline-regions \
  pennsylvania Pennsylvania
```

The builder uses a disk-backed index, rejects unevaluable conditional access, emits directed edges and supported node-via turn restrictions, compresses each content-addressed tile, and activates the new version only after the manifest and every tile are complete. Next serves the active manifest at `/api/offline/regions/{regionId}/manifest` and immutable byte-range tiles at `/api/offline/regions/{regionId}/tiles/{tileId}`. Generated artifacts are intentionally gitignored; publish them alongside the deployed runtime, not in Git.

## Verification

Run all static checks, unit/component tests, and the production build:

```bash
npm run verify
```

Run the desktop Chromium and mobile Safari-compatible browser flows:

```bash
npx playwright install chromium webkit
npm run test:e2e
```

Smoke-test a live Pennsylvania route through the public app boundary:

```bash
SWITCHBACK_URL=https://switchback.home.arpa npm run validate:live
```

The validator checks health, four distinct non-synthetic motorcycle route shapes, and a live regression proving every profile refuses the exact geometry of OSM way `969576184`, which is explicitly tagged `motorcycle=no`. To inspect one raw response:

```bash
curl --fail --show-error \
  --request POST https://switchback.home.arpa/api/routes \
  --header 'content-type: application/json' \
  --data '{"profile":"twisty","compare":true,"points":[{"lat":40.2732,"lon":-76.8867,"label":"Harrisburg"},{"lat":40.0379,"lon":-76.3055,"label":"Lancaster"}]}'
```

Smoke-test a two-hour Adventure loop and the optional public-data adapters:

```bash
curl --fail --show-error \
  --request POST http://127.0.0.1:3000/api/routes \
  --header 'content-type: application/json' \
  --data '{"profile":"adventure","compare":true,"points":[{"lat":40.2732,"lon":-76.8867,"label":"Harrisburg"}],"roundTrip":{"targetMinutes":120,"seed":17}}'

curl --fail --show-error \
  'http://127.0.0.1:3000/api/pa-unpaved-roads?bbox=-77.1,40.1,-76.6,40.5&zoom=10&limit=25'

curl --fail --show-error \
  --request POST http://127.0.0.1:3000/api/route-weather \
  --header 'content-type: application/json' \
  --data '{"points":[{"lat":40.2732,"lon":-76.8867}]}'

curl --fail --show-error \
  --request POST http://127.0.0.1:3000/api/ride-intent \
  --header 'content-type: application/json' \
  --data '{"prompt":"two-hour gravel loop with a brewery stop"}'
```

Useful service checks:

```bash
systemctl status switchback-router switchback-app caddy
journalctl -u switchback-router -u switchback-app -u caddy -f
curl --fail https://switchback.home.arpa/api/health
```

## Expanding routing coverage

Coverage is defined by the OpenStreetMap extract imported by GraphHopper; Pennsylvania is simply the checked-in default configuration.

1. Stop `switchback-router`.
2. Back up any graph cache you still need.
3. Put the desired source `.osm.pbf` in `data/` (or merge adjacent extracts with a tool such as `osmium merge`).
4. Normalize its motorcycle access: `node scripts/prepare-motorcycle-osm.mjs data/region.osm.pbf data/region-motorcycle.osm.pbf`.
5. Change `graphhopper.datareader.file` in `infra/graphhopper/config.yml` to the derived motorcycle file.
6. Run `npm run routing:import`; this deletes and rebuilds `data/graph-cache`.
7. Start the router and verify normal routes plus known motorcycle-restricted roads near every edge of the new region.
8. Supply curvature data covering the same region, or leave the overlay unavailable there. A wider routing graph does not automatically create wider curvature coverage.

Graph caches are coupled to the pinned engine and profile/encoded-value configuration. Re-import after changing the GraphHopper version, OSM extract, encoded values, or custom models; never assume an older cache is compatible.

## Data and privacy

- Saved and imported routes live in the browser's IndexedDB on that device.
- Project GPX files under `GPX_LIBRARY_PATH` remain on the server and are exposed to the browser through the catalog API when opened.
- GPX export is generated in the browser.
- Live location is read by the ride view and is not persisted by the application.
- Place queries pass through the Next server to Google Places Text Search when `GOOGLE_MAPS_API_KEY` is configured; no-key, empty-result, and provider-failure cases use the configured Photon endpoint. Location bias contains the selected or freshly acquired route origin.
- Ride descriptions pass through the Next server to OpenRouter only when `OPENROUTER_API_KEY` is configured; otherwise interpretation stays in the app's local parser.
- Selected route sample coordinates pass through the Next server to the National Weather Service for forecasts and active alerts.
- Pennsylvania unpaved-road viewport and planned-route corridor queries pass through the Next server to PASDA and are cached. They contain map bounds or simplified candidate geometry, not a stored GPS history.
- Spotify PKCE and refresh credentials stay in encrypted server-readable cookies; only the SDK's short-lived access token enters browser memory, and it is never persisted by Switchback.
- Map style and tile requests go to the configured browser-visible map provider.

Clearing site data removes the local route library. Export important rides as GPX before clearing browser storage or moving to another device.

## Project layout

```text
src/app/api/             Next server boundary for routing, geocoding, ride intent, weather, GPX, and map overlays
src/components/planner/ Planner, map, library, comparison, and ride surfaces
src/components/spotify/ Persistent Web Playback SDK mini-player
src/lib/ai/              Local and optional OpenRouter ride-intent interpretation
src/lib/geocoding/       Google-first destination-provider chain, Photon normalization, bias, and result selection
src/lib/planner/         Modular free-form waypoint resolution plus destination and timeboxed-loop request construction
src/lib/roads/           Pennsylvania unpaved-road provider and validation
src/lib/routing/         Profiles, GraphHopper/Valhalla adapters, hybrid orchestration, comparison/scoring, and GPX import/export
src/lib/spotify/         PKCE, encrypted sessions, token refresh, and browser SDK adapter
src/lib/storage/         IndexedDB route library
src/lib/weather/         National Weather Service forecast and alert adapter
infra/graphhopper/       Pinned profiles, custom models, and GraphHopper config
infra/valhalla/          Optional pinned PA/NJ supplemental-router Compose contract and runbook
infra/caddy/             HTTPS reverse-proxy example
infra/systemd/           Production process supervisor examples
scripts/                 Data bootstrap, motorcycle normalization, validation, and lifecycle scripts
tests/                   Unit, component, and end-to-end coverage
```
