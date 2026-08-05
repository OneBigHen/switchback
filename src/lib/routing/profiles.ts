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
    id: "balanced",
    label: "Balanced",
    description: "A practical blend of pace, road quality, and riding interest.",
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
  },
  {
    id: "gravel",
    label: "Gravel",
    description: "A surface-aware route that favors legal, rideable gravel.",
    engineProfile: "motorcycle_adventure"
  },
  {
    id: "avoid-highways",
    label: "Avoid Highways",
    description: "A route with a hard exclusion for motorways and trunk roads.",
    engineProfile: "motorcycle_fastest"
  },
  {
    id: "neural",
    label: "Neural",
    description: "A personalized baseline ranked by your local riding history.",
    engineProfile: "motorcycle_twisty"
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
