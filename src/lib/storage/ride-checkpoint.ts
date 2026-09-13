import Dexie, { type EntityTable } from "dexie"
import { isRideIntent, migrateRideIntent, type RideIntent } from "@/lib/domain/ride-intent"

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

/** JSON with object keys sorted at every depth, so equal intents compare equal regardless of key order. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, nested: unknown) =>
    nested && typeof nested === "object" && !Array.isArray(nested)
      ? Object.fromEntries(Object.entries(nested as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)))
      : nested)
}

function validInput(value: RideCheckpointInput): boolean {
  return Boolean(value) && typeof value === "object"
    && typeof value.rideId === "string" && value.rideId.length > 0
    && typeof value.identity === "string" && value.identity.length > 0
    && Number.isSafeInteger(value.sequence) && value.sequence >= 0
    && isRideIntent(value.intent)
}

function checkpointRecord(value: unknown): RideCheckpoint | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (record.id !== "active" || record.version !== 1) return null
  if (typeof record.token !== "string" || record.token.length === 0) return null
  const intent = migrateRideIntent(record.intent)
  if (!intent) return null
  const checkpoint: RideCheckpoint = {
    id: "active",
    version: 1,
    token: record.token,
    rideId: typeof record.rideId === "string" ? record.rideId : "",
    identity: typeof record.identity === "string" ? record.identity : "",
    sequence: typeof record.sequence === "number" ? record.sequence : Number.NaN,
    intent
  }
  return validInput(checkpoint) ? checkpoint : null
}

/** A dedicated DB keeps checkpoint migration/rollback away from all libraries. */
export class RideCheckpointStore {
  private readonly database: CheckpointDatabase
  constructor(name = "switchback-ride-intent") { this.database = new CheckpointDatabase(name) }

  async load(): Promise<CheckpointLoad> {
    try {
      const value = await this.database.checkpoints.get("active") as unknown
      if (!value) return { status: "empty" }
      if (typeof value === "object" && value !== null && !Array.isArray(value)
        && (value as Record<string, unknown>).version !== 1) return { status: "incompatible" }
      const checkpoint = checkpointRecord(value)
      if (!checkpoint) return { status: "invalid" }
      return { status: "restored", checkpoint }
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
        const stored = await this.database.checkpoints.get("active") as unknown
        const raw = stored && typeof stored === "object" && !Array.isArray(stored)
          ? stored as Record<string, unknown>
          : null
        if ((typeof raw?.token === "string" ? raw.token : null) !== expectedToken) return { status: "conflict" as const }
        // Parse through the same migration boundary as load(). A valid legacy
        // v1 record is allowed to become current-format on this write; corrupt
        // or unknown records remain untouched.
        const current = stored ? checkpointRecord(stored) : null
        if (stored && !current) return { status: "invalid" as const }
        // The same identity must always describe the same intent, or the
        // identity has stopped being an identity. Compare the migrated intent
        // so an additive schema default does not fabricate a conflict, and
        // compare canonically: migration can append a field in a different
        // key order than the live intent without changing its meaning.
        if (current && current.identity === input.identity
          && canonicalJson(current.intent) !== canonicalJson(input.intent)) return { status: "conflict" as const }
        await this.database.checkpoints.put(next)
        return { status: "saved" as const, token: next.token }
      })
    } catch { return { status: "unavailable" } }
  }

  close(): void { this.database.close() }
}
