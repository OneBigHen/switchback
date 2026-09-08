export type CoordinatePoint = readonly [number, number]

export interface NormalizedPoint {
  x: number
  y: number
}

export interface NormalizePointOptions {
  width: number
  height: number
  padding: number
}
