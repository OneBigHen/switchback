export type RouteSculptFenceSchedule = (callback: () => void) => unknown
export type RouteSculptFenceCancel = (handle: unknown) => void

export interface RouteSculptClickFence {
  /** True for the browser-generated click immediately following a pointer release. */
  blocked(): boolean
  /** Block all map click handlers until the next event-loop task. */
  arm(): void
  /** Clear any pending block immediately, used for cancellation/unmount. */
  cancel(): void
}

/**
 * Pointer-up on the MapLibre canvas is followed by a click event. A sculpt
 * release must fence that whole click dispatch — both the generic map click
 * handler and layer-specific alternate-route handlers — without consuming the
 * fence in whichever handler happens to run first. The fence clears on the
 * next task so an unrelated rider click is never swallowed.
 */
export function createRouteSculptClickFence(
  schedule: RouteSculptFenceSchedule = (callback) => window.setTimeout(callback, 0),
  cancelSchedule: RouteSculptFenceCancel = (handle) => window.clearTimeout(handle as number)
): RouteSculptClickFence {
  let armed = false
  let pending: unknown | null = null

  const clearPending = () => {
    if (pending !== null) cancelSchedule(pending)
    pending = null
  }

  return {
    blocked: () => armed,
    arm: () => {
      clearPending()
      armed = true
      pending = schedule(() => {
        armed = false
        pending = null
      })
    },
    cancel: () => {
      clearPending()
      armed = false
    }
  }
}
