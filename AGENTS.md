<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Switchback — product guardrails for agents

**Product target — do not drift from this.** Switchback is a *motorcycle trip
decision engine*, not a map with many layers. Google Maps answers "what is the
practical route?" Switchback answers "which route will I actually want to ride,
and what should I know before committing to it?"

**Integration gate.** A new data source, provider, or adapter is only justified
if it improves **route selection, route explanation, trip preparation, or ride
safety**. A map overlay by itself is not a sufficient reason to add one. The PR
must answer: *what rider decision gets better?* Each source is a small adapter
behind a clean interface — no generic provider framework, no microservices.

**Frozen decisions** (`docs/adr/`, full context in `docs/release/ROADMAP-WAVES.md`):

- Renderer: Mapbox GL JS v3 with Mapbox Standard / Standard Satellite is the
  primary online renderer (ADR 0015, supersedes 0010). Custom layers go in
  Standard slots, never on internal layer ids. MapLibre survives only as the
  migration rollback path — no permanent dual-renderer framework. Google 3D is
  a lazy-loaded cinematic preview only, never the navigation renderer (0016).
- Routing: GraphHopper is the self-hosted baseline that must answer alone;
  Valhalla and TomTom add candidates. Providers propose, Switchback decides —
  every candidate passes eligibility, enrichment, traffic evidence, scoring,
  dedupe, and role assignment (ADR 0001, 0017). No engine rewrite; Mapbox
  Directions is not a routing source.
- Traffic/incidents: optional adapters, TomTom on the hosted instance (traffic
  evidence plus Thrilling candidates, endpoints chosen by a recorded bakeoff),
  OSM signal/stop density as the key-free baseline; core works with no
  commercial key (ADR 0002, 0014, 0018). Traffic informs but does not win:
  Protect the Ride is the default, closures still hard-fail (ADR 0019).
- Identity: same-origin WebAuthn passkeys + local SQLite. No Clerk/Auth0/
  Supabase/Firebase, no session-store service.
- Sharing: opaque-link read-only snapshots, not a social network — no
  followers/likes/feed/DMs/moderation (ADR 0012).
- Analytics: PostHog, ~15 deliberate events, no PII, no session replay, no
  autocapture, `TELEMETRY_ENABLED=false` for self-hosters (ADR 0011).
- Rate limiting: in-process limiter for the single instance. No Redis.
- Default route: Best Ride, with Fastest/Balanced one tap away (ADR 0013).
  Route Policy V2 gives each rider-facing role its own detour envelope; V1 is
  frozen for comparison, and added minutes vs fastest are always shown (0022).
- Premium providers: server-declared, identity-gated capabilities, no billing
  and no client-only flags; a missing key disables only that capability and
  leaves the core product coherent (ADR 0021).
- Free Ride: Discovery (timeboxed loops) and Live (ahead-only, workload-aware,
  one quiet suggestion) are separate contracts sharing one engine (ADR 0020).
- Offline: ships with an honest "limited coverage" state; parity % is not a
  release blocker (ADR 0003).

**Rejected right now — do not build without a new decision:** Mapbox Directions
or the Mapbox Navigation SDK, a learned/LLM route ranker, three permanent
renderers, a plugin/provider marketplace, billing / Free-vs-Pro plans /
entitlement tables, Redis, microservices, a social feed, native iOS/Android
apps, CarPlay/Android Auto as a core phase.

**Do not restart closed campaigns.** The 2026-08 UX remediation campaign closed
with PR #20. Ledgers under `docs/quality/archive/` are evidence, not worklists.

**Current wave.** The premium maps + routing wave opened 2026-08-29 (ADRs
0015–0022, phases in `docs/release/ROADMAP-WAVES.md`). It is a deliberate new
wave, not a reopening of the closed remediation campaign.
