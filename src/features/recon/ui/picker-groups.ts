import type { ReconTrack } from "@/features/recon/types";
import { formatRecordedRowMeta, formatTrackMiles } from "./recon-format";

/**
 * Picker grouping, derived from track truth instead of loader origin.
 *
 * A journal entry without timestamps is a Route Preview and is presented as
 * one, wherever it came from: the section lists and the badge text both
 * derive from `playbackKind`, so the same track can never be labelled two
 * ways and colour never has to carry the distinction alone.
 */

export interface CatalogEntry {
  id: string;
  name: string;
}

export type PickerBadge = "Recorded" | "Preview";

export interface PickerEntry {
  id: string;
  name: string;
  badge: PickerBadge;
  meta: string;
  /** True when geometry is already adapted and distance is observable. */
  hasGeometry: boolean;
}

export interface PickerGroups {
  recorded: PickerEntry[];
  previews: PickerEntry[];
}

export function pickerEntryFromTrack(track: ReconTrack): PickerEntry {
  if (track.playbackKind === "recorded") {
    return {
      id: track.id,
      name: track.name,
      badge: "Recorded",
      meta: formatRecordedRowMeta(track),
      hasGeometry: true,
    };
  }
  // Journal geometry without timestamps: a preview with distance, and
  // never a date, a duration, or a claim the user rode it.
  return {
    id: track.id,
    name: track.name,
    badge: "Preview",
    meta: formatTrackMiles(track.distanceMeters),
    hasGeometry: true,
  };
}

export function groupPickerEntries(
  journalTracks: readonly ReconTrack[],
  catalogEntries: readonly CatalogEntry[],
): PickerGroups {
  const recorded: PickerEntry[] = [];
  const previews: PickerEntry[] = [];
  for (const track of journalTracks) {
    const entry = pickerEntryFromTrack(track);
    if (entry.badge === "Recorded") recorded.push(entry);
    else previews.push(entry);
  }
  for (const entry of catalogEntries) {
    previews.push({
      id: entry.id,
      name: entry.name,
      badge: "Preview",
      meta: "Distance shown after the route loads",
      hasGeometry: false,
    });
  }
  return { recorded, previews };
}
