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
 * The approved mobile model, in order. Four of these are places; Record is an
 * activity, kept beside them in `RECORD_NAV_ITEM` so the bar reads as one
 * navigation model without pretending Record changes where the rider is.
 */
export const PRIMARY_NAV_ITEMS: readonly PrimaryNavItem[] = [
  { destination: "plan", label: "Plan", icon: MapTrifold, href: "/" },
  { destination: "explore", label: "Explore", icon: Compass, href: "/?tab=explore" },
  { destination: "saved", label: "Saved", icon: Star, href: "/?tab=saved" },
  { destination: "settings", label: "Settings", icon: GearSix, href: "/?tab=settings" }
]

export const RECORD_NAV_ITEM = {
  label: "Record",
  icon: Record,
  /** Shows the Record surface; the rider still presses Start recording. */
  href: "/?open=record"
} as const
