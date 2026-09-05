# Switchback full refactor specification

Date: 2026-09-05. Reviewed source: `63de8ef583e93a6f323662cfe390febcb8480f60`.
Scope: product definition and staged refactor proposal. No application implementation is authorized by this document alone.

## Executive decision

Build **one editable, recoverable ride**, expressed through a map. Search, drawing, route dragging, preferences, imported tracks, and AI are ways of expressing or changing that ride. They must share its constraints, history, routing lifecycle, and recovery behavior.

Switchback today has a credible motorcycle routing foundation and an accumulated interaction layer. It can calculate real routes and distinguish useful alternatives. It does not yet give a rider a reliable mental model for choosing, changing, preserving, and riding one. A further set of cosmetic fixes would leave the central problem intact.

The recommended refactor preserves the routing engine, GIS primitives, local libraries, provider boundaries, and useful navigation machinery. It rebuilds intent ownership, mutation semantics, gesture coordination, task composition, and the boundary between planning and an active ride. This is a staged replacement inside the existing application, not a greenfield rewrite.

## Read this package in order

| Document | Responsibility |
|---|---|
| [PRODUCT-NORTH-STAR](PRODUCT-NORTH-STAR.md) | Product promise, audience, scope, and decision register |
| [UX-AUDIT](UX-AUDIT.md) | Observed defects, code findings, evidence limits, test coverage |
| [INTERACTION-SPEC](INTERACTION-SPEC.md) | Exact behavior and recovery contracts |
| [DESIGN-SYSTEM](DESIGN-SYSTEM.md) | Screen composition, cartography, visual and accessibility rules |
| [ARCHITECTURE-ASSESSMENT](ARCHITECTURE-ASSESSMENT.md) | What survives, what changes, and how state flows |
| [IMPLEMENTATION-BACKLOG](IMPLEMENTATION-BACKLOG.md) | Dependency-ordered waves with acceptance criteria and tests |
| [RELEASE-GATES](RELEASE-GATES.md) | Objective requirements for promotion and release |
| [WAVE-RECONCILIATION](WAVE-RECONCILIATION.md) | How this package relates to the open premium maps + routing wave |
| [ASTRA-STATE](ASTRA-STATE.md) | Exact review checkpoint and next-session starting point |

This file is the entry point; the linked documents own the detailed contracts. The user-supplied [handoff report](astra-handoff-report.md) records a blocked consultation, not a completed independent architecture verdict.

## The five strongest assets

1. Real GraphHopper road routing with motorcycle eligibility, explicit provider provenance, and bounded optional fallback.
2. A deterministic, explainable route-quality pipeline with candidate diversity and progressive alternatives.
3. A direct-manipulation foundation: point editing, stroke endpoint inference, route sculpting, and preferred-road matching.
4. Local-first route/recording libraries and unusually careful GPX original/derived-track boundaries.
5. Existing lifecycle seams and tests for cancellation, stale responses, GPS continuity, recovery, and bounded resource use.

## The ten largest obstacles

1. Route intent is split across Zustand, component state, refs, and derived route objects.
2. Refresh loses an unsaved plan; Free Ride refresh changes the activity into a paused recording.
3. Undo means point history, although the UI calls it route-edit history.
4. The route chooser does not consistently present a selected recommendation or an immediate next action; mobile and landscape layouts obscure its content.
5. Rider intent is expressed through overlapping profiles, bike constraints, avoidance controls, time modes, and role names.
6. Drawing is a single disposable sampled stroke; a second gesture replaces it, and undo removes one sampled point.
7. Avoid areas have no object-level edit contract; only the latest can be removed through the current options panel.
8. AI has a separate conversation and whole-plan proposal surface, without a complete representation of current constraints or selected map objects.
9. Free Ride has no visible control for ride character or duration extension, and its transition handlers reset important constraints.
10. Discovery, preparation, and quality governance prioritize feature presence over a coherent end-to-end rider decision.

These are supported at different evidence levels; see the audit. A missing field test is not a proven runtime failure, and a screenshot is not a passing workflow.

## Highest-leverage product changes

Make the first screen answer three things: where the ride begins, whether Switchback can route there, and how to get a good ride without filling a form. Offer a destination, a timeboxed ride, or drawing; Free Ride begins a continuous activity without a destination.

Make route choice self-explanatory: **Best ride**, **Faster**, and one genuinely distinct option such as **More dirt**. Show added time against the fastest eligible route before selection. Explain differences with measured evidence and distinguish unknown surface from paved road. Do not make a rider interpret a 100-point curve score to decide whether an extra six minutes is worthwhile.

Make changes trustworthy: hold the last usable route on the map while a change is calculated, highlight the changed section, preserve constraints, and allow a single meaningful undo. Refresh must recover the same ride and explain whether it needs recalculation.

Make AI a route control: "more dirt," "keep this road," and "home by six" produce a visible proposed change, grounded places, measured tradeoffs, and one Apply action. The route engine evaluates the change. The assistant cannot invent access, difficulty, closures, or a road's current condition.

## Delete, simplify, redesign, rebuild

**Remove from the normal experience:** Neural as a rider-facing profile; provider/alternative ordinal route names; duplicated highway controls; raw match tolerances; unconditional research controls; unrelated publish/stage/rating forms inside every route's preparation view; decorative AI invitations competing with the main composer. Preserve useful capability behind contextual actions. Do not delete user data or remove APIs until usage, compatibility, export, and migration have been checked.

**Simplify:** one route library with saved, imported, and recorded sources; one discovery entry point with clear provenance; one preparation summary; one settings source for durable defaults; one place-selection interaction.

**Redesign:** the complete planning/choice/editing screen, drawing canvas, editable constraints, Free Ride HUD, AI proposal panel, route detail/preparation, discovery/import handoff, and all short-height layouts.

**Rebuild internally:** the ride intent and command boundary, intent-wide undo, draft persistence, gesture state machine, revision-aware routing commits, and continuous ride-session ownership. Keep these as small modules within the Next.js application. Do not introduce a generic event-sourcing platform, plugin framework, second routing engine, or service mesh.

## Recommended implementation sequence

1. Establish an exact baseline, resolve product-policy conflicts, and reproduce the critical evidence.
2. Centralize ride intent, transactions, cancellation, undo, and recovery behind existing UI.
3. Replace the planner/chooser composition and expose rider-level intent controls.
4. Complete drawing, waypoint, segment, and avoid-area manipulation through that command boundary.
5. Connect AI to typed, revision-scoped route proposals and grounded explanations.
6. Unify Free Ride, guided riding, recording, return-home, and recovery as one session.
7. Consolidate discovery, GPX, saved rides, preparation, and route-specific offline readiness.
8. Close browser, real-provider, accessibility, performance, and physical-device gates.

Wave details and safe parallelization opportunities are in the backlog. Each wave must be reviewable and releasable behind a temporary migration switch. No second permanent state authority is allowed during migration. See [WAVE-RECONCILIATION](WAVE-RECONCILIATION.md) before sequencing against the open premium maps + routing wave.

## What finished should feel like

A rider opens Switchback and immediately understands the starting point. They ask for ninety minutes of backroads, sketch a ridge they want to follow, or simply start riding. The map responds visibly. Alternatives explain what the extra time buys. Changing one section preserves everything else. Bad data and poor connectivity are clear, recoverable states. On the bike, the interface becomes quiet and legible. At the end, the ride is already saved with its source and changes intact.

The ambition is first-party mapping quality in interaction and trust, with motorcycle-specific judgment in route selection. The product should feel easy because its internal state is coherent—not because important limitations are hidden.
