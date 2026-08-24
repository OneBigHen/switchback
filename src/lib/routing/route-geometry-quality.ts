import type { Coordinate } from "./types"
import { haversine } from "./scoring"

/**
 * Share of route distance spent on IMMEDIATE backtracking: a segment that
 * heads back toward where the route recently came from (bearing within 120°
 * of the reverse of the direction travelled ~1.5 km earlier). Dead-end spurs
 * and u-turns count; graceful valley loops that keep progressing along the
 * corridor do not. Hard gate: more than 15% is rejected.
 */
export function backtrackingShare(geometry: Coordinate[]): number {
  if (geometry.length < 5) return 0
  const toRad = Math.PI / 180
  const cumulative: number[] = [0]
  for (let index = 0; index < geometry.length - 1; index += 1) {
    cumulative.push(cumulative[index]! + haversine(geometry[index]!, geometry[index + 1]!))
  }
  const total = cumulative[cumulative.length - 1]!
  if (total < 1) return 0

  const bearing = (first: Coordinate, second: Coordinate): number => {
    const y = Math.sin((second[0] - first[0]) * toRad) * Math.cos(second[1] * toRad)
    const x = Math.cos(first[1] * toRad) * Math.sin(second[1] * toRad)
      - Math.sin(first[1] * toRad) * Math.cos(second[1] * toRad) * Math.cos((second[0] - first[0]) * toRad)
    return Math.atan2(y, x)
  }

  let backtracking = 0
  for (let index = 1; index < geometry.length - 1; index += 1) {
    const travelledBefore = cumulative[index]!
    const lookbackTarget = travelledBefore - 1500
    let earlier = 0
    while (earlier < geometry.length - 1 && cumulative[earlier + 1]! <= lookbackTarget) earlier += 1
    if (earlier >= index) continue
    const segmentBearing = bearing(geometry[index]!, geometry[index + 1]!)
    const earlierBearing = bearing(geometry[earlier]!, geometry[earlier + 1]!)
    let deviation = Math.abs(segmentBearing - earlierBearing)
    if (deviation > Math.PI) deviation = 2 * Math.PI - deviation
    if (deviation > (120 * Math.PI) / 180) {
      backtracking += haversine(geometry[index]!, geometry[index + 1]!)
    }
  }
  return total > 0 ? backtracking / total : 0
}

/**
 * Share of route distance that revisits an already-traveled corridor: sample
 * the line every ~150 m and count samples within 100 m of an earlier sample.
 * Parallel-but-distinct roads stay separate; a route that crosses or returns
 * along the same road is flagged. Hard gate: more than 20% is rejected.
 */
export function selfOverlapShare(geometry: Coordinate[]): number {
  if (geometry.length < 3) return 0
  const SAMPLE_METERS = 150
  const NEAR_METERS = 100

  const samples: Coordinate[] = []
  samples.push(geometry[0]!)
  let carry = 0
  for (let index = 0; index < geometry.length - 1; index += 1) {
    const first = geometry[index]!
    const second = geometry[index + 1]!
    const segmentDistance = haversine(first, second)
    if (segmentDistance === 0) continue
    let position = SAMPLE_METERS - carry
    while (position < segmentDistance) {
      const ratio = position / segmentDistance
      samples.push([first[0] + (second[0] - first[0]) * ratio, first[1] + (second[1] - first[1]) * ratio])
      position += SAMPLE_METERS
    }
    carry = Math.max(0, segmentDistance - (position - SAMPLE_METERS))
  }
  if (samples[samples.length - 1] !== geometry[geometry.length - 1]) {
    samples.push(geometry[geometry.length - 1]!)
  }

  let overlapping = 0
  for (let index = 1; index < samples.length; index += 1) {
    const point = samples[index]!
    let near = false
    for (let prior = 0; prior < index; prior += 1) {
      if (haversine(samples[prior]!, point) < NEAR_METERS) {
        near = true
        break
      }
    }
    if (near) overlapping += 1
  }
  return samples.length > 1 ? overlapping / (samples.length - 1) : 0
}
