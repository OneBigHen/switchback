# Map Layer Taxonomy

## Goal
Replace a flat technical list with rider-purpose groups.

## 1. Road Character

### Curvature
Shows useful road geometry/curvature quality.

### Surface / Unpaved
Shows unpaved/gravel confidence and road segments.

### Road locks / must-use corridors
Editing/planning layer, not normally always on.

### Known / ridden roads
Future novelty/history layer.

## 2. Conditions

### Live incidents
Crash/lane incident/event data.

### Closures
Only genuinely current closure data.

### Construction
Current construction when provider-based; static OSM context separately identified.

### Winter conditions
Regional provider data.

### Weather
Route-relevant NWS alerts / conditions.

## 3. Discovery

### Fuel
### Food
### Scenic overlooks
### Repair
### Camping
### Lodging

Results should become denser at appropriate zoom; avoid pin overload.

## 4. Map

### CINCO vector
### Satellite
### Day/dusk/night
### 2D / 3D
### Detail tier

## Rules

- Hide categories that have no data at current region/zoom where practical.
- A layer control must state when data is not live.
- Do not imply cell coverage from tower locations.
- Critical closure/incident information may surface even if the user has not manually enabled a cosmetic layer, but must follow warning policy.
