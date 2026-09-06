import { describe, expect, it } from "vitest"
import {
  createRideHistory,
  dispatchRideCommand,
  redoRideIntent,
  type RideCommand,
  undoRideIntent,
} from "@/lib/domain/ride-intent"

describe("whole ride intent", () => {
  it("reverses and redoes a compound destinationless ride edit as one change", () => {
    const initial = createRideHistory("ride-a")
    const edited = dispatchRideCommand(initial, {
      id: "edit-a", baseIdentity: initial.identity, source: "rider",
      type: "edit", label: "Updated ride preferences",
      changes: { mode: "loop", targetMinutes: 90, avoidHighways: true }
    })
    expect(edited.outcome).toBe("applied")
    expect(edited.state.intent.start).toBeNull()
    expect(edited.state.intent.finish).toBeNull()
    expect(edited.state.intent.targetMinutes).toBe(90)
    expect(edited.state.past).toHaveLength(1)
    const undone = undoRideIntent(edited.state)
    expect(undone.intent).toEqual(initial.intent)
    expect(undone.identity).not.toBe(initial.identity)
    const redone = redoRideIntent(undone)
    expect(redone.intent).toEqual(edited.state.intent)
    expect(redone.identity).not.toBe(edited.state.identity)
    expect(redone.lastChange?.source).toBe("redo")
  })

  it("keeps only the newest 50 applied revisions", () => {
    let state = createRideHistory("ride-history")

    for (let index = 1; index <= 51; index += 1) {
      const result = dispatchRideCommand(state, {
        id: `edit-${index}`, baseIdentity: state.identity, source: "rider",
        type: "edit", label: `Set target to ${index} minutes`,
        changes: { targetMinutes: index }
      })
      expect(result.outcome).toBe("applied")
      state = result.state
    }

    expect(state.sequence).toBe(51)
    expect(state.past).toHaveLength(50)
    expect(state.past[0]?.intent.targetMinutes).toBe(1)
    expect(state.past.at(-1)?.intent.targetMinutes).toBe(50)

    let rewound = state
    for (let index = 0; index < 50; index += 1) rewound = undoRideIntent(rewound)
    expect(rewound.intent.targetMinutes).toBe(1)
    expect(rewound.past).toHaveLength(0)
  })

  it("preserves identity and history for invalid and no-op commands", () => {
    const initial = createRideHistory("ride-stable")
    const applied = dispatchRideCommand(initial, {
      id: "edit-valid", baseIdentity: initial.identity, source: "rider",
      type: "edit", label: "Set a target", changes: { targetMinutes: 90 }
    })
    expect(applied.outcome).toBe("applied")

    const before = applied.state
    const invalid = dispatchRideCommand(before, {
      id: "edit-invalid", baseIdentity: before.identity, source: "rider",
      type: "edit", label: "Invalid target", changes: { targetMinutes: 0 }
    })
    expect(invalid.outcome).toBe("invalid")
    expect(invalid.state).toBe(before)
    expect(invalid.state.identity).toBe(before.identity)
    expect(invalid.state.past).toBe(before.past)

    const noop = dispatchRideCommand(before, {
      id: "edit-noop", baseIdentity: before.identity, source: "rider",
      type: "edit", label: "Repeat the same target", changes: { targetMinutes: 90 }
    })
    expect(noop.outcome).toBe("noop")
    expect(noop.state).toBe(before)
    expect(noop.state.identity).toBe(before.identity)
    expect(noop.state.past).toBe(before.past)
  })

  it("rejects a command whose base identity is stale", () => {
    const initial = createRideHistory("ride-stale")
    const applied = dispatchRideCommand(initial, {
      id: "edit-new", baseIdentity: initial.identity, source: "rider",
      type: "edit", label: "New target", changes: { targetMinutes: 150 }
    })
    expect(applied.outcome).toBe("applied")

    const stale = dispatchRideCommand(applied.state, {
      id: "edit-old", baseIdentity: initial.identity, source: "advisor",
      type: "edit", label: "Old target", changes: { targetMinutes: 180 }
    })
    expect(stale.outcome).toBe("stale")
    expect(stale.state).toBe(applied.state)
    expect(stale.state.intent.targetMinutes).toBe(150)
    expect(stale.state.past).toBe(applied.state.past)
  })

  it("rejects a repeated Apply submitted against the same base revision", () => {
    const initial = createRideHistory("ride-apply")
    const command: RideCommand = {
      id: "apply-once", baseIdentity: initial.identity, source: "advisor",
      type: "edit", label: "Apply advisor proposal", changes: { targetMinutes: 180 }
    }

    const first = dispatchRideCommand(initial, command)
    expect(first.outcome).toBe("applied")
    const repeated = dispatchRideCommand(first.state, command)
    expect(repeated.outcome).toBe("stale")
    expect(repeated.state).toBe(first.state)
    expect(repeated.state.past).toHaveLength(1)
  })

  it("clears redo when a new edit branches from an undone revision", () => {
    const initial = createRideHistory("ride-branch")
    const first = dispatchRideCommand(initial, {
      id: "edit-first", baseIdentity: initial.identity, source: "rider",
      type: "edit", label: "First target", changes: { targetMinutes: 90 }
    })
    expect(first.outcome).toBe("applied")
    const undone = undoRideIntent(first.state)
    expect(undone.future).toHaveLength(1)

    const branched = dispatchRideCommand(undone, {
      id: "edit-branch", baseIdentity: undone.identity, source: "settings",
      type: "edit", label: "Branched target", changes: { targetMinutes: 180 }
    })
    expect(branched.outcome).toBe("applied")
    expect(branched.state.intent.targetMinutes).toBe(180)
    expect(branched.state.future).toHaveLength(0)
    expect(redoRideIntent(branched.state)).toBe(branched.state)
  })

  it("cuts the redo branch when a non-history system edit diverges from it", () => {
    const initial = createRideHistory("ride-system-branch")
    const edited = dispatchRideCommand(initial, {
      id: "edit-rider", baseIdentity: initial.identity, source: "rider",
      type: "edit", label: "Rider target", changes: { targetMinutes: 90 }
    })
    expect(edited.outcome).toBe("applied")

    const undone = undoRideIntent(edited.state)
    expect(undone.intent.targetMinutes).toBe(initial.intent.targetMinutes)
    expect(undone.future).toHaveLength(1)
    expect(undone.future[0]!.intent.targetMinutes).toBe(90)

    // A system edit records no undo step, but it still changed the intent, so
    // the undone branch no longer describes this ride and must be dropped.
    const system = dispatchRideCommand(undone, {
      id: "edit-system", baseIdentity: undone.identity, source: "location",
      type: "edit", label: "Started from your location", recordHistory: false,
      changes: { start: { lat: 40.2, lon: -76.9, label: "Current position" } }
    })

    expect(system.outcome).toBe("applied")
    expect(system.state.future).toHaveLength(0)
    expect(redoRideIntent(system.state)).toBe(system.state)
    // Existing undo history is preserved, and the system change itself is not
    // a step the rider can undo.
    expect(system.state.past).toEqual(undone.past)
    expect(system.state.lastChange?.undoable).toBe(false)
    // The system edit's own result is intact.
    expect(system.state.intent.start).toEqual({ lat: 40.2, lon: -76.9, label: "Current position" })
    expect(system.state.intent.targetMinutes).toBe(initial.intent.targetMinutes)
    // Every earlier identity is now stale, so no result computed for the
    // rider's edit or for the undone state can commit against this ride.
    for (const superseded of [initial.identity, edited.state.identity, undone.identity]) {
      expect(system.state.identity).not.toBe(superseded)
      expect(dispatchRideCommand(system.state, {
        id: "late", baseIdentity: superseded, source: "rider",
        type: "edit", label: "Late work", changes: { profile: "scenic" }
      }).outcome).toBe("stale")
    }
  })

  it("leaves the redo branch alone when a system command changes nothing", () => {
    const initial = createRideHistory("ride-system-noop")
    const edited = dispatchRideCommand(initial, {
      id: "edit-rider", baseIdentity: initial.identity, source: "rider",
      type: "edit", label: "Rider target", changes: { targetMinutes: 90 }
    })
    const undone = undoRideIntent(edited.state)

    const noop = dispatchRideCommand(undone, {
      id: "edit-system-noop", baseIdentity: undone.identity, source: "settings",
      type: "edit", label: "Applied your rider defaults", recordHistory: false,
      changes: { targetMinutes: undone.intent.targetMinutes, profile: undone.intent.profile }
    })

    expect(noop.outcome).toBe("noop")
    expect(noop.state).toBe(undone)
    expect(noop.state.identity).toBe(undone.identity)
    expect(noop.state.future).toHaveLength(1)
    expect(redoRideIntent(noop.state).intent.targetMinutes).toBe(90)
  })

  it("detaches nested incoming command changes from the committed intent", () => {
    const initial = createRideHistory("ride-immutable")
    const incomingVia = [{ lat: 40.2, lon: -76.4, label: "Fuel stop" }]
    const command: RideCommand = {
      id: "edit-via", baseIdentity: initial.identity, source: "import",
      type: "edit", label: "Import a stop", changes: { via: incomingVia }
    }

    const applied = dispatchRideCommand(initial, command)
    expect(applied.outcome).toBe("applied")
    expect(applied.state.intent.via).toEqual(incomingVia)
    expect(applied.state.intent.via).not.toBe(incomingVia)

    incomingVia[0]!.lat = 41.2
    incomingVia.push({ lat: 40.3, lon: -76.5, label: "Later stop" })
    expect(applied.state.intent.via).toEqual([{ lat: 40.2, lon: -76.4, label: "Fuel stop" }])
  })
})
