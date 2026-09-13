# Open Source Opportunities

Interesting repositories on GitHub that could accelerate OpenGravel development.

## Scenic routing / motorcycle routing

| Repo | Language | License | Component | Use | Integration cost | Risk |
|------|----------|---------|-----------|-----|-----------------|------|
| Project-Owl/Owl | TypeScript | MIT | Route scoring | Curvature + elevation scoring model | Low | Low |
| dirkmartin/routescoring | Python | MIT | Route scoring | Curvature analysis | Medium | Low |

## GPX tools

| Repo | Language | License | Component | Use | Integration cost | Risk |
|------|----------|---------|-----------|-----|-----------------|------|
| tqdm/gpxpy | Python | MIT | GPX parsing | GPX import/export | Low | Low |
| braubach/gpx.js | JavaScript | MIT | GPX parsing | GPX import in browser | Low | Low |
| vitalets/gpxparser | JavaScript | MIT | GPX parsing | GPX waypoint extraction | Low | Low |
| GraphHopper/gpx | Java | Apache 2.0 | GPX processing | GPX route import | Medium | Low |

## Map matching

| Repo | Language | License | Component | Use | Integration cost | Risk |
|------|----------|---------|-----------|-----|-----------------|------|
| GraphHopper/map-matching | Java | Apache 2.0 | Map matching | Navigation GPS matching | Medium | Low |
| OpenTripPlanner/OTP | Java | GPL | Route planning | Multi-modal routing | High | Medium |

## Navigation UI

| Repo | Language | License | Component | Use | Integration cost | Risk |
|------|----------|---------|-----------|-----|-----------------|------|
| MapLibre/maplibre-gl-js | TypeScript | BSD | Map rendering | Already in use | N/A | Low |
| IONOS/mapbox-gl-js | TypeScript | MIT | Map rendering | Alternative renderer | Medium | Low |

## Offline maps

| Repo | Language | License | Component | Use | Integration cost | Risk |
|------|----------|---------|-----------|-----|-----------------|------|
| Organic Maps/organic-maps | C++ | ASL 2.0 | Offline navigation | Reference for offline UX | High | Medium |
| GraphHopper/graphhopper | Java | Apache 2.0 | Offline routing | Already in use | N/A | Low |

## Surface classification

| Repo | Language | License | Component | Use | Integration cost | Risk |
|------|----------|---------|-----------|-----|-----------------|------|
| mapillary/mapillary-js | TypeScript | Apache 2.0 | Street-level imagery | Surface verification | High | Medium |
| karta-viewer/KartaView | JavaScript | MIT | Community mapping | Rider report integration | Medium | Low |

## Elevation / DEM

| Repo | Language | License | Component | Use | Integration cost | Risk |
|------|----------|---------|-----------|-----|-----------------|------|
| jannisx11/demcompare | Python | MIT | DEM comparison | Elevation analysis | Medium | Low |
| GIScience/openrouteservice | Java | AGPL | Elevation API | Elevation profiles | Medium | Medium |

## Weather routing

| Repo | Language | License | Component | Use | Integration cost | Risk |
|------|----------|---------|-----------|-----|-----------------|------|
| pyOpenSci/wxget | Python | MIT | Weather data | Weather along route | Medium | Low |
| open-meteo/open-meteo | JavaScript | MIT | Weather API | Free weather API | Low | Low |

## Collaborative maps

| Repo | Language | License | Component | Use | Integration cost | Risk |
|------|----------|---------|-----------|-----|-----------------|------|
| uMap-project/umap | Python | BSD | Collaborative mapping | Community route sharing | Medium | Low |
| OpenStreetMap/iD | JavaScript | BSD | OSM editor | Rider report editor | High | Low |

## Not recommended

- **Forking 20 random projects** — integration cost exceeds value.
- **Blockchain/drive-to-earn** — gimmick, not product.
- **NFT/ crypto riding apps** — distraction, no rider value.
- **Heavy ML pipelines for routing** — routing should be deterministic and explainable.

## Best candidates for immediate integration

1. **gpx.js** — GPX parsing in browser, already fits the stack.
2. **Open-Meteo** — Free weather API with no key required.
3. **KartaView** — Rider-reported map corrections, fits the surface confidence model.
4. **GraphHopper map-matching** — Already in use for navigation, improve GPS matching.
