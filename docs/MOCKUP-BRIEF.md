# Switchback UI Mockup Brief

19 components across 3 surfaces. Use for AI mockup generation.

## 3 Surfaces (orchestrated by PlannerShell)

| Surface | State | Description |
|---|---|---|
| **Planner** | Default | Map + bottom deck. Build routes, browse library, configure layers. |
| **Ride** | Active navigation | Full-screen map + RideHUD overlay. Turn-by-turn, GPS, recovery. |
| **Library** | Modal drawer | Saved routes, trips, recorded rides, imports. Search + sort + bulk. |

---

## 1. PlannerDeck — Route planner sidebar

**What:** Where the rider asks "where do I ride?" and builds a route.

**States:**
- **Intent (default):** "Where do you want to ride?" textbox, quick chips ("1-hour loop", "Gravel morning"), no waypoint fields visible
- **Intent active:** Spinner "interpreting…" then stop ideas (ranked by rider-fit with reasons like "Destination brewery")
- **Intent research:** Spinner "researching…" then source links
- **Editing (expanded):** "Edit route" toggled open — Start/Finish comboboxes, vias, profile switch, Plan button, time-boxed loop mode
- **Has route:** Replan + Clear + Start Ride + Offline Pack buttons in action dock
- **Planning:** Plan button shows spinner
- **Minimized:** Compact header bar with route name + Expand button
- **Stop ideas:** Cards with name, rating, review count, rider-fit reason, "Add" button
- **Vias:** Shaping stops between start/finish with remove/move/lock/profile-per-segment controls

**Key elements:** Omnibox, intent chips, stop idea cards, waypoint fields (S start / F finish / numbered vias), profile switch (Quick/Twisty/Scenic/Adventure), time-boxed loop buttons, avoid highways checkbox, action dock

---

## 2. MapStage — Map canvas

**What:** MapLibre GL map with route lines, markers, overlays.

**States:**
- **Loading:** "Reading the map…" overlay
- **Error:** "The base map could not load" banner
- **Planner:** Route lines (selected = orange, others = gray), waypoint markers (S circle / F circle / numbered vias), curvature overlay, unpaved overlay
- **Ride:** Rider position dot + heading arrow, match-position ring, traversed route dimmed, remaining route bright
- **Sketch mode:** Freehand polyline drawing, instruction text
- **Avoid mode:** Rectangle drawing surface
- **Crosshair:** Visible when arming a point or adding via
- **Recenter button:** Following / not-following

**Key elements:** MapLibre canvas, route polylines, waypoint markers, rider dot, overlays, drawing surfaces, recenter control

---

## 3. MapStageLayerControl — Map toolbar

**What:** Toolbar overlay for map controls.

**States:**
- **Closed:** Three-icon row (Sketch / Avoid / Layers)
- **Open:** Full menu panel

**Inside menu:**
- Map style swatches (Clean / Explore / Night)
- Rider layer toggles with checkboxes + opacity sliders + up/down order
- Route visibility toggle (standard/high-contrast)
- Map Packs: name input + Save button + saved pack buttons
- Reference Map: file upload + opacity + align + remove
- Unpaved layer: count badge + loading/zoom/error label

**Key elements:** Three toolbar buttons, layer checkboxes, opacity sliders, style swatches, map pack name input, file upload

---

## 4. RegionDownloadsPanel — Offline tile downloads

**What:** Download offline map data for regions.

**States per region:**
- **Not downloaded:** Download button with cloud icon + size label
- **Downloading:** Progress bar + cancel button
- **Ready:** Checkmark badge + remove trash button
- **Stale:** Warning badge + "Update available" label
- **Failed:** Error message + retry button
- **Expired:** Warning + download button

**Other:**
- Suggested regions highlighted with chip badges
- Footer shows total offline storage used
- OSM attribution link

**Key elements:** Region list items, progress bars, status badges, download/remove buttons, suggested chips, storage quota

---

## 5. RideHUD — Turn-by-turn navigation overlay

**What:** Full ride-mode HUD — guidance, telemetry, actions.

**States by section:**

**Top bar:**
- Route name displayed
- GPS: ready / acquiring (spinner) / error (retry)
- Voice: enabled / muted
- Pause toggle
- Overnight suspend toggle
- Recording: pulsing REC dot / inactive
- Exit ride button

**Instruction panel:**
- Maneuver icon (phosphor glyph: left/right/uturn/roundabout/finish/etc)
- Instruction text + distance
- "Then" next-cue preview
- Reroute card when off-route

**Off-route recovery (expanded):**
- "GPS is outside the route corridor" message
- Action buttons: Nearest Rejoin, Next Stop, Skip Stop, Find Fuel, Keep Original
- Fuel stops list (if found) with station buttons
- Rerouting spinner when active

**Telemetry footer:**
- Distance traveled
- Time elapsed
- Current speed
- Speed limit badge (when available)
- Progress bar filling toward destination

**Weather alert banner:** NWS warning icon + headline + dismiss

**Key elements:** Top bar, maneuver glyph, instruction text, then-cue, reroute card, recovery buttons, telemetry row, progress bar, weather alert

---

## 6. RideHUDStatus — Instruction text block

**What:** Pure text: eyebrow label, h2 heading, paragraph detail. No states.

---

## 7. RideRecoveryActions — Off-route recovery

**See RideHUD off-route section above.**

