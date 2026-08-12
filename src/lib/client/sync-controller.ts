import { authenticatePasskey, csrfHeaders } from "@/lib/client/passkey"
import {
  decryptJsonSyncObject,
  encryptJsonSyncObject,
  mergeSyncHeaders,
  parseSyncEnvelope,
  type SyncEnvelopeV1,
  type SyncRecordHeader
} from "@/lib/sync/encrypted-sync"
import {
  createRecoveryKit,
  type RecoveryKit
} from "@/lib/sync/recovery-kit"
import {
  SyncClientStore,
  syncEnvelopeKey,
  syncObjectKey,
  type SyncObjectRecord,
  type SyncOutboxRecord,
  type SyncStateRecord
} from "@/lib/sync/client-store"
import { RouteLibrary, type SavedRoute } from "@/lib/storage/route-library"
import {
  loadRiderSettings,
  saveRiderSettings,
  RIDER_SETTINGS_VERSION,
  type RiderSettings
} from "@/lib/settings/rider-settings"

const SETTINGS_OBJECT_ID = "rider-settings"
const SYNC_PAGE_SIZE = 100
const MAX_ATTEMPTS = 3

interface SyncResponseBody {
  envelopes?: unknown
  nextCursor?: unknown
}

export interface SyncRunResult {
  pushed: number
  pulled: number
  conflicts: number
  pending: number
}

export interface SyncControllerOptions {
  store?: SyncClientStore
  routeLibrary?: RouteLibrary
  fetcher?: typeof fetch
  sleep?: (milliseconds: number) => Promise<void>
}

class SyncRequestError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message)
  }
}

function fingerprint(value: unknown): string {
  return JSON.stringify(value)
}

function revision(): string {
  return `rev-${crypto.randomUUID()}`
}

function now(): string {
  return new Date().toISOString()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function savedRoute(value: unknown, objectId: string): SavedRoute {
  if (!isRecord(value) || value.id !== objectId || typeof value.name !== "string" || value.previewOnly === true || typeof value.updatedAt !== "string") {
    throw new Error("The synced route is invalid")
  }
  return value as unknown as SavedRoute
}

function riderSettings(value: unknown): RiderSettings {
  if (!isRecord(value) || value.version !== RIDER_SETTINGS_VERSION || typeof value.riderName !== "string" || !Array.isArray(value.bikes)) {
    throw new Error("The synced rider settings are invalid")
  }
  return value as unknown as RiderSettings
}

function routeHeader(record: SyncObjectRecord): SyncRecordHeader {
  return {
    objectId: record.objectId,
    revision: record.revision,
    updatedAt: record.updatedAt,
    tombstone: record.tombstone
  }
}

function envelopeHeader(envelope: SyncEnvelopeV1): SyncRecordHeader {
  return {
    objectId: envelope.objectId,
    revision: envelope.revision,
    updatedAt: envelope.updatedAt,
    tombstone: envelope.tombstone === true
  }
}

async function responseMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json() as { error?: { message?: string } }
    return payload.error?.message ?? fallback
  } catch {
    return fallback
  }
}

