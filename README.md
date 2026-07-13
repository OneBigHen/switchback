# Switchback

Switchback is a map-first motorcycle route planner for riders who care more about the road than the shortest ETA. It plans real road geometry, compares motorcycle-specific route styles, explains their tradeoffs, saves rides locally, imports and exports GPX, and provides a distraction-reduced ride view.

The first deployable routing region is **Pennsylvania**. The basemap and place search are broader than that, but route requests with a waypoint outside the installed Pennsylvania graph return an explicit coverage error instead of drawing a fake straight line.

## What works

- Quick, Twisty, Scenic, and Adventure routing profiles
- Motorcycle-specific way/node access and turn restrictions, including explicit `motorcycle=no`
- Side-by-side route comparison with distance, time, turn density, road mix, and surface mix
- Address/place search plus map-picked start and finish points
- Optional viewport-bounded curvy-road overlay
- Local route library in IndexedDB; no account required
- GPX 1.1 import and export
- High-contrast ride preview with browser GPS, heading/continuity-aware progress, maneuver, accuracy, off-route detection, and a screen wake lock when available
- Desktop sidebar and touch-oriented mobile layout
- App/router health endpoint and actionable provider errors

Ride guidance is an early browser-based aid, not a safety-critical navigation system. Keep your attention on the road, obey posted restrictions, and verify Adventure routes before riding; map surface/access data can be incomplete or stale.

GraphHopper 11's configurable road model uses its car access parser. Before graph import, Switchback creates a derived OSM extract that projects explicit `motorcycle=*` tags onto the parser's access keys while retaining the original tags for auditability. Conditional-only motorcycle access is excluded conservatively: a static graph cannot safely interpret every time-of-day, seasonal, or free-text condition at ride time.

## Why this stack

| Layer | Choice | Reason |
| --- | --- | --- |
| App | Next.js 16, React 19, TypeScript | One production process for the UI and server-side provider boundary |
| Map | MapLibre GL JS + OpenFreeMap | Open rendering stack with a replaceable style URL and no required map token |
| Router | Self-hosted GraphHopper 11 | Deterministic road routing, turn instructions, custom encoded values, and app-owned motorcycle models |
| Route quality | GraphHopper custom models + SQLite curvature data | Makes Twisty, Scenic, and Adventure behavior controllable instead of relying on car-only profiles |
| Place search | Photon | Lightweight server-side geocoding adapter that can be replaced or self-hosted |
| Rider data | Dexie/IndexedDB | Fast local-first saved routes without a sign-in gate |

Mapbox is not the routing core because its Directions API does not expose a motorcycle profile. Google two-wheel routing is region-limited and does not provide the custom curvy/scenic weighting this product needs. The provider boundaries are configuration-driven, so either can still be added later without replacing the planner.

## Requirements

- Linux or macOS
- Node.js 22 or newer
- npm 10 or newer
- Java 17 or newer
- Approximately 2 GB RAM to serve the router and at least 6 GB available during graph import
- Roughly 2 GB free disk for the Pennsylvania extract, GraphHopper jar, and imported graph
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

`data:bootstrap` first reuses compatible files from known local Vibe projects, then downloads the pinned GraphHopper 11 jar and current Pennsylvania Geofabrik extract when needed. It creates `data/pennsylvania-motorcycle.osm.pbf` with motorcycle-specific access normalized for GraphHopper. The curvature database is optional; without it, normal routing still works and the overlay reports that its data is unavailable.

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
| `PHOTON_URL` | `https://photon.komoot.io/api/` | Server-only Photon-compatible search endpoint |
| `CURVATURE_DB_PATH` | `<repo>/data/segments.db` | Absolute or repo-relative path to the optional curvature SQLite database |
| `NEXT_PUBLIC_MAP_STYLE_URL` | OpenFreeMap Fiord | Browser-visible MapLibre style URL; set this before building |

The public Photon endpoint is convenient for a personal deployment. For heavier or multi-user traffic, run a Photon instance you control and set `PHOTON_URL` rather than treating the public service as an unlimited production API.

Bootstrap downloads can also be overridden for one command:

```bash
SWITCHBACK_PBF_URL=https://example.test/region.osm.pbf \
SWITCHBACK_GRAPHHOPPER_JAR_URL=https://example.test/graphhopper-web-11.0.jar \
npm run data:bootstrap
```

Do not expose GraphHopper directly to the LAN or internet. The browser only calls Next.js `/api/*` routes, and Next talks to GraphHopper over loopback.

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

The examples bind Next to `127.0.0.1:3100`; GraphHopper must bind its application connector to `127.0.0.1:8989`. Confirm both before enabling the proxy:

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

If you own a real DNS name, a publicly trusted certificate is preferable. Point a name at the LAN host (split DNS) and replace `tls internal` in the example with your ACME/DNS-challenge configuration. Do not port-forward GraphHopper or Next's loopback ports.

Finally, open `https://switchback.home.arpa` on the phone and grant location access. Add it to the home screen from the browser if desired. Offline maps and offline routing are not included in this release.

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
- GPX export is generated in the browser.
- Live location is read by the ride view and is not persisted by the application.
- Place queries pass through the Next server to the configured Photon endpoint.
- Map style and tile requests go to the configured browser-visible map provider.

Clearing site data removes the local route library. Export important rides as GPX before clearing browser storage or moving to another device.

## Project layout

```text
src/app/api/             Next server boundary for routes, health, geocoding, curvature
src/components/planner/ Planner, map, library, comparison, and ride surfaces
src/lib/routing/         Profiles, GraphHopper adapter, scoring, GPX import/export
src/lib/storage/         IndexedDB route library
infra/graphhopper/       Pinned profiles, custom models, and GraphHopper config
infra/caddy/             HTTPS reverse-proxy example
infra/systemd/           Production process supervisor examples
scripts/                 Data bootstrap, motorcycle normalization, validation, and lifecycle scripts
tests/                   Unit, component, and end-to-end coverage
```
