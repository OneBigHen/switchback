# Visual References

These SVGs are composition guides stored directly in GitHub so an implementation agent can inspect them without external files.

They are **not** screenshot goldens and do not authorize fake data. Reproduce hierarchy, spacing, map-to-chrome balance, CTA priority and palette using the real app/components/data.

Files:
- `01-plan-mobile.svg` — idle, route alternatives, route-ready hierarchy.
- `02-destinations-mobile.svg` — Rides, Discover, Settings density.
- `03-ride-focus-mobile.svg` — Record, Free Ride, Ride/off-route hierarchy.
- `04-responsive-layouts.svg` — phone, short landscape, tablet, desktop composition.

Canonical palette/type/radius rules remain in `design/DESIGN-CONTRACT.md` and `../VISUAL-SYSTEM.md`.

## How to review against these

Do not pixel-clone. Ask:
- Does the real map/content receive similar visual priority?
- Is useful content equally early?
- Is there one strong CTA rather than many equal buttons?
- Is Ember similarly restrained?
- Are cards compact rather than hero-sized?
- Is typography doing hierarchy work?
- Does Ride Focus show less information than planning?
- Does desktop use constrained instruments rather than stretched phone UI?

When implementation data lacks a field shown illustratively, omit it rather than manufacturing it.