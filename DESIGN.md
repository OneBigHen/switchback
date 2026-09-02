# Switchback UX V2 Design System

## Authority

`design/DESIGN-CONTRACT.md` is the replacement visual and interaction source of truth. The earlier CINCO blue system and `design/archive/DESIGN-CONTRACT-v1.1.0.md` are migration evidence only. New work must not blend those retired systems into V2.

## Mode and thesis

Switchback is an **Operate** surface: a cartographic field instrument for motorcycle riders. The map supplies atmosphere and geographic orientation; the chrome supplies compact, reliable control. The interface should feel premium, rugged, tactile, and calm without becoming decorative or costume-like.

The primary journey is Plan, Decide, Prepare, Ride, and Review. Rides and Discover support that journey without displacing the persistent map workspace. Every surface exposes one dominant next action and retains a clear recovery or exit path.

## Visual world

- Use the approved Ink, Spruce, Canvas, Paper, Ember, Signal Blue, Moss, Sage, Sandstone, Slate, Golden Hour, and Trail Brown tokens exactly through their semantic aliases.
- Use bundled Oswald Variable for compact identity and authored headings, and bundled Inter Variable for controls, body copy, and tabular telemetry.
- Treat topographic texture as a bounded material for identity, route art, selected headers, and discovery—not as wallpaper behind working content.
- Use precise 1px rules, controlled tonal depth, 4px-grid spacing, compact radii, and object cards only when the object itself merits a card.
- Use Ember for commitment and selected route geometry, Signal Blue for navigation/location state, and dark Ink/Spruce Ride Focus chrome in all planning themes.

## Interaction and composition

- Phone: map-first compact composer, bottom sheets/docks, safe-area-aware primary navigation.
- Tablet: docked or split planning surfaces with the map continuously visible.
- Desktop: a real planning workstation with persistent map and authored side workspaces, never a stretched phone sheet.
- Riding: one dominant instruction, one secondary instruction, at most three default metrics, and no decorative motion.
- Progressive disclosure is one product, not separate simple and advanced modes.
- Map objects are direct, selectable, recoverable editing targets; pan and edit modes never compete.

## Quality floor

- No generic blue SaaS palette, glass soup, giant in-app hero copy, decorative eyebrows, sparkles-as-intelligence, arbitrary widget dashboards, or stacks of nested cards.
- No V2 override stylesheet or duplicate root token authority. Retire migrated V1 selectors instead of masking them.
- All ordinary controls retain 44px hit targets, visible focus, keyboard equivalents, reduced motion, honest loading/empty/error/offline states, and sufficient contrast.
- Visual acceptance uses fresh rendered phone, tablet, landscape, and desktop evidence. Passing snapshots alone do not prove usable hierarchy, occlusion, or glanceability.

## Detailed references

- `design/DESIGN-CONTRACT.md`
- `/root/.hermes/runs/20260830-042301-6d0994c4/package/design/SCREEN-CONTRACTS.md`
- `/root/.hermes/runs/20260830-042301-6d0994c4/package/design/RESPONSIVE-CONTRACT.md`
- `/root/.hermes/runs/20260830-042301-6d0994c4/package/design/CONTENT-AND-ANTI-SLOP.md`
- `/root/.hermes/runs/20260830-042301-6d0994c4/package/design/ACCEPTANCE-GATES.md`
