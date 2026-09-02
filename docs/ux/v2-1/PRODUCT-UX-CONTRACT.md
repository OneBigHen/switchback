# PRODUCT UX CONTRACT — Switchback V2.1

This file is the screen/state acceptance contract for implementation. It complements `design/DESIGN-CONTRACT.md`; it does not replace it.

## 1. Product hierarchy

Switchback is a motorcycle route decision instrument. Planning should make the map and route choice dominant. Content destinations should make lists/objects dominant. Active ride surfaces should make maneuver, recovery and GPS state dominant.

Global hierarchy:
1. current task/state;
2. primary object or maneuver;
3. critical metrics/warnings;
4. primary action;
5. secondary utilities.

## 2. Plan

### Idle
- Map remains the largest visual region.
- One omnibox is the visual anchor.
- Destination / Loop / Draw are one planning-mode group.
- Free Ride is adjacent but separate.
- Options is tertiary.
- No welcome hero, tagline card, giant logo, or blank lower sheet.

### Options
Group existing controls by rider intent:
- Route: profile/style, bike, route preferences.
- Stops & shape: start, finish, via, reverse, undo/redo.
- Loop: time target/presets only in loop mode.
- Road requirements: must/prefer roads and avoid areas.
- Saved places: Home/library actions.

Do not convert every setting row into its own card.

### Draw
- Entering Draw makes the map more important, not less.
- Existing freehand semantics stay: the drawn trace implies start/end; no forced finish-location prompt.
- Toolbar is compact, explicit, and reachable: undo/clear/done/cancel as current semantics support.

### Loading
- Keep omnibox/context visible.
- Show current lifecycle wording + elapsed time + Cancel.
- Do not cover the whole panel with a spinner.

### Error/provider failure
- One concise title and message.
- Retry only if the callback exists.
- Avoid coloring the whole panel yellow/red.
- Planner/saved rides should not appear lost.

### Alternatives
Every route card uses the same grammar:
- role eyebrow;
- route name;
- time strongest;
- distance secondary;
- added time vs fastest quiet but visible;
- one route-character line derived from real data;
- warning only if real;
- Details tertiary.

Selected card uses border/accent/marker, not a full Ember fill.

### Route ready / Prepare
Before `Start route`, show:
- selected route name;
- duration;
- distance;
- real route character;
- real warning if present.

Action hierarchy:
1. Start route;
2. Edit route;
3. Offline / Road locks / other utilities;
4. Clear route is low-emphasis/destructive.

### Detail/edit
- Full detail sheet groups facts first.
- Actions grouped by Ride, Save/Export/Share, Trip, advanced facts.
- Editing state is explicit; Replan becomes the commit action.
- Offline modal footer must remain reachable at 320×700.

## 3. Rides

### Populated
Phone order:
1. compact `YOUR ROADS / Rides` header;
2. Import;
3. Search;
4. filter chips;
5. first ride row quickly.

Row grammar:
- source kind eyebrow;
- ride/route title strongest;
- distance/time line;
- quiet tags/state;
- open affordance;
- management button separately accessible.

Do not replace real source identity with a presentation ID.

### Management
Collapsed by default. Organize/tags/visibility/match-roads are subordinate to Open. Delete is isolated.

### Empty
- True empty: explain briefly + Import.
- Search/filter empty: keep query/filter and offer clear/reset.

### Import
Keep route import vs Prefer/Require road import explicit. Parsing and validation stay unchanged.

## 4. Discover / community

### Discover
- Compact header, search immediately after.
- Real result count/state.
- Cards show real provenance and available stats.
- Full Atlas is tertiary.

Do not infer `ADV`, `gravel`, `scenic`, `twisty`, difficulty, or “nearby” from free text.

### States
- Loading has stable card footprint or compact status.
- API error states that planner/saved rides are unaffected and offers Retry.
- `no public routes` differs from `no search matches`.

### `/routes`
Standalone public Atlas should share palette/type/card grammar without embedding PlannerShell.

### `/routes/[routeId]`
Order:
1. back/navigation;
2. visibility/provenance;
3. title/description;
4. sanitized map preview;
5. available facts;
6. Download preview GPX / Plan your own route;
7. report form.

Privacy/sanitization language remains explicit.

## 5. Settings

### Main
- Compact header.
- Active motorcycle is a small identity card: icon, name, category, range/surface capability if already present, edit/change action.
- Sections: Rider & bike, Ride defaults, UI customization.
- Secondary descriptions appear only when they explain consequence.
- One `Account, sync & data` Advanced entry at end.

Stable motorcycle IDs and persistence semantics do not change.

### Advanced
Four visual groups:
1. Switchback ID;
2. encrypted sync + recovery;
3. offline/local data;
4. diagnostics.

Never hide linked/unlinked state, recovery safety, destructive reset confirmation, or download progress.

## 6. Record

Idle:
- `Record a ride`;
- quiet local/private trust note;
- readiness;
- breadcrumb area;
- three aligned metrics;
- Start recording dominant.

Active:
- breadcrumb becomes more important;
- Pause dominant;
- Finish clear but secondary.

Paused:
- Resume dominant;
- Finish clear.

Discard/finalization safety unchanged.

## 7. Free Ride

### Idle
Priority:
1. GPS confidence;
2. current speed;
3. heading;
4. `Ride your way` state;
5. restrained telemetry;
6. utilities.

`Experimental` remains visible.

### Suggestion
One suggestion only:
- experimental warning;
- road/title;
- max 3 reasons;
- score small/supporting;
- Accept primary;
- Ignore / Less like this secondary.

No gamified dial, carousel or confidence language that implies verified guidance.

## 8. Active Ride

Priority:
1. maneuver or recovery state;
2. GPS state;
3. distance to instruction;
4. route/map;
5. speed and remaining route metrics;
6. voice/pause/record utilities.

Preview/no GPS must not look like live guidance.
Track-only explicitly says track guidance.
GPS uncertainty explicitly pauses/qualifies guidance.
Arrival is calm and preserves recording/finalization clarity.

### Off route
Off-route must be more visually explicit than normal guidance:
- semantic warning icon/color;
- recovery headline;
- recovery options;
- original-route preservation behavior remains truthful.

## 9. Global states

Every primary surface must handle, where applicable:
- populated;
- empty;
- loading;
- error;
- selected;
- editing;
- disabled/unavailable;
- dark theme;
- reduced motion;
- long content/missing metrics;
- 320px narrow phone;
- short landscape;
- tablet portrait/landscape;
- desktop.

## 10. Definition of gorgeous

A screen is accepted when it feels intentional rather than merely decorated:
- useful content begins early;
- the eye lands on the correct object/action;
- spacing is consistent;
- typography does most hierarchy work;
- accents are restrained;
- no fake visual filler;
- transitions preserve spatial continuity;
- light/dark both feel designed;
- phone/desktop compositions are native to their space rather than scaled copies;
- ride surfaces are calmer than planning surfaces.