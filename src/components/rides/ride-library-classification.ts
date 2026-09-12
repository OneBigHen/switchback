interface ClassifiableRideLibraryItem {
  kind: "saved-route" | "recorded-ride" | "trip-plan"
  management?: { imported?: boolean }
}

/** One authority for whether a rider-owned row belongs to the Imported bucket. */
export function isImportedRideLibraryItem(item: ClassifiableRideLibraryItem): boolean {
  return item.management?.imported === true
}

/** Rider-facing identity that must agree with the filter/count classification. */
export function rideLibraryKindLabel(item: ClassifiableRideLibraryItem): string {
  if (isImportedRideLibraryItem(item)) return "Imported"
  if (item.kind === "saved-route") return "Planned"
  if (item.kind === "recorded-ride") return "Recorded"
  return "Trip"
}
