import type { ReconTrack } from "@/features/recon/types"
import { formatRecordedRowMeta } from "./recon-format"
import styles from "./recon-explorer.module.css"

/**
 * The floating track picker. Recorded rides and route previews are always
 * distinguishable by text badges — colour is never the only carrier.
 */

export interface CatalogEntry {
  id: string
  name: string
}

interface ReconTrackPickerProps {
  recordedTracks: ReconTrack[]
  catalogEntries: CatalogEntry[]
  catalogUnavailable: boolean
  loading: boolean
  selectedId: string | null
  onSelect(id: string): void
}

export function ReconTrackPicker({
  recordedTracks,
  catalogEntries,
  catalogUnavailable,
  loading,
  selectedId,
  onSelect,
}: ReconTrackPickerProps) {
  return (
    <nav className={styles.pickerScroll} aria-label="Recon tracks">
      <p className={styles.sectionHeading}>Recorded rides</p>
      {loading ? (
        <p className={styles.quietNote}>Loading your ride journal…</p>
      ) : recordedTracks.length === 0 ? (
        <p className={styles.quietNote}>
          No recorded rides yet. Record a ride and Recon will bring it back to life.
        </p>
      ) : (
        <ul className={styles.trackList}>
          {recordedTracks.map((track) => (
            <li key={track.id}>
              <TrackRow
                track={track}
                label="Recorded"
                badgeClass={styles.badgeRecorded}
                selected={track.id === selectedId}
                onSelect={onSelect}
                meta={formatRecordedRowMeta(track)}
              />
            </li>
          ))}
        </ul>
      )}

      <p className={styles.sectionHeading}>Route previews</p>
      {catalogUnavailable ? (
        <p className={styles.quietNote}>The Route Library is unavailable right now.</p>
      ) : catalogEntries.length === 0 ? (
        <p className={styles.quietNote}>Nothing in the Route Library yet.</p>
      ) : (
        <ul className={styles.trackList}>
          {catalogEntries.map((entry) => (
            <li key={entry.id}>
              <CatalogRow
                entry={entry}
                selected={entry.id === selectedId}
                onSelect={onSelect}
              />
            </li>
          ))}
        </ul>
      )}
    </nav>
  )
}

interface TrackRowProps {
  track: ReconTrack
  label: string
  badgeClass: string
  meta: string
  selected: boolean
  onSelect(id: string): void
}

function TrackRow({ track, label, badgeClass, meta, selected, onSelect }: TrackRowProps) {
  const classNames = selected
    ? `${styles.trackRow} ${styles.trackRowSelected}`
    : styles.trackRow
  return (
    <button
      type="button"
      className={classNames}
      aria-pressed={selected}
      onClick={() => onSelect(track.id)}
    >
      <span className={styles.rowTop}>
        <span className={styles.rowName}>{track.name}</span>
        <span className={`${styles.badge} ${badgeClass}`}>{label}</span>
      </span>
      <span className={styles.rowMeta}>{meta}</span>
    </button>
  )
}

function CatalogRow({
  entry,
  selected,
  onSelect,
}: {
  entry: CatalogEntry
  selected: boolean
  onSelect(id: string): void
}) {
  const classNames = selected
    ? `${styles.trackRow} ${styles.trackRowSelected}`
    : styles.trackRow
  return (
    <button
      type="button"
      className={classNames}
      aria-pressed={selected}
      onClick={() => onSelect(entry.id)}
    >
      <span className={styles.rowTop}>
        <span className={styles.rowName}>{entry.name}</span>
        <span className={`${styles.badge} ${styles.badgePreview}`}>Preview</span>
      </span>
      <span className={styles.rowMeta}>Distance shown after the route loads</span>
    </button>
  )
}
