export interface SyncEnvelopeV1 {
  version: 1
  namespaceId: string
  collection: string
  objectId: string
  revision: string
  nonce: string
  ciphertext: string
  tombstone?: boolean
}

export interface SyncObjectMetadata {
  namespaceId: string
  collection: string
  objectId: string
  revision: string
  tombstone?: boolean
}

const MAX_SYNC_BYTES = 8 * 1024 * 1024
const NONCE_BYTES = 12

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer as ArrayBuffer
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64")
  let result = ""
  for (const byte of bytes) result += String.fromCharCode(byte)
  return btoa(result)
}

function base64ToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 === 1) throw new Error("Invalid sync base64")
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(value, "base64"))
  const decoded = atob(value)
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0))
}

function metadataBytes(metadata: SyncObjectMetadata): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({
    version: 1,
    namespaceId: metadata.namespaceId,
    collection: metadata.collection,
    objectId: metadata.objectId,
    revision: metadata.revision,
    tombstone: metadata.tombstone === true
  }))
}

function validateIdentifier(value: string, field: string): void {
  if (!/^[A-Za-z0-9._:-]{1,160}$/.test(value)) throw new Error(`${field} is invalid`)
}

async function objectKey(root: Uint8Array, metadata: SyncObjectMetadata): Promise<CryptoKey> {
  if (root.byteLength !== 32) throw new Error("Sync root must be 256 bits")
  const rootKey = await crypto.subtle.importKey("raw", ownedArrayBuffer(root), "HKDF", false, ["deriveKey"])
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: ownedArrayBuffer(new TextEncoder().encode("switchback-sync-v1")),
      info: ownedArrayBuffer(metadataBytes(metadata))
    },
    rootKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  )
}

export function createSyncRoot(): Uint8Array {
  const root = new Uint8Array(32)
  crypto.getRandomValues(root)
  return root
}

export function parseSyncEnvelope(input: unknown): SyncEnvelopeV1 {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new Error("Sync envelope must be an object")
  const value = input as Record<string, unknown>
  if (value.version !== 1) throw new Error("Unsupported sync envelope version")
  const identifiers = {
    namespaceId: value.namespaceId,
    collection: value.collection,
    objectId: value.objectId,
    revision: value.revision
  }
  for (const [field, item] of Object.entries(identifiers)) {
    if (typeof item !== "string") throw new Error(`Sync ${field} is invalid`)
    validateIdentifier(item, field)
  }
  if (typeof value.nonce !== "string" || typeof value.ciphertext !== "string") throw new Error("Sync ciphertext is invalid")
  const nonce = base64ToBytes(value.nonce)
  const ciphertext = base64ToBytes(value.ciphertext)
  if (nonce.byteLength !== NONCE_BYTES || ciphertext.byteLength < 16 || ciphertext.byteLength > MAX_SYNC_BYTES + 16) {
    throw new Error("Sync ciphertext size is invalid")
  }
  if (value.tombstone !== undefined && typeof value.tombstone !== "boolean") throw new Error("Sync tombstone is invalid")
  return {
    version: 1,
    namespaceId: identifiers.namespaceId as string,
    collection: identifiers.collection as string,
    objectId: identifiers.objectId as string,
    revision: identifiers.revision as string,
    nonce: value.nonce,
    ciphertext: value.ciphertext,
    ...(value.tombstone === true ? { tombstone: true } : {})
  }
}

export async function encryptSyncObject(
  root: Uint8Array,
  metadata: SyncObjectMetadata,
  plaintext: Uint8Array
): Promise<SyncEnvelopeV1> {
  for (const [field, value] of Object.entries(metadata)) {
    if (field !== "tombstone") validateIdentifier(value as string, field)
  }
  if (plaintext.byteLength > MAX_SYNC_BYTES) throw new Error("Sync object is too large")
  const normalized: SyncObjectMetadata = { ...metadata, tombstone: metadata.tombstone === true }
  const nonce = new Uint8Array(NONCE_BYTES)
  crypto.getRandomValues(nonce)
  const key = await objectKey(root, normalized)
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ownedArrayBuffer(nonce), additionalData: ownedArrayBuffer(metadataBytes(normalized)) },
    key,
    ownedArrayBuffer(plaintext)
  )
  return parseSyncEnvelope({
    version: 1,
    ...normalized,
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext))
  })
}

export async function decryptSyncObject(root: Uint8Array, envelope: SyncEnvelopeV1): Promise<Uint8Array> {
  const parsed = parseSyncEnvelope(envelope)
  const metadata: SyncObjectMetadata = parsed
  const key = await objectKey(root, metadata)
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ownedArrayBuffer(base64ToBytes(parsed.nonce)), additionalData: ownedArrayBuffer(metadataBytes(metadata)) },
      key,
      ownedArrayBuffer(base64ToBytes(parsed.ciphertext))
    )
    return new Uint8Array(plaintext)
  } catch {
    throw new Error("Sync object authentication failed")
  }
}

export async function encryptJsonSyncObject(
  root: Uint8Array,
  metadata: SyncObjectMetadata,
  value: unknown
): Promise<SyncEnvelopeV1> {
  return encryptSyncObject(root, metadata, new TextEncoder().encode(JSON.stringify(value)))
}

export async function decryptJsonSyncObject<T>(root: Uint8Array, envelope: SyncEnvelopeV1): Promise<T> {
  return JSON.parse(new TextDecoder().decode(await decryptSyncObject(root, envelope))) as T
}

export interface SyncRecordHeader {
  objectId: string
  revision: string
  updatedAt: string
  tombstone: boolean
}

/** Route geometry is immutable; concurrent writes become a bounded conflict copy. */
export function mergeSyncHeaders(
  local: SyncRecordHeader,
  remote: SyncRecordHeader,
  collection: "routes" | "settings" | "other"
): SyncRecordHeader[] {
  if (local.objectId !== remote.objectId) return [local, remote]
  if (local.revision === remote.revision) return [Date.parse(remote.updatedAt) >= Date.parse(local.updatedAt) ? remote : local]
  if (collection === "routes") {
    const conflictId = `${remote.objectId}~conflict-${remote.revision}`.slice(0, 160)
    return [local, { ...remote, objectId: conflictId }]
  }
  return [Date.parse(remote.updatedAt) >= Date.parse(local.updatedAt) ? remote : local]
}

export { base64ToBytes, bytesToBase64, MAX_SYNC_BYTES }