---

## 8. RouteComparison — Route options "rack"

**What:** Numbered route slips after planning, with details expandable.

**States:**
- **Route slips:** Selected (orange highlight) / unselected. Each shows: number, profile, distance, duration, twistiness score
- **Directions:** Toggle open → numbered step list with maneuver icons
- **Details collapsed:** "Details" toggle button
- **Details expanded:** Weather panel + evidence panel + trip stage panel + rating widget + share panel
- **Route actions:** Save, Export (GPX dropdown: Track/Route/Cues), Start Ride

**Key elements:** Numbered slips, directions list, expandable detail sections, save/export/ride buttons

---

## 9. RouteEvidencePanel — Decision evidence

**What:** Why the router chose this route. Static display.

- Road character score
- Surface mix percentages
- Official PA unpaved alignment (if applicable)
- Weather note
- Traffic disclaimer

---

## 10. RouteRating — Star rating

**What:** Rate a route 1–5 stars with context.

**States:**
- **Pre-rate:** Empty stars, motorcycle name input
- **Rated:** Filled stars + fit explanation (score % + confidence + reason)
- **Hidden:** If no `onRate` callback

**Key elements:** Star buttons, motorcycle name input, fit explanation text

---

## 11. RouteSharePanel — Privacy-aware sharing

**What:** Share a route link with privacy controls.

**States:**
- **Controls:** Hide start/finish checkboxes, radius slider
- **Actions:** Copy Link button + Share button (Web Share API)
- **Message:** Success/error status

**Key elements:** Checkboxes, radius slider, Copy/Share buttons, status text

---

## 12. RouteWeatherPanel — NWS weather along route

**What:** Weather forecast at waypoints.

**States:**
- **Loading:** Spinner + "Checking weather…"
- **Error:** Message + Retry
- **Ready:** NWS alert banner (if any) + forecast cards (start/mid/finish)

**Per card:** Temperature, short forecast, rain %, wind speed/direction

**Key elements:** Spinner, alert banner, forecast cards with weather data

---

## 13. TripStagePanel — Multi-day trip planner

**What:** Break a route into daily stages with constraints.

**States:**
- **Collapsed:** Toggle button
- **Expanded:** Sliders (daily ride minutes, fuel range, fuel reserve, break cadence, daylight window)
- **Stages list:** Per stage — label, distance, fuel windows, break windows, overnight stop name input
- **Error:** Plan error message
- **Warnings:** Per-plan warnings

**Key elements:** Constraint sliders, stage cards, overnight stop fields, error/warning text

---

## 14. WaypointField — Geocoding input

**What:** Labeled text input with autocomplete for places.

**States:**
- **Empty:** Placeholder text
- **Typing:** Debounced search
- **Searching:** Spinner on map-pick button
- **Suggestions:** Dropdown list with keyboard nav (highlighted active)
- **Selected:** Place label shown
- **Armed:** Highlighted border for map placement
- **Error:** Inline error

**Key elements:** Label, text input, map-pick button, suggestion dropdown

---

## 15. LibraryDrawer — Saved content modal

**What:** Full-height right-side drawer for saved routes, trips, rides, imports.

**States:**
- **Open:** Modal with dark scrim behind
- **Empty:** Illustration + "No rides parked yet"
- **Has content:** Sections — Saved Trips, On This Device (routes), Recorded Rides, Imported Projects
- **Search:** Filters list, "no matches" state
- **Bulk:** Checkboxes, Show/Hide controls
- **Pending delete:** Confirmation toggle
- **Organize:** Expandable folder/tag editor
- **Import:** File input button

**Key elements:** Header, search bar, section headers, item cards with names/dates, checkboxes, action buttons, import button

---

## 16. SpotifyPlayerDock — Music player

**What:** Draggable Spotify mini-player, auth via OAuth.

**States:**
- **Disconnected:** "Connect Spotify" link card
- **Auth in progress:** "Check sign-in" button
- **Checking:** "Checking Spotify" label
- **Ready:** Album art, track name/artist, play/pause, seek bar, prev/next, volume, disconnect
- **No active device:** "Open Spotify and start a song"
- **Error:** Error message + retry
- **Compact (ride mode):** Header-only (cover + summary + play/pause)
- **Collapsed (manual):** Header-only
- **Hidden:** Floating "Music" reveal button
- **Draggable:** Can be repositioned

**Key elements:** Album art, track info, transport controls, seek bar, volume slider, connect/disconnect

---

## 17–19. Utility components

| Component | What |
|---|---|
| **ManeuverGlyph** | Maps maneuver name → phosphor icon. Pure render. |
| **RideWeatherAlert** | NWS alert banner inside RideHUD. Visible/dismissed. |
| **PlannerShell** | Orchestrator. Renders one of 3 surfaces + global notice toast (success green / warning amber, auto-dismiss). |

---

## Global states

| State | Where |
|---|---|
| **Notice toast** | PlannerShell — success (green check) or warning (amber triangle), auto-dismisses |
| **Service worker** | PlannerShell registers for tile caching |
| **Empty library** | LibraryDrawer — illustration + "No rides parked yet" |
| **Map error** | MapStage — "The base map could not load" banner |
| **No GPS** | RideHUD — error state with retry |
| **Offline** | RideHUD + MapStage — uses corridor graph from pack, "follow-saved-route" or "in-corridor-routing" |
