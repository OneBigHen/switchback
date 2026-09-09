export type MapStyleFamily = "standard" | "standard-satellite"

export type MapPresetId = "road" | "terrain" | "satellite"

export interface MapPresetDefinition {
  id: MapPresetId
  label: string
  description: string
  styleFamily: MapStyleFamily
  requiresPremiumRenderer: boolean
}

export const MAP_PRESETS = [
  {
    id: "road",
    label: "Road",
    description: "Clear road-first view for planning and comparison.",
    styleFamily: "standard",
    requiresPremiumRenderer: false
  },
  {
    id: "terrain",
    label: "Terrain",
    description: "Landform and relief for backroad and mountain context.",
    styleFamily: "standard",
    requiresPremiumRenderer: false
  },
  {
    id: "satellite",
    label: "Satellite",
    description: "Imagery for real-world land cover and surroundings.",
    styleFamily: "standard-satellite",
    requiresPremiumRenderer: true
  }
] as const satisfies readonly MapPresetDefinition[]

const PRESETS_BY_ID = new Map<MapPresetId, MapPresetDefinition>(
  MAP_PRESETS.map((preset) => [preset.id, preset])
)

export function isMapPresetId(value: unknown): value is MapPresetId {
  return typeof value === "string" && PRESETS_BY_ID.has(value as MapPresetId)
}

export function mapPresetDefinition(id: MapPresetId): MapPresetDefinition {
  return PRESETS_BY_ID.get(id)!
}

export function availableMapPresets(
  { premiumRenderer }: { premiumRenderer: boolean }
): readonly MapPresetDefinition[] {
  return MAP_PRESETS.filter((preset) => premiumRenderer || !preset.requiresPremiumRenderer)
}
