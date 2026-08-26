import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

/**
 * Builds data/gpx-library/atlas.json — precomputed curvature-colored poster
 * art for every imported GPX route. Run after `npm run gpx:import-projects`:
 *
 *   node scripts/build-route-atlas.mjs
 *
 * Art is stored as SVG path data in a shared 100x125 viewBox so the gallery
 * renders without shipping route geometry to anonymous clients.
 */

const TILE = 256
const MAX_LAT = 85.05112878
const VIEW_W = 100
const VIEW_H = 125
const PADDING = 8
const MAX_POINTS_PER_SEGMENT = 240
const POINTS_PER_SEGMENT = 90
const SIMPLIFY_EPSILON = 0.32

const root = process.env.GPX_LIBRARY_PATH ?? path.join(process.cwd(), "data/gpx-library")

function mercatorY(lat) {
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat))
  const sin = Math.sin((clamped * Math.PI) / 180)
  return (TILE / (2 * Math.PI)) * Math.log((1 + sin) / (1 - sin))
}

function curvatureAt(points, i) {
  if (i <= 0 || i >= points.length - 1) return 0
  const [ax, ay] = [points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]]
  const [bx, by] = [points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]]
  const la = Math.hypot(ax, ay)
  const lb = Math.hypot(bx, by)
  if (la < 1e-12 || lb < 1e-12) return 0
  let dot = (ax * bx + ay * by) / (la * lb)
  dot = Math.max(-1, Math.min(1, dot))
  return (Math.acos(dot) * 180) / Math.PI
}

function smooth(values, window = 5) {
  if (values.length < window) return values
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

function curvatureBand(value) {
  if (value >= 65) return "hairpin"
  if (value >= 45) return "twisty"
  if (value >= 22) return "mellow"
  return "calm"
}


/** Ramer-Douglas-Peucker simplification; returns kept ORIGINAL point indices. */
function rdpIndices(points, epsilon) {
  if (points.length < 3) return points.map((_, i) => i)
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
  return keep.reduce((acc, flag, i) => {
    if (flag) acc.push(i)
    return acc
  }, [])
}

async function main() {
  const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"))
  const out = { version: 1, generatedAt: new Date().toISOString(), count: 0, routes: {} }
  const seenSignatures = new Map()

  for (const summary of manifest.routes) {
    let route
    try {
      route = JSON.parse(await readFile(path.join(root, "routes", `${summary.id}.json`), "utf8"))
    } catch {
      continue
    }
    const geo = Array.isArray(route.geometry) ? route.geometry.filter((p) => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1])) : []
    if (geo.length < 2) continue

    const projected = geo.map(([lon, lat]) => [lon, mercatorY(lat)])
    const xs = projected.map((p) => p[0])
    const ys = projected.map((p) => p[1])
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const spanX = Math.max(1e-9, maxX - minX)
    const spanY = Math.max(1e-9, maxY - minY)

    // Aspect-fit the route shape inside the poster viewbox.
    const boxW = VIEW_W - PADDING * 2
    const boxH = VIEW_H - PADDING * 2
    const scale = Math.min(boxW / spanX, boxH / spanY)
    const offsetX = PADDING + (boxW - spanX * scale) / 2
    const offsetY = PADDING + (boxH - spanY * scale) / 2
    const fitted = projected.map(([x, y]) => [offsetX + (x - minX) * scale, offsetY + (maxY - y) * scale])
    const keptIndices = rdpIndices(fitted, SIMPLIFY_EPSILON)
    const view = keptIndices.map((i) => fitted[i])
    // Curvature is measured on the DENSE geometry, then sampled at the kept
    // points — simplification otherwise inflates angles and turns every
    // poster red.
    const denseHeat = smooth(projected.map((_, i) => curvatureAt(projected, i)))
    const heat = keptIndices.map((i) => denseHeat[i])

    // Chunk long routes so each drawn piece carries its own average color.
    const chunks = []
    for (let i = 0; i < view.length; i += POINTS_PER_SEGMENT) {
      const slice = view.slice(i, i + POINTS_PER_SEGMENT + 1)
      const heatSlice = heat.slice(i, i + MAX_POINTS_PER_SEGMENT + 1)
      if (slice.length >= 2) chunks.push({ slice, heatSlice })
    }

    const paths = chunks.map(({ slice, heatSlice }) => {
      // Color by peak corner intensity (p90 of smoothed heat), not the mean —
      // a handful of hairpins should light up their stretch of road.
      const sorted = [...heatSlice].sort((a, b) => a - b)
      const peak = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))]
      return {
      band: curvatureBand(peak),
      d:
        `M ${slice[0][0].toFixed(1)} ${slice[0][1].toFixed(1)} ` +
        slice.slice(1).map((p) => `L ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ")
      }
    })

    // Geometry signature: identical files imported twice get identical
    // signatures, and later twins point at the first canonical poster.
    const signature = `${geo.length}|${geo[0][0].toFixed(4)},${geo[0][1].toFixed(4)}|${geo[geo.length - 1][0].toFixed(4)},${geo[geo.length - 1][1].toFixed(4)}`
    const canonicalId = seenSignatures.get(signature)

    out.routes[summary.id] = {
      aspect: Number((spanX / spanY).toFixed(4)),
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
