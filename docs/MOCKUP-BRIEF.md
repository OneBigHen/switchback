# Switchback UI Mockup Brief

28 components across 3 surfaces, plus 9 Wave B/C road-lock / data-quality / offline surfaces. Use for AI mockup generation.

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

## 20–28. Wave B/C surfaces — road locks, data quality, offline, region suites

> These surfaces ship from the §1–§8 wiring waves prior to reskin. All are mounted
> inside PlannerShell and reuse tokens from `src/app/globals.css` plus the
> road-lock palette in `src/app/styles/map-stage-road-locks.css`.

### 20. RoadLockLibraryDrawer — Saved road locks modal

**What:** Right-side modal drawer listing every `RoadLock` on the device plus the
provenance icon, mode badge, source region, and quick edit/delete controls. Mounted
from the planner action dock via the "Road locks" entry point.

**States / elements:**
- **Empty:** "No road locks" placeholder copy
- **Has locks:** Rows with provenance icon (manual / gpx / image-trace), display name,
  region chip, mode badge ("Must use" / "Prefer"), edit + delete buttons
- **Pending delete:** Row switches to "Confirm delete" — locks must never disappear silently
- **Editing:** Inline rename field + mode toggle + corridor widening control
- **Filters:** Region, source, mode `<select>` filters; "Clear all" reset
- **Library fetch error:** Inline alert, not modal
- **Header:** "Road locks" title + close affordance; mobile collapses to bottom sheet

**Tokens loaded (CSS module: `src/app/styles/road-lock-library-drawer.css`):**
`--oled`, `--machined`, `--raised`, `--instrument`, `--metal`, `--line`, `--signal`,
`--danger`, `--success`, `--road-lock-exact`, `--road-lock-matched`,
`--road-lock-approximate`, `--road-lock-unresolved`.

---

### 21. MustLockUnresolvedPanel — Must-use lock failure recovery

**What:** Modal `alertdialog` shown when a `must`-use lock could not be satisfied.
Must never silently fall through to a route that omits the lock.

**States:**
- **Reasoned failure:** "<displayName> could not be included." headline + reason text
- **Four recovery options:** "Try a wider match", "Convert to Prefer", "Remove lock",
  "Restore previous route"
- **Pending:** Option buttons disabled while action runs
- **Previous route preserved:** Top-level reverse flag prevents planner-store overwrite

**Tokens loaded (CSS module: `src/app/styles/must-lock-unresolved-panel.css`):**
`--oled`, `--machined`, `--instrument`, `--metal`, `--line`, `--danger`,
`--road-lock-approximate`, `--signal`, `--success`.

---

### 22. RoadLockImageOverlay — Image trace overlay tool

**What:** Two/three-point georeferenced image overlay the rider traces freehand to
create an `image-trace` provenance `RoadLock`. Local-only image bytes (never persisted,
never redistributed).

**States / panels:**
- **Upload phase:** File input + accuracy statement banner + "I'll be careful" hint
- **Align phase:** Image canvas + two-point control placement + transform sliders (translate / scale / rotate / opacity)
- **Verify point:** Optional third control point confirming alignment
- **Trace phase:** Freehand pixel polyline; matched OSM edges render as a separate
  green / amber / red line below the image
- **Done:** "Name (optional)" field + "Save road lock" button — bytes dropped after save
- **Error:** Inline "Couldn't match the trace onto OSM roads" message

**Tokens loaded (CSS module: `src/app/styles/road-lock-image-overlay.css`):**
`--oled`, `--machined`, `--raised`, `--instrument`, `--metal`, `--line`, `--signal`,
`--danger`, `--road-lock-exact`, `--road-lock-matched`, `--road-lock-approximate`,
`--road-lock-unresolved`.

---

### 23. BikeProfilePicker — Motorcycle profile segmented control

**What:** Inline `radiogroup` with rider-editable fields, surfaced inside `PlannerDeck`.

