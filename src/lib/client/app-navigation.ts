export type AppTab = "plan" | "library" | "record" | "profile"

export type AppOverlay =
  | "route-details"
  | "weather"
  | "trip-stages"
  | "downloads"
  | "waypoint-search"
  | "spotify"
  | "road-locks"
  | "recovery"

export type ThemePreference = "auto" | "light" | "dark"

export interface AppBackStackEntry {
  kind: "tab"
  tab: AppTab
}

export interface AppNavigationState {
  activeTab: AppTab
  overlays: AppOverlay[]
  backStack: AppBackStackEntry[]
  theme: ThemePreference
}

export type AppNavigationAction =
  | { type: "select_tab"; tab: AppTab }
  | { type: "open_overlay"; overlay: AppOverlay }
  | { type: "close_overlay"; overlay?: AppOverlay }
  | { type: "back" }
  | { type: "restore_tab"; tab: AppTab }
  | { type: "set_theme"; theme: ThemePreference }

const TABS_FROM_URL: ReadonlyArray<AppTab> = ["library", "record", "profile"]

/** Derive the active tab from a ?tab= URL parameter (deep links, reloads). */
export function tabFromLocation(url: string): AppTab {
  try {
    const tab = new URL(url).searchParams.get("tab")
    return TABS_FROM_URL.includes(tab as AppTab) ? tab as AppTab : "plan"
  } catch {
    return "plan"
  }
}

export function createInitialAppNavigationState(theme: ThemePreference): AppNavigationState {
  const tab = typeof window === "undefined" ? "plan" : tabFromLocation(window.location.href)
  return { activeTab: tab, overlays: [], backStack: [], theme }
}

export function appNavigationReducer(
  state: AppNavigationState,
  action: AppNavigationAction
): AppNavigationState {
  switch (action.type) {
    case "select_tab":
      if (action.tab === state.activeTab) return state
      return {
        ...state,
        activeTab: action.tab,
        overlays: [],
        backStack: [...state.backStack, { kind: "tab", tab: state.activeTab }]
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
        activeTab: previous.tab,
        backStack: state.backStack.slice(0, -1)
      }
    }
    case "restore_tab":
      // Browser Back / URL navigation: switch the tab without recording a new
      // history entry or pushing to the back stack.
      return action.tab === state.activeTab
        ? { ...state, overlays: [] }
        : { ...state, activeTab: action.tab, overlays: [] }
    case "set_theme":
      return action.theme === state.theme ? state : { ...state, theme: action.theme }
  }
}
