import { describe, expect, it, vi } from "vitest"
import { classifyTurn, mapsAllowedForMode, toolsForMode } from "@/lib/advice/execution-policy"
import { createAdvisorToolbox } from "@/lib/advice/toolbox"
import { createGeminiProvider } from "@/lib/advice/gemini-adviser"
import { createOpenRouterProvider } from "@/lib/advice/openrouter-adviser"
import { advisorSystemPrompt } from "@/lib/advice/route-context"
import { createRoutedAdviser } from "@/lib/advice/router"
import { createAdviserFromEnvironment, providerPreference, resolveAdvisorCapability } from "@/lib/advice/capability"
import type { AdviceRequest, AdvisorRouteContext } from "@/lib/advice/contracts"
import type { AdvisorProvider } from "@/lib/advice/provider"

const context: AdvisorRouteContext = {
  selectedRouteId: "best-ride",
  candidates: [
    {
      id: "best-ride",
      name: "Best Ride",
      profile: "adventure",
      distanceMiles: 120,
      durationMinutes: 210,
      twistiness: 79,
      turnCount: 240,
      roadMix: {},
      surfaceMix: { unpaved: 0.38 }
    },
    {
      id: "fastest-now",
      name: "Fastest way south",
      profile: "quick",
      distanceMiles: 96,
      durationMinutes: 185,
      twistiness: 22,
      turnCount: 60,
      roadMix: {},
      surfaceMix: {}
    }
  ],
  geometry: [[-76.88, 40.27], [-77.03, 40.39]],
  warnings: []
}

function ask(riderMessage?: string, withContext = true): AdviceRequest {
  return {
    context: withContext ? context : null,
    conversation: [],
    ...(riderMessage ? { riderMessage } : {})
  }
}

describe("advisor execution policy", () => {
  it("classifies the brief's own examples exactly as specified", () => {
    // These six are the contract. If any of them moves, the latency behaviour
    // the rider experiences moves with it.
    expect(classifyTurn(ask("Worth the extra 20 minutes?"))).toBe("route-only")
    expect(classifyTurn(ask("Which route would you take?"))).toBe("route-only")
    expect(classifyTurn(ask("How much gravel does this have?"))).toBe("route-only")
    expect(classifyTurn(ask("Find coffee around halfway"))).toBe("tool-assisted")
    expect(classifyTurn(ask("Add a brewery near the end"))).toBe("tool-assisted")
    expect(classifyTurn(ask("Three hour gravel ride ending at a brewery"))).toBe("tool-assisted")
  })

  it("treats the opening read on a route as answerable from the briefing alone", () => {
    expect(classifyTurn(ask(undefined))).toBe("route-only")
  })

  it("always needs tools when there is no route to talk about", () => {
    // Building from scratch means pinning places, whatever the wording.
    expect(classifyTurn(ask("Worth the extra 20 minutes?", false))).toBe("tool-assisted")
    expect(classifyTurn(ask(undefined, false))).toBe("tool-assisted")
  })

  it("resolves an unrecognised question towards capability, not speed", () => {
    // The failure modes are not symmetric: a route-only turn that needed tools
    // answers worse, a tool-assisted turn that did not is merely slower.
    expect(classifyTurn(ask("mmm not sure about this one honestly"))).toBe("tool-assisted")
  })

  it("does not read a place noun out of an unrelated word", () => {
    // "stopped" must not register as a request for a "stop".
    expect(classifyTurn(ask("Why has the twistiness dropped compared to the other one?")))
      .toBe("route-only")
  })

  it("never classifies a turn as maps-specialist on its own", () => {
    // Paid grounding is an explicit opt-in, never something a classifier infers.
    const everything = [
      "Worth it?", "Find coffee nearby", "Add a brewery", "What do you think?",
      "How much gravel?", "Build me a three hour loop"
    ]
    for (const message of everything) {
      expect(classifyTurn(ask(message))).not.toBe("maps-specialist")
    }
  })

  it("exposes no tool declarations at all for a route-only turn", () => {
    const toolbox = createAdvisorToolbox({})
    const input = ask("Worth the extra 20 minutes?")
    expect(toolsForMode("route-only", toolbox, input)).toEqual([])
    // The same toolbox does offer tools when the mode calls for them, so the
    // empty list above is the mode's doing and not an empty toolbox.
    expect(toolsForMode("tool-assisted", toolbox, input).length).toBeGreaterThan(0)
  })

  it("never attaches paid Maps grounding to a route-only turn", () => {
    expect(mapsAllowedForMode("route-only", true)).toBe(false)
    expect(mapsAllowedForMode("tool-assisted", true)).toBe(true)
    expect(mapsAllowedForMode("tool-assisted", false)).toBe(false)
  })

  it("tells the model it has no tools rather than advertising ones it cannot call", () => {
    const prompt = advisorSystemPrompt(ask("Worth it?"), "route-only")
    expect(prompt).toContain("THIS TURN HAS NO TOOLS")
    expect(advisorSystemPrompt(ask("Find coffee"), "tool-assisted"))
      .not.toContain("THIS TURN HAS NO TOOLS")
  })
})

