import {
  migrateRiderLayerId,
  type RiderLayerSetting,
  type RiderLayerSettingInput
} from "@/lib/client/map-layers"

/**
 * Canonicalize only the layer settings a rider explicitly persisted.
 *
 * Runtime normalization intentionally expands a partial list to the complete
 * catalog so the map studio can render every supported layer. Persistence must
 * not do that: a one-layer map pack should remain one layer on disk, otherwise
 * every catalog addition rewrites old packs and blurs the distinction between
 * a rider choice and a default.
 */
export function normalizePersistedRiderLayerSettings(
  settings: readonly RiderLayerSettingInput[] | null | undefined
): RiderLayerSetting[] {
  const selected = new Map<RiderLayerSetting["id"], RiderLayerSetting>()
  for (const setting of settings ?? []) {
    const id = migrateRiderLayerId(setting.id)
    if (!id || selected.has(id)) continue
    selected.set(id, {
      id,
      visible: Boolean(setting.visible),
      opacity: Math.max(0, Math.min(1, Number.isFinite(setting.opacity) ? setting.opacity : 1)),
      order: Number.isFinite(setting.order) ? Math.max(0, Math.floor(setting.order)) : selected.size
    })
  }
  return [...selected.values()]
    .sort((left, right) => left.order - right.order)
    .map((setting, order) => ({ ...setting, order }))
}
