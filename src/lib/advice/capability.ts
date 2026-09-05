import path from "node:path"
import { CurvatureRepository } from "@/lib/curvature/repository"
import { createGeminiProvider } from "./gemini-adviser"
import { createOpenRouterProvider } from "./openrouter-adviser"
import { createRoutedAdviser, type AdvisorProviderPreference } from "./router"
import { createAdvisorToolbox } from "./toolbox"
import type { AdvisorProvider } from "./provider"
import type { RouteAdviser } from "./contracts"

/**
 * Server-declared advisor capability (ADR 0021).
 *
 * No key means the capability is absent: the API answers "disabled", the client
 * renders nothing, and core planning behavior is unchanged. Missing optional
 * sources remove only those sources.
 *
 * Either model key enables the advisor. `GEMINI_API_KEY` additionally enables
 * Maps grounding, which is Gemini-API-native; `ADVISOR_OPENROUTER_API_KEY`
 * enables the OpenAI-shaped transport. With both present, `ADVISOR_PROVIDER=auto` routes
 * each turn to whichever measured better for that turn's shape and fails over
 * on operational failures.
 *
 * `GEMINI_MAPS_GROUNDING=0` disables Maps grounding while retaining the local
 * conversation/tools. Maps defaults on for compatibility with ADR 0023, but it
 * has separate Gemini API pricing; `.env.example` carries the current cost
 * warning rather than pretending it is an API Free Tier feature.
 * `CURVATURE_DB_PATH` adds locally scored road/gravel lookup when available.
 */

export interface AdvisorCapability {
  enabled: boolean
  sources: Array<"switchback-local" | "switchback-roads" | "google-maps">
  attributions: string[]
}

export interface AdvisorEnvironment {
  readonly [key: string]: string | undefined
  readonly GEMINI_API_KEY?: string
  readonly GEMINI_ADVISOR_MODEL?: string
  readonly GEMINI_MAPS_GROUNDING?: string
  /**
   * Deliberately NOT `OPENROUTER_API_KEY`: that variable already enables
   * natural-language ride interpretation, and reusing it would silently turn
   * the co-pilot on — and start sending rider conversations to OpenRouter —
   * for every deployment that set it for the other feature. Enabling a
   * transport that egresses conversation has to be an explicit act.
   */
  readonly ADVISOR_OPENROUTER_API_KEY?: string
  readonly OPENROUTER_ADVISOR_MODEL?: string
  readonly ADVISOR_PROVIDER?: string
  readonly CURVATURE_DB_PATH?: string
  readonly PHOTON_URL?: string
}

const ABSENT: AdvisorCapability = { enabled: false, sources: [], attributions: [] }

/** Maps grounding is on unless explicitly switched off. */
export function mapsGroundingEnabled(env: AdvisorEnvironment): boolean {
  const flag = env.GEMINI_MAPS_GROUNDING?.trim().toLowerCase()
  return flag !== "0" && flag !== "false" && flag !== "off"
}

function curvaturePath(env: AdvisorEnvironment): string | null {
  const configured = env.CURVATURE_DB_PATH?.trim()
  return configured ? path.resolve(configured) : null
}

/**
 * Which transports a deployment asked for.
 *
 * An unrecognised value falls back to `auto` rather than failing the request:
 * a typo in an environment variable should not take the co-pilot offline when
 * a sensible behaviour is available.
 */
export function providerPreference(env: AdvisorEnvironment): AdvisorProviderPreference {
  const raw = env.ADVISOR_PROVIDER?.trim().toLowerCase()
  return raw === "gemini" || raw === "openrouter" ? raw : "auto"
}

export function resolveAdvisorCapability(env: AdvisorEnvironment): AdvisorCapability {
  const gemini = Boolean(env.GEMINI_API_KEY?.trim())
  const openrouter = Boolean(env.ADVISOR_OPENROUTER_API_KEY?.trim())
  if (!gemini && !openrouter) return ABSENT

  // Maps grounding is a Gemini-native tool, so it needs that key regardless of
  // which provider ends up answering a given turn.
  const maps = gemini && mapsGroundingEnabled(env)
  const roads = curvaturePath(env) !== null
  return {
    enabled: true,
    sources: [
      "switchback-local",
      ...(roads ? ["switchback-roads" as const] : []),
      ...(maps ? ["google-maps" as const] : [])
    ],
    attributions: [
      "Place data © OpenStreetMap contributors",
      ...(maps ? ["Grounded with Google Maps"] : [])
    ]
  }
}

export function createAdviserFromEnvironment(env: AdvisorEnvironment): RouteAdviser | null {
  const geminiKey = env.GEMINI_API_KEY?.trim()
  const openRouterKey = env.ADVISOR_OPENROUTER_API_KEY?.trim()
  if (!geminiKey && !openRouterKey) return null

  const databasePath = curvaturePath(env)
  const repository = databasePath ? new CurvatureRepository(databasePath) : null

  const toolbox = createAdvisorToolbox({
    ...(env.PHOTON_URL?.trim() ? { geocoderUrl: env.PHOTON_URL.trim() } : {}),
    ...(repository
      ? {
          queryRoads: (bounds) => {
            try {
              return repository.queryBounds(bounds)
            } catch {
              return []
            }
          }
        }
      : {})
  })

  const providers: AdvisorProvider[] = []
  if (geminiKey) {
    providers.push(createGeminiProvider({
      apiKey: geminiKey,
      ...(env.GEMINI_ADVISOR_MODEL?.trim() ? { model: env.GEMINI_ADVISOR_MODEL.trim() } : {}),
      mapsGrounding: mapsGroundingEnabled(env),
      toolbox
    }))
  }
  if (openRouterKey) {
    providers.push(createOpenRouterProvider({
      apiKey: openRouterKey,
      ...(env.OPENROUTER_ADVISOR_MODEL?.trim() ? { model: env.OPENROUTER_ADVISOR_MODEL.trim() } : {})
    }))
  }

  return createRoutedAdviser({
    toolbox,
    providers,
    preference: providerPreference(env),
    mapsGrounding: Boolean(geminiKey) && mapsGroundingEnabled(env)
  })
}