/** Capture exactly what each provider put on the wire. */
function recordingFetch(body: unknown) {
  const bodies: Array<Record<string, unknown>> = []
  const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" }
    })
  }) as unknown as typeof fetch
  return { fetcher, bodies }
}

const ANSWER = JSON.stringify({ message: "Take the gravel — the 25 minutes buy real dirt." })

describe("route-only turns cannot enter a tool round", () => {
  it("sends no tools to Gemini and asks exactly once", async () => {
    const { fetcher, bodies } = recordingFetch({
      candidates: [{ content: { parts: [{ text: ANSWER }] } }]
    })
    const toolbox = createAdvisorToolbox({})
    const input = ask("Worth the extra 20 minutes?")

    const reply = await createGeminiProvider({ apiKey: "k", fetcher, toolbox }).runTurn({
      request: input,
      mode: "route-only",
      tools: toolsForMode("route-only", toolbox, input),
      toolbox,
      systemPrompt: advisorSystemPrompt(input, "route-only"),
      mapsGrounding: false
    })

    expect(reply.reply.status).toBe("ok")
    // One request is the whole point of the mode.
    expect(bodies).toHaveLength(1)
    // No declarations and no google_maps: nothing can call back.
    expect(bodies[0]!.tools).toBeUndefined()
    expect(reply.reply.usage.toolCalls).toBe(0)
    // The schema still rides along, so the answer is structured on the one pass.
    const generation = bodies[0]!.generationConfig as Record<string, unknown>
    expect(generation.responseJsonSchema).toBeDefined()
  })

  it("sends no tools to OpenRouter and asks exactly once", async () => {
    const { fetcher, bodies } = recordingFetch({
      choices: [{ message: { role: "assistant", content: ANSWER } }]
    })
    const toolbox = createAdvisorToolbox({})
    const input = ask("Which route would you take?")

    const reply = await createOpenRouterProvider({ apiKey: "k", fetcher }).runTurn({
      request: input,
      mode: "route-only",
      tools: toolsForMode("route-only", toolbox, input),
      toolbox,
      systemPrompt: advisorSystemPrompt(input, "route-only"),
      mapsGrounding: false
    })

    expect(reply.reply.status).toBe("ok")
    expect(bodies).toHaveLength(1)
    expect(bodies[0]!.tools).toBeUndefined()
    expect(bodies[0]!.tool_choice).toBeUndefined()
    expect(reply.reply.usage.toolCalls).toBe(0)
    expect(bodies[0]!.response_format).toBeDefined()
  })

  it("caps reasoning on a route-only turn, where thinking is the whole cost", async () => {
    const { fetcher, bodies } = recordingFetch({
      choices: [{ message: { role: "assistant", content: ANSWER } }]
    })
    const toolbox = createAdvisorToolbox({})
    const input = ask("Worth the extra 20 minutes?")
    const provider = createOpenRouterProvider({ apiKey: "k", fetcher })

    await provider.runTurn({
      request: input,
      mode: "route-only",
      tools: [],
      toolbox,
      systemPrompt: advisorSystemPrompt(input, "route-only"),
      mapsGrounding: false
    })
    // Measured: 8685ms at default effort vs 3059ms at minimal on the same
    // question. One round trip means reasoning is the remaining cost.
    expect(bodies[0]!.reasoning).toEqual({ effort: "minimal" })

    // Tool-assisted must not inherit the cap: there, round trips dominate and
    // the same setting bought nothing while costing success rate.
    bodies.length = 0
    const toolInput = ask("Find coffee around halfway")
    await provider.runTurn({
      request: toolInput,
      mode: "tool-assisted",
      tools: toolsForMode("tool-assisted", toolbox, toolInput),
      toolbox,
      systemPrompt: advisorSystemPrompt(toolInput, "tool-assisted"),
      mapsGrounding: false
    })
    expect(bodies[0]!.reasoning).toBeUndefined()
  })

  it("still sends tools when the turn actually needs them", async () => {
    // The guard above must come from the mode, not from a provider that
    // silently stopped sending declarations altogether.
    const { fetcher, bodies } = recordingFetch({
      candidates: [{ content: { parts: [{ text: ANSWER }] } }]
    })
    const toolbox = createAdvisorToolbox({})
    const input = ask("Find coffee around halfway")

    await createGeminiProvider({ apiKey: "k", fetcher, toolbox }).runTurn({
      request: input,
      mode: "tool-assisted",
      tools: toolsForMode("tool-assisted", toolbox, input),
      toolbox,
      systemPrompt: advisorSystemPrompt(input, "tool-assisted"),
      mapsGrounding: false
    })

    expect(bodies[0]!.tools).toBeDefined()
  })

  it("routes a route-only question through the seam without exposing tools", async () => {
    const { fetcher, bodies } = recordingFetch({
      choices: [{ message: { role: "assistant", content: ANSWER } }]
    })
    const toolbox = createAdvisorToolbox({})
    const adviser = createRoutedAdviser({
      toolbox,
      providers: [createOpenRouterProvider({ apiKey: "k", fetcher })],
      preference: "auto",
      mapsGrounding: true
    })

    const reply = await adviser.advise(ask("Worth the extra 20 minutes?"))
    expect(reply.status).toBe("ok")
    expect(bodies).toHaveLength(1)
    expect(bodies[0]!.tools).toBeUndefined()
  })
})

