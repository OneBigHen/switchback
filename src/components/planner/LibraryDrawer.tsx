"use client"

import { ArrowRight, FileArrowUp, MapTrifold, Trash, X } from "@phosphor-icons/react"
import { useEffect, useRef, useState } from "react"
import type { SavedRoute } from "@/lib/storage/route-library"

interface LibraryDrawerProps {
  routes: SavedRoute[]
  onClose(): void
  onLoad(route: SavedRoute): void
  onDelete(route: SavedRoute): void
  onImport(file: File): void
}

export function LibraryDrawer({ routes, onClose, onLoad, onDelete, onImport }: LibraryDrawerProps) {
  const scrimRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const scrim = scrimRef.current
    const background = scrim?.parentElement
      ? Array.from(scrim.parentElement.children).filter(
        (element): element is HTMLElement => element instanceof HTMLElement && element !== scrim
      )
      : []
    const backgroundState = background.map((element) => ({
      element,
      inert: element.inert,
      ariaHidden: element.getAttribute("aria-hidden")
    }))

    for (const element of background) {
      element.inert = true
      element.setAttribute("aria-hidden", "true")
    }
    closeButtonRef.current?.focus()

    return () => {
      for (const { element, inert, ariaHidden } of backgroundState) {
        element.inert = Boolean(inert)
        if (ariaHidden == null) element.removeAttribute("aria-hidden")
        else element.setAttribute("aria-hidden", ariaHidden)
      }
      previouslyFocused?.focus()
    }
  }, [])

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== "Tab") return

    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex='-1'])"
    ) ?? []).filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true")
    const first = focusable[0]
    const last = focusable.at(-1)
    if (!first || !last) {
      event.preventDefault()
      dialogRef.current?.focus()
      return
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div ref={scrimRef} className="drawer-scrim" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <aside
        ref={dialogRef}
        className="library-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-title"
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
      >
        <header>
          <div>
            <span className="eyebrow">Saved on this device</span>
            <h2 id="library-title">Ride library</h2>
          </div>
          <div className="drawer-header-actions">
            <label className="import-route-button">
              <FileArrowUp aria-hidden="true" />
              <span>Import GPX</span>
              <input
                type="file"
                accept=".gpx,application/gpx+xml,application/xml,text/xml"
                aria-label="Import GPX file"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) onImport(file)
                  event.currentTarget.value = ""
                }}
              />
            </label>
            <button
              ref={closeButtonRef}
              type="button"
              className="icon-tool"
              aria-label="Close library"
              onClick={onClose}
            >
              <X aria-hidden="true" />
            </button>
          </div>
        </header>

        {routes.length === 0 ? (
          <div className="library-empty">
            <MapTrifold aria-hidden="true" />
            <strong>No routes parked yet</strong>
            <p>Build a live route, then save it here for another day.</p>
          </div>
        ) : (
          <div className="library-list">
            {routes.map((route) => (
              <article className="library-row" key={route.id}>
                <button type="button" className="library-load" onClick={() => onLoad(route)}>
                  <span>
                    <small>{route.profile} · {new Date(route.updatedAt).toLocaleDateString()}</small>
                    <strong>{route.name}</strong>
                  </span>
                  <span className="library-metrics">
                    {route.distanceMiles.toFixed(1)} mi · {Math.round(route.durationMinutes)} min
                  </span>
                  <ArrowRight aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={`delete-route${pendingDeleteId === route.id ? " is-confirming" : ""}`}
                  aria-label={pendingDeleteId === route.id
                    ? `Confirm delete ${route.name}`
                    : `Delete ${route.name}`}
                  aria-pressed={pendingDeleteId === route.id}
                  onClick={() => {
                    if (pendingDeleteId === route.id) {
                      setPendingDeleteId(null)
                      onDelete(route)
                    } else {
                      setPendingDeleteId(route.id)
                    }
                  }}
                >
                  {pendingDeleteId === route.id
                    ? <span>Delete?</span>
                    : <Trash aria-hidden="true" />}
                </button>
              </article>
            ))}
          </div>
        )}
      </aside>
    </div>
  )
}
