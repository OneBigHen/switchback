import Dexie, { type EntityTable } from "dexie"
import { isRideIntent, type RideIntent } from "@/lib/domain/ride-intent"

/**
 * Wave 1 checkpoints **authored intent only**.
 *
 * Route candidates are answers to an intent, not the ride itself. Replaying a
 * stored answer would either duplicate route geometry into a second store or
 * risk drawing yesterday's roads under today's ride, so recovery restores what
 * the rider asked for and the planner re-asks for the route. The rider gets
 * the same ride back; the answer is always freshly earned.
 *
 * The known cost: recovering with no connectivity restores the ride but not a
 * drawn route. Offline route packs remain the owner of the offline case.
 */
export interface RideCheckpointInput {
  rideId: string
  identity: string
  sequence: number
  intent: RideIntent
}
export interface RideCheckpoint extends RideCheckpointInput {
  id: "active"
  version: 1
  /** Rotated on every write. Whoever holds the current one owns the next write. */
  token: string
}
export type CheckpointLoad = { status: "restored"; checkpoint: RideCheckpoint }
  | { status: "empty" | "invalid" | "incompatible" | "unavailable" }
export type CheckpointSave = { status: "saved"; token: string }
  | { status: "conflict" | "invalid" | "unavailable" }

class CheckpointDatabase extends Dexie {
  checkpoints!: EntityTable<RideCheckpoint, "id">
  constructor(name: string) {
    super(name)
    this.version(1).stores({ checkpoints: "&id" })
  }
}

function validInput(value: RideCheckpointInput): boolean {
  return Boolean(value) && typeof value === "object"
    && typeof value.rideId === "string" && value.rideId.length > 0
    && typeof value.identity === "string" && value.identity.length > 0
    && Number.isSafeInteger(value.sequence) && value.sequence >= 0
    && isRideIntent(value.intent)
}

/** A dedicated DB keeps checkpoint migration/rollback away from all libraries. */
export class RideCheckpointStore {
  private readonly database: CheckpointDatabase
  constructor(name = "switchback-ride-intent") { this.database = new CheckpointDatabase(name) }

  async load(): Promise<CheckpointLoad> {
    try {
      const value = await this.database.checkpoints.get("active")
      if (!value) return { status: "empty" }
      if (value.version !== 1) return { status: "incompatible" }
      if (typeof value.token !== "string" || !value.token || !validInput(value)) return { status: "invalid" }
      return { status: "restored", checkpoint: value }
    } catch { return { status: "unavailable" } }
  }

  /**
   * Compare-and-swap on the write token: whoever last read the record owns the
   * next write. A second tab that saved in the meantime has rotated the token,
   * so this write is refused rather than silently overwriting newer work.
   *
   * Sequence numbers are deliberately *not* a conflict rule. Within one tab
   * they only ever move forward, and a tab that legitimately starts a fresh
   * ride over an old draft would otherwise be locked out of saving entirely.
   */
  async save(input: RideCheckpointInput, expectedToken: string | null): Promise<CheckpointSave> {
    if (!validInput(input)) return { status: "invalid" }
    try {
      const next: RideCheckpoint = { ...structuredClone(input), id: "active", version: 1, token: crypto.randomUUID() }
      return await this.database.transaction("rw", this.database.checkpoints, async () => {
        const current = await this.database.checkpoints.get("active")
        if ((current?.token ?? null) !== expectedToken) return { status: "conflict" as const }
        // A corrupt/unknown record is preserved, never silently overwritten.
        if (current && (current.version !== 1 || !validInput(current))) return { status: "invalid" as const }
        // The same identity must always describe the same intent, or the
        // identity has stopped being an identity.
        if (current && current.identity === input.identity
          && JSON.stringify(current.intent) !== JSON.stringify(input.intent)) return { status: "conflict" as const }
        await this.database.checkpoints.put(next)
        return { status: "saved" as const, token: next.token }
      })
    } catch { return { status: "unavailable" } }
  }

  close(): void { this.database.close() }
}
