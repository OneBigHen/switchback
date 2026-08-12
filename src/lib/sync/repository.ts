import { DatabaseSync } from "node:sqlite"
import { dirname } from "node:path"
import { mkdirSync } from "node:fs"

import { parseSyncEnvelope, type SyncEnvelopeV1 } from "./encrypted-sync"

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
    `)
  }

  private ensureNamespace(identityId: string, namespaceId: string): void {
    const current = this.database.prepare("select owner_identity_id from sync_namespace where id = ?").get(namespaceId) as { owner_identity_id: string } | undefined
    if (current && current.owner_identity_id !== identityId) throw new Error("Sync namespace is not owned by this identity")
    if (!current) this.database.prepare("insert into sync_namespace(id, owner_identity_id, created_at) values (?, ?, ?)").run(namespaceId, identityId, new Date().toISOString())
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
    `).run(parsed.namespaceId, parsed.collection, parsed.objectId, parsed.revision, nonce, ciphertext, parsed.tombstone === true ? 1 : 0, nonce.byteLength + ciphertext.byteLength, new Date().toISOString())
  }

  list(identityId: string, namespaceId: string, collection?: string, objectId?: string): SyncEnvelopeV1[] {
    const owner = this.database.prepare("select owner_identity_id from sync_namespace where id = ?").get(namespaceId) as { owner_identity_id: string } | undefined
    if (!owner || owner.owner_identity_id !== identityId) throw new Error("Sync namespace is not owned by this identity")
    const rows = this.database.prepare(`
      select namespace_id, collection, object_id, revision, nonce, ciphertext, tombstone
      from sync_object
      where namespace_id = ? and (? is null or collection = ?) and (? is null or object_id = ?)
      order by updated_at desc
      limit 500
    `).all(namespaceId, collection ?? null, collection ?? null, objectId ?? null, objectId ?? null) as Array<{
      namespace_id: string; collection: string; object_id: string; revision: string; nonce: Uint8Array; ciphertext: Uint8Array; tombstone: number
    }>
    return rows.map((row) => parseSyncEnvelope({
      version: 1,
      namespaceId: row.namespace_id,
      collection: row.collection,
      objectId: row.object_id,
      revision: row.revision,
      nonce: Buffer.from(row.nonce).toString("base64"),
      ciphertext: Buffer.from(row.ciphertext).toString("base64"),
      ...(row.tombstone ? { tombstone: true } : {})
    }))
  }

  close(): void {
    this.database.close()
  }
}
