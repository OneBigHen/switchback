import type { RideCharacter } from "@/lib/ai/ride-intent"

const PROFILE_CHARACTER: Record<string, RideCharacter> = {
  balanced: "balanced",
  quick: "quick",
  twisty: "twisty",
  scenic: "scenic",
  adventure: "adventure",
  gravel: "gravel",
  "avoid-highways": "avoid-highways",
  neural: "neural"
}

/** Best-effort ride character for a routing profile (adviser input). */
export function characterForProfile(profile: string): RideCharacter {
  return PROFILE_CHARACTER[profile] ?? "balanced"
}
