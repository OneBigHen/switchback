export type PrimaryDestination = "plan" | "rides" | "discover"

export type AppMode = "explore" | "plan" | "ride" | "library"

export function appModeForState(input: {
  surface: "planner" | "library" | "ride" | "free-ride"
  destination: PrimaryDestination
  hasPlan: boolean
}): AppMode {
  if (input.surface === "ride" || input.surface === "free-ride") return "ride"
  if (input.surface === "library" || input.destination === "rides") return "library"
  return input.destination === "plan" && input.hasPlan ? "plan" : "explore"
}

export type AppOverlay =
  | "settings"
  | "record"
  | "route-details"
  | "weather"
  | "trip-stages"
  | "downloads"
  | "waypoint-search"
  | "road-locks"
  | "recovery"

export type ThemePreference = "auto" | "light" | "dark"

export interface AppBackStackEntry {
  kind: "destination"
  destination: PrimaryDestination
}

export interface AppNavigationState {
  destination: PrimaryDestination
  overlays: AppOverlay[]
  backStack: AppBackStackEntry[]
  theme: ThemePreference
}

export type AppNavigationAction =
  | { type: "select_destination"; destination: PrimaryDestination }
  | { type: "open_overlay"; overlay: AppOverlay }
  | { type: "close_overlay"; overlay?: AppOverlay }
  | { type: "back" }
  | { type: "restore_destination"; destination: PrimaryDestination; overlays: AppOverlay[] }
  | { type: "set_theme"; theme: ThemePreference }

/**
 * V2 destinations reachable through the ?tab= URL parameter. Legacy V1 tab
 * values are migrated by `destinationFromLocation`, never reintroduced here.
 */
const DESTINATIONS_FROM_URL: ReadonlyArray<PrimaryDestination> = ["rides", "discover"]

export interface LocationDestination {
  destination: PrimaryDestination
  overlays: AppOverlay[]
}

/**
 * Derive the V2 navigation state from a ?tab= URL parameter (deep links,
 * reloads, browser Back). Legacy V1 tabs migrate rather than break:
 * - ?tab=library → the Rides destination
 * - ?tab=profile → Plan with the settings overlay open
 * - ?tab=record  → Plan; recording is an activity and never auto-starts
 */
export function destinationFromLocation(url: string): LocationDestination {
  try {
    const tab = new URL(url).searchParams.get("tab")
    if (tab === "library") return { destination: "rides", overlays: [] }
    if (tab === "profile") return { destination: "plan", overlays: ["settings"] }
    if (DESTINATIONS_FROM_URL.includes(tab as PrimaryDestination)) {
      return { destination: tab as PrimaryDestination, overlays: [] }
    }
    return { destination: "plan", overlays: [] }
  } catch {
    return { destination: "plan", overlays: [] }
  }
}

export function createInitialAppNavigationState(theme: ThemePreference): AppNavigationState {
  return { destination: "plan", overlays: [], backStack: [], theme }
}

export function appNavigationReducer(
  state: AppNavigationState,
  action: AppNavigationAction
): AppNavigationState {
  switch (action.type) {
    case "select_destination": {
      if (action.destination === state.destination) {
        // Re-selecting the active destination dismisses overlay panels
        // (e.g. a legacy ?tab=profile deep link leaves Settings open on
        // Plan; tapping Plan returns the rider to the map).
        return state.overlays.length > 0 ? { ...state, overlays: [] } : state
      }
      return {
        ...state,
        destination: action.destination,
        overlays: [],
        backStack: [...state.backStack, { kind: "destination", destination: state.destination }]
      }
    }
    case "open_overlay":
      if (state.overlays.includes(action.overlay)) return state
      return { ...state, overlays: [...state.overlays, action.overlay] }
    case "close_overlay": {
      if (state.overlays.length === 0) return state
      if (!action.overlay) return { ...state, overlays: state.overlays.slice(0, -1) }
      return { ...state, overlays: state.overlays.filter((overlay) => overlay !== action.overlay) }
    }
    case "back": {
      if (state.overlays.length > 0) {
        return { ...state, overlays: state.overlays.slice(0, -1) }
      }
      const previous = state.backStack.at(-1)
      if (!previous) return state
      return {
        ...state,
        destination: previous.destination,
        backStack: state.backStack.slice(0, -1)
      }
    }
    case "restore_destination":
      // Browser Back / URL navigation: replace URL-derived state without
      // recording a new history entry or pushing to the back stack. Overlays
      // are replaced wholesale so popstate can never merge stale UI state.
      return action.destination === state.destination
        ? { ...state, overlays: action.overlays }
        : { ...state, destination: action.destination, overlays: action.overlays }
    case "set_theme":
      return action.theme === state.theme ? state : { ...state, theme: action.theme }
  }
}
