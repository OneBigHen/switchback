# W2 — DESTINATIONS: Rides, Discover, Settings

## Outcome
Rides, Discover and Settings feel unmistakably like one Switchback product without sharing a generic giant hero template. Useful content appears early and real data remains authoritative.

## 1. Rides baseline/fixture
Ensure deterministic visual data includes at least:
- saved route;
- recorded ride;
- trip;
- imported/project route.

Do not change normalization/source identity to create the fixture.

## 2. Rides header/search/filter
Phone order:
1. `YOUR ROADS` eyebrow + `Rides` title;
2. Import action;
3. search;
4. horizontally scrollable filters;
5. first row quickly.

Support copy may disappear on phone when it delays content. Reduce RouteGraphic hero use.

Filter state/count remains real. Active filter should be legible without making every chip orange.

## 3. Rides rows
Hierarchy:
- source kind;
- title;
- distance/duration if real;
- quiet tags/state;
- open affordance.

Management control remains a separate 44px target.

Use current lightweight route identity graphic if real geometry is not already cheap to render. Do not mount a map per row.

## 4. Rides management/import/empty
Management closed by default:
- organize/tags/visibility/match roads subordinate;
- Delete isolated.

Import:
- route import vs Prefer/Require road import explicit;
- parser/validation unchanged.

Empty:
- true empty → concise explanation + Import;
- no search matches → preserve query/filter + reset action.

Test each source kind opens/deletes/manages using the correct original source ID.

## 5. Discover

### Header/search
Compact `COMMUNITY ATLAS / Discover`, optional one-line support, then search. Full Atlas tertiary.

### Cards
Use real API data only:
- provenance;
- title;
- 1–2 line description;
- distance/duration only when present;
- updated info if useful;
- open affordance.

Never infer route style/difficulty from free text.

### States
- loading keeps stable structure;
- API error explicitly says planner/saved rides are unaffected and offers Retry;
- no public routes differs from no query matches.

Optional filters are allowed only if guaranteed fields make them truthful (for example provenance or distance/duration bands with missing-value handling).

## 6. Public Atlas `/routes`

Share V2.1 palette/type/card/action grammar but remain standalone.
- compact Switchback identity/back path;
- responsive content width;
- route list scanning;
- no PlannerShell mount.

## 7. Public route detail

Order:
1. back;
2. visibility/provenance;
3. title/description;
4. sanitized preview map;
5. real facts;
6. Download preview GPX / Plan your own route;
7. report form.

Do not weaken sanitization/privacy language.

## 8. Settings

### Header
Compact `RIDER SETUP / Settings`; support copy max one short line.

### Active bike
Small identity card:
- icon;
- bike name;
- category;
- range/surface capability only if current data has it;
- Edit/Change.

Do not enlarge metrics to hero size.

### Main rows
Sections:
- Rider & bike;
- Ride defaults;
- UI customization.

Descriptions explain consequence, not labels. Controls remain usable at 320px. Stable bike IDs/persistence unchanged.

## 9. Advanced / downloads

Main Settings contains one `Account, sync & data` entry.

Inside Advanced group:
1. Switchback ID;
2. encrypted sync + recovery;
3. offline/local data;
4. diagnostics.

Do not hide:
- linked/unlinked state;
- recovery warning/seed/QR flow;
- destructive reset confirmation;
- download progress/state.

Region Downloads visually matches Advanced and keeps footer/close controls reachable at 320×700.

## 10. Responsive/dark

Inspect Rides, Discover, Settings at:
- 320×700;
- 390×844;
- 430×932;
- 844×390 where destination shell applies;
- 768×1024;
- 1024×768;
- 1440×900.

Dark theme is mandatory for Settings/Advanced and representative Rides/Discover state.

## 11. Performance

- no card-level map renderers;
- no heavy image/animation dependencies;
- long lists retain normal scrolling;
- destination changes do not remount map workspace;
- RouteGraphic remains lightweight.

## 12. Completion gate

Run focused destination unit/component/visual tests. Verify:
- source-ID callbacks;
- search/filter/import;
- Discover loading/error/query/missing metrics;
- Settings persistence;
- modal focus/Escape;
- phone input sizing/overflow.

Update `STATE.md`; W3 becomes ready only after W2 visual and behavior review is accepted.