/** A provider that always returns one fixed status, for routing assertions. */
function stubProvider(id: string, status: string, calls: string[]): AdvisorProvider {
  return {
    id,
    async runTurn() {
      calls.push(id)
      return {
        reply: {
          status: status as never,
          message: status === "ok" ? "fine" : "",
          secondOpinion: null,
          proposedStops: [],
          proposedRide: null,
          citations: [],
          usage: { toolCalls: 0, groundedQueries: 0 }
        },
        modelId: `${id}-model`
      }
    }
  }
}

describe("provider routing and failover", () => {
  const toolbox = createAdvisorToolbox({})

  function adviserWith(
    providers: AdvisorProvider[],
    preference: "auto" | "gemini" | "openrouter" = "auto"
  ) {
    const records: unknown[] = []
    const adviser = createRoutedAdviser({
      toolbox, providers, preference, mapsGrounding: false,
      onTurn: (record) => records.push(record)
    })
    return { adviser, records }
  }

  it("prefers the one-shot provider for route-only and Gemini for tool-assisted", async () => {
    const calls: string[] = []
    const { adviser } = adviserWith([
      stubProvider("gemini", "ok", calls),
      stubProvider("openrouter", "ok", calls)
    ])

    await adviser.advise(ask("Worth the extra 20 minutes?"))
    expect(calls).toEqual(["openrouter"])

    calls.length = 0
    await adviser.advise(ask("Find coffee around halfway"))
    expect(calls).toEqual(["gemini"])
  })

  it("fails over on an operational failure and records who answered", async () => {
    const calls: string[] = []
    const { adviser, records } = adviserWith([
      stubProvider("gemini", "ok", calls),
      stubProvider("openrouter", "rate-limited", calls)
    ])

    const reply = await adviser.advise(ask("Worth it?"))
    expect(calls).toEqual(["openrouter", "gemini"])
    expect(reply.status).toBe("ok")
    expect((records[0] as { answeredBy: string }).answeredBy).toBe("gemini")
    expect((records[0] as { attempts: unknown[] }).attempts).toHaveLength(2)
  })

  it.each(["timeout", "unavailable", "rate-limited"])(
    "treats %s as retryable",
    async (status) => {
      const calls: string[] = []
      const { adviser } = adviserWith([
        stubProvider("gemini", "ok", calls),
        stubProvider("openrouter", status, calls)
      ])
      await adviser.advise(ask("Worth it?"))
      expect(calls).toEqual(["openrouter", "gemini"])
    }
  )

  it("never retries a resolver rejection through another provider", async () => {
    // `malformed` means a model answered and the deterministic resolvers
    // refused it. Shopping that around until one passes would turn the
    // resolvers from a boundary into an obstacle.
    const calls: string[] = []
    const { adviser } = adviserWith([
      stubProvider("gemini", "ok", calls),
      stubProvider("openrouter", "malformed", calls)
    ])

    const reply = await adviser.advise(ask("Worth it?"))
    expect(calls).toEqual(["openrouter"])
    expect(reply.status).toBe("malformed")
  })

  it("honours an explicitly pinned provider and does not fail over past it", async () => {
    const calls: string[] = []
    const { adviser } = adviserWith([
      stubProvider("gemini", "unavailable", calls),
      stubProvider("openrouter", "ok", calls)
    ], "gemini")

    const reply = await adviser.advise(ask("Worth it?"))
    // A pin is a deployment's deliberate choice; silently using the other
    // provider would ignore it.
    expect(calls).toEqual(["gemini"])
    expect(reply.status).toBe("unavailable")
  })

  it("works as a single-provider deployment", async () => {
    const calls: string[] = []
    const { adviser } = adviserWith([stubProvider("gemini", "ok", calls)])
    const reply = await adviser.advise(ask("Worth the extra 20 minutes?"))
    // Route-only prefers openrouter, but only one provider exists.
    expect(calls).toEqual(["gemini"])
    expect(reply.status).toBe("ok")
  })
})

