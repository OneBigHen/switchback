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
| [0010](0010-map-renderer.md) | MapLibre is the only renderer; no Mapbox, no dual-renderer abstraction *(superseded by 0015)* |
| [0011](0011-product-analytics.md) | Minimal PII-free PostHog events; `TELEMETRY_ENABLED=false` for self-hosters |
| [0012](0012-public-route-sharing.md) | Opaque-link read-only snapshots; cheap/expensive rate-limit split; no Redis |
| [0013](0013-default-route-mode.md) | Best Ride is the default mode; Fastest/Balanced one tap away with ETA delta shown |
| [0014](0014-tomtom-traffic-adapter.md) | TomTom is the hosted traffic/incident adapter; OSS core works with no key |
| [0015](0015-mapbox-primary-renderer.md) | Mapbox Standard is the primary online renderer; slots, not internal layer ids *(supersedes 0010)* |
| [0016](0016-google-3d-cinematic.md) | Google 3D is a lazy-loaded cinematic preview, never the navigation renderer |
| [0017](0017-federated-route-candidates.md) | Providers supply candidates; Switchback keeps eligibility and ranking authority |
| [0018](0018-tomtom-premium-adapters.md) | TomTom traffic and Thrilling routing as optional adapters, chosen by a recorded bakeoff |
| [0019](0019-protect-the-ride.md) | Protect the Ride: bounded traffic cost in the scorer; closures still hard-fail |
| [0020](0020-free-ride-discovery-live.md) | Free Ride splits into Discovery loops and workload-aware Live suggestions |
| [0021](0021-premium-capabilities.md) | Server-declared, identity-gated premium capabilities; no billing, no client-only flags |
| [0022](0022-route-policy-v2.md) | Route Policy V2: role-specific detour envelopes; V1 frozen for comparison |
| [0023](0023-route-advisor.md) | The route advisor proposes explanations and stops; it never ranks or selects a route *(proposed)* |
