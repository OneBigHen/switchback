import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

/**
 * Builds data/gpx-library/atlas.json — prettymaps-style poster art for every
 * imported GPX route. Run after `npm run gpx:import-projects`:
 *
 *   node scripts/build-route-atlas.mjs
 *
 * Pipeline per route: Mercator project → aspect-fit → jitter filter →
 * RDP simplify → Chaikin smooth → curvature heat (p95-normalized per route)
 * → continuous color ramp → chunked SVG paths in a shared 100x125 viewBox.
 */

const TILE = 256
const MAX_LAT = 85.05112878
const VIEW_W = 100
const VIEW_H = 125
const PADDING = 8
const JITTER_MIN = 0.25 // view-space units; GPS noise below this is dropped
const RDP_EPSILON = 0.22
const CHAIKIN_ITERATIONS = 2
const MAX_CHUNKS = 16
const MIN_CHUNK_POINTS = 60

const root = process.env.GPX_LIBRARY_PATH ?? path.join(process.cwd(), "data/gpx-library")

function bandOf(t) {
  if (t >= 0.75) return "hairpin"
  if (t >= 0.5) return "twisty"
  if (t >= 0.25) return "mellow"
  return "calm"
}

function mercatorY(lat) {
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat))
  const sin = Math.sin((clamped * Math.PI) / 180)
  return (TILE / (2 * Math.PI)) * Math.log((1 + sin) / (1 - sin))
}

function curvatureAt(points, i) {
  if (i <= 0 || i >= points.length - 1) return 0
  const ax = points[i][0] - points[i - 1][0]
  const ay = points[i][1] - points[i - 1][1]
  const bx = points[i + 1][0] - points[i][0]
  const by = points[i + 1][1] - points[i][1]
  const la = Math.hypot(ax, ay)
  const lb = Math.hypot(bx, by)
  if (la < 1e-12 || lb < 1e-12) return 0
  let dot = (ax * bx + ay * by) / (la * lb)
  dot = Math.max(-1, Math.min(1, dot))
  return (Math.acos(dot) * 180) / Math.PI
}

function smoothHeat(values, window = 7) {
  const half = Math.floor(window / 2)
  return values.map((_, i) => {
    let sum = 0
    let count = 0
    for (let j = i - half; j <= i + half; j += 1) {
      if (j >= 0 && j < values.length) {
        sum += values[j]
        count += 1
      }
    }
    return count > 0 ? sum / count : 0
  })
}

/** Drop GPS jitter: keep only points that move the line. */
function dropJitter(points, minDist) {
  const out = [points[0]]
  for (let i = 1; i < points.length; i += 1) {
    const [x, y] = points[i]
    const [px, py] = out[out.length - 1]
    if (Math.hypot(x - px, y - py) >= minDist) out.push(points[i])
  }
  return out
}

/** Ramer-Douglas-Peucker simplification. */
function rdp(points, epsilon) {
  if (points.length < 3) return points
  const keep = new Array(points.length).fill(false)
  keep[0] = true
  keep[points.length - 1] = true
  const stack = [[0, points.length - 1]]
  while (stack.length > 0) {
    const [start, end] = stack.pop()
    let maxDist = 0
    let index = -1
    const [x1, y1] = points[start]
    const [x2, y2] = points[end]
    const dx = x2 - x1
    const dy = y2 - y1
    const len = Math.hypot(dx, dy) || 1e-12
    for (let i = start + 1; i < end; i += 1) {
      const [px, py] = points[i]
      const dist = Math.abs(dy * px - dx * py + x2 * y1 - y2 * x1) / len
      if (dist > maxDist) {
        maxDist = dist
        index = i
      }
    }
    if (maxDist > epsilon && index > 0) {
      keep[index] = true
      stack.push([start, index], [index, end])
    }
  }
  return points.filter((_, i) => keep[i])
}

/** Chaikin corner-cutting: polyline → flowing curve, endpoints preserved. */
function chaikin(points) {
  if (points.length < 3) return points
  const out = [points[0]]
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[i + 1]
    out.push([x1 * 0.75 + x2 * 0.25, y1 * 0.75 + y2 * 0.25])
    out.push([x1 * 0.25 + x2 * 0.75, y1 * 0.25 + y2 * 0.75])
  }
  out.push(points[points.length - 1])
  return out
}

