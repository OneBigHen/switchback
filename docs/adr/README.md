# Architecture decision records

Short, durable decisions. Each ADR is a `Decision` and its `Consequences`.
Supersede an ADR with a new one rather than rewriting history.

| ADR | Decision |
|---|---|
| [0001](0001-routing-provider-architecture.md) | GraphHopper primary + normalized Valhalla; core routing needs no commercial key |
| [0002](0002-traffic-data-strategy.md) | OSM signal/stop density baseline; live traffic only via optional adapters with capability states |
| [0003](0003-offline-pack-strategy.md) | Checksummed, versioned regional packs with atomic activation |
| [0004](0004-fun-road-scoring.md) | Explainable deterministic fun-road scoring before any learned ranker |
| [0005](0005-rider-preference-learning.md) | Local interpretable rider preference model, no account required |
| [0006](0006-pwa-and-ios-constraints.md) | PWA with progressive enhancement; honest about iOS/browser limits |
| [0007](0007-location-privacy.md) | Local-first location privacy; providers get only what a call needs |
| [0008](0008-recommendation-safety.md) | Advisory, workload-aware, single-suggestion Free Ride engine |
| [0009](0009-product-scope-and-integration-gate.md) | Trip decision engine scope; a new provider must change a rider decision |
| [0010](0010-map-renderer.md) | MapLibre is the only renderer; no Mapbox, no dual-renderer abstraction |
| [0011](0011-product-analytics.md) | Minimal PII-free PostHog events; `TELEMETRY_ENABLED=false` for self-hosters |
| [0012](0012-public-route-sharing.md) | Opaque-link read-only snapshots; cheap/expensive rate-limit split; no Redis |
| [0013](0013-default-route-mode.md) | Best Ride is the default mode; Fastest/Balanced one tap away with ETA delta shown |
| [0014](0014-tomtom-traffic-adapter.md) | TomTom is the hosted traffic/incident adapter; OSS core works with no key |
