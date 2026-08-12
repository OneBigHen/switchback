import { validateSyncNamespaceId } from "./encrypted-sync"
import type { SyncStateRecord } from "./client-store"

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
const FORMAT = "SB1"

export interface ParsedRecoveryKit {
  namespaceId: string
  root: Uint8Array
}

export interface RecoveryKit {
  format: "switchback-sync-recovery"
  version: 1
  namespaceId: string
  seed: string
  qrPayload: string
}

function base32Encode(bytes: Uint8Array): string {
  let output = ""
  let buffer = 0
  let bits = 0
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += ALPHABET[(buffer >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += ALPHABET[(buffer << (5 - bits)) & 31]
  return output
}

function base32Decode(input: string): Uint8Array {
  const value = input.toUpperCase()
  if (!/^[A-Z2-7]+$/.test(value)) throw new Error("Recovery seed is invalid")
  let buffer = 0
  let bits = 0
  const bytes: number[] = []
  for (const character of value) {
    buffer = (buffer << 5) | ALPHABET.indexOf(character)
    bits += 5
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  if (bits >= 5 || (bits > 0 && (buffer & ((1 << bits) - 1)) !== 0)) throw new Error("Recovery seed is invalid")
  return new Uint8Array(bytes)
}

async function checksum(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))
  return base32Encode(digest.slice(0, 5))
}

function seedBody(namespaceId: string, root: Uint8Array): string {
  return `${FORMAT}.${namespaceId}.${base32Encode(root)}`
}

export async function createRecoveryKit(state: SyncStateRecord): Promise<RecoveryKit> {
  const body = seedBody(state.namespaceId, state.root)
  const seed = `${body}.${await checksum(body)}`
  return {
    format: "switchback-sync-recovery",
    version: 1,
    namespaceId: state.namespaceId,
    seed,
    qrPayload: seed
  }
}

export async function parseRecoveryKit(input: string): Promise<ParsedRecoveryKit> {
  const normalized = input.trim().replace(/^switchback-sync:/i, "")
  const parts = normalized.split(".")
  if (parts.length !== 4 || parts[0] !== FORMAT || !parts[1] || !parts[2] || !parts[3]) throw new Error("Recovery seed is invalid")
  const namespaceId = parts[1]!
  validateSyncNamespaceId(namespaceId)
  const root = base32Decode(parts[2]!)
  if (root.byteLength !== 32) throw new Error("Recovery seed is invalid")
  const body = `${FORMAT}.${namespaceId}.${parts[2]!.toUpperCase()}`
  if ((await checksum(body)) !== parts[3]!.toUpperCase()) throw new Error("Recovery seed checksum failed")
  return { namespaceId, root }
}