**States:**
- **Four options:** Street / Touring / Adventure / Dual-Sport, each with glyph + label
  + one-line description; selected option borders `--signal`
- **Fields collapsed:** "Edit bike profile fields" toggle button
- **Fields expanded:** Fuel range + reserve + "allow maintained gravel" toggle +
  rule summary (fuel range, disallowed surfaces, track types)
- **Profile mismatch:** Small danger-tinted banner when route profile != selected profile

**Tokens loaded (CSS module: `src/app/styles/bike-profile-picker.css`):**
`--oled`, `--machined`, `--instrument`, `--metal`, `--line`, `--signal`,
`--road-lock-approximate`.

---

### 24. RouteDataQualityPanel — Coverage bars + caveats

**What:** Three-bar coverage summary appended to each route card. Headline = lowest
of the three coverages.

**States / elements:**
- **Three bars:** Access / Surface / Condition coverage percentages; bar fill is data-driven
  width via inline `style={{ width }}`; tier color via `[data-tier]` attribute
- **Headline:** `XX% lowest coverage` styled by tier (strong ≥90 / warn ≥70 / weak)
- **Seasonal badge:** Amber banner when `seasonalUncertainty` is true
- **Caveats:** Each caveat as a warning row with phosphor icon — includes the
  unknown-surface-mileage string ("Surface type is unknown for N.N miles of this route.")
- **Footer:** "Source map updated: <date> | Unknown" with the region build date

**Tokens loaded (CSS module: `src/app/styles/route-data-quality-panel.css`):**
`--oled`, `--instrument`, `--metal`, `--line`, `--signal`, `--danger`, `--success`.

---

### 25. RegionSuitePicker — Region suite presets

**What:** Radiogroup of three suites (Home Territory / Appalachia / Northeast) plus
the individual regions each preset references.

**States:**
- **Selected suite:** Each preset is independently toggleable; selecting presets checks
  every region they reference without bundling them — each region remains independently
  downloadable / updateable / removable / versioned
- **Recommended:** "Home Territory" carries a distinct chip and the default-active state
- **Region list below:** Reuses the existing RegionDownloadsPanel region rows

**Tokens loaded (CSS module: `src/app/styles/region-suite-picker.css`):**
`--oled`, `--machined`, `--instrument`, `--metal`, `--line`, `--signal`, `--success`.

---

### 26. StorageQuotaMeter — Offline storage usage meter

**What:** Inline panel inside `RegionDownloadsPanel` rendering current usage, projected
usage, persistence status, and packages remaining.

**States / elements:**
- **Tier badge:** `[data-tier="normal"|"warn"|"strong-warn"|"block"]` mapped to
  Healthy / High use / Near limit / Blocked
- **Progress bar:** width set by `visibleFraction` via inline `style` (data-driven)
- **Projection row:** Shows projected bytes after install + reason if blocked
- **Persistence banner:** Persistent / non-persistent variant with "Request durable" CTA
- **Error:** Inline "Could not request persistent storage."

**Tokens loaded (CSS module: `src/app/styles/storage-quota-meter.css`):**
`--oled`, `--instrument`, `--metal`, `--line`, `--success`, `--signal`, `--danger`.

---

### 27. DownloadModePicker — Three-choice offline level picker

**What:** Radiogroup picking one of routing-only / full offline region / saved-ride corridor.

**States:**
- **Three options:** Three segmented cards with "Recommended" chip on the
  saved-ride-corridor preset
- **Corridor width:** Conditional radio group shown only when saved-ride-corridor is
  selected — segmented by Street / Adventure / Multi-day with 10/20/30 miles defaults
- **Summary:** "Half-width ≈ N meters" copy derived via `corridorMilesToHalfWidthMeters`

**Tokens loaded (CSS module: `src/app/styles/download-mode-picker.css`):**
`--oled`, `--machined`, `--instrument`, `--metal`, `--line`, `--signal`, `--success`.

---

### 28. RoadLockSatisfactionBadge + road-lock map surface

