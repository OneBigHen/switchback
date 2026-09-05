# Product north star

## Promise

**Find the ride worth taking, shape it naturally, and stay confident when the plan changes.**

Switchback is a motorcycle ride decision and execution workspace for backroad, ADV, and dual-sport riders. It chooses among legal, supported routes using road enjoyment, time, surface, bike suitability, and the evidence available. It explains what a rider gains and gives up. It remains useful without an account, an AI provider, or a premium map provider.

Its central object is a ride: intention, optional destination, optional time budget, constraints, proposed routes, a chosen route, preparation, and eventually a recorded journey. A route is a computed interpretation of that intention; it is not the only surviving record of what the rider wanted.

## Primary riders and jobs

| Rider/context | Main job | Product response |
|---|---|---|
| Weekend backroad rider on a phone | "I have 90 minutes; make it worthwhile." | Starting point + time + one useful recommendation |
| ADV rider at a desk | "Connect these roads, preserve this GPX section, avoid difficult terrain." | Map manipulation, ordered stops, segment constraints, evidence and uncertainty |
| Rider already moving | "Keep this enjoyable, but get me home sooner." | Quiet, workload-aware change to the remaining ride |
| New user | "Can this help me here, on my bike?" | Visible coverage, inferred start with provenance, minimal bike suitability setup |
| Returning rider | "Use last weekend's idea but skip the rough bit." | Searchable local rides, derivative editing, original preserved |

Motorcycle surface preference and technical difficulty are separate. Gravel does not establish easy riding; pavement does not establish low workload. "Easy dirt" requires relevant evidence such as track grade, smoothness, slope, access, and uncertainty. Without it, say difficulty is unknown and offer the supported surface preference. Do not turn a lack of evidence into a terrain promise.

## Product structure

The map workspace has Plan and active Ride activities. **Rides** holds saved plans, imports, recordings, and history. **Discover** finds rideable source material; it should not open an empty social destination when curated rides exist elsewhere. Settings is secondary. Record is an activity available from the map or active ride, not a fifth equal planning destination.

Planning supports three entry methods: choose a place, describe a ride, or draw. "Loop" is a trip shape, not a separate set of state rules. Free Ride is destination-free execution; timeboxed loop discovery is a planning operation. They share recommendation and session contracts but remain distinct experiences.

The intended journey is:

`Express intent → Compare → Shape → Prepare → Ride → Keep / share / revisit`

Riders may enter at any point through an import or shared ride. They do not need to complete a wizard to move between these activities.

## Decision register for the refactor

These are the proposed authoritative product requirements for the next implementation. They do not assert that the current app satisfies them. Existing frozen ADRs remain operational policy until explicitly amended; conflicts below must be resolved in wave 0.

| ID | Decision | Relationship to current policy |
|---|---|---|
| N01 | One durable ride intent and one active session; all inputs use shared commands | Refines map-first/state ownership |
| N02 | Default to Best ride; show fastest eligible comparison and added time immediately | Reaffirms ADR 0013; challenges current unselected result behavior |
| N03 | Surface, time flexibility, and terrain tolerance express intent; engine profiles are internal | Replaces eight visible profile choices; keep adapter compatibility |
| N04 | New drawing derives endpoints from the gesture; preserving existing anchors is explicit | Builds on existing inference; fixes location-seed ambiguity |
| N05 | Every authored constraint is selectable, editable, removable, and undoable | Extends point-only history and latest-area deletion |
| N06 | AI proposes validated changes against an exact ride revision; Apply commits them | Retains proposer boundary; any automatic preview routing requires ADR 0023 clarification |
| N07 | Model output never ranks/filter-selects routes or establishes road facts | Retains deterministic engine policy; remove competing model "would pick" authority |
| N08 | Free Ride preserves constraints and recording across accepted suggestions and return-home | Extends ADR 0020; separate discovery/live contracts remain |
| N09 | Unknown data stays unknown; offline readiness is specific to this ride and capability | Refines ADR 0003; generic downloaded-region readiness is insufficient |
| N10 | Sharing is a read-only derivative with provenance and explicit privacy preview | Retains ADR 0012; proposes retiring comments/social-style scope |
| N11 | Keep the Switchback mark/palette/fonts; simplify composition before rebranding | Existing V2 identity preserved, layout rules made enforceable |
| N12 | Mapbox remains the intended primary renderer; verify its actual rollout before retiring MapLibre | No third renderer, no navigation SDK, no routing rewrite |

## Principles with useful exceptions

The map is primary where geography helps a decision. A searchable ride list or a keyboard editing view may temporarily take more space when that is the task. Never keep a decorative sliver of map just to claim the product is map-first.

Direct manipulation is preferred, with accessible search/list alternatives. A phone rider should not have to precisely drag an overlapping road under a sheet to set a stop. Desktop may show an ordered stop list beside the map.

Infer fresh start and units where reliable, but display their source. A cached location is not current GPS. Approximate regional defaults need an explicit label. A inferred start must not silently override a deliberate drawing start.

Important user actions are reversible. Undo reverses user intent; it must not undo newly received closure or legality evidence. An old route invalidated by new safety evidence remains invalid even if the rider undoes a preference.

AI is optional. Structured controls must cover every core change AI can propose. No interaction requires a successful model call, and no model conversation becomes the planner's memory.

## Deliberate exclusions

No social graph, public comment feed, billing tier system, learned route ranker, native mobile rewrite, provider marketplace, or generic map-layer browser. No premium-provider expansion until it demonstrably improves an actual route choice or preparation decision. Google 3D preview is deferred until core planning and riding meet the gate.

Do not remove original GPX files, recorded rides, enrolled identities, or existing offline packs as cleanup. Preserve format compatibility and provide migrations before retiring implementations.

## Alternatives considered

**Polish the current panels:** lowest initial effort, but leaves partial undo, constraint loss, and separate AI ownership. Appropriate only for urgent contained defects.

**Build a new app:** allows a clean composition but risks discarding routing, import, and navigation guarantees. Too much simultaneous replacement for this codebase.

**Recommended: one ride model, staged interaction replacement:** fixes the source of inconsistency and reuses the hard-won engine. Costs careful migrations and temporary adapters; those have explicit removal gates.

## Success measures

Target, not measured baseline: first-time riders complete a useful local ride plan without coaching; riders can explain why the recommendation differs from fastest; an edit/undo/reload preserves intent; a rider can start Free Ride without a destination and return home without losing the session. Validate in five moderated rider sessions spanning phone and desktop, with at least four completing each core task unaided and no dangerous misunderstanding. Small-sample usability evidence supplements, not replaces, release gates.

Do not optimize for feature count, AI message volume, overlay density, or maximum curve score. Measure successful ride decisions and recoverable changes.
