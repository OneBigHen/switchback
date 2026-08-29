/**
 * The ride HUD owns the lower surface's layout; MapStage owns the recenter
 * control's behaviour. The control renders into this slot so the two cannot
 * geometrically overlap, without MapStage having to give up its map state.
 */
export const RIDE_MAP_CONTROL_SLOT_ID = "ride-map-control-slot"

type SlotListener = () => void

let slotElement: HTMLElement | null = null
const listeners = new Set<SlotListener>()

/**
 * RideHud publishes its slot element through a ref. A remount (the HUD is
 * keyed by route id, so an accepted rejoin replaces it) publishes the new
 * element through this same path, and any portal already pointed at the old
 * node follows — a captured element in component state would go stale.
 */
export function setRideMapControlSlot(next: HTMLElement | null) {
  if (slotElement === next) return
  slotElement = next
  for (const listener of listeners) listener()
}

export function getRideMapControlSlot(): HTMLElement | null {
  return slotElement
}

export function subscribeRideMapControlSlot(listener: SlotListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
