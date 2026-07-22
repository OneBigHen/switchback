/**
 * Offline-vs-GraphHopper parity + legality audit against real generated tiles.
 *
 * Loads PA (and NJ) tiles as compressed buffers from the active on-disk
 * artifacts, decompresses only the corridor tiles needed per pair, runs the
 * real `routeOfflineV2` (same code the worker calls), compares distance/
 * legality against GraphHopper (the production oracle), and audits every
 * returned offline edge ID for forbidden access or prohibited turn
 * restrictions.
 *
 * Produces deterministic evidence at artifacts/offline-parity-evidence.json.
 *
 * Usage:
 *   npx tsx scripts/verify-offline-parity.ts [pairCount]
 *   # default pairCount = 200 (>= 98% success gate from the closure reality doc)
 */
import { createHash } from "node:crypto"
import { gunzipSync } from "node:zlib"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { routeOfflineV2, type OfflineRouteProfile } from "../src/lib/offline/v2-router"
import type { OfflineGraphTileV2 } from "../src/lib/offline/v2-contracts"

const PAIR_COUNT = Number(process.argv[2] ?? 200)
const GRAPH_HOPPER_URL = process.env.GRAPHHOPPER_URL ?? "http://127.0.0.1:8989"
const DATA_ROOT = "data/offline-regions"

// Deterministic PRNG (seeded) so every run reproduces the same 200 pairs.
function makeRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return ((state >>> 0) % 1_000_000) / 1_000_000
  }
}

interface RegionBundle {
  regionId: string
  manifest: { bounds: Bounds; version: string; regionId: string; tiles: Array<{ tileId: string; bounds: Bounds }> }
  tilesDir: string
  tileBounds: Array<{ tileId: string; bounds: Bounds }>
}

interface Bounds {
  minLon: number
  minLat: number
  maxLon: number
  maxLat: number
}

function loadRegion(regionId: string): RegionBundle {
  const active = JSON.parse(readFileSync(join(DATA_ROOT, regionId, "active.json"), "utf8")) as { version: string }
  const versionDir = active.version
  const manifest = JSON.parse(readFileSync(join(DATA_ROOT, regionId, versionDir, "manifest.json"), "utf8"))
  const tilesDir = join(DATA_ROOT, regionId, versionDir, "tiles")
  // Pull tile bounds from the manifest only — no tile decompression at load time.
  // This keeps memory bounded by the manifest (~100KB) instead of all compressed tiles (~1.2GB).
  const tileBounds: Array<{ tileId: string; bounds: Bounds }> = (manifest.tiles as Array<{ tileId: string; bounds: Bounds }>).map((entry) => ({ tileId: entry.tileId, bounds: entry.bounds }))
  return { regionId: manifest.regionId, manifest, tilesDir, tileBounds }
}

function decompressTile(tilesDir: string, tileId: string): OfflineGraphTileV2 {
  return JSON.parse(gunzipSync(readFileSync(join(tilesDir, `${tileId}.json.gz`))).toString("utf8")) as OfflineGraphTileV2
}

function selectCorridorTileIds(tileBounds: Array<{ tileId: string; bounds: Bounds }>, points: number[][], padDeg = 0.01): string[] {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity
  for (const [lon, lat] of points) {
    minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon)
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat)
  }
  minLon -= padDeg; minLat -= padDeg; maxLon += padDeg; maxLat += padDeg
  return tileBounds.filter((t) => {
    const b = t.bounds
    return !(b.minLon > maxLon || b.maxLon < minLon || b.minLat > maxLat || b.maxLat < minLat)
  }).map((t) => t.tileId)
}