describe("capability wiring for the provider seam", () => {
  it("does not enable the advisor from the ride-intent OpenRouter key", () => {
    // OPENROUTER_API_KEY already enables natural-language ride interpretation.
    // Reusing it here would silently switch the co-pilot on, and start sending
    // rider conversations to OpenRouter, for every deployment that set it for
    // that unrelated feature.
    const env = { OPENROUTER_API_KEY: "ride-intent-key" }
    expect(resolveAdvisorCapability(env).enabled).toBe(false)
    expect(createAdviserFromEnvironment(env)).toBeNull()
  })

  it("enables the advisor from either dedicated key alone", () => {
    expect(resolveAdvisorCapability({ GEMINI_API_KEY: "g" }).enabled).toBe(true)
    expect(resolveAdvisorCapability({ ADVISOR_OPENROUTER_API_KEY: "o" }).enabled).toBe(true)
    expect(resolveAdvisorCapability({}).enabled).toBe(false)
  })

  it("only claims Google Maps as a source when the Gemini key can actually ground", () => {
    // Maps grounding is Gemini-API-native, so an OpenRouter-only deployment
    // must not advertise it or carry its attribution.
    const openRouterOnly = resolveAdvisorCapability({ ADVISOR_OPENROUTER_API_KEY: "o" })
    expect(openRouterOnly.sources).not.toContain("google-maps")
    expect(openRouterOnly.attributions).not.toContain("Grounded with Google Maps")

    const withGemini = resolveAdvisorCapability({ GEMINI_API_KEY: "g" })
    expect(withGemini.sources).toContain("google-maps")
  })

  it("falls back to auto rather than going offline on a typo", () => {
    expect(providerPreference({ ADVISOR_PROVIDER: "gemini" })).toBe("gemini")
    expect(providerPreference({ ADVISOR_PROVIDER: "openrouter" })).toBe("openrouter")
    expect(providerPreference({ ADVISOR_PROVIDER: "gemeni" })).toBe("auto")
    expect(providerPreference({})).toBe("auto")
  })
})
