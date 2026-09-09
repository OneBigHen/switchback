# Deploying Switchback

Self-hosting guide: local prerequisites, first run, LAN HTTPS, public exposure,
and routing coverage. [`README.md`](../README.md) is the product and
architecture entry point; [`.env.example`](../.env.example) is the
configuration reference. For the container stack see
[`deployment/README.md`](../deployment/README.md).

## Requirements

- Linux or macOS
- Node.js 24 or newer
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

Open `http://localhost:3000`. `localhost` is treated as a secure browser context for development; a phone opening a raw LAN URL is not. Use the LAN HTTPS setup below for phone GPS and wake lock.

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
  email in the Caddy global block. The HTTPS edge sends HSTS; the app sends
  CSP, nosniff and frame/object restrictions in production.
- **GPX library paths are scrubbed** from the public catalog response; the
  project catalog under `GPX_LIBRARY_PATH` is still visible to anyone — only
  publish routes you intend to share.

Backup and restore use `deployment/lib/resolve-data-root.sh`. Set
`SWITCHBACK_DATA_ROOT` explicitly when possible. If it is unset, discovery is
limited to the web service declared by the production Compose file and accepts
only one unique `/data` mount source; generic Docker-wide `web` discovery is
forbidden. `deployment/restore.sh` prints the validated target only after
rejecting unsafe, foreign, or ambiguous roots and verifying backup checksums.

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

Materialize the routing files under `/opt/switchback/data`; do not leave production symlinks pointing into a developer checkout. Import the graph as the service user if it was not copied from a compatible GraphHopper 11 install:

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
switchback.home.arpa -> <your-LAN-IP>
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

## Service checks

```bash
systemctl status switchback-router switchback-app caddy
journalctl -u switchback-router -u switchback-app -u caddy -f
curl --fail https://switchback.home.arpa/api/health
```

Smoke-test a live Pennsylvania route through the public app boundary:

```bash
SWITCHBACK_URL=https://switchback.home.arpa npm run validate:live
```

The validator checks health, four distinct non-synthetic motorcycle route
shapes, and a live regression proving every profile refuses the exact geometry
of OSM way `969576184`, which is explicitly tagged `motorcycle=no`.
