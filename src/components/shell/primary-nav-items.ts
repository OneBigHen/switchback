import { Compass, GearSix, MapTrifold, Record, Star } from "@phosphor-icons/react"
import type { PrimaryDestination } from "@/lib/client/app-navigation"

export interface PrimaryNavItem {
  readonly destination: PrimaryDestination
  readonly label: string
  readonly icon: typeof MapTrifold
  /** Where this destination lives for pages rendered outside the app shell. */
  readonly href: string
}

/**
 * The approved mobile model is `Plan · Explore · Saved · Record · Settings`.
 *
 * Four of those are places; Record is an activity, so it keeps its own entry
 * (`RECORD_NAV_ITEM`) and its own marking. It still has to appear *between*
 * Saved and Settings, because that is the order riders were shown — hence the
 * split into the items before it and the items after it, rather than one list
 * with an activity smuggled into it.
 */
export const PRIMARY_NAV_ITEMS: readonly PrimaryNavItem[] = [
  { destination: "plan", label: "Plan", icon: MapTrifold, href: "/" },
  { destination: "explore", label: "Explore", icon: Compass, href: "/?tab=explore" },
  { destination: "saved", label: "Saved", icon: Star, href: "/?tab=saved" },
  { destination: "settings", label: "Settings", icon: GearSix, href: "/?tab=settings" }
]

/** How many destinations are drawn before the Record activity. */
export const NAV_ITEMS_BEFORE_RECORD = 3

export const RECORD_NAV_ITEM = {
  label: "Record",
  icon: Record,
  /** Shows the Record surface; the rider still presses Start recording. */
  href: "/?open=record"
} as const
