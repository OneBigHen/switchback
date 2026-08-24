# Research and Source Notes

These are source anchors for the implementing agent. Re-check current documentation before committing provider-specific code.

## Mapbox

### Standard
https://docs.mapbox.com/map-styles/reference/standard/

Relevant:
- modern Standard style,
- configurable labels/features,
- 3D objects,
- custom layer slots.

### Standard styles guide
https://docs.mapbox.com/map-styles/guides/standard-styles/

Relevant:
- terrain,
- buildings,
- landmarks,
- trees,
- elevated structures,
- dawn/day/dusk/night lighting,
- Standard Satellite,
- theming,
- custom layer emissive strength.

### Standard Satellite
https://docs.mapbox.com/map-styles/reference/standard-satellite/

### Slots
https://docs.mapbox.com/style-spec/reference/slots/

### Pricing
https://www.mapbox.com/pricing

Do not hard-code pricing assumptions into the app.

## PennDOT

Developer resources / Road Condition Reporting System data service:
https://www.penndot.pa.gov/ProjectAndPrograms/operations/Pages/Developer-Resources.aspx

The agent must confirm:
- current access method,
- credentials,
- attribution,
- rate/freshness policy.

## New Jersey 511 / NJDOT

Use official NJDOT/511NJ sources and validate the current feed/API format before implementation.

## NWS
Use official National Weather Service APIs already consistent with project architecture.

## Competitor principles incorporated into this plan

Common rider expectations:
- twisty/scenic route generation,
- round trips,
- offline maps/navigation,
- GPX fidelity,
- ride recording,
- POI/fuel,
- route discovery,
- minimal interaction while moving.

Common rider pain:
- clunky route planning,
- imported route geometry changing,
- waypoint snapping surprises,
- being forced back to a missed shaping point,
- over-twisty routes with too many intersections,
- poor off-road/surface handling.

Switchback’s “Flowy” concept and explicit waypoint semantics are designed in response to these recurring product problems.
