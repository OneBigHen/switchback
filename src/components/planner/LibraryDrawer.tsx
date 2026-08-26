"use client"

import { ArrowRight, Eye, EyeSlash, FileArrowUp, Folder, Lock, MagnifyingGlass, MapTrifold, Path, Tag, Trash, X } from "@phosphor-icons/react"
import { useEffect, useMemo, useRef, useState } from "react"
import type { RoadLock, RoadLockMode } from "@/lib/roads/road-locks"
import type { ProjectGpxRouteSummary } from "@/lib/gpx/catalog"
import {
  buildProjectRouteLibrary,
  PROJECT_ROUTE_REGION_LABELS
} from "@/lib/gpx/library-view-model"
import type {
  ProjectRouteGroup,
  ProjectRouteProfile,
  ProjectRouteSort,
  ProjectRouteSurface
} from "@/lib/gpx/library-view-model"
import type { SavedRoute } from "@/lib/storage/route-library"
import type { RecordedRide } from "@/lib/storage/ride-journal"
import type { TripPlan } from "@/lib/trip/trip-plan"

function formatDateLabel(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined) return "date unavailable"
  const parsed = typeof value === "number" ? value : Date.parse(String(value))
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleDateString() : "date unavailable"
}

interface LibraryDrawerProps {
  routes: SavedRoute[]
  recordedRides?: RecordedRide[]
  trips?: TripPlan[]
  projectRoutes?: ProjectGpxRouteSummary[]
  onClose(): void
  onLoad(route: SavedRoute): void
  onLoadTrip?(route: TripPlan): void
  onDeleteTrip?(trip: TripPlan): void
  onMatchImported?(route: SavedRoute): void
  onLoadRecorded?(ride: RecordedRide): void
  onLoadProject?(route: ProjectGpxRouteSummary): void
  onDelete(route: SavedRoute): void
  onOrganize?(route: SavedRoute, organization: {
    folder?: string
    tags?: string[]
    visible?: boolean
  }): void
  onImport(file: File): void
  /**
   * Application callback for the "Import as lock" affordance. The drawer
   * owns only the pending/error/success presentation around this callback.
   */
  onImportAsLock?(file: File, options: ImportAsLockOptions): Promise<RoadLock | null>
}

interface ImportAsLockOptions {
  mode: RoadLockMode
  displayName?: string
  sourceRegionId?: string
  sourceGraphVersion?: string
}

