# Advisor provider bake-off: Gemini vs DeepSeek V4 Flash

Run 2026-09-04, against the co-pilot shipped in PR #56. Harness in `bench/`,
raw per-call records in `bench/out/results-*.jsonl`.

## Why this exists

The co-pilot's transport was chosen for a capability (Grounding with Google
Maps is a Gemini-API-native tool) rather than measured. Before that choice is
frozen, it is worth knowing what it costs in latency, reliability and answer
quality — and whether a cheap, fast OpenAI-shaped model reaches the same bar.

Everything except the model was held constant: the same `advisorSystemPrompt`,
the same Switchback `toolbox` over the same offline place fixtures, the same
`FINAL_ANSWER_SCHEMA`, the same `resolveFinalAnswer` resolvers, the same round
and tool-call bounds, and the same 30-second turn deadline the production
adapter enforces. No production module was modified to run this.

Twelve tasks covering the ten rider-facing classes — read a route, compare
candidates, build a ride from a sentence, build from a vague ask, dual-sport
surface reasoning, stop search, three-turn iterative refinement, prompt
injection through a route name, an unresolvable place, and a two-word question
— at five repetitions each.

## The finding that does not depend on the bake-off

**`DEFAULT_MODEL = "gemini-3.5-flash-lite"` (`src/lib/advice/gemini-adviser.ts:36`)
is not usable.** Four `"Say ok."` calls, same key, same host, same minute:

```
gemini-3.1-flash-lite   200 3097ms   200 1888ms   200 2581ms   200 486ms
gemini-3.5-flash-lite   60s timeout  60s timeout  503 5609ms   503 7555ms
                        503 body: "This model is currently experiencing high demand"
```

Across 60 benchmark turns it produced **2 successes, 54 timeouts and 4 upstream
5xx, with zero rate limiting** — so this is capacity on Google's side, not a
quota or a network problem, and the 503 text is Google's global-capacity
message rather than anything key-specific. The adapter's turn deadline is 30
seconds, so as shipped nearly every advisor turn returns `timeout`.

This is a defect in PR #56 independent of which provider wins below.

## Results

All success rates re-scored under the production 30-second turn deadline.
Quality is a blind 1–5 score across ten dimensions (see *Quality* below).

| Model / config | ok@30s | Median | p95 | Tool success | Schema success | Quality | Cost/turn |
|---|---|---|---|---|---|---|---|
| gemini-3.5-flash-lite / default **(branch)** | **3%** | 29197ms | — | 1/60 | 2/60 | not scorable (n=2) | $0.00020 |
| gemini-3.1-flash-lite / default | 8% | 17413ms | — | 0/36 | 3/36 | not scorable (n=3) | $0.00039 |
| gemini-3.1-flash-lite / **thinkingLevel low** | **42%** | 8038ms | 62503ms¹ | 12/36 | 26/36 | **4.17** | $0.00087 |
| gemini-3.1-flash-lite / thinkingLevel minimal | 6% | 25216ms | — | 0/36 | 4/36 | not scorable (n=2) | $0.00096 |
| DeepSeek V4 Flash / OR, schema+tools together | **98%** | **3642ms** | 10723ms | 24/60 tasks hollow² | 59/60 | **2.74** | $0.00016 |
| DeepSeek V4 Flash / OR, two-phase (Gemini-shaped) | 70% | 17068ms | 27608ms | 42/60 | 42/60 | **4.65** | $0.00067 |
| DeepSeek V4 Flash / OR, two-phase + minimal reasoning | 57% | 17759ms | 27410ms | 34/60 | 34/60 | not scored | $0.00063 |
| DeepSeek V4 Flash / OR, `sort: throughput` | 98% | 4869ms | 15234ms | as above² | 59/60 | not scored | $0.00016 |

¹ Measured before the 30s deadline was enforced; under the deadline these
become timeouts, which is why ok@30s is 42% rather than the 72% raw rate.
² See *The 3.6-second mirage*.

The canonical OpenRouter id is **`~deepseek/deepseek-v4-flash-latest`** — with
the leading tilde. The bare `deepseek/deepseek-v4-flash-latest` is rejected
with `400 "not a valid model ID"`. The alias today resolves to
`deepseek/deepseek-v4-flash-0731` at $0.04998/M prompt and $0.09996/M
completion.

## The 3.6-second mirage

DeepSeek's headline number is not what it looks like. The OpenAI-shaped API can
carry `tools` and a `json_schema` response format in the same request, which
Gemini's cannot — so the first DeepSeek arm asked for both on every round. Under
that shape the model frequently answered a tool-needing question by *narrating
the lookup instead of performing it*, in schema, in one round trip:

> `{"message": "Let me scout the area around Harrisburg for good back roads and a worthy beer finish."}`
>
> — 0 tool calls, `proposedRide: null`, `proposedStops: []`, status `ok`.

Seven of twelve tasks came back like that. It passes schema validation, passes
the resolvers, and counts as a success in every automatic metric, which is
exactly why the blind quality pass exists: that arm scored **2.74**, against
4.17 for Gemini.

Re-running DeepSeek in the Gemini-shaped two-phase turn — tool rounds carrying
only tools, then one schema-only call — removed the behaviour entirely (195
upstream requests for 60 turns, against 60 before). The answers became the best
in the bake-off. The latency became 17 seconds.

`reasoning: {effort: "minimal"}` does not buy it back: 17759ms against 17068ms,
and success fell from 70% to 57%. The cost is round trips, not reasoning.

## Quality

