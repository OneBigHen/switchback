# Routing Intelligence Model

## How competitors conceptualize "good motorcycle routing"

### Current industry models

**Calimoto:** Curviness + scenery + "avoid highways" weights. Algorithm is proprietary. No surface intelligence beyond paved/unpaved binary.

**Kurviger:** Curvature-based scoring with via-point shaping. No surface confidence. No mixed-surface intent.

**Scenic:** User-selected routing mode (curvy, fastest, eco). No surface intelligence. No confidence.

**REVER:** Standard routing + Butler Maps overlay. No motorcycle-specific scoring beyond basic preference settings.

**Garmin:** Adventurous Routing — avoid highways, prefer toll-free. No curvature. No surface.

**DMD²:** Off-road routing profiles. No motorcycle-specific scoring. Basic surface classification.

## What rider enjoyment actually involves

| Signal | Type | Data source |
|--------|------|-------------|
| Curve frequency | DERIVABLE | OSM + geometry analysis |
| Curve radius | DERIVABLE | OSM + geometry analysis |
| Successive corner sequences | DERIVABLE | OSM + geometry analysis |
| Elevation | DERIVABLE | SRTM/DEM + OSM |
| Elevation variance | DERIVABLE | DEM |
| Climb/descent profile | DERIVABLE | DEM |
| Ridgelines | DERIVABLE | DEM + map tiles |
| Views | SPECULATIVE | Satellite + crowdsource |
| Forest cover | DERIVABLE | satellite imagery |
| Water proximity | DERIVABLE | OSM + satellite |
| Low development | DERIVABLE | satellite + OSM |
| Road width | PARTIAL | OSM lane_count, some DOT data |
| Traffic | AVAILABLE NOW | TomTom, Google Maps APIs |
| Traffic lights | DERIVABLE | OSM + Mapbox |
| Stop signs | DERIVABLE | OSM |
| Junction density | DERIVABLE | OSM + geometry |
| Speed limit | AVAILABLE NOW | TomTom, OSM maxspeed |
| Pavement | AVAILABLE NOW | OSM surface |
| Gravel | AVAILABLE NOW | OSM surface + rider reports |
| Dirt | AVAILABLE NOW | OSM surface + rider reports |
| Track | AVAILABLE NOW | OSM surface |
| Legal access | PUBLIC DATA | USFS MVUM, BLM, OSM access=*, seasonal |
| Road quality | CROWDSOURCING | Rider reports, Mapillary |
| Technicality | DERIVABLE | Surface + width + curvature + elevation |
| Weather | AVAILABLE NOW | NOAA, NWS APIs |
| Season | PUBLIC DATA | State DOT, OSM seasonal=*)
| Closures | PUBLIC DATA | OSM, state DOT, rider reports |
| Construction | PUBLIC DATA | OSM, state DOT |
| Popularity | CROWDSOURCING | Ride records, Strava heatmap |
| Novelty | DERIVABLE | Rider history + road graph |
| Distance from previous rides | DERIVABLE | Ride history + road graph |

## Classification

- **AVAILABLE NOW:** Signals we can access today with existing data sources
- **DERIVABLE:** Signals we can compute from available data with reasonable effort
- **PUBLIC DATA AVAILABLE:** Signals that require external data ingestion
- **CROWDSOURCING REQUIRED:** Signals that require rider contributions
- **SPECULATIVE:** Signals that are currently impractical to obtain reliably

## Proposed next-generation route quality model

### Deterministic scoring components (no ML)

| Component | Weight | Data source | Explainable? |
|-----------|--------|-------------|--------------|
| Curve quality | 25% | OSM + geometry | "31 mi great curves" |
| Uninterrupted backroad | 20% | OSM + classification | "18 mi uninterrupted back roads" |
| Surface confidence | 15% | OSM + rider reports | "91% paved, 9% maintained gravel" |
| Elevation variance | 10% | DEM | "1,200 ft total climb" |
| Traffic load | 10% | TomTom/OSM | "Low town traffic" |
| Junction density | 10% | OSM | "4 traffic lights" |
| Novelty | 5% | Ride history | "New roads for you" |
| Closure risk | 5% | OSM + rider reports | "No known closures" |

### Rules

1. Components sum to 100. No hidden factors.
2. Hard gates run before scoring — illegal, private, closed, unsafe, low-confidence candidates are rejected, not deprioritized.
3. Every accepted result emits an explanation string derived from measured values.
4. Scoring is deterministic — same input → same output → testable.
5. Rider profile adjusts weights, not the algorithm. Adventure rider weights elevation and surface. Sport rider weights curves and traffic.
6. No learned ranker — personalization is a policy over eligible candidates, not a separate engine (ADR 0004).

### Surface quality model

```
surface_type: pavement | broken_pavement | chipseal | maintained_gravel | loose_gravel | hardpack | dirt | sand | mud | forest_road | double_track | trail | unknown
confidence: 0–100%
recency: days since last confirmation
legality: legal | seasonal | private | gate_unknown
width_meters: number | null
maintenance: good | fair | poor | unknown
difficulty: easy | moderate | difficult | expert
bike_suitability: sport | standard | adventure | dual_sport | enduro
tire_recommendation: road | all_terrain | mud | null
weather_sensitivity: low | medium | high
```

**Key principle:** Unknown must remain unknown. False confidence is worse than missing information. Every surface claim carries a provenance chain and confidence score.

### Rider confirmation system

When a rider finishes a ride, they can confirm surface quality per segment:
- "Rode this — surface was [X]"
- Confidence increases with each confirmation
- Recency decay — old confirmations count less
- Conflicts trigger review, not automatic override
- "Stale data" warnings when confidence drops below threshold
