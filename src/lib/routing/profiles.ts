import type { RouteProfileId } from "./types"

export interface RouteProfile {
  id: RouteProfileId
  label: string
  description: string
  engineProfile: string
}

const profiles: RouteProfile[] = [
  {
    id: "quick",
    label: "Quick",
    description: "The direct line when arrival time matters most.",
    engineProfile: "motorcycle_fastest"
  },
  {
    id: "twisty",
    label: "Twisty",
    description: "More direction changes and less time on major roads.",
    engineProfile: "motorcycle_twisty"
  },
  {
    id: "scenic",
    label: "Scenic",
    description: "Rural secondary roads with room to take the long way.",
    engineProfile: "motorcycle_scenic"
  },
  {
    id: "adventure",
    label: "Adventure",
    description: "Mixed-surface roads and approachable gravel connectors.",
    engineProfile: "motorcycle_adventure"
  }
]

export function listProfiles(): RouteProfile[] {
  return profiles.map((profile) => ({ ...profile }))
}

export function getProfile(id: RouteProfileId): RouteProfile {
  const profile = profiles.find((candidate) => candidate.id === id)
  if (!profile) {
    throw new Error(`Unknown motorcycle profile: ${id}`)
  }
  return { ...profile }
}
