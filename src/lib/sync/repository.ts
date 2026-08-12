import { DatabaseSync } from "node:sqlite"
import { dirname } from "node:path"
import { mkdirSync } from "node:fs"

import { parseSyncEnvelope, validateSyncNamespaceId, type SyncEnvelopeV1 } from "./encrypted-sync"

export interface SyncListOptions {
  collection?: string
  objectId?: string
  limit?: number
  cursor?: string | null
}

export interface SyncListResult {
  envelopes: SyncEnvelopeV1[]
  nextCursor: string | null
}

interface SyncCursor {
  updatedAt: string
  collection: string
  objectId: string
  revision: string
}

const MAX_PAGE_SIZE = 100

function encodeCursor(cursor: SyncCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url")
}

function decodeCursor(value: string | null | undefined): SyncCursor | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<SyncCursor>
    if (!parsed || typeof parsed !== "object" || typeof parsed.updatedAt !== "string" || new Date(parsed.updatedAt).toISOString() !== parsed.updatedAt) throw new Error("cursor")
    for (const key of ["collection", "objectId", "revision"] as const) {
      if (typeof parsed[key] !== "string" || !/^[A-Za-z0-9._:-]{1,160}$/.test(parsed[key])) throw new Error("cursor")
    }
    return parsed as SyncCursor
  } catch {
    throw new Error("Sync cursor is invalid")
  }
}

export class SyncRepository {
  private readonly database: DatabaseSync

  constructor(readonly databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true })
    this.database = new DatabaseSync(databasePath)
    this.database.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
    this.database.exec(`
      create table if not exists sync_namespace (
        id text primary key,
        owner_identity_id text not null,
        created_at text not null
      );
      create table if not exists sync_object (
        namespace_id text not null references sync_namespace(id),
        collection text not null,
        object_id text not null,
        revision text not null,
        nonce blob not null,
        ciphertext blob not null,
        tombstone integer not null default 0,
        byte_count integer not null,
        updated_at text not null,
        primary key(namespace_id, collection, object_id, revision)
      );
      create index if not exists sync_object_lookup_idx on sync_object(namespace_id, collection, object_id, updated_at);
      create index if not exists sync_object_cursor_idx on sync_object(namespace_id, updated_at, collection, object_id, revision);
    `)
  }

  private ensureNamespace(identityId: string, namespaceId: string): void {
    const current = this.database.prepare("select owner_identity_id from sync_namespace where id = ?").get(namespaceId) as { owner_identity_id: string } | undefined
    if (current && current.owner_identity_id !== identityId) throw new Error("Sync namespace is not owned by this identity")
    if (!current) this.database.prepare("insert into sync_namespace(id, owner_identity_id, created_at) values (?, ?, ?)").run(namespaceId, identityId, new Date().toISOString())
  }

  link(identityId: string, namespaceId: string): void {
    validateSyncNamespaceId(namespaceId)
    this.ensureNamespace(identityId, namespaceId)
  }

  put(identityId: string, envelope: SyncEnvelopeV1): void {
    const parsed = parseSyncEnvelope(envelope)
    this.ensureNamespace(identityId, parsed.namespaceId)
    const nonce = Buffer.from(parsed.nonce, "base64")
    const ciphertext = Buffer.from(parsed.ciphertext, "base64")
    this.database.prepare(`
      insert into sync_object(namespace_id, collection, object_id, revision, nonce, ciphertext, tombstone, byte_count, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(namespace_id, collection, object_id, revision) do nothing
    `).run(parsed.namespaceId, parsed.collection, parsed.objectId, parsed.revision, nonce, ciphertext, parsed.tombstone === true ? 1 : 0, nonce.byteLength + ciphertext.byteLength, parsed.updatedAt)
  }

  list(identityId: string, namespaceId: string, options: SyncListOptions = {}): SyncListResult {
    const owner = this.database.prepare("select owner_identity_id from sync_namespace where id = ?").get(namespaceId) as { owner_identity_id: string } | undefined
    if (!owner || owner.owner_identity_id !== identityId) throw new Error("Sync namespace is not owned by this identity")
    const requestedLimit = options.limit ?? 50
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > MAX_PAGE_SIZE) throw new Error("Sync page limit is invalid")
    const limit = requestedLimit
    const cursor = decodeCursor(options.cursor)
    const clauses = ["namespace_id = ?"]
    const parameters: Array<string | number | Uint8Array> = [namespaceId]
    if (options.collection) {
      clauses.push("collection = ?")
      parameters.push(options.collection)
    }
    if (options.objectId) {
      clauses.push("object_id = ?")
      parameters.push(options.objectId)
    }
    if (cursor) {
      clauses.push("(updated_at > ? or (updated_at = ? and collection > ?) or (updated_at = ? and collection = ? and object_id > ?) or (updated_at = ? and collection = ? and object_id = ? and revision > ?))")
      parameters.push(cursor.updatedAt, cursor.updatedAt, cursor.collection, cursor.updatedAt, cursor.collection, cursor.objectId, cursor.updatedAt, cursor.collection, cursor.objectId, cursor.revision)
    }
    const rows = this.database.prepare(`
      select namespace_id, collection, object_id, revision, updated_at, nonce, ciphertext, tombstone
      from sync_object
      where ${clauses.join(" and ")}
      order by updated_at asc, collection asc, object_id asc, revision asc
      limit ?
    `).all(...parameters, limit + 1) as Array<{
      namespace_id: string; collection: string; object_id: string; revision: string; updated_at: string; nonce: Uint8Array; ciphertext: Uint8Array; tombstone: number
    }>
    const pageRows = rows.slice(0, limit)
    const last = pageRows.at(-1)
    return {
      envelopes: pageRows.map((row) => parseSyncEnvelope({
      version: 1,
      namespaceId: row.namespace_id,
      collection: row.collection,
      objectId: row.object_id,
      revision: row.revision,
      updatedAt: row.updated_at,
      nonce: Buffer.from(row.nonce).toString("base64"),
      ciphertext: Buffer.from(row.ciphertext).toString("base64"),
      ...(row.tombstone ? { tombstone: true } : {})
      })),
      nextCursor: rows.length > limit && last
        ? encodeCursor({ updatedAt: last.updated_at, collection: last.collection, objectId: last.object_id, revision: last.revision })
        : null
    }
  }

  close(): void {
    this.database.close()
  }
}
