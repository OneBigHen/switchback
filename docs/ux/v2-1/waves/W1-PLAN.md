# W1 — PLAN: Planning Instrument

## Outcome
Plan should feel like one compact premium instrument from idle → shape/options/draw → loading → alternatives → prepare/detail/edit. The map remains useful throughout.

## 1. Baseline first
Run:
```bash
npm run lint
npm run typecheck
npm test
npm run build
```
Capture current Plan states at 320×700, 390×844, 430×932, 844×390, 768×1024, 1024×768, 1440×900.

If baseline is already red for required behavior, record in `STATE.md` and stop mixing failures.

## 2. Idle Plan

### Required layout
- one strong omnibox;
- Destination / Loop / Draw as one segmented family;
- Free Ride adjacent but separate, preferably Spruce identity;
- Options tertiary;
- no mobile hero/tagline/logo filler;
- no blank lower sheet;
- map gets the remaining visual area.

### Tests before risky CSS
Assert at 320×700:
- sheet remains inside existing idle cap;
- nav does not overlap;
- all primary controls >=44px;
- search/input computed font >=16px;
- no horizontal overflow.

Do not change detents merely to make screenshots easier.

## 3. Options

Group existing controls visually:
- Route;
- Stops & shape;
- Loop (conditional);
- Road requirements;
- Saved places;
- existing Research only if already intentionally exposed.

Use section headings/dividers. Do not make every input a separate card.

Keep current data/state callbacks and field semantics.

## 4. Draw

Requirements:
- entering Draw increases map emphasis;
- trace implies start/end;
- do not require destination/finish;
- compact toolbar with only current supported actions;
- undo/clear/done/cancel reachable;
- no new drawing algorithm.

Validate phone + short landscape.

## 5. Loading and error

Loading:
- keep planning context visible;
- compact lifecycle status;
- elapsed useful but quiet;
- Cancel reachable;
- avoid full-sheet spinner takeover.

Error/provider failure:
- concise human title/message;
- Retry only when supported;
- map and unaffected controls remain understandable;
- warning color limited to semantic state.

## 6. Layers / road locks

- quick layer panel compact;
- active state obvious;
- no control hidden under current sheet/nav;
- `must` visually stronger than `prefer`;
- required-road failure never clipped;
- preserve road-lock storage/meaning.

## 7. Alternatives

Use current real presentation fields.

Card hierarchy:
1. role eyebrow;
2. route name;
3. time + distance + added time;
4. one route-character line;
5. warning when real;
6. Details tertiary.

Selection = Ember border/accent + marker. Do not fill entire selected card Ember.

At half detent the selected/leading alternative should read clearly without requiring immediate full-sheet expansion.

## 8. Route ready / Prepare

Before Start, show selected route:
- name;
- time;
- distance;
- route character;
- warning if real.

Prefer deriving this from `selectedRoute` and existing route-presentation helper rather than adding state.

Action priority:
1. Start route — filled primary;
2. Edit route — secondary;
3. Offline / Road locks / details utilities;
4. Clear — low-emphasis/destructive.

Do not duplicate full RouteComparison into the dock.

## 9. Detail/edit/offline

Detail full-sheet:
- facts first;
- Ride actions;
- Save/Export/Share;
- Trip;
- advanced facts.

Edit:
- state obvious;
- Replan primary;
- Clear not equal to Replan.

Offline modal:
- concise Switchback-pack vs GPX explanation;
- mode picker;
- Cancel + Save footer visible at 320×700;
- focus/escape behavior preserved.

## 10. Motion

Verify spatial continuity:
- peek → idle;
- idle → options;
- idle → loading;
- loading → alternatives;
- alternative selection → prepare;
- prepare → detail/edit.

No unrelated page jump/reflow. Use canonical transition durations; reduced motion works.

## 11. Performance

- no new map instance;
- no map remount when sheet content changes;
- no heavy animation library;
- no decorative route geometry recomputation each render;
- no large blur.

## 12. Completion gate

Run focused Plan unit/component tests plus relevant Playwright visuals. Then:
```bash
npm run qa:pr
```

Manually inspect:
- 320×700 idle;
- 390×844 idle/options/loading/alternatives/prepare/detail/edit;
- 430×932 idle;
- 844×390;
- 768×1024;
- 1440×900;
- one dark Plan state.

Update `STATE.md` with commits/tests/visuals/snapshots and set W2 ready only when W1 is genuinely green.