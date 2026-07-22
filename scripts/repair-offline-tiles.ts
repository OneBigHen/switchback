/**
 * Repair offline tiles that fail validation due to:
 *   - Duplicate restriction signatures (same incoming|via|outgoing|kind)
 *   - Cross-tile turn restrictions (references edges not in this tile)
 *
 * Reads each tile, deduplicates restrictions, re-compresses, re-hashes,
 * and updates the manifest inventory + checksums.
 *
 * Usage: NODE_OPTIONS="--max-old-space-size=4096" npx tsx scripts/repair-offline-tiles.ts
 */
import { gunzipSync, gzipSync } from "node:zlib"
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs"
import { createHash } from "node:crypto"
import { join } from "node:path"
import { type OfflineGraphTileV2, type OfflineRegionManifestTileEntry } from "../src/lib/offline/v2-contracts"

const DATA_ROOT = "data/offline-regions"

function hash(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex")
}

for (const regionId of ["pennsylvania", "new-jersey"]) {
  const active = JSON.parse(readFileSync(join(DATA_ROOT, regionId, "active.json"), "utf8")) as { version: string }
  const versionDir = active.version
  const tilesDir = join(DATA_ROOT, regionId, versionDir, "tiles")
  const manifestPath = join(DATA_ROOT, regionId, versionDir, "manifest.json")
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))

  let repaired = 0
  let alreadyValid = 0
  const newTiles: OfflineRegionManifestTileEntry[] = []
  const tileIdsToRemove: string[] = []
  let tileByteTotal = 0

  for (const tileEntry of manifest.tiles) {
    const oldPath = join(tilesDir, `${tileEntry.tileId}.json.gz`)
    if (!existsSync(oldPath)) {
      console.warn(`[repair] ${regionId} tile ${tileEntry.tileId.slice(0, 12)} file missing — keeping manifest entry`)
      newTiles.push(tileEntry)
      tileByteTotal += tileEntry.bytes
      continue
    }
    const compressed = readFileSync(oldPath)
    const rawTile = JSON.parse(gunzipSync(compressed).toString("utf8"))

    // Skipping validateOfflineGraphTileV2 for large tiles (the validator's
    // O(restrictions × edges) linear search is too slow on urban tiles with
    // 2000+ restrictions and 400k+ edges). We check for dup signatures +
    // cross-tile refs directly instead.
    const tile = rawTile as OfflineGraphTileV2
    const edgeIdSet = new Set(tile.edges.map((e) => e.id))
    const restrictionSignatures = new Set<string>()
    const before = tile.turnRestrictions.length

    tile.turnRestrictions = tile.turnRestrictions.filter((r) => {
      // Drop cross-tile restrictions (edges not in this tile)
      if (!edgeIdSet.has(r.incomingEdgeId) || !edgeIdSet.has(r.outgoingEdgeId)) return false
      // Drop duplicate signatures
      const sig = `${r.incomingEdgeId}|${r.viaNodeId}|${r.outgoingEdgeId}|${r.restriction}`
      if (restrictionSignatures.has(sig)) return false
      restrictionSignatures.add(sig)
      return true
    })
    const after = tile.turnRestrictions.length

    if (before === after) {
      // No changes needed — keep original
      alreadyValid++
      newTiles.push(tileEntry)
      tileByteTotal += tileEntry.bytes
      continue
    }

    // Write repaired tile (new tileId since content changed)
    const newCompressed = gzipSync(JSON.stringify(tile), { level: 9 })
    const newSha = hash(newCompressed)
    const newTileId = `t-${hash(JSON.stringify(tile))}`
    const newPath = join(tilesDir, `${newTileId}.json.gz`)

    writeFileSync(newPath, newCompressed)
    // Remove old tile file synchronously
    try { unlinkSync(oldPath) } catch { /* may already be removed */ }
    tileIdsToRemove.push(tileEntry.tileId)

    newTiles.push({
      tileId: newTileId,
      bounds: tileEntry.bounds,
      bytes: newCompressed.byteLength,
      sha256: newSha,
      nodeCount: tile.nodes.length,
      edgeCount: tile.edges.length
    })
    tileByteTotal += newCompressed.byteLength
    repaired++
    console.log(`[repair] ${regionId} ${tileEntry.tileId.slice(0, 12)} -> ${newTileId.slice(0, 12)} (restrictions: ${before} -> ${after})`)
  }

  // Sort tiles and rebuild manifest inventory checksum
  newTiles.sort((a, b) => a.tileId.localeCompare(b.tileId))
  const inventoryString = newTiles.map((t) => `${t.tileId}:${t.sha256}`).join("\n")
  const inventorySha256 = hash(inventoryString)

  // Update manifest
  const newManifest = {
    ...manifest,
    tiles: newTiles,
    tileByteTotal,
    checksums: { inventorySha256 }
  }
  writeFileSync(manifestPath, JSON.stringify(newManifest, null, 2) + "\n")
  console.log(`[repair] ${regionId}: ${alreadyValid} unchanged, ${repaired} repaired, ${newTiles.length} total tiles`)
  console.log(`[repair] ${regionId}: inventorySha256=${inventorySha256.slice(0, 24)}...`)
}
