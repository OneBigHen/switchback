import Dexie, { type EntityTable } from "dexie"

import { createSyncRoot, type SyncEnvelopeV1 } from "./encrypted-sync"
import { parseRecoveryKit } from "./recovery-kit"

export interface SyncStateRecord {
  id: "state"
  namespaceId: string
  root: Uint8Array
  linked: boolean
  createdAt: string
}

export interface SyncObjectRecord {
  id: string
  collection: "routes" | "settings"
  objectId: string
  revision: string
  updatedAt: string
  fingerprint: string
  tombstone: boolean
}

export interface SyncOutboxRecord {
  id: string
  collection: "routes" | "settings"
  objectId: string
  revision: string
  createdAt: string
  attempts: number
  nextAttemptAt: string | null
  lastError: string | null
  envelope: SyncEnvelopeV1
}

export interface SyncInboxRecord {
  id: string
  receivedAt: string
  processedAt: string | null
  envelope: SyncEnvelopeV1
}

class SyncDatabase extends Dexie {
  state!: EntityTable<SyncStateRecord, "id">
  objects!: EntityTable<SyncObjectRecord, "id">
  outbox!: EntityTable<SyncOutboxRecord, "id">
  inbox!: EntityTable<SyncInboxRecord, "id">

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      state: "&id",
      objects: "&id, collection, objectId, updatedAt",
      outbox: "&id, collection, objectId, createdAt, nextAttemptAt",
      inbox: "&id, receivedAt"
    })
    this.version(2).stores({
      state: "&id",
      objects: "&id, collection, objectId, updatedAt, tombstone",
      outbox: "&id, collection, objectId, createdAt, nextAttemptAt",
      inbox: "&id, receivedAt, processedAt"
    }).upgrade((transaction) => transaction.table("inbox").toCollection().modify((record: SyncInboxRecord) => {
      record.processedAt ??= null
    }))
  }
}

export function syncObjectKey(collection: string, objectId: string): string {
  return `${collection}:${objectId}`
}

export function syncEnvelopeKey(envelope: SyncEnvelopeV1): string {
  return `${envelope.collection}:${envelope.objectId}:${envelope.revision}`
}

export class SyncClientStore {
  private readonly database: SyncDatabase

  constructor(readonly name = "switchback-sync") {
    this.database = new SyncDatabase(name)
  }

  async getState(): Promise<SyncStateRecord | undefined> {
    return this.database.state.get("state")
  }

  async ensureState(): Promise<SyncStateRecord> {
    const existing = await this.getState()
    if (existing) return existing
    const state: SyncStateRecord = {
      id: "state",
      namespaceId: `ns-${crypto.randomUUID()}`,
      root: createSyncRoot(),
      linked: false,
      createdAt: new Date().toISOString()
    }
    await this.database.state.put(state)
    return state
  }

  async setLinked(linked: boolean): Promise<SyncStateRecord> {
    const state = await this.ensureState()
    const next = { ...state, linked }
    await this.database.state.put(next)
    return next
  }

  async importRecoveryKit(seed: string): Promise<SyncStateRecord> {
    const parsed = await parseRecoveryKit(seed)
    const current = await this.getState()
    if (current && current.namespaceId !== parsed.namespaceId) {
      const [objectCount, outboxCount, inboxCount] = await Promise.all([
        this.database.objects.count(),
        this.database.outbox.count(),
        this.database.inbox.count()
      ])
      if (current.linked || objectCount > 0 || outboxCount > 0 || inboxCount > 0) {
        throw new Error("A different sync root is already installed on this device.")
      }
    }
    const state: SyncStateRecord = {
      id: "state",
      namespaceId: parsed.namespaceId,
      root: parsed.root,
      linked: false,
      createdAt: current?.createdAt ?? new Date().toISOString()
    }
    await this.database.transaction("rw", this.database.state, this.database.objects, this.database.outbox, this.database.inbox, async () => {
      await this.database.state.put(state)
      await this.database.objects.clear()
      await this.database.outbox.clear()
      await this.database.inbox.clear()
    })
    return state
  }

  async getObject(collection: SyncObjectRecord["collection"], objectId: string): Promise<SyncObjectRecord | undefined> {
    return this.database.objects.get(syncObjectKey(collection, objectId))
  }

  async listObjects(collection: SyncObjectRecord["collection"]): Promise<SyncObjectRecord[]> {
    return this.database.objects.where("collection").equals(collection).toArray()
  }

  async putObject(record: SyncObjectRecord): Promise<void> {
    await this.database.objects.put(record)
  }

  async listOutbox(): Promise<SyncOutboxRecord[]> {
    return this.database.outbox.orderBy("createdAt").toArray()
  }

  async putOutbox(record: SyncOutboxRecord): Promise<void> {
    await this.database.outbox.put(record)
  }

  async removeOutbox(id: string): Promise<void> {
    await this.database.outbox.delete(id)
  }

  async listInbox(): Promise<SyncInboxRecord[]> {
    return this.database.inbox.toCollection().filter((item) => item.processedAt === null).toArray()
  }

  async putInbox(record: SyncInboxRecord): Promise<void> {
    await this.database.inbox.put(record)
  }

  async markInboxProcessed(id: string): Promise<void> {
    await this.database.inbox.update(id, { processedAt: new Date().toISOString() })
  }

  async destroy(): Promise<void> {
    this.database.close()
    await Dexie.delete(this.name)
  }
}
