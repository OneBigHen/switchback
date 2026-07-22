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
  | { type: "set_theme"; theme: ThemePreference }

export function createInitialAppNavigationState(theme: ThemePreference): AppNavigationState {
  return { activeTab: "plan", overlays: [], backStack: [], theme }
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
    case "set_theme":
      return action.theme === state.theme ? state : { ...state, theme: action.theme }
  }
}