export function createSyncController(options: SyncControllerOptions = {}) {
  const store = options.store ?? new SyncClientStore()
  const routeLibrary = options.routeLibrary ?? new RouteLibrary()
  const fetcher = options.fetcher ?? fetch
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)))

  async function ensureState(): Promise<SyncStateRecord> {
    return store.ensureState()
  }

  async function exportRecoveryKit(): Promise<RecoveryKit> {
    return createRecoveryKit(await ensureState())
  }

  async function linkCurrentSession(): Promise<SyncStateRecord> {
    const state = await ensureState()
    const response = await fetcher("/api/sync/link", {
      method: "POST",
      credentials: "same-origin",
      headers: csrfHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ namespaceId: state.namespaceId })
    })
    if (!response.ok) throw new SyncRequestError(await responseMessage(response, "This device could not be linked for sync."), response.status >= 500 || response.status === 429)
    return store.setLinked(true)
  }

  async function linkWithPasskey(): Promise<SyncStateRecord> {
    await authenticatePasskey()
    return linkCurrentSession()
  }

  async function queueValue(
    state: SyncStateRecord,
    collection: "routes" | "settings",
    objectId: string,
    value: unknown,
    updatedAt: string,
    tombstone = false
  ): Promise<void> {
    const currentRevision = revision()
    const envelope = await encryptJsonSyncObject(state.root, {
      namespaceId: state.namespaceId,
      collection,
      objectId,
      revision: currentRevision,
      updatedAt,
      tombstone
    }, value)
    const object: SyncObjectRecord = {
      id: syncObjectKey(collection, objectId),
      collection,
      objectId,
      revision: currentRevision,
      updatedAt,
      fingerprint: tombstone ? "" : fingerprint(value),
      tombstone
    }
    const outbox: SyncOutboxRecord = {
      id: syncEnvelopeKey(envelope),
      collection,
      objectId,
      revision: currentRevision,
      createdAt: now(),
      attempts: 0,
      nextAttemptAt: null,
      lastError: null,
      envelope
    }
    await store.putObject(object)
    await store.putOutbox(outbox)
  }

  async function captureLocalChanges(state: SyncStateRecord): Promise<void> {
    const routes = await routeLibrary.list()
    const routeIds = new Set(routes.map((route) => route.id))
    for (const route of routes) {
      const current = await store.getObject("routes", route.id)
      const valueFingerprint = fingerprint(route)
      if (current && !current.tombstone && current.updatedAt === route.updatedAt && current.fingerprint === valueFingerprint) continue
      await queueValue(state, "routes", route.id, route, route.updatedAt)
    }
    for (const current of await store.listObjects("routes")) {
      if (!routeIds.has(current.objectId) && !current.tombstone) await queueValue(state, "routes", current.objectId, null, now(), true)
    }

    const settings = loadRiderSettings()
    const settingsFingerprint = fingerprint(settings)
    const currentSettings = await store.getObject("settings", SETTINGS_OBJECT_ID)
    if (!currentSettings || currentSettings.tombstone || currentSettings.fingerprint !== settingsFingerprint) {
      await queueValue(state, "settings", SETTINGS_OBJECT_ID, settings, now())
    }
  }

  async function pushOutbox(): Promise<number> {
    let pushed = 0
    for (const original of await store.listOutbox()) {
      if (original.nextAttemptAt && Date.parse(original.nextAttemptAt) > Date.now()) continue
      let record = original
      let delivered = false
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          const response = await fetcher("/api/sync", {
            method: "POST",
            credentials: "same-origin",
            headers: csrfHeaders({ "content-type": "application/json" }),
            body: JSON.stringify(record.envelope)
          })
          if (!response.ok) throw new SyncRequestError(await responseMessage(response, "Encrypted sync could not save this change."), response.status >= 500 || response.status === 429)
          await store.removeOutbox(record.id)
          pushed++
          delivered = true
          break
        } catch (caught) {
          const error = caught instanceof SyncRequestError
            ? caught
            : new SyncRequestError("Encrypted sync could not reach the server.", true)
          const nextAttemptAt = error.retryable && attempt + 1 < MAX_ATTEMPTS
            ? new Date(Date.now() + 250 * 2 ** attempt).toISOString()
            : null
          record = {
            ...record,
            attempts: record.attempts + 1,
            nextAttemptAt,
            lastError: error.message
          }
          await store.putOutbox(record)
          if (!error.retryable || attempt + 1 >= MAX_ATTEMPTS) throw error
          await sleep(250 * 2 ** attempt)
        }
      }
      if (!delivered) break
    }
    return pushed
  }

  async function pullRemote(state: SyncStateRecord): Promise<number> {
    let cursor: string | null = null
    let pulled = 0
    do {
      const url = new URL("/api/sync", window.location.origin)
      url.searchParams.set("namespaceId", state.namespaceId)
      url.searchParams.set("limit", String(SYNC_PAGE_SIZE))
      if (cursor) url.searchParams.set("cursor", cursor)
      const response = await fetcher(url.toString(), { credentials: "same-origin" })
      if (!response.ok) throw new SyncRequestError(await responseMessage(response, "Encrypted sync could not load this device's changes."), response.status >= 500 || response.status === 429)
      const body = await response.json() as SyncResponseBody
      if (!Array.isArray(body.envelopes) || (body.nextCursor !== null && body.nextCursor !== undefined && typeof body.nextCursor !== "string")) throw new Error("The sync response is invalid")
      for (const candidate of body.envelopes) {
        const envelope = parseSyncEnvelope(candidate)
        if (envelope.collection !== "routes" && envelope.collection !== "settings") continue
        await store.putInbox({ id: syncEnvelopeKey(envelope), receivedAt: now(), processedAt: null, envelope })
        pulled++
      }
      cursor = typeof body.nextCursor === "string" ? body.nextCursor : null
    } while (cursor)
    return pulled
  }

  async function applyEnvelope(state: SyncStateRecord, envelope: SyncEnvelopeV1): Promise<boolean> {
    const value = await decryptJsonSyncObject<unknown>(state.root, envelope)
    const collection = envelope.collection as "routes" | "settings"
    const current = await store.getObject(collection, envelope.objectId)
    const remote = envelopeHeader(envelope)
    if (!current) {
      if (envelope.collection === "routes") {
        const route = envelope.tombstone ? null : savedRoute(value, envelope.objectId)
        if (route) await routeLibrary.upsertSynced(route)
        else await routeLibrary.remove(envelope.objectId)
      } else if (!envelope.tombstone) {
        saveRiderSettings(riderSettings(value))
      }
      await store.putObject({
        id: syncObjectKey(envelope.collection, envelope.objectId),
        collection: envelope.collection as "routes" | "settings",
        objectId: envelope.objectId,
        revision: envelope.revision,
        updatedAt: envelope.updatedAt,
        fingerprint: envelope.tombstone ? "" : fingerprint(value),
        tombstone: envelope.tombstone === true
      })
      return false
    }

    const merged = mergeSyncHeaders(routeHeader(current), remote, collection)
    const selectedRemote = merged.length === 1 && merged[0]!.objectId === remote.objectId && merged[0]!.revision === remote.revision
    if (selectedRemote) {
      if (envelope.collection === "routes") {
        const route = envelope.tombstone ? null : savedRoute(value, envelope.objectId)
        if (route) await routeLibrary.upsertSynced(route)
        else await routeLibrary.remove(envelope.objectId)
      } else if (!envelope.tombstone) {
        saveRiderSettings(riderSettings(value))
      }
      await store.putObject({
        ...current,
        revision: envelope.revision,
        updatedAt: envelope.updatedAt,
        fingerprint: envelope.tombstone ? "" : fingerprint(value),
        tombstone: envelope.tombstone === true
      })
      return false
    }

    if (envelope.collection === "routes" && !envelope.tombstone) {
      const conflict = merged.find((header) => header.objectId !== envelope.objectId)
      if (conflict) {
        const route = savedRoute(value, envelope.objectId)
        const conflictRoute = { ...route, id: conflict.objectId, name: `${route.name} · Conflict copy` }
        await routeLibrary.upsertSynced(conflictRoute)
        await store.putObject({
          id: syncObjectKey("routes", conflict.objectId),
          collection: "routes",
          objectId: conflict.objectId,
          revision: envelope.revision,
          updatedAt: envelope.updatedAt,
          fingerprint: fingerprint(conflictRoute),
          tombstone: false
        })
        return true
      }
    }
    return false
  }

  async function processInbox(state: SyncStateRecord): Promise<number> {
    let conflicts = 0
    for (const item of await store.listInbox()) {
      conflicts += Number(await applyEnvelope(state, item.envelope))
      await store.markInboxProcessed(item.id)
    }
    return conflicts
  }

  async function sync(): Promise<SyncRunResult> {
    const state = await ensureState()
    if (!state.linked) throw new Error("Link this device with your Switchback ID before syncing.")
    await captureLocalChanges(state)
    let pushed = await pushOutbox()
    const pulled = await pullRemote(state)
    const conflicts = await processInbox(state)
    pushed += await pushOutbox()
    return { pushed, pulled, conflicts, pending: (await store.listOutbox()).length }
  }

  return {
    ensureState,
    exportRecoveryKit,
    linkCurrentSession,
    linkWithPasskey,
    sync,
    store,
    routeLibrary
  }
}