**What:** (a) Skip-reason badge rendered on Prefer-lock routes that were skipped
(no render if `skippedReason` is null); (b) Map-stage polylines for every RoadLock
in the proposal, with a separate toggle button ("Lock a road" / "Cancel") that drops
into a new lock draft.

**States — badge:**
- **Hidden:** No render when the lock is satisfied (preferred behaviour)
- **Visible:** Phosphor `WarningCircle` + reason line ("Preferred road skipped because
  it requires a 47-mile backtrack.")

**States — map surface (`src/app/styles/map-stage-road-locks.css`):**
- **Toggle button:** "Lock a road" (inactive) / "Cancel" (active)
- **Draft panel:** Inline panel with step text ("Tap the start / end / name and save")
  + mode picker (Must use / Prefer) + optional name field + Save / Cancel actions
- **Match-state polylines:** Green `--road-lock-exact`, amber `--road-lock-matched`,
  red `--road-lock-approximate`, dashed `--road-lock-unresolved`
- **Drift arrows:** Small arrows when rematching moves the snap off the authored corridor

**Tokens loaded (CSS module: `src/app/styles/map-stage-road-locks.css`):**
`--oled`, `--machined`, `--instrument`, `--metal`, `--line`, `--signal`,
`--road-lock-exact` (aliases `--success`), `--road-lock-matched` (aliases `--signal`),
`--road-lock-approximate` (aliases `--danger`), `--road-lock-unresolved` (aliases `--danger`).

---

## Wave B/C design-token map

| New surface | CSS module | Tokens loaded |
|---|---|---|
| RoadLockLibraryDrawer | `src/app/styles/road-lock-library-drawer.css` | `--oled --machined --raised --instrument --metal --line --signal --danger --success --road-lock-exact --road-lock-matched --road-lock-approximate --road-lock-unresolved` |
| MustLockUnresolvedPanel | `src/app/styles/must-lock-unresolved-panel.css` | `--oled --machined --instrument --metal --line --danger --road-lock-approximate --signal --success` |
| RoadLockImageOverlay | `src/app/styles/road-lock-image-overlay.css` | `--oled --machined --raised --instrument --metal --line --signal --danger --road-lock-exact --road-lock-matched --road-lock-approximate --road-lock-unresolved` |
| BikeProfilePicker | `src/app/styles/bike-profile-picker.css` | `--oled --machined --instrument --metal --line --signal --road-lock-approximate` |
| RouteDataQualityPanel | `src/app/styles/route-data-quality-panel.css` | `--oled --instrument --metal --line --signal --danger --success` |
| RegionSuitePicker | `src/app/styles/region-suite-picker.css` | `--oled --machined --instrument --metal --line --signal --success` |
| StorageQuotaMeter | `src/app/styles/storage-quota-meter.css` | `--oled --instrument --metal --line --success --signal --danger` |
| DownloadModePicker | `src/app/styles/download-mode-picker.css` | `--oled --machined --instrument --metal --line --signal --success` |
| RoadLockSatisfactionBadge + map surface | `src/app/styles/road-lock-satisfaction-badge.css` + `src/app/styles/map-stage-road-locks.css` | `--oled --machined --instrument --metal --line --signal --road-lock-exact --road-lock-matched --road-lock-approximate --road-lock-unresolved` |

The road-lock palette is centralized in `src/app/styles/map-stage-road-locks.css` so reskin can re-theme every lock surface by editing that single file. Base tokens map: `--road-lock-exact` → `--success`, `--road-lock-matched` → `--signal`, `--road-lock-approximate` / `--road-lock-unresolved` → `--danger`.

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
| **Must-lock unresolved** | MustLockUnresolvedPanel — surfaces previous route, never silently drops the lock |
| **Road lock badge** | PlannerDeck action dock — "Road locks" pill with count when one or more must-use locks active |
| **Bike profile mismatch** | PlannerDeck action dock — small danger-tinted "Profile mismatch" hint |
