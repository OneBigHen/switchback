# Migrations, Diagnostics, and Operations

## Version and migrate

- planner localStorage;
- rider settings;
- route library;
- ride journal;
- trip plans;
- preferences;
- road requirements;
- offline route packs;
- regional graph data;
- map packs;
- service-worker caches.

## Migration rules

Explicit version, idempotence, backup/export before destructive changes, corrupt-record isolation, tests from every supported prior version, and clear reset.

## Unified export

Export settings, bikes, routes, trips, ride metadata, learning, road requirements, map packs, app version, and schema versions. Offline binaries may be omitted with a redownload manifest.

## Diagnostics screen

### App
Version, SHA, environment, PWA control, cache versions.

### Routing
Provider status/version, region coverage, graph build, last successful route, degradation.

### Device
GPS permission/accuracy, wake lock, speech support, storage, persistence, connectivity.

### Offline
Installed regions/versions, integrity, route packs, last update, cache usage.

### Local data
Counts, schema versions, export, repair, and subsystem reset.

## Logging

Structured local logs: timestamp, planning ID, subsystem, event, status, duration, sanitized error, and provider. Never log raw home coordinates, complete trails, tokens, or keys.

## Health endpoint

App readiness, provider readiness/degradation, data availability, and versions without secrets/private paths.

## Runbooks

First install, graph import/upgrade, package generation, provider outage, corrupt IndexedDB, stuck service worker, failed region update, rollback, and release qualification.
