# Gravel Intelligence

## The gravel truth problem

Motorcycle apps frequently know that a road exists but not enough about what riding it is actually like. A road tagged `surface=gravel` in OSM could be:
- Well-maintained forest service road (fun on a BMW GS)
- Washed-out rutted track (damaging to any bike)
- Seasonal fire road (impassable when wet)
- Private driveway (legal access issues)
- Hidden gem (no one has reported it)

The current answer — "avoid unpaved" or "allow all unpaved" — is binary and loses the nuance that matters to riders.

## Surface taxonomy

### Primary classification

| Tag | Definition | Riding character | Bike suitability |
|-----|-----------|-----------------|-----------------|
| pavement | Asphalt/concrete | Smooth, fast | All |
| broken_pavement | Cracked, patched, uneven | Rough at speed | Sport/Standard caution |
| chipseal | Gravel sealed with tar | Vibrating, noisy | All, less pleasant |
| maintained_gravel | Graded, compacted | Fun, predictable | Adventure/dual-sport |
| loose_gravel | Unbound, shifting | Requires skill | Dual-sport/enduro |
| hardpack | Compacted dirt | Firm, fast | All |
| dirt | Bare soil | Variable | Adventure+ |
| sand | Loose sand | Difficult | Dual-sport/enduro |
| mud | Wet soil, standing water | Very difficult | Enduro |
| forest_road | Logging/forest service | Variable, often graded | Adventure+ |
| double_track | Wide trail, two tracks | Fun, moderate | Adventure/dual-sport |
| trail | Narrow, single-track | Technical | Enduro/motocross |
| unknown | No surface data | — | — |

### Dimensions per segment

| Dimension | Values | Source |
|-----------|--------|--------|
| confidence | 0–100% | OSM + rider reports + satellite |
| recency | days_since_confirmation | Rider reports + satellite change detection |
| legality | legal / seasonal / private / gate_unknown | USFS MVUM + OSM + rider reports |
| seasonal_accessibility | year_round / dry_only / summer_only / closed | USFS + state DOT + rider reports |
| gate_status | open / closed / seasonal / unknown | Rider reports + USFS |
| width_meters | number | Rider reports + satellite |
| maintenance | good / fair / poor / unknown | Rider reports + satellite |
| difficulty | easy / moderate / difficult / expert | Surface + width + curvature + elevation |
| big_bike_suitability | yes / marginal / no | Surface + width + maintenance |
| tire_recommendation | road / all_terrain / mud / unknown | Surface + maintenance |
| weather_sensitivity | low / medium / high | Surface + drainage + width |

## Confidence model

### Formula

```
confidence = base_confidence * recency_factor * confirmation_factor

base_confidence:
  OSM surface tag present: 60%
  County road inventory match: +15%
  4+ rider confirmations: +15%
  Satellite imagery confirms: +10%
  Recency < 30 days: +10%

recency_factor:
  < 7 days: 1.0
  < 30 days: 0.9
  < 90 days: 0.8
  < 180 days: 0.6
  > 180 days: 0.4

confirmation_factor:
  1 confirmation: 0.7
  2-3 confirmations: 0.85
  4+ confirmations: 0.95
```

### Display standard

```
GRAVEL — 91% confidence
Sources:
  • OSM surface=gravel
  • County road inventory
  • 4 rider confirmations
  • Last confirmation 19 days ago
```

When confidence < 70%: "Surface uncertain — recent rider reports mixed."
When confidence < 50%: "Surface unknown — ride with caution."
When no data: "Surface not mapped — treat as unknown."

**Never display a surface claim without confidence and provenance.**

## Data sources

| Source | Coverage | Update frequency | License | Reliability | Integration |
|--------|----------|-----------------|---------|-------------|-------------|
| OSM surface tags | Global | Community | ODbL | Variable | Routing engine |
| USFS MVUM | USFS roads | Annual | Public | High for USFS roads | GIS import |
| County road inventory | Varies by county | Annual | Varies | Medium | GIS import |
| State DOT | State roads | Quarterly | Public | High for state roads | API/GIS |
| Rider reports | User-contributed | Real-time | User license | Variable | Community layer |
| Satellite imagery | Global | Monthly | Varies | Medium for surface | Computer vision |
| Mapillary | Global | Continuous | CC-BY-SA | Medium | Computer vision |
| KartaView | Global | Continuous | CC-BY-SA | Medium | Computer vision |
| BLM | US public lands | Annual | Public | Medium | GIS import |
| NPS | US parks | Annual | Public | High for parks | GIS import |

## What OpenGravel should build

1. Surface taxonomy with confidence scores — not binary paved/unpaved.
2. Rider confirmation system — simple, one-tap per segment.
3. Provenance display — show riders where surface data comes from and how fresh it is.
4. Seasonal/gate status — especially for forest roads and USFS roads.
5. Bike-suitability filtering — a 500-lb ADV bike needs different surface data than a 400-lb enduro.
6. Weather sensitivity — gravel roads that are fine in dry weather become mud in rain.
7. Integration with USFS MVUM and county GIS for legal access data.

## What OpenGravel should NOT build

1. Do not build a satellite imagery analysis pipeline — computationally expensive, low ROI vs rider reports.
2. Do not build a "road condition" web of trust like Waze — motorcycle-specific conditions are different from traffic conditions.
3. Do not claim certainty where data is thin — false confidence is a safety issue.

## Competitive comparison

| Competitor | Surface model | Confidence | Rider reports | Seasonal | Gate status |
|-----------|--------------|-----------|---------------|----------|-------------|
| Calimoto | Binary paved/unpaved | No | No | No | No |
| Kurviger | Binary paved/unpaved | No | No | No | No |
| REVER | Binary paved/unpaved | No | No | No | No |
| Scenic | Binary paved/unpaved | No | No | No | No |
| onX | Trail difficulty | Partial | Yes | Partial | Partial |
| DMD² | Off-road profiles | No | No | Partial | No |
| Trails Offroad | Trail difficulty | No | Yes (guides) | Partial | No |
| GoraAdv | T1–T5 hierarchy | No | No | No | No |
| Offroad Pilot | Unpaved priority | No | No | No | No |
| OpenGravel (target) | Full taxonomy | Yes | Yes | Yes | Yes |
