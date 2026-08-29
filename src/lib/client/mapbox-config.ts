import type { MapExperienceConfig } from "./map-experience"

/**
 * Mapbox Standard slots. Switchback places every custom layer by slot so the
 * premium basemap can keep evolving without breaking route visibility
 * (ADR 0015). `critical` is Switchback's own name for "above everything,
 * including labels" — Mapbox has no such slot, so it is expressed as an
 * unslotted layer added last.
 */
export type SwitchbackMapSlot = "bottom" | "middle" | "top" | "critical"

/** The Mapbox slot id for a Switchback slot, or null when none applies. */
export function mapboxSlotFor(slot: SwitchbackMapSlot): "bottom" | "middle" | "top" | null {
  return slot === "critical" ? null : slot
}

export type MapboxRendererStatus =
  | { enabled: true; token: string }
  | { enabled: false; reason: "rollout-disabled" | "missing-token" }

function readToken(): string {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  return typeof token === "string" ? token.trim() : ""
}

function readRolloutFlag(): boolean {
  return process.env.NEXT_PUBLIC_SWITCHBACK_PREMIUM_MAPBOX === "true"
}

/**
 * The temporary phase-1 rollout gate: the premium renderer is off unless the
 * deployment opts in *and* a browser-authorized public token exists. A missing
 * token can never enable Mapbox, so a misconfigured deployment falls back to
 * the existing renderer instead of rendering a blank canvas.
 *
 * Phase 4 replaces this with the server-declared capability payload (ADR 0021).
 */
export function mapboxRendererStatus(
  env: { rollout?: boolean; token?: string } = {}
): MapboxRendererStatus {
  const rollout = env.rollout ?? readRolloutFlag()
  const token = (env.token ?? readToken()).trim()
  if (!rollout) return { enabled: false, reason: "rollout-disabled" }
  if (!token) return { enabled: false, reason: "missing-token" }
  return { enabled: true, token }
}

export function isPremiumMapboxRendererEnabled(): boolean {
  return mapboxRendererStatus().enabled
}

/**
 * Mapbox Standard exposes its presentation as style configuration rather than
 * separate styles, so a mode change is a set of config properties on the same
 * map instance — no extra map load.
 */
export function standardConfigProperties(
  experience: MapExperienceConfig
): Record<string, string | boolean> {
  return {
    lightPreset: experience.lightPreset,
    theme: experience.theme,
    show3dObjects: experience.show3dBuildings,
    showTransitLabels: false,
    showPlaceLabels: true,
    showRoadLabels: experience.showRoadLabels,
    showPointOfInterestLabels: experience.showPointOfInterestLabels
  }
}