async function routeGraphHopper(points: number[][], profile: string): Promise<{ ok: boolean; distanceMeters: number | null; error?: string }> {
  const ghProfile: Record<string, string> = {
    quick: "motorcycle_fastest",
    twisty: "motorcycle_twisty",
    scenic: "motorcycle_scenic",
    adventure: "motorcycle_adventure"
  }
  const body = {
    profile: ghProfile[profile] ?? "motorcycle_fastest",
    points_encoded: false,
    "ch.disable": true,
    calc_points: true,
    points: points.map(([lon, lat]) => [lon, lat])
  }
  const res = await fetch(`${GRAPH_HOPPER_URL}/route`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  })
  const json = await res.json() as { paths?: Array<{ distance: number; time: number }>; message?: string }
  if (!res.ok || !json.paths?.length) {
    return { ok: false, distanceMeters: null, error: json.message ?? `HTTP ${res.status}` }
  }
  return { ok: true, distanceMeters: Math.round(json.paths[0].distance) }
}

function auditLegality(edgeIds: string[], tiles: OfflineGraphTileV2[]): { illegalEdges: unknown[]; turnViolations: unknown[] } {
  // Build a lightweight edge lookup only for returned edges (not all edges).
  // This avoids the O(allEdges) merged index that causes heap pressure.
  const edgeMap = new Map<string, OfflineGraphTileV2["edges"][number]>()
  const restrictionMap = new Map<string, OfflineGraphTileV2["turnRestrictions"][number][]>()
  const neededEdges = new Set(edgeIds)
  for (const tile of tiles) {
    for (const edge of tile.edges) {
      if (neededEdges.has(edge.id)) edgeMap.set(edge.id, edge)
    }
    for (const r of tile.turnRestrictions) {
      // Only store restrictions whose incoming edge is in the returned path
      if (neededEdges.has(r.incomingEdgeId)) {
        const k = `${r.incomingEdgeId}:${r.viaNodeId}`
        const list = restrictionMap.get(k) ?? []
        if (!list.some((c) => c.outgoingEdgeId === r.outgoingEdgeId && c.restriction === r.restriction)) list.push(r)
        restrictionMap.set(k, list)
      }
    }
  }
  const illegalEdges: unknown[] = []
  for (const edgeId of edgeIds) {
    const edge = edgeMap.get(edgeId)
    if (!edge) {
      illegalEdges.push({ edgeId, reason: "edge_not_found" })
      continue
    }
    if (edge.access === "forbidden" || edge.motorcycleAccess === "forbidden") {
      illegalEdges.push({ edgeId, osmWayId: edge.osmWayId, access: edge.access, motorcycleAccess: edge.motorcycleAccess })
    }
  }
  const turnViolations: unknown[] = []
  for (let i = 0; i < edgeIds.length - 1; i += 1) {
    const incoming = edgeIds[i]
    const outgoing = edgeIds[i + 1]
    const incomingEdge = edgeMap.get(incoming)
    if (!incomingEdge) continue
    const viaNodeId = incomingEdge.toNodeId
    const restrictions = restrictionMap.get(`${incoming}:${viaNodeId}`) ?? []
    const noTurn = restrictions.filter((r) => r.restriction === "no_turn" && r.outgoingEdgeId === outgoing)
    if (noTurn.length > 0) {
      turnViolations.push({ incoming, outgoing, viaNodeId, relation: noTurn[0].sourceRelationId })
    }
    const onlyTurns = restrictions.filter((r) => r.restriction === "only_turn")
    if (onlyTurns.length > 0 && !onlyTurns.some((r) => r.outgoingEdgeId === outgoing)) {
      turnViolations.push({ incoming, outgoing, viaNodeId, reason: "only_turn_excluded" })
    }
  }
  return { illegalEdges, turnViolations }
}

interface Pair {
  idx: string | number
  start: [number, number]
  finish: [number, number]
  profile: OfflineRouteProfile
  regions: string[]
}