function pathData(points) {
  return (
    `M ${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)} ` +
    points.slice(1).map((p) => `L ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ")
  )
}

function geometrySignature(geometry) {
  return geometry.map(([longitude, latitude]) => `${longitude.toFixed(4)},${latitude.toFixed(4)}`).join("|")
}

async function main() {
  const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"))
  const out = { version: 2, generatedAt: new Date().toISOString(), count: 0, routes: {} }
  const seenSignatures = new Map()

  for (const summary of manifest.routes) {
    let route
    try {
      route = JSON.parse(await readFile(path.join(root, "routes", `${summary.id}.json`), "utf8"))
    } catch {
      continue
    }
    const geo = Array.isArray(route.geometry)
      ? route.geometry.filter((p) => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1]))
      : []
    if (geo.length < 2) continue

    // Real-world extent in lon/lat, so the atlas listing can sort rides by
    // distance from the rider and cluster them by area without re-reading
    // every per-route geometry file. Four rounded numbers per route.
    let west = Infinity
    let south = Infinity
    let east = -Infinity
    let north = -Infinity
    for (const [lon, lat] of geo) {
      if (lon < west) west = lon
      if (lon > east) east = lon
      if (lat < south) south = lat
      if (lat > north) north = lat
    }
    const bbox = [
      Number(west.toFixed(5)),
      Number(south.toFixed(5)),
      Number(east.toFixed(5)),
      Number(north.toFixed(5))
    ]

    const projected = geo.map(([lon, lat]) => [lon, mercatorY(lat)])
    const xs = projected.map((p) => p[0])
    const ys = projected.map((p) => p[1])
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const spanX = Math.max(1e-9, maxX - minX)
    const spanY = Math.max(1e-9, maxY - minY)

    const boxW = VIEW_W - PADDING * 2
    const boxH = VIEW_H - PADDING * 2
    const scale = Math.min(boxW / spanX, boxH / spanY)
    const offsetX = PADDING + (boxW - spanX * scale) / 2
    const offsetY = PADDING + (boxH - spanY * scale) / 2
    const fitted = projected.map(([x, y]) => [offsetX + (x - minX) * scale, offsetY + (maxY - y) * scale])

    const clean = dropJitter(fitted, JITTER_MIN)
    if (clean.length < 2) continue
    const simplified = rdp(clean, RDP_EPSILON)
    let view = simplified
    for (let i = 0; i < CHAIKIN_ITERATIONS; i += 1) view = chaikin(view)

    // Curvature heat on the smoothed line, normalized by the route's own 95th
    // percentile so calm rides stay calm and twisty rides pop.
    const heat = smoothHeat(view.map((_, i) => curvatureAt(view, i)))
    const ranked = [...heat].sort((a, b) => a - b)
    const ref = Math.max(4, ranked[Math.floor(ranked.length * 0.95)])
    const heat01 = heat.map((h) => Math.min(1, h / ref))

    const chunkSize = Math.max(MIN_CHUNK_POINTS, Math.ceil(view.length / MAX_CHUNKS))
    const paths = []
    for (let i = 0; i < view.length - 1; i += chunkSize) {
      const slice = view.slice(i, Math.min(view.length, i + chunkSize + 1))
      const heatSlice = heat01.slice(i, i + slice.length)
      if (slice.length < 2) continue
      const sorted = [...heatSlice].sort((a, b) => a - b)
      const peak = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))]
      paths.push({
        band: bandOf(peak),
        heat: Number(Math.pow(peak, 0.85).toFixed(4)),
        d: pathData(slice)
      })
    }
    if (paths.length === 0) continue

    const signature = geometrySignature(geo)
    const canonicalId = seenSignatures.get(signature)

    out.routes[summary.id] = {
      aspect: Number((spanX / spanY).toFixed(4)),
      bbox,
      paths,
      start: [Number(view[0][0].toFixed(1)), Number(view[0][1].toFixed(1))],
      end: [Number(view[view.length - 1][0].toFixed(1)), Number(view[view.length - 1][1].toFixed(1))]
    }
    if (canonicalId) {
      out.routes[summary.id].duplicateOf = canonicalId
    } else {
      seenSignatures.set(signature, summary.id)
      out.count += 1
    }
  }

  await writeFile(path.join(root, "atlas.json"), JSON.stringify(out))
  console.log(`route atlas: wrote poster art for ${out.count} of ${manifest.routes.length} routes`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
