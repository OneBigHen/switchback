# Offline, PWA, and Storage Specification

## Offline levels

### Level 1 — Shell
App loads; local routes/rides are visible; provider failures remain honest.

### Level 2 — Prepared route
Route, corridor map data, cues, and required assets are available.

### Level 3 — Offline routing
Regional graph supports reroute and recovery without live router.

The UI states the achieved level.

## Region downloads

- Large confirmation passes an explicit confirmed flag and starts one job.
- Pause preserves verified tiles.
- Resume continues verified tiles.
- Activation is atomic.
- Prior active version remains until verification.
- Roll back on failure.
- Deletion requires confirmation.
- Suite download must work or be removed.
- Wi-Fi update uses a conservative connection check and confirms when unknown.

## Storage

Do not read all tile blobs to total size. Maintain aggregate metadata transactionally.

Expose usage, quota estimate, persistent-storage state, package projection, route-pack sizes, last access, and cleanup.

## Readiness

```ts
interface OfflineReadiness {
  shell: "ready" | "not-ready"
  route: "ready" | "partial" | "not-ready"
  routing: "ready" | "partial" | "not-ready"
  regions: RegionReadiness[]
  mapTiles: "ready" | "partial" | "not-ready"
  warnings: string[]
}
```

## Freshness

Show graph build date, installed date, current manifest, staleness, and limitations. Age alone does not silently block routing.

## Service worker

Separate shell, build asset, image, and tile caches.

- navigation: network-first with shell fallback;
- hashed assets: cache-first;
- images: stale-while-revalidate;
- tiles: bounded cache-first;
- APIs: no caching unless an explicit offline contract exists.

## iOS qualification

Installed PWA, browser tab, background/foreground, restart, low storage, eviction, offline reload, permission changes, wake-lock recovery, and rotation.

## Required E2E

Large package confirmation, pause/resume, interrupted update preserving prior version, checksum rejection, low quota, regional offline recovery, no fake API success, and cache limits.