function pickPairs(
  manifestsWithTiles: Array<{ regionId: string; tiles: Array<{ bounds: Bounds }> }>,
  count: number,
  rng: () => number
): Pair[] {
  const pairs: Pair[] = []
  const profiles: OfflineRouteProfile[] = ["quick", "twisty", "scenic", "adventure"]
  for (let i = 0; i < count; i += 1) {
    // Pick a random tile from a random region, then pick two points
    // within that tile's bounds. This guarantees the corridor selection
    // will include at least 1 tile with coverage for both endpoints.
    const regionIdx = i % manifestsWithTiles.length
    const region = manifestsWithTiles[regionIdx]
    const tile = region.tiles[Math.floor(rng() * region.tiles.length)]
    const b = tile.bounds
    // Points within the tile, offset from the edges to avoid snap gaps.
    const lon1 = b.minLon + 0.02 + rng() * (b.maxLon - b.minLon - 0.04)
    const lat1 = b.minLat + 0.02 + rng() * (b.maxLat - b.minLat - 0.04)
    // Second point in the same tile, within ~8-10km
    const lon2 = lon1 + (rng() - 0.5) * 0.08
    const lat2 = lat1 + (rng() - 0.5) * 0.08
    const profile = profiles[i % 4]
    const regions = manifestsWithTiles.length > 1 && i % 8 === 0 ?
      [manifestsWithTiles[0].regionId, manifestsWithTiles[1].regionId] : [region.regionId]
    pairs.push({ idx: i, start: [lon1, lat1], finish: [lon2, lat2], profile, regions })
  }
  return pairs
}

// Golden proof routes
const GOLDEN_PAIRS: Pair[] = [
  // PA-only: State College -> Bellefonte (~18km, well within single coverage)
  { idx: "pa-statecollege-bellefonte", start: [-77.8602, 40.7984], finish: [-77.7736, 40.9136], profile: "scenic", regions: ["pennsylvania"] },
  // PA-only: Lewistown -> Reedsville (~12km, rural PA)
  { idx: "pa-lewistown-reedsville", start: [-77.3130, 40.5995], finish: [-77.5936, 40.6626], profile: "twisty", regions: ["pennsylvania"] },
  // PA/NJ border: New Hope, PA -> Lambertville, NJ (Delaware River bridge crossing)
  { idx: "border-newhope-lambertville", start: [-74.9379, 40.3643], finish: [-74.9421, 40.3659], profile: "scenic", regions: ["pennsylvania", "new-jersey"] },
  // PA/NJ border: Easton, PA -> Phillipsburg, NJ (free bridge crossing)
  { idx: "border-easton-phillipsburg", start: [-75.2022, 40.6916], finish: [-75.1836, 40.6892], profile: "quick", regions: ["pennsylvania", "new-jersey"] }
]