export function LibraryDrawer({
  routes,
  recordedRides = [],
  trips = [],
  projectRoutes = [],
  onClose,
  onLoad,
  onLoadTrip,
  onDeleteTrip,
  onMatchImported,
  onLoadRecorded,
  onLoadProject,
  onDelete,
  onOrganize,
  onImport,
  onImportAsLock
}: LibraryDrawerProps) {
  const scrimRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [pendingDeleteTripId, setPendingDeleteTripId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [sourceFilter, setSourceFilter] = useState("")
  const [profileFilter, setProfileFilter] = useState<ProjectRouteProfile | "">("")
  const [surfaceFilter, setSurfaceFilter] = useState<ProjectRouteSurface | "">("")
  const [projectSort, setProjectSort] = useState<ProjectRouteSort>("name")
  const [selectedProjectMemberIds, setSelectedProjectMemberIds] = useState<Record<string, string>>({})
  const [folderFilter, setFolderFilter] = useState("")
  const [showHidden, setShowHidden] = useState(false)
  const [selectedRouteIds, setSelectedRouteIds] = useState<string[]>([])
  const [pendingLockFile, setPendingLockFile] = useState<File | null>(null)
  const [lockDraftMode, setLockDraftMode] = useState<RoadLockMode>("must")
  const [lockDraftName, setLockDraftName] = useState("")
  const [lockDraftError, setLockDraftError] = useState("")
  const [lockImportBusy, setLockImportBusy] = useState(false)
  const [lockImportNotice, setLockImportNotice] = useState<string | null>(null)
  const lockFileInputRef = useRef<HTMLInputElement>(null)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const hasActiveProjectFilters = Boolean(sourceFilter || profileFilter || surfaceFilter)
  const hasActiveLibraryCriteria = Boolean(normalizedQuery || hasActiveProjectFilters)
  const matchesQuery = (name: string, source = "") =>
    !normalizedQuery || `${name} ${source}`.toLocaleLowerCase().includes(normalizedQuery)
  const folders = [...new Set(routes.map((route) => route.folder || "Unfiled"))].sort((a, b) => a.localeCompare(b))
  const visibleSavedRoutes = routes.filter((route) => (
    matchesQuery(`${route.name} ${route.folder ?? ""} ${(route.tags ?? []).join(" ")}`) &&
    (!folderFilter || (route.folder || "Unfiled") === folderFilter) &&
    (showHidden || route.visible !== false)
  ))
  const visibleTrips = trips.filter((trip) => matchesQuery(trip.name, "saved trip"))
  const projectLibrary = useMemo(() => buildProjectRouteLibrary(projectRoutes, {
    query,
    source: sourceFilter,
    profile: profileFilter || undefined,
    surface: surfaceFilter || undefined,
    sort: projectSort
  }), [profileFilter, projectRoutes, projectSort, query, sourceFilter, surfaceFilter])

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
      "button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex='-1'])"
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

  const renderProjectGroup = (group: ProjectRouteGroup, showRegion = false) => {
    const selectedMemberId = selectedProjectMemberIds[group.id]
    const route = group.members.find((member) => member.id === selectedMemberId)
      ?? group.representative
    return (
      <article className="library-row library-project-row" key={group.id}>
        {group.count > 1 ? (
          <select
            className="library-variant-select"
            aria-label={`Choose variant for ${group.name}`}
            value={route.id}
            onChange={(event) => setSelectedProjectMemberIds((selected) => ({
              ...selected,
              [group.id]: event.currentTarget.value
            }))}
          >
            {group.members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.sourceProject} · {member.distanceMiles.toFixed(1)} mi
                {member.sourceFile ? ` · ${member.sourceFile.split("/").at(-1)}` : ""}
              </option>
            ))}
          </select>
        ) : null}
        <button
          type="button"
          className="library-load"
          aria-label={`Load ${group.name} from ${route.sourceProject}`}
          onClick={() => onLoadProject?.(route)}
        >
          <span>
            <small>
              {showRegion ? `${PROJECT_ROUTE_REGION_LABELS[group.region]} · ` : null}
              {group.sourceProjects.join(" · ")}
              {group.count > 1 ? <> · <span>{group.count} variants</span></> : null}
            </small>
            <strong>{group.name}</strong>
          </span>
          <span className="library-metrics">
            {route.distanceMiles.toFixed(1)} mi · {Math.round(route.durationMinutes)} min
          </span>
          <ArrowRight aria-hidden="true" />
        </button>
      </article>
    )
  }

  const toggleSelectedRoute = (id: string) => {
    setSelectedRouteIds((selected) => selected.includes(id)
      ? selected.filter((selectedId) => selectedId !== id)
      : [...selected, id])
  }

  const setSelectedVisibility = (visible: boolean) => {
    for (const route of routes.filter((route) => selectedRouteIds.includes(route.id))) {
      onOrganize?.(route, { visible })
    }
    setSelectedRouteIds([])
  }

  const resetLockDraft = (clearNotice = true) => {
    setPendingLockFile(null)
    setLockDraftMode("must")
    setLockDraftName("")
    setLockDraftError("")
    if (clearNotice) setLockImportNotice(null)
    if (lockFileInputRef.current) lockFileInputRef.current.value = ""
  }

  async function persistGpxLockFromFile(file: File): Promise<void> {
    setLockImportBusy(true)
    try {
      if (!onImportAsLock) throw new Error("Road lock import is unavailable in this view.")
      const lock = await onImportAsLock(file, {
        mode: lockDraftMode,
        displayName: lockDraftName,
        sourceRegionId: "gpx-import",
        sourceGraphVersion: "gpx-import"
      })
      if (!lock) throw new Error("The GPX file could not be imported as a road lock.")
      setLockImportNotice(`${lock.displayName ?? "GPX"} imported as a ${lock.mode === "must" ? "must-use" : "preferred"} road lock.`)
      resetLockDraft(false)
    } catch (caught) {
      setLockDraftError(caught instanceof Error ? caught.message : "The GPX file could not be imported as a road lock.")
    } finally {
      setLockImportBusy(false)
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
            <h2 id="library-title">Ride library</h2>
          </div>
          <div className="drawer-header-actions">
            <label className="import-route-button">
              <FileArrowUp aria-hidden="true" />
              <span>Import route</span>
              <input
                type="file"
                accept=".gpx,.kml,.kmz,application/gpx+xml,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz,application/xml,text/xml"
                aria-label="Import GPX, KML, or KMZ file"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) onImport(file)
                  event.currentTarget.value = ""
                }}
              />
            </label>
            <span className="import-route-button import-lock-wrap">
              <button
                type="button"
                className="import-lock-button"
                aria-label="Import as road lock"
                onClick={() => lockFileInputRef.current?.click()}
              >
                <Lock aria-hidden="true" />
                <span>Import as lock</span>
              </button>
              <input
                ref={lockFileInputRef}
                type="file"
                accept=".gpx,.kml,.kmz,application/gpx+xml,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz,application/xml,text/xml"
                aria-label="Import a GPX, KML, or KMZ file as a road lock"
                tabIndex={-1}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) {
                    setPendingLockFile(file)
                    setLockDraftError("")
                    setLockImportNotice(null)
                  }
                  event.currentTarget.value = ""
                }}
              />
            </span>
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

        {pendingLockFile ? (
          <form
            className="library-lock-import"
            aria-label={`Import ${pendingLockFile.name} as a road lock`}
            onSubmit={(event) => {
              event.preventDefault()
              void persistGpxLockFromFile(pendingLockFile)
            }}
          >
            <header>
              <strong>Import as road lock</strong>
              <small>{pendingLockFile.name}</small>
            </header>
            <fieldset className="library-lock-import-mode" role="radiogroup" aria-label="Lock mode">
              <label className={lockDraftMode === "must" ? "is-selected" : ""}>
                <input
                  type="radio"
                  name="library-lock-mode"
                  value="must"
                  checked={lockDraftMode === "must"}
                  onChange={() => setLockDraftMode("must")}
                />
                Must use
              </label>
              <label className={lockDraftMode === "prefer" ? "is-selected" : ""}>
                <input
                  type="radio"
                  name="library-lock-mode"
                  value="prefer"
                  checked={lockDraftMode === "prefer"}
                  onChange={() => setLockDraftMode("prefer")}
                />
                Prefer
              </label>
            </fieldset>
            <label className="library-lock-import-name">
              <span>Lock name (optional)</span>
              <input
                type="text"
                value={lockDraftName}
                maxLength={120}
                placeholder="Best section of PA-125"
                onChange={(event) => setLockDraftName(event.currentTarget.value)}
              />
            </label>
            {lockDraftError ? <span className="library-lock-import-error" role="status">{lockDraftError}</span> : null}
            <div className="library-lock-import-actions">
              <button type="button" onClick={() => resetLockDraft()} disabled={lockImportBusy}>Cancel</button>
              <button type="submit" disabled={lockImportBusy}>
                {lockImportBusy ? "Saving lock…" : "Save road lock"}
              </button>
            </div>
          </form>
        ) : null}
        {lockImportNotice ? <span className="library-lock-import-notice" role="status">{lockImportNotice}</span> : null}

        {routes.length > 0 ? (
          <div className="library-filters local-library-filters" role="group" aria-label="Organize saved routes">
            <select
              aria-label="Filter saved routes by folder"
              value={folderFilter}
              onChange={(event) => setFolderFilter(event.currentTarget.value)}
            >
              <option value="">All folders</option>
              {folders.map((folder) => <option key={folder} value={folder}>{folder}</option>)}
            </select>
            <label className="library-hidden-toggle">
              <input type="checkbox" checked={showHidden} onChange={(event) => setShowHidden(event.currentTarget.checked)} />
              Include hidden
            </label>
            {selectedRouteIds.length > 0 ? <span className="library-bulk-actions" aria-label="Bulk visibility">
              <button type="button" onClick={() => setSelectedVisibility(true)}>Show {selectedRouteIds.length}</button>
              <button type="button" onClick={() => setSelectedVisibility(false)}>Hide {selectedRouteIds.length}</button>
            </span> : null}
          </div>
        ) : null}

        {projectRoutes.length > 0 ? (
          <div className="library-filters" role="group" aria-label="Filter imported routes">
            <select
              aria-label="Filter by source"
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.currentTarget.value)}
            >
              <option value="">All sources</option>
              {projectLibrary.facets.sources.map((source) => (
                <option key={source} value={source}>{source}</option>
              ))}
            </select>
            <select
              aria-label="Filter by profile"
              value={profileFilter}
              onChange={(event) => setProfileFilter(event.currentTarget.value as ProjectRouteProfile | "")}
            >
              <option value="">All profiles</option>
              {projectLibrary.facets.profiles.map((profile) => (
                <option key={profile} value={profile}>{profile}</option>
              ))}
            </select>
            <select
              aria-label="Filter by surface"
              value={surfaceFilter}
              onChange={(event) => setSurfaceFilter(event.currentTarget.value as ProjectRouteSurface | "")}
            >
              <option value="">All surfaces</option>
              {projectLibrary.facets.surfaces.map((surface) => (
                <option key={surface} value={surface}>{surface}</option>
              ))}
            </select>
            <select
              aria-label="Sort imported routes"
              value={projectSort}
              onChange={(event) => setProjectSort(event.currentTarget.value as ProjectRouteSort)}
            >
              <option value="name">Name</option>
              <option value="distance-desc">Longest</option>
              <option value="twistiness-desc">Most twisty</option>
              <option value="variants-desc">Most variants</option>
            </select>
          </div>
        ) : null}

        {projectRoutes.length > 0 ? (
          <a className="atlas-drawer-link" href="/gpx-library">
            <span className="atlas-drawer-posters" aria-hidden="true"><i /><i /><i /></span>
            <span className="atlas-drawer-copy"><strong>Route atlas</strong><small>{projectRoutes.length} rides drawn as posters</small></span>
            <ArrowRight aria-hidden="true" />
          </a>
        ) : null}

        {visibleSavedRoutes.length === 0 && projectLibrary.groups.length === 0 && recordedRides.length === 0 && visibleTrips.length === 0 ? (
          <div className="library-empty">
            <MapTrifold aria-hidden="true" />
            <strong>{hasActiveLibraryCriteria ? "No matching rides" : "No routes parked yet"}</strong>
            <p>{hasActiveLibraryCriteria
              ? "Try a route name, source project, or location."
              : "Build a live route, then save it here for another day."}</p>
          </div>
        ) : (
          <div className="library-collections">
            {visibleTrips.length > 0 ? <section>
              <div className="library-section-title"><span>Saved trips</span><strong>{visibleTrips.length}</strong></div>
              <div className="library-list">{visibleTrips.map((trip) => <article className="library-row" key={trip.id}>
                <button type="button" className="library-load" aria-label={`Load saved trip ${trip.name}`} onClick={() => onLoadTrip?.(trip)}>
                  <span><small>{trip.stages.length} day{trip.stages.length === 1 ? "" : "s"} · saved locally</small><strong>{trip.name}</strong></span><ArrowRight aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={`delete-route${pendingDeleteTripId === trip.id ? " is-confirming" : ""}`}
                  aria-label={pendingDeleteTripId === trip.id ? `Confirm delete saved trip ${trip.name}` : `Delete saved trip ${trip.name}`}
                  aria-pressed={pendingDeleteTripId === trip.id}
                  onClick={() => {
                    if (pendingDeleteTripId === trip.id) {
                      setPendingDeleteTripId(null)
                      onDeleteTrip?.(trip)
                    } else {
                      setPendingDeleteTripId(trip.id)
                    }
                  }}
                >
                  {pendingDeleteTripId === trip.id ? <span>Delete?</span> : <Trash aria-hidden="true" />}
                </button>
              </article>)}</div>
            </section> : null}
            {visibleSavedRoutes.length > 0 ? <section>
              <div className="library-section-title">
                <span>On this device</span>
                <strong>{visibleSavedRoutes.length}</strong>
              </div>
              <div className="library-list">
            {visibleSavedRoutes.map((route) => (
              <article className="library-row" key={route.id}>
                <input
                  className="library-row-select"
                  type="checkbox"
                  aria-label={`Select ${route.name}`}
                  checked={selectedRouteIds.includes(route.id)}
                  onChange={() => toggleSelectedRoute(route.id)}
                />
                <button type="button" className="library-load" onClick={() => onLoad(route)}>
                  <span>
                    <small>{route.profile} · {route.folder || "Unfiled"} · {formatDateLabel(route.updatedAt)}</small>
                    <strong>{route.name}</strong>
                    {route.tags?.length ? <em>{route.tags.map((tag) => `#${tag}`).join(" ")}</em> : null}
                  </span>
                  <span className="library-metrics">
                    {route.distanceMiles.toFixed(1)} mi · {Math.round(route.durationMinutes)} min
                  </span>
                  <ArrowRight aria-hidden="true" />
                </button>
                {route.routingSource === "imported" ? <button
                  type="button"
                  className="match-imported-route"
                  aria-label={`Match ${route.name} to legal roads`}
                  onClick={() => onMatchImported?.(route)}
                >
                  <Path aria-hidden="true" /> Match roads
                </button> : null}
                <details className="library-organize">
                  <summary aria-label={`Organize ${route.name}`}><Folder aria-hidden="true" /> <Tag aria-hidden="true" /></summary>
                  <label>Folder
                    <input
                      aria-label={`Folder for ${route.name}`}
                      defaultValue={route.folder || "Unfiled"}
                      onBlur={(event) => onOrganize?.(route, { folder: event.currentTarget.value })}
                    />
                  </label>
                  <label>Tags
                    <input
                      aria-label={`Tags for ${route.name}`}
                      defaultValue={route.tags?.join(", ") ?? ""}
                      placeholder="gravel, weekend"
                      onBlur={(event) => onOrganize?.(route, { tags: event.currentTarget.value.split(",") })}
                    />
                  </label>
                </details>
                <button
                  type="button"
                  className="route-visibility-toggle"
                  aria-label={`${route.visible === false ? "Show" : "Hide"} ${route.name}`}
                  aria-pressed={route.visible !== false}
                  onClick={() => onOrganize?.(route, { visible: route.visible === false })}
                >
                  {route.visible === false ? <EyeSlash aria-hidden="true" /> : <Eye aria-hidden="true" />}
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
            {recordedRides.length > 0 ? <section>
              <div className="library-section-title">
                <span>Recorded rides</span>
                <strong>{recordedRides.length}</strong>
              </div>
              <div className="library-list">
                {recordedRides.map((ride) => <article className="library-row" key={ride.id}>
                  <button type="button" className="library-load" onClick={() => onLoadRecorded?.(ride)}>
                    <span>
                      <small>Actual replay · {formatDateLabel(ride.endedAt)}</small>
                      <strong>{ride.routeName}</strong>
                      <em>{ride.points.length} GPS points · {ride.notes ? "notes attached" : "no notes"} · {ride.photos.length} photos</em>
                    </span>
                    <span className="library-metrics">Replay</span>
                    <ArrowRight aria-hidden="true" />
                  </button>
                </article>)}
              </div>
            </section> : null}
            {projectLibrary.groups.length > 0 ? <section>
              <div className="library-section-title">
                <span>Imported projects</span>
                <strong>{projectLibrary.visibleRoutes}</strong>
              </div>
              {projectSort === "name" ? (
                projectLibrary.sections.map((section) => (
                  <div key={section.region}>
                    <div className="library-section-title">
                      <span>{section.label}</span>
                      <strong>{section.groupCount}</strong>
                    </div>
                    <div className="library-list">
                      {section.groups.map((group) => renderProjectGroup(group))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="library-list">
                  {projectLibrary.groups.map((group) => renderProjectGroup(group, true))}
                </div>
              )}
            </section> : null}
          </div>
        )}
      </aside>
    </div>
  )
}
