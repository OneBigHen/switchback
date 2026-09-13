"use client";

import type { PickerEntry, PickerGroups } from "./picker-groups";

/**
 * The floating track picker. Section membership and badge text derive from
 * `playbackKind` (see picker-groups), never from which loader produced a
 * track, so recorded and preview truth survive colour loss — the badge
 * always names the kind. Journal failure is a distinct unavailable state,
 * never a false "no rides yet", and rejected entries are counted, not
 * silently dropped.
 */

export type { CatalogEntry } from "./picker-groups";

interface ReconRidePickerProps {
  groups: PickerGroups;
  journalState: "loading" | "ready" | "unavailable";
  /** Journal entries that failed to adapt, surfaced instead of hidden. */
  journalRejectedCount: number;
  catalogUnavailable: boolean;
  selectedId: string | null;
  onSelect(id: string): void;
}

export default function ReconRidePicker({
  groups,
  journalState,
  journalRejectedCount,
  catalogUnavailable,
  selectedId,
  onSelect,
}: ReconRidePickerProps) {
  return (
    <nav className="recon-picker" aria-label="Recon tracks">
      <p className="recon-section-heading">Recorded rides</p>
      {journalState === "loading" ? (
        <p className="recon-quiet-note">Loading your ride journal…</p>
      ) : journalState === "unavailable" ? (
        <p className="recon-quiet-note">
          Your ride journal is unavailable right now.
        </p>
      ) : groups.recorded.length === 0 ? (
        <p className="recon-quiet-note">
          No recorded rides yet. Record a ride and Recon will bring it back to
          life.
        </p>
      ) : (
        <ul className="recon-track-list">
          {groups.recorded.map((entry) => (
            <li key={entry.id}>
              <TrackRow
                entry={entry}
                selected={entry.id === selectedId}
                onSelect={onSelect}
              />
            </li>
          ))}
        </ul>
      )}
      {journalState === "ready" && journalRejectedCount > 0 ? (
        <p className="recon-quiet-note">
          {journalRejectedCount} journal{" "}
          {journalRejectedCount === 1 ? "entry" : "entries"} could not be read
          (unreadable geometry or timestamps) and{" "}
          {journalRejectedCount === 1 ? "is" : "are"} left out.
        </p>
      ) : null}

      <p className="recon-section-heading">Route previews</p>
      {catalogUnavailable ? (
        <p className="recon-quiet-note">
          The Route Library is unavailable right now.
        </p>
      ) : groups.previews.length === 0 ? (
        <p className="recon-quiet-note">Nothing in the Route Library yet.</p>
      ) : (
        <ul className="recon-track-list">
          {groups.previews.map((entry) => (
            <li key={entry.id}>
              <TrackRow
                entry={entry}
                selected={entry.id === selectedId}
                onSelect={onSelect}
              />
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}

function TrackRow({
  entry,
  selected,
  onSelect,
}: {
  entry: PickerEntry;
  selected: boolean;
  onSelect(id: string): void;
}) {
  const badgeClass =
    entry.badge === "Recorded" ? "recon-badge-recorded" : "recon-badge-preview";
  return (
    <button
      type="button"
      className="recon-track-row"
      aria-pressed={selected}
      onClick={() => onSelect(entry.id)}
    >
      <span className="recon-row-top">
        <span className="recon-row-name">{entry.name}</span>
        <span className={`recon-badge ${badgeClass}`}>{entry.badge}</span>
      </span>
      <span className="recon-row-meta">{entry.meta}</span>
    </button>
  );
}
