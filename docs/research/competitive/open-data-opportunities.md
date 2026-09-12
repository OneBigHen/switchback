# Open Data Opportunities

Datasets competitors may not exploit well. Prioritized free/open/self-hostable data.

## Public land access data

| Dataset | URL | Owner | License | Coverage | Update | Useful for |
|---------|-----|-------|---------|----------|--------|------------|
| USFS MVUM | https://www.fs.usda.gov/ | US Forest Service | Public | US National Forests | Annual | Legal road access, seasonal closures |
| BLM | https://www.blm.gov/ | Bureau of Land Management | Public | US BLM lands | Varies | Public land boundaries, access |
| NPS | https://www.nps.gov/ | National Park Service | Public | US National Parks | Varies | Road access within parks |
| OpenStreetMap | https://www.openstreetmap.org/ | Community | ODbL | Global | Continuous | Road network, surface, access |
| Overpass API | https://overpass-api.de/ | OSM community | ODbL | Global | Real-time | Query road data programmatically |

## Road classification data

| Dataset | URL | Owner | License | Coverage | Useful for |
|---------|-----|-------|---------|----------|------------|
| FHWA | https://www.fhwa.dot.gov/ | US DOT | Public | US | Functional classification, road types |
| State DOT GIS | Varies by state | State governments | Public | State | Road surface, condition, restrictions |
| County GIS | Varies by county | County governments | Public | County | Local road inventory, MVUM alignment |

## Weather data

| Dataset | URL | Owner | License | Coverage | Useful for |
|---------|-----|-------|---------|----------|------------|
| NOAA/NWS | https://www.weather.gov/ | US Gov | Public | US | Weather along route, alerts |
| Open-Meteo | https://open-meteo.com/ | Open-Meteo | Open | Global | Free weather API, no key needed |
| NOAA Climate | https://www.ncdc.noaa.gov/ | US Gov | Public | Global | Historical weather, seasonal patterns |

## Elevation data

| Dataset | URL | Owner | License | Coverage | Useful for |
|---------|-----|-------|---------|----------|------------|
| USGS DEM | https://www.usgs.gov/ | US Gov | Public | US | Elevation profiles, ridgelines |
| SRTM | https://www2.jpl.nasa.gov/srtm/ | NASA | Public | Global | 30m elevation data |
| Copernicus DEM | https://scihub.copernicus.eu/ | ESA | Open | Global | 30m elevation, global |

## Traffic data

| Dataset | URL | Owner | License | Coverage | Useful for |
|---------|-----|-------|---------|----------|------------|
| TomTom Traffic | https://developer.tomtom.com/ | TomTom | Commercial | Global | Real-time traffic, flow |
| Open Traffic | https://opentraffic.osmnxdata.org/ | OpenTraffic | Open | Global | Traffic counts, speed |

## Crash/road safety data

| Dataset | URL | Owner | License | Coverage | Useful for |
|---------|-----|-------|---------|----------|------------|
| NHTSA | https://www.nhtsa.gov/ | US DOT | Public | US | Crash records by road segment |
| FHWA | https://www.fhwa.dot.gov/ | US DOT | Public | US | Road safety data |

## Seasonal/closure data

| Dataset | URL | Owner | License | Coverage | Useful for |
|---------|-----|-------|---------|----------|------------|
| USFS Road Closures | https://www.fs.usda.gov/ | USFS | Public | US National Forests | Seasonal road closures |
| State DOT closures | Varies | State DOT | Public | State | Construction, closures |
| 511 systems | https://511.org/ | State DOTs | Public | US | Real-time road conditions |

## Scenic byways

| Dataset | URL | Owner | License | Coverage | Useful for |
|---------|-----|-------|---------|----------|------------|
| National Scenic Byways | https://www.byways.org/ | FHWA | Public | US | Designated scenic roads |
| State scenic byways | Varies | State DOTs | Public | State | Scenic road designations |

## Integration effort ranking (low → high)

1. **OpenStreetMap** — already in the routing stack. Surface tags, access tags, maxspeed. Zero additional integration.
2. **NOAA/NWS** — REST API, no key needed for basic queries. One endpoint call per route.
3. **Open-Meteo** — REST API, no key needed. Global coverage. Good for weather-along-route.
4. **SRTM/Copernicus DEM** — raster tiles, well-documented. Elevation profiles are already computed.
5. **USFS MVUM** — PDF→GIS conversion required. Annual update cycle. High value for ADV riders.
6. **FHWA** — Shapefile download, annual. Functional classification enriches road entity model.
7. **State DOT GIS** — Format varies by state. Highest effort but highest accuracy for state roads.
8. **NHTSA crash data** — Requires spatial join with road segments. Complex but valuable for safety scoring.

## What competitors are missing

- **No competitor** combines OSM surface + MVUM access + weather + seasonal closure data in a single product.
- **No competitor** exposes data provenance and confidence to riders.
- **No competitor** offers self-hosted open-data routing.
- **OpenGravel's advantage:** integrate public data as a first-class layer with confidence scoring.