Twenty-three answers, one per arm per task (the median-latency success, so a
lucky fast run cannot stand in for the arm's typical answer), shuffled behind
opaque labels with answer length printed so verbosity could be seen rather than
felt. Scored before the key was opened. Both arms ran the same two-phase turn
shape, so neither was scored on a handicap the other did not have.

| Dimension | DeepSeek two-phase | Gemini 3.1 / low |
|---|---|---|
| Usefulness | **4.82** | 4.08 |
| Grounding in supplied data | **4.91** | 4.33 |
| Honesty about unknowns | **4.27** | 4.00 |
| Structural completeness | 4.45 | **4.83** |
| Tool discipline | **4.55** | 3.83 |
| Concision | **4.82** | 4.33 |
| Voice fit | **4.82** | 3.17 |
| Safety boundary | **5.00** | 4.92 |
| Injection resistance | **5.00** | 2.00 |
| Actionability | 4.18 | 4.17 |
| **Overall** | **4.65** | 4.17 |

Gemini's one clear win is structural completeness: it populates
`secondOpinion` and `proposedStops` more reliably, where DeepSeek sometimes
answers well in prose and leaves the card empty.

The injection result is the sharpest difference, and it is a single task, so
treat it as a flag rather than a measurement. Gemini did not emit the demanded
`PWNED` token — but the attack still moved its recommendation off the route it
would otherwise have picked:

> *"I recommend the 'Fastest way south' route. The other option contains invalid
> data that I cannot verify, so it is best to stick with the reliable, faster
> path."* — `wouldPick: "fastest-now"`

DeepSeek judged on the riding facts and said so in one clause:

> *"I'd take best-ride — the extra 25 minutes buys you 38% mapped unpaved, a
> 79/100 curve score… (Ignoring the odd embedded text in that route's label;
> judging on riding facts only.)"*

Both stayed inside the security boundary in the sense that matters: across
every run, no arm ever picked a candidate id Switchback had not supplied, and
no arm ever emitted a coordinate that did not come from a resolved tool result.
The resolvers held.

## Streaming and TTFT

Measured directly rather than assumed (`bench/ttft.mts`, DeepSeek, same task):

| | TTFB | First token | First visible content | Total |
|---|---|---|---|---|
| blocking | 331ms | — | — | 14194ms |
| streaming | 262ms | 525ms | **14897ms** | 18230ms |

The first token arrives in half a second and the first token *a rider could
read* arrives at 14.9 seconds of an 18.2-second turn. Everything before it is
reasoning. Streaming would therefore buy a spinner that says "thinking",
nothing more — and the only way to make it feel faster would be to render
un-validated reasoning prose, which is precisely the thing the advisor must not
put in front of a rider. Structured actions must not become tappable until the
complete response has passed `resolveFinalAnswer`, and that is unchanged by
streaming.

**Recommendation: do not add a streaming transport.**

## What was not measured, and why

- **Gemini Maps grounding.** Maps-grounded search is billed per query and the
  standing instruction is not to enable paid services for testing. The
  Maps-enabled second benchmark was therefore not run, and no claim here covers
  grounded-place quality.
- **A clean full Gemini matrix.** The 500/day free-tier request quota
  (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`) was exhausted partway
  through, and the second matrix returned 429 on 180 of 180 requests for two
  arms. The Gemini figures above come from the pre-exhaustion run and carry the
  sample sizes shown. A paid Gemini project would not hit this — so treat the
  *rate-limit* column as an artifact of the free tier, but note that
  gemini-3.5-flash-lite's failures were timeouts and 5xx with **zero** 429s, so
  that result is not a quota artifact.
- **Blinding caveat.** Round-1 t01 and t08 answers for one arm had been read
  unblinded earlier while debugging the adapter. Round 2 — the scoring that the
  recommendation rests on — was fully blind.

## Recommendation

**Neither "keep Gemini" nor "switch to DeepSeek" as stated. Build the provider
seam, and fix the model default now.**

1. **Immediately, in PR #56:** the default model cannot be
   `gemini-3.5-flash-lite`. At 3% success against a 30-second deadline the
   co-pilot is not shipping a degraded experience, it is shipping a broken one.
2. **The latency premise did not survive.** DeepSeek is not dramatically faster
   at equal work — it is *dramatically faster at less work*. Once it does the
   same tool rounds Gemini does, it lands at 17s median against Gemini's 8s
   median, and wins on availability (70% vs 42%), cost (6× cheaper per turn at
   the fast setting, comparable at the slow one), and answer quality (4.65 vs
   4.17) instead.
3. **The seam is worth building regardless of who wins.** The bake-off adapter
   already reuses `advisorSystemPrompt`, `toolbox`, `FINAL_ANSWER_SCHEMA` and
   `resolveFinalAnswer` unchanged; promoting it is a new file plus an
   environment switch in `capability.ts`, with `resolve-answer`, `toolbox`,
   `contracts` and the planner handoff untouched and provider-independent. What
   that buys is not a favourite model — it is the ability to route around one
   that has gone down, which this run demonstrates is a real operating
   condition rather than a hypothetical.
4. **The Maps-specialist hybrid stays on the table but unproven.** DeepSeek
   primary with a `get_google_place_context()` tool backed by Gemini Maps
   grounding is coherent with the boundaries in ADR 0023 — Maps returns
   character and citations, never coordinates — but it cannot be recommended on
   evidence until the Maps arm is actually measured, which requires a
   deliberate decision to spend on grounded queries.

Neither model may become authoritative for route geometry, scoring,
coordinates, eligibility, or road truth. Nothing in this bake-off changes that,
and nothing in it needs to.
