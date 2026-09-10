interface ClassifiableRideLibraryItem {
  kind: "saved-route" | "recorded-ride" | "trip-plan" | "project-gpx"
  management?: { imported?: boolean }
}

/** One authority for whether a library row belongs to the Imported bucket. */
export function isImportedRideLibraryItem(item: ClassifiableRideLibraryItem): boolean {
  return item.kind === "project-gpx" || item.management?.imported === true
}

/** Rider-facing identity that must agree with the filter/count classification. */
export function rideLibraryKindLabel(item: ClassifiableRideLibraryItem): string {
  if (isImportedRideLibraryItem(item)) return "Imported"
  if (item.kind === "saved-route") return "Planned"
  if (item.kind === "recorded-ride") return "Recorded"
  if (item.kind === "trip-plan") return "Trip"
  return "Imported"
}
