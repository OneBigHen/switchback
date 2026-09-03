import { usePlannerStore } from "@/stores/planner-store"

export type MapEditCommand = "exclude-area" | "prefer-road"

const MAP_EDIT_EVENT = "switchback:map-edit"

/**
 * Start a contextual map edit without introducing a second editor state
 * machine. The planner only requests the action; PlannerMapStage remains the
 * owner of the in-progress geometry/road draft.
 */
export function requestMapEdit(command: MapEditCommand): void {
  if (typeof window === "undefined") return
  // Give the map usable space before the map-owned draft begins. Using the
  // existing shared detent keeps phone and desktop behavior consistent.
  usePlannerStore.getState().setSheetDetentOverride("peek")
  window.dispatchEvent(new CustomEvent<MapEditCommand>(MAP_EDIT_EVENT, { detail: command }))
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
