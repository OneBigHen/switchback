import { usePlannerStore } from "@/stores/planner-store"

export type MapEditCommand = "exclude-area" | "prefer-road"

const MAP_EDIT_EVENT = "switchback:map-edit"

const EDIT_SURFACE_SELECTOR: Record<MapEditCommand, string> = {
  "exclude-area": '[role="region"][aria-label="Draw an avoid area"]',
  "prefer-road": '[role="region"][aria-label="Road lock draft"]'
}

const EDIT_TRIGGER_SELECTOR: Record<MapEditCommand, string> = {
  "exclude-area": 'button[aria-label="Exclude an area on map"]',
  "prefer-road": 'button[aria-label="Prefer a road on map"]'
}

interface ActiveMapEditFocus {
  token: number
  command: MapEditCommand
  previousDetent: ReturnType<typeof usePlannerStore.getState>["sheetDetentOverride"]
  trigger: HTMLElement | null
  observer: MutationObserver | null
}

let focusToken = 0
let activeFocus: ActiveMapEditFocus | null = null

function stopActiveObserver(): void {
  activeFocus?.observer?.disconnect()
}

function restoreMapEditFocus(active: ActiveMapEditFocus): void {
  if (activeFocus?.token !== active.token) return
  active.observer?.disconnect()
  activeFocus = null
  usePlannerStore.getState().setSheetDetentOverride(active.previousDetent)

  // Restoring the detent may remount the planner. Prefer the original element
  // when it survived; otherwise resolve the semantic trigger after the sheet
  // has rendered again.
  window.setTimeout(() => {
    const trigger = active.trigger && document.contains(active.trigger)
      ? active.trigger
      : document.querySelector<HTMLElement>(EDIT_TRIGGER_SELECTOR[active.command])
    trigger?.focus({ preventScroll: true })
  }, 0)
}

function focusEditSurface(active: ActiveMapEditFocus, attempts = 0): void {
  if (activeFocus?.token !== active.token) return
  const surface = document.querySelector<HTMLElement>(EDIT_SURFACE_SELECTOR[active.command])
  if (!surface) {
    if (attempts < 12) window.setTimeout(() => focusEditSurface(active, attempts + 1), 0)
    return
  }

  // Regions are intentionally programmatically focusable, not added to the
  // normal Tab order. This makes the mode change explicit to keyboard users
  // without creating another stop during ordinary map navigation.
  if (!surface.hasAttribute("tabindex")) surface.tabIndex = -1
  surface.focus({ preventScroll: true })

  const observer = new MutationObserver(() => {
    if (!document.contains(surface)) restoreMapEditFocus(active)
  })
  observer.observe(document.body, { childList: true, subtree: true })
  active.observer = observer
}

/**
 * Start a contextual map edit without introducing a second editor state
 * machine. The planner requests the action; map-owned draft subscribers react
 * to the same desired mode, while this bridge owns sheet/focus lifecycle.
 */
export function requestMapEdit(command: MapEditCommand): void {
  if (typeof window === "undefined") return

  const store = usePlannerStore.getState()
  const previousDetent = activeFocus?.previousDetent ?? store.sheetDetentOverride
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const trigger = activeElement?.matches(EDIT_TRIGGER_SELECTOR[command])
    ? activeElement
    : document.querySelector<HTMLElement>(EDIT_TRIGGER_SELECTOR[command])

  stopActiveObserver()
  const active: ActiveMapEditFocus = {
    token: ++focusToken,
    command,
    previousDetent,
    trigger,
    observer: null
  }
  activeFocus = active

  // Give the map usable space before the map-owned draft begins. Using the
  // existing shared detent keeps phone and desktop behavior consistent.
  store.setSheetDetentOverride("peek")
  window.dispatchEvent(new CustomEvent<MapEditCommand>(MAP_EDIT_EVENT, { detail: command }))
  focusEditSurface(active)
}

export function subscribeMapEdit(
  listener: (command: MapEditCommand) => void
): () => void {
  if (typeof window === "undefined") return () => undefined
  const handle = (event: Event) => {
    const command = (event as CustomEvent<MapEditCommand>).detail
    if (command === "exclude-area" || command === "prefer-road") listener(command)
  }
  window.addEventListener(MAP_EDIT_EVENT, handle)
  return () => window.removeEventListener(MAP_EDIT_EVENT, handle)
}
