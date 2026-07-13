export interface FallbackStyleImage {
  width: number
  height: number
  data: Uint8Array
}

export function createFallbackStyleImage(id: string): FallbackStyleImage | null {
  const match = /^circle-(\d+)$/.exec(id)
  if (!match) return null
  const size = Math.max(3, Math.min(Number(match[1]), 64))
  const data = new Uint8Array(size * size * 4)
  const center = (size - 1) / 2
  const radius = Math.max(1, center - 0.75)

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (Math.hypot(x - center, y - center) > radius) continue
      const offset = (y * size + x) * 4
      data[offset] = 255
      data[offset + 1] = 255
      data[offset + 2] = 255
      data[offset + 3] = 255
    }
  }
  return { width: size, height: size, data }
}
