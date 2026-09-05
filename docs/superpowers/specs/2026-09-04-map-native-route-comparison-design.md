# Map-native route comparison design

## Goal

Make the map and route-choice rail one interaction surface. A single deterministic `routeId` joins route cards, map geometry, comparison metrics, and Gravel Goblin recommendations.

## Authority boundaries

- `usePlannerStore().selectedRouteId` remains the only committed route selection.
- Preview is ephemeral presentation state only; it is never persisted and never changes routing input.
- Map taps, cards, keyboard actions, and Gravel Goblin all select by calling the same existing route-selection command with a currently valid route id.
- Unknown/stale route ids are ignored.
- No model-authored geometry or scores.

## Interaction

- Desktop pointer hover or keyboard focus on a route choice previews its map geometry without selecting it.
- Leaving/blurring clears preview unless focus remains inside the same card.
- Selected, previewed, and alternate map routes differ by line width and opacity in addition to color.
- A broad transparent route hit layer makes map alternatives easy to tap without changing visible stroke width.
- Map route tap selects that existing candidate when no higher-priority map interaction (road-lock drawing, avoid drawing, waypoint placement, ride mode) owns the click.
- Route cards compare candidates against the currently selected route. Deltas are factual and omitted when source data is absent.
- Gravel Goblin's existing `Show route` remains explicit selection; its recommendation action previews the same candidate on hover/focus.

## Delta contract

Candidate deltas may include:
- time in minutes
- distance in miles
- twistiness score (`curve`)
- known non-asphalt surface percentage (`unpaved`)

The selected route says `Current route`. Zero/unknown dimensions are omitted rather than presented as invented facts.

## Accessibility / mobile

- Card preview works from focus as well as pointer hover.
- Map selection uses the large route hit target.
- Selection never depends on color alone.
- No hover-only information is required to choose a route on touch.

## Non-goals

- routing/scoring/provider changes
- persisted preview state
- changing route geometry
- broad card redesign
- generic map-selection framework
