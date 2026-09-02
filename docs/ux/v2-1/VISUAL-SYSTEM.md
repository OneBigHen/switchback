# VISUAL SYSTEM — Switchback V2.1

Use `design/DESIGN-CONTRACT.md` as canonical authority. This file translates it into implementation decisions for V2.1.

## Palette roles

- Ink `#161D1C`: primary text/deep chrome.
- Spruce `#243A35`: ride/adventure identity, dark raised surfaces.
- Moss `#65745D`: restrained supporting accent.
- Sage `#9DA98F`: quiet fill/decorative map/topo accent.
- Canvas `#F4F0E7`: warm app background.
- Paper `#FBF9F4`: primary light surface.
- Sandstone `#D8C8B7`: borders/warm neutral fill.
- Ember `#D65A36`, accessible filled `#BF4829`: selected route and primary action.
- Signal Blue / strong Signal: GPS, current-location, links/focus.
- Golden Hour / Danger: caution/danger only.

### Allocation rules
- Ember is not the color of every chip.
- Spruce may own Free Ride and adventure-adjacent primary actions.
- Signal is utility/navigation information.
- Warning colors never become brand decoration.

## Type

- Oswald Variable: compact identity, destination titles, short state labels, instrument emphasis.
- Inter Variable: body, controls, route names in dense rows, metrics.
- Use tabular numerals for aligned telemetry/route metrics.
- No all-caps paragraph copy.
- Do not shrink copy to fit; shorten it.

Phone target scale:
- destination: 26–30px;
- route title: 20–24px;
- section: 17–20px;
- row title: 15–17px;
- body: 13–15px;
- support: 11–13px;
- metrics: 18–28px.

## Spacing and shape

4px system. Prefer 4/8/12/16/20/24/32.

Radius roles:
- chip 6–8;
- control 8–10;
- object card 10–12;
- desktop panel 12–16;
- phone sheet 16–20.

Do not turn every rectangle into a giant pill or 28px-radius card.

## Material

- Outer floating panel/sheet gets canonical shadow.
- Nested object cards generally use border + tonal separation only.
- Glass/blur is never the identity; avoid blur over continuously moving map regions.
- Map supplies atmosphere. Chrome supplies control.

## Primary CTA grammar

Primary filled Ember, one per task region.
Examples: Plan route, Start route, Start recording, Accept suggestion, Save offline pack.

Free Ride can use Spruce because it is a distinct ride action.

Secondary: Paper/raised + border + Ink.
Tertiary: text/icon utility.
Destructive: Danger semantics.

## Object card grammar

At most:
1. eyebrow/status;
2. title;
3. metrics/support line;
4. warning/action.

A settings group is not an object card. Use rows/dividers.

## Route card

```text
FAST & FUN                         Selected
River Road North
1h 34m       74.8 mi       +8 min
Flowing back roads · 72 curve score
```

- Neutral base.
- Selected = Ember border/left accent + text marker.
- Time strongest metric.
- Warning separate compact row.
- Details tertiary.

## Rides row

```text
[route identity]  SAVED ROUTE
                  Delaware River Loop
                  74.2 mi · 1h 48m
                  scenic · weekend        ›
```

Use actual route geometry only if already cheaply available. Do not create one map renderer per row. A lightweight current RouteGraphic is acceptable as identity.

## Discover card

```text
RIDER RECORDED
Upper Delaware Sweep
86.4 mi · 2h 05m
River roads and ridge connectors.          ›
```

Missing metric = omit, never `0`.

## Navigation

Four primary destinations:
- Plan
- Rides
- Discover
- Settings

Record remains separated by spacing/divider and action styling.

Phone: active destination uses a quiet raised region + Ember icon/indicator, not a row of five competing pills.
Desktop: narrow field-instrument rail, active state readable but restrained.

## Map overlays

- selected route: Ember + casing;
- alternatives: lower prominence;
- current position/guidance: Signal;
- avoid area: danger/Ember family with low-opacity fill;
- unpaved context: Brown/Moss family;
- closure/danger stays conventional, not forced into brand color.

## Topographic motif

Allowed in launch/empty, Discover/public identity, offline previews, subtle headers.
Not behind body text, every card, active nav, or Ride HUD.

## Dark Ride Focus

Record/Free Ride/Ride use stable dark chrome in both day/night where current product contract does so:
- Ink/Spruce surfaces;
- Paper text;
- Ember commits/route;
- Signal GPS/nav.

## Visual anti-patterns

Reject:
- generic gradient SaaS cards;
- stock motorcycle photography as filler;
- sparkles for “smart” features;
- giant hero headings in map sheets;
- repeated badges to create interest;
- decorative shadows on nested cards;
- translucent glass template styling;
- identical hero structures on Rides/Discover/Settings;
- huge blank padding mistaken for premium design.