"use client"

import { ArrowRight, FileArrowUp, MagnifyingGlass, MapTrifold, Trash, X } from "@phosphor-icons/react"
import { useEffect, useRef, useState } from "react"
import type { ProjectGpxRouteSummary } from "@/lib/gpx/catalog"
import type { SavedRoute } from "@/lib/storage/route-library"

interface LibraryDrawerProps {
  routes: SavedRoute[]
  projectRoutes?: ProjectGpxRouteSummary[]
  onClose(): void
  onLoad(route: SavedRoute): void
  onLoadProject?(route: ProjectGpxRouteSummary): void
  onDelete(route: SavedRoute): void
  onImport(file: File): void
}

export function LibraryDrawer({
  routes,
  projectRoutes = [],
  onClose,
  onLoad,
  onLoadProject,
  onDelete,
  onImport
}: LibraryDrawerProps) {
  const scrimRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const matchesQuery = (name: string, source = "") =>
    !normalizedQuery || `${name} ${source}`.toLocaleLowerCase().includes(normalizedQuery)
  const visibleSavedRoutes = routes.filter((route) => matchesQuery(route.name))
  const visibleProjectRoutes = projectRoutes.filter((route) =>
    matchesQuery(route.name, `${route.sourceProject} ${route.sourceFile}`)
  )

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

        <label className="library-search">
          <MagnifyingGlass aria-hidden="true" />
          <input
            type="search"
            aria-label="Search ride library"
            placeholder={`Search ${projectRoutes.length + routes.length} rides`}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>

        {visibleSavedRoutes.length === 0 && visibleProjectRoutes.length === 0 ? (
          <div className="library-empty">
            <MapTrifold aria-hidden="true" />
            <strong>{normalizedQuery ? "No matching rides" : "No routes parked yet"}</strong>
            <p>{normalizedQuery
              ? "Try a route name, source project, or location."
              : "Build a live route, then save it here for another day."}</p>
          </div>
        ) : (
          <div className="library-collections">
            {visibleSavedRoutes.length > 0 ? <section>
              <div className="library-section-title">
                <span>On this device</span>
                <strong>{visibleSavedRoutes.length}</strong>
              </div>
              <div className="library-list">
            {visibleSavedRoutes.map((route) => (
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
            </section> : null}
            {visibleProjectRoutes.length > 0 ? <section>
              <div className="library-section-title">
                <span>Imported projects</span>
                <strong>{visibleProjectRoutes.length}</strong>
              </div>
              <div className="library-list">
                {visibleProjectRoutes.map((route) => (
                  <article className="library-row library-project-row" key={route.id}>
                    <button
                      type="button"
                      className="library-load"
                      aria-label={`Load ${route.name} from ${route.sourceProject}`}
                      onClick={() => onLoadProject?.(route)}
                    >
                      <span>
                        <small>{route.sourceProject}</small>
                        <strong>{route.name}</strong>
                      </span>
                      <span className="library-metrics">
                        {route.distanceMiles.toFixed(1)} mi · {Math.round(route.durationMinutes)} min
                      </span>
                      <ArrowRight aria-hidden="true" />
                    </button>
                  </article>
                ))}
              </div>
            </section> : null}
          </div>
        )}
      </aside>
    </div>
  )
}
