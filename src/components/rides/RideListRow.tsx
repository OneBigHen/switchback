"use client"

import { ArrowRight, DotsThree } from "@phosphor-icons/react"
import { useState } from "react"
import { RouteGraphic } from "@/components/v2/RouteGraphic"
import type { RideLibraryItem } from "./RidesSurface"
import styles from "./RidesSurface.module.css"

function dateLabel(value: string | null): string | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed)
    ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(parsed))
    : null
}

function parsedTags(value: string): string[] {
  return [...new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean))]
}

function kindLabel(item: RideLibraryItem): string {
  if (item.kind === "saved-route") return "Planned"
  if (item.kind === "recorded-ride") return "Recorded"
  if (item.kind === "trip-plan") return "Trip"
  return "Imported"
}

export interface RideListRowProps {
  item: RideLibraryItem
  onOpen(item: RideLibraryItem): void
  onMatchRoads?(item: RideLibraryItem): void
  onOrganize?(item: RideLibraryItem, organization: { folder?: string; tags?: string[]; visible?: boolean }): void
  onDelete?(item: RideLibraryItem): void
}

export function RideListRow({ item, onOpen, onMatchRoads, onOrganize, onDelete }: RideListRowProps) {
  const updated = dateLabel(item.updatedAt)
  const [manageOpen, setManageOpen] = useState(false)
  const [folder, setFolder] = useState(item.management?.folder ?? "")
  const [tags, setTags] = useState(item.tags.join(", "))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const management = item.management
  const canManage = Boolean(management?.canDelete || management?.canMatchRoads || (item.kind === "saved-route" && onOrganize))
  const deleteLabel = item.kind === "trip-plan" ? "trip" : item.kind === "recorded-ride" ? "recording" : "route"

  const toggleManagement = () => {
    if (!manageOpen) {
      setFolder(item.management?.folder ?? "")
      setTags(item.tags.join(", "))
      setConfirmDelete(false)
    }
    setManageOpen((open) => !open)
  }

  return (
    <article className={styles.row} data-kind={item.kind}>
      <div className={styles.rowPrimary}>
        <button className={styles.openButton} type="button" aria-label={`Open ${item.name}`} onClick={() => onOpen(item)}>
          <span className={styles.routeGraphic}>
            <RouteGraphic seed={item.id} variant="route" />
            <small>{kindLabel(item)}</small>
          </span>
          <span className={styles.identity}>
            <small>{item.sourceLabel}</small>
            <strong>{item.name}</strong>
            {item.tags.length > 0 ? <span>{item.tags.slice(0, 3).join(" · ")}</span> : <span className={styles.noTags}>Ready to ride</span>}
          </span>
          <span className={styles.metrics}>
            <b>{item.distanceMiles.toFixed(1)} mi</b>
            <span>{Math.round(item.durationMinutes)} min</span>
            {updated ? <small>{updated}</small> : <small>Project library</small>}
          </span>
          <ArrowRight weight="bold" aria-hidden="true" />
        </button>
        {canManage ? (
          <button
            className={styles.manageButton}
            type="button"
            aria-label={`Manage ${item.name}`}
            aria-expanded={manageOpen}
            onClick={toggleManagement}
          >
            <DotsThree weight="bold" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {manageOpen && management ? (
        <div className={styles.management} aria-label={`Manage ${item.name} actions`}>
          {item.kind === "saved-route" ? (
            <>
              <div className={styles.managementActions}>
                {management.canMatchRoads && onMatchRoads ? <button type="button" onClick={() => onMatchRoads(item)}>Match roads</button> : null}
                {onOrganize ? (
                  <button type="button" onClick={() => onOrganize(item, { visible: management.visible === false })}>
                    {management.visible === false ? "Show route" : "Hide route"}
                  </button>
                ) : null}
              </div>
              {onOrganize ? (
                <div className={styles.organization}>
                  <label>
                    <span>Folder</span>
                    <input aria-label="Folder" value={folder} maxLength={80} onChange={(event) => setFolder(event.target.value)} />
                  </label>
                  <label>
                    <span>Tags</span>
                    <input aria-label="Tags" value={tags} placeholder="forest, weekend" onChange={(event) => setTags(event.target.value)} />
                  </label>
                  <button type="button" onClick={() => onOrganize(item, { folder, tags: parsedTags(tags) })}>Save organization</button>
                </div>
              ) : null}
            </>
          ) : null}

          {management.canDelete && onDelete ? (
            <div className={styles.deleteActions}>
              {!confirmDelete ? (
                <button type="button" onClick={() => setConfirmDelete(true)}>Delete {deleteLabel}</button>
              ) : (
                <>
                  <span>This removes it from this device.</span>
                  <button type="button" className={styles.dangerButton} onClick={() => onDelete(item)}>Confirm delete {deleteLabel}</button>
                  <button type="button" onClick={() => setConfirmDelete(false)}>Cancel</button>
                </>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