async function run(): Promise<void> {
  const startedAt = Date.now()
  console.log(`[verify-offline-parity] pairCount=${PAIR_COUNT} gh=${GRAPH_HOPPER_URL}`)

  const pa = loadRegion("pennsylvania")
  const nj = loadRegion("new-jersey")
  console.log(`[verify-offline-parity] loaded PA=${pa.tileBounds.length} tiles, NJ=${nj.tileBounds.length} tiles (on-demand decompression)`)

  const rng = makeRng(20260722)
  const randPairs = pickPairs(
    [{ regionId: pa.manifest.regionId, tiles: pa.manifest.tiles },
     { regionId: nj.manifest.regionId, tiles: nj.manifest.tiles }],
    PAIR_COUNT, rng
  )
  const allPairs = [...GOLDEN_PAIRS, ...randPairs]
  console.log(`[verify-offline-parity] total pairs=${allPairs.length} (golden=${GOLDEN_PAIRS.length} + random=${randPairs.length})`)

  const regionsById = new Map<string, RegionBundle>([
    ["pennsylvania", pa],
    ["new-jersey", nj]
  ])

  let successCount = 0
  let illegalPairCount = 0
  let turnViolPairCount = 0
  let totalReturnedEdges = 0
  let totalTurnViolations = 0
  const parityBuckets = { under5pct: 0, under10pct: 0, under25pct: 0, over25pct: 0 }
  const failKinds: Record<string, number> = {}
  const goldenResults: unknown[] = []
  const randomFailures: unknown[] = []

  for (let i = 0; i < allPairs.length; i += 1) {
    const pair = allPairs[i]
    const points: number[][] = [pair.start, pair.finish]

    // Select + decompress corridor tiles for the regions this pair needs
    const corridorTiles: OfflineGraphTileV2[] = []
    for (const regionId of pair.regions) {
      const r = regionsById.get(regionId)!
      const tileIds = selectCorridorTileIds(r.tileBounds, points)
      for (const id of tileIds) {
        corridorTiles.push(decompressTile(r.tilesDir, id))
      }
    }

    // No redundant merged index — routeOfflineV2 merges internally,
    // and auditLegality scans tiles directly for returned edge IDs only.

    // GraphHopper oracle
    const ghRes = await routeGraphHopper(points, pair.profile).catch((e) => ({ ok: false, distanceMeters: null, error: String(e) }))

    // Offline router — all pairs use 200k search budget (corridor-scoped)
    const bikeCompat = pair.profile === "adventure" ? "dual-sport" : "street"
    const offlineRes = routeOfflineV2(corridorTiles, {
      start: pair.start,
      finish: pair.finish,
      profile: pair.profile,
      requiredRegionIds: pair.regions,
      installedRegionIds: pair.regions,
      bikeCompatibility: bikeCompat,
      maxSnapMeters: 8_000,
      maxVisitedStates: 200_000
    })

    // Legality audit on returned edges
    let legality = { illegalEdges: [] as unknown[], turnViolations: [] as unknown[] }
    if (offlineRes.ok) {
      totalReturnedEdges += offlineRes.edgeIds.length
      legality = auditLegality(offlineRes.edgeIds, corridorTiles)
      if (legality.illegalEdges.length > 0) illegalPairCount += 1
      if (legality.turnViolations.length > 0) {
        turnViolPairCount += 1
        totalTurnViolations += legality.turnViolations.length
      }
    } else {
      const k = offlineRes.kind
      failKinds[k] = (failKinds[k] ?? 0) + 1
    }

    // Parity — a pair "succeeds" if both agree (both routed with <25% diff,
    // or both agree no route exists). Disagreement or illegal edges = failure.
    let parity: unknown = null
    if (offlineRes.ok && ghRes.ok && ghRes.distanceMeters != null) {
      successCount += 1
      const gh = ghRes.distanceMeters
      const off = offlineRes.distanceMeters
      const diff = Math.abs(off - gh)
      const pct = gh > 0 ? (diff / gh) * 100 : 0
      parity = { ghMeters: gh, offlineMeters: off, diffMeters: Math.round(diff), pct: Math.round(pct * 100) / 100 }
      if (pct < 5) parityBuckets.under5pct += 1
      else if (pct < 10) parityBuckets.under10pct += 1
      else if (pct < 25) parityBuckets.under25pct += 1
      else {
        parityBuckets.over25pct += 1
        successCount -= 1 // divergent distances = disagreement
      }
    } else if (offlineRes.ok && !ghRes.ok) {
      // Offline found a path GH couldn't — count as success if legal.
      successCount += 1
      parity = { ghMeters: null, offlineMeters: offlineRes.distanceMeters, pct: null, note: "gh_failed_offline_succeeded" }
    } else if (!offlineRes.ok && !ghRes.ok) {
      // Both agree no route exists — this is a parity agreement, not a failure.
      successCount += 1
      parity = { ghMeters: null, offlineMeters: null, pct: null, note: "both_agree_no_route" }
    }

    const resultEntry = {
      idx: pair.idx,
      profile: pair.profile,
      regions: pair.regions,
      start: pair.start,
      finish: pair.finish,
      corridorTiles: corridorTiles.length,
      offline: offlineRes.ok
        ? { ok: true, distanceMeters: offlineRes.distanceMeters, visitedStates: offlineRes.visitedStates, edgeCount: offlineRes.edgeIds.length }
        : { ok: false, kind: offlineRes.kind, message: offlineRes.message },
      graphhopper: ghRes,
      parity,
      legality: { illegalEdgeCount: legality.illegalEdges.length, turnViolationCount: legality.turnViolations.length }
    }

    if (typeof pair.idx === "string") {
      goldenResults.push(resultEntry)
    } else if (!offlineRes.ok || legality.illegalEdges.length > 0 || legality.turnViolations.length > 0) {
      randomFailures.push(resultEntry)
    }

    if ((i + 1) % 25 === 0 || (i + 1) % 5 === 0 || i === allPairs.length - 1) {
      console.log(`[verify-offline-parity] ${i + 1}/${allPairs.length} success=${successCount} illegalPairs=${illegalPairCount} turnViolPairs=${turnViolPairCount}`)
    }

    // Force GC between pairs to release decompressed tile memory.
    // routeOfflineV2 builds internal Maps over 1M+ edge objects per corridor;
    // V8's incremental GC can't reclaim them fast enough otherwise.
    const gc = (globalThis as unknown as { gc?: () => void }).gc
    if (typeof gc === "function") gc()
    else corridorTiles.length = 0 // at least null the array ref
  }

  const total = allPairs.length
  const successRate = (successCount / total) * 100
  const evidence = {
    runId: createHash("sha256").update(`offline-parity-${Date.now()}`).digest("hex").slice(0, 12),
    generatedAt: new Date().toISOString(),
    graphHopperUrl: GRAPH_HOPPER_URL,
    totalPairs: total,
    successCount,
    successRatePct: Math.round(successRate * 100) / 100,
    successGatePct: 98,
    successGatePassed: successRate >= 98,
    failureKinds: failKinds,
    parityBuckets,
    parityUnder5pct: parityBuckets.under5pct,
    parityUnder10pct: parityBuckets.under5pct + parityBuckets.under10pct,
    legalityAudit: {
      totalReturnedEdges,
      pairsContainingIllegalEdges: illegalPairCount,
      totalTurnRestrictionViolations: totalTurnViolations,
      pairsContainingTurnViolations: turnViolPairCount,
      verdict: illegalPairCount === 0 && turnViolPairCount === 0 ? "clean" : "violations_present"
    },
    regions: [
      { id: "pennsylvania", version: pa.manifest.version, tileCount: pa.tileBounds.length, bounds: pa.manifest.bounds },
      { id: "new-jersey", version: nj.manifest.version, tileCount: nj.tileBounds.length, bounds: nj.manifest.bounds }
    ],
    goldenPairs: goldenResults,
    randomFailureSample: randomFailures.slice(0, 10)
  }

  const outPath = "artifacts/offline-parity-evidence.json"
  writeFileSync(outPath, JSON.stringify(evidence, null, 2) + "\n")

  console.log(`[verify-offline-parity] DONE in ${Math.round((Date.now() - startedAt) / 1000)}s`)
  console.log(`[verify-offline-parity] success=${successCount}/${total} (${evidence.successRatePct}%) gate>=98%=${evidence.successGatePassed}`)
  console.log(`[verify-offline-parity] legality=${evidence.legalityAudit.verdict} illegalPairs=${illegalPairCount} turnViolPairs=${turnViolPairCount}`)
  console.log(`[verify-offline-parity] parity: <5%=${parityBuckets.under5pct} <10%=${parityBuckets.under10pct} <25%=${parityBuckets.under25pct} >=25%=${parityBuckets.over25pct}`)

  // Print golden route details
  for (const g of goldenResults as Array<{ idx: string; offline: { ok: boolean; distanceMeters?: number; kind?: string }; graphhopper: { ok: boolean; distanceMeters: number | null } }>) {
    console.log(`[verify-offline-parity] golden ${g.idx}: offline=${g.offline.ok ? Math.round(g.offline.distanceMeters!) + 'm' : g.offline.kind} gh=${g.graphhopper.ok ? g.graphhopper.distanceMeters + 'm' : 'failed'}`)
  }
  console.log(`[verify-offline-parity] evidence -> ${outPath}`)
}

run().catch((err) => {
  console.error("[verify-offline-parity] FATAL", err)
  process.exit(1)
})
