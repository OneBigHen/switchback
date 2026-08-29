# Switchback map-first rider session UX

## Objective

Make Switchback feel like one motorcycle-first session rather than a collection
of capable tools. The primary flow is **Plan → Choose → Prepare → Ride → Recap**.
The map remains the workspace. Route Atlas remains a polished secondary Library
destination for browsing and showing custom imported rides.

## Locked product decisions

- The planner/map is the product center; Atlas is value-add, not the home screen.
- Preserve existing routing profiles, provider contracts, route locks, Free Ride,
  offline work, identity, privacy defaults, and explicit route selection.
- Google Maps is an interaction-model reference only. Do not copy its branding or
  reduce motorcycle-specific route intelligence to generic navigation.
- Do not claim full offline readiness, live identity health, physical-device ride
  readiness, or provider health without direct evidence.
- Do not merge, delete, rebase, or prune branches/worktrees as part of UX code.

## Primary users and stress contexts

- A new rider who needs one obvious next action and plain-language route choices.
- An experienced route builder who needs road locks, alternatives, evidence, and
  deep detail without those controls crowding the first decision.
- A rider using a 375–430 px phone outdoors, one-handed or with gloves.
- A rider with low vision, larger text, keyboard/switch access, or reduced motion.
- A rider with weak connectivity who must see honest stale/offline limitations.

## Information architecture

### Plan

The phone opens map-first with search and three clear intents: destination,
round trip, and Free Ride. Advanced preferences remain available one level deeper.

### Choose

Route results lead with time, distance, elevation, relative detour, and one
rider-language reason. Raw scores, data confidence, directions, and provenance
are progressive detail. Selecting an alternative updates the map without silently
overriding an explicit selection.

### Prepare

The selected-route surface has one primary action: **Start ride**. **Edit** and
**Prepare** are secondary. Prepare assembles existing surface, weather, warning,
and offline limitations without inventing a single readiness claim.

### Ride

The ride HUD remains a separate sparse interaction regime. Exit/recovery is
obvious; moving prompts expose no more than one opportunity and two traits.

### Recap and Library

Saved plans, recorded rides, sharing, and imported projects live in Library.
Route Atlas is a crafted collection view that lets riders browse and show imported
routes. It always offers a clear path back to planning and never pretends poster
art starts navigation by itself.

## First implementation wave

1. Finish and harden the current Route Atlas work: one shared curvature-ramp
   implementation, responsive gallery/detail layouts, legible metadata, explicit
   collection context, semantic links, and empty/missing-geometry states.
2. Finish the approved persistent **Start new route** affordance in the minimized
   selected-route planner, reusing the complete reset command.
3. Make `ContextSheet` pointer gestures commit detent changes on release while
   retaining tap and keyboard alternatives and reduced-motion behavior.
4. Establish canonical responsive sheet/dock geometry variables so safe areas,
   touch targets, and map occlusion are not controlled by contradictory constants.
5. Improve the route-choice first layer: directions collapsed initially, imperial
   short-distance formatting, rider-language evidence, and a clear Start/Edit/
   Prepare hierarchy. Generic or unrelated imagery stays hidden.
6. Maintain `docs/quality/UX_REMEDIATION_LEDGER_2026-08-26.md` with one of:
   `fixed + verified`, `fixed in another branch`, `open`, `external gate`, or
   `physical proof required` for every owner note and release-critical UX finding.

## Responsive and interaction contract

- Verify at 375×812, 390×844, 768×1024, and 1280×800 or wider.
- Primary touch targets are at least 44×44 CSS px and remain clear of safe areas.
- Phone route-ready `peek` shows route identity, key metrics, Start ride, expand,
  and Start new route; generic planning shortcuts do not compete with a loaded route.
- Sheet release uses direction and a small distance threshold to move one detent;
  a tap/Enter/Space follows the same progressive-disclosure path.
- Only transform, opacity, and filter animate; reduced motion changes state directly.
- The Atlas gallery uses intrinsic columns that cannot force horizontal overflow;
  detail becomes one column before its story or poster is cramped.

## Verification

- Component/unit tests prove reset reachability, gesture detent transitions,
  route-choice disclosure, distance units, and Atlas data/color contracts.
- Lint, typecheck, unit tests, and production build complete on the final diff.
- Real browser checks exercise planner home, selected-route peek, alternatives,
  sheet detents, Atlas gallery/detail/empty states, ride start, keyboard focus, and
  reduced motion at the target widths.
- Fresh visual QA and independent review use the same build and artifact paths.
- Physical iPhone/PWA and live-provider/identity checks remain separate named gates.

## Accepted debt and non-goals for this wave

- Full offline regional parity and physical ride proof remain release gates.
- Passkey secret deployment is an external configuration gate.
- A unified post-ride recap and full Rider Home IA are follow-on packages after
  the route-choice and mobile workspace seams are stable.
- No routing algorithm, map provider, commercial traffic provider, native app,
  privacy default, or social/auth scope change is authorized here.
