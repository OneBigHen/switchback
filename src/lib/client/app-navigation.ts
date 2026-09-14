/**
 * The approved OpenGravel mobile model: Plan, Explore, Saved and Settings are
 * places; Record is an activity launched from the same bar (see
 * `AppNavigation`). `explore` owns route discovery and the GPX Library;
 * `saved` owns rider-owned, imported and recorded material.
 */
export type PrimaryDestination = "plan" | "explore" | "saved" | "settings"

export type AppMode = "explore" | "plan" | "ride" | "library"

export function appModeForState(input: {
  surface: "planner" | "library" | "ride" | "free-ride"
  destination: PrimaryDestination
  hasPlan: boolean
}): AppMode {
  if (input.surface === "ride" || input.surface === "free-ride") return "ride"
  if (input.surface === "library" || input.destination === "saved") return "library"
  return input.destination === "plan" && input.hasPlan ? "plan" : "explore"
}

export type AppOverlay =
  | "advanced-settings"
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
 * Destinations reachable through the ?tab= URL parameter. Superseded tab
 * values are migrated by `destinationFromLocation`, never reintroduced here.
 */
const DESTINATIONS_FROM_URL: ReadonlyArray<PrimaryDestination> = ["explore", "saved", "settings"]

/**
 * Superseded tab values, kept working so shared links and browser history
 * from earlier builds still land somewhere sensible.
 *
 * - `library` / `rides` were the rider's own material, now `saved`
 * - `discover` was community browsing, now folded into `explore`
 * - `profile` was the settings sheet, now the `settings` destination
 */
const MIGRATED_TABS: Readonly<Record<string, PrimaryDestination>> = {
  library: "saved",
  rides: "saved",
  discover: "explore",
  profile: "settings"
}

export interface LocationDestination {
  destination: PrimaryDestination
  overlays: AppOverlay[]
}

/**
 * Derive navigation state from the URL (deep links, reloads, browser Back).
 *
 * `?tab=record` keeps its historical meaning — Plan, with no overlay, because
 * recording is an activity that never auto-starts. `?open=record` is the
 * explicit request to *show* the Record surface, which pages outside the app
 * shell (the GPX Library) use to hand the rider back to it. Showing the panel
 * still starts nothing: the rider presses Start recording.
 */
export function destinationFromLocation(url: string): LocationDestination {
  try {
    const params = new URL(url).searchParams
    const tab = params.get("tab")
    const destination = MIGRATED_TABS[tab ?? ""]
      ?? (DESTINATIONS_FROM_URL.includes(tab as PrimaryDestination) ? tab as PrimaryDestination : "plan")
    const overlays: AppOverlay[] = params.get("open") === "record" ? ["record"] : []
    return { destination, overlays }
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
        // Re-selecting the active destination dismisses task overlays while
        // keeping the rider on the same top-level surface.
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
      if (action.overlay === "downloads") {
        return {
          ...state,
          overlays: [...state.overlays.filter((overlay) => overlay !== "advanced-settings"), action.overlay]
        }
      }
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
