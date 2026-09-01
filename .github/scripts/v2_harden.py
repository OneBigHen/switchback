from pathlib import Path
from textwrap import dedent

root = Path(".")


def write(path: str, content: str) -> None:
    target = root / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(dedent(content).lstrip(), encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    target = root / path
    text = target.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"Expected contract missing in {path}: {old[:80]!r}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


def append_once(path: str, marker: str, block: str) -> None:
    target = root / path
    text = target.read_text(encoding="utf-8")
    if marker not in text:
        target.write_text(text.rstrip() + "\n\n" + dedent(block).strip() + "\n", encoding="utf-8")


write(
    "src/components/discover/DiscoverDestination.tsx",
    r'''
    "use client"

    import { ArrowRight, MagnifyingGlass, RoadHorizon, SpinnerGap, WarningCircle } from "@phosphor-icons/react"
    import Link from "next/link"
    import { useEffect, useMemo, useState } from "react"
    import { DestinationHeader } from "@/components/v2/DestinationHeader"
    import styles from "./DiscoverDestination.module.css"

    interface CommunityRouteSummary {
      id: string
      revisionId: string
      title: string
      description: string | null
      routeFingerprint: string
      stats: Record<string, number | string | null>
      provenanceClass: string
      visibility: "public" | "unlisted"
      updatedAt: string
    }

    function metric(stats: CommunityRouteSummary["stats"], key: string): number | null {
      const value = stats[key]
      if (typeof value === "number" && Number.isFinite(value)) return value
      if (typeof value === "string") {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : null
      }
      return null
    }

    function provenanceLabel(value: string): string {
      if (value === "rider-recorded") return "Rider recorded"
      if (value === "built-and-verified") return "Built & verified"
      return value
        .split("-")
        .filter(Boolean)
        .map((part) => part[0]?.toUpperCase() + part.slice(1))
        .join(" ")
    }

    function updatedLabel(value: string): string | null {
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return null
      return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date)
    }

    export function DiscoverDestination() {
      const [routes, setRoutes] = useState<CommunityRouteSummary[]>([])
      const [query, setQuery] = useState("")
      const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
      const [retryToken, setRetryToken] = useState(0)

      useEffect(() => {
        const controller = new AbortController()
        setStatus("loading")
        fetch("/api/community/routes?limit=24", { signal: controller.signal })
          .then(async (response) => {
            if (!response.ok) throw new Error(`Community routes returned ${response.status}`)
            return response.json() as Promise<{ routes?: CommunityRouteSummary[] }>
          })
          .then((payload) => {
            if (controller.signal.aborted) return
            setRoutes(Array.isArray(payload.routes) ? payload.routes : [])
            setStatus("ready")
          })
          .catch((error: unknown) => {
            if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return
            setStatus("error")
          })
        return () => controller.abort()
      }, [retryToken])

      const filteredRoutes = useMemo(() => {
        const needle = query.trim().toLowerCase()
        if (!needle) return routes
        return routes.filter((route) => (
          route.title.toLowerCase().includes(needle)
          || route.description?.toLowerCase().includes(needle)
          || route.provenanceClass.toLowerCase().includes(needle)
        ))
      }, [query, routes])

      return (
        <section className={styles.destination} role="region" aria-label="Discover">
          <div className={styles.surface}>
            <DestinationHeader
              eyebrow="Community Atlas"
              title="Find a better road."
              description="Browse rider-published and verified routes without leaving the map experience. Search first, then open the full route only when something looks worth riding."
              actions={(
                <Link className={styles.atlasLink} href="/routes">
                  <span>Open full Atlas</span>
                  <ArrowRight weight="bold" aria-hidden="true" />
                </Link>
              )}
            />

            <div className={styles.toolbar} role="search">
              <MagnifyingGlass aria-hidden="true" />
              <label className="sr-only" htmlFor="discover-route-search">Search community routes</label>
              <input
                id="discover-route-search"
                type="search"
                aria-label="Search community routes"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Search roads, rides, or route character"
                autoComplete="off"
              />
              <span className={styles.count} aria-live="polite">
                {status === "ready" ? `${filteredRoutes.length} ${filteredRoutes.length === 1 ? "route" : "routes"}` : ""}
              </span>
            </div>

            {status === "loading" ? (
              <div className={styles.state} role="status" aria-live="polite">
                <SpinnerGap className="spin" aria-hidden="true" />
                <div><strong>Reading the Atlas</strong><span>Loading community routes…</span></div>
              </div>
            ) : status === "error" ? (
              <div className={styles.state} role="alert">
                <WarningCircle weight="fill" aria-hidden="true" />
                <div><strong>Atlas unavailable</strong><span>Your planner and saved rides are unaffected.</span></div>
                <button type="button" onClick={() => setRetryToken((token) => token + 1)}>Try again</button>
              </div>
            ) : filteredRoutes.length === 0 ? (
              <div className={styles.empty}>
                <RoadHorizon aria-hidden="true" />
                <strong>{routes.length === 0 ? "No public routes yet" : "No routes match that search"}</strong>
                <span>{routes.length === 0 ? "Published rides will appear here as the Atlas grows." : "Try a road name, route title, or riding style."}</span>
              </div>
            ) : (
              <div className={styles.grid} aria-label="Community routes">
                {filteredRoutes.map((route) => {
                  const distance = metric(route.stats, "distanceMiles")
                  const duration = metric(route.stats, "durationMinutes")
                  const updated = updatedLabel(route.updatedAt)
                  return (
                    <article className={styles.route} key={route.id}>
                      <div className={styles.routeTopline}>
                        <span>{provenanceLabel(route.provenanceClass)}</span>
                        {updated ? <small>Updated {updated}</small> : null}
                      </div>
                      <Link className={styles.routeLink} href={`/routes/${encodeURIComponent(route.id)}`}>
                        <span>{route.title}</span>
                        <ArrowRight weight="bold" aria-hidden="true" />
                      </Link>
                      {route.description ? <p>{route.description}</p> : <p className={styles.noDescription}>Open the route for the rider-published line and details.</p>}
                      <div className={styles.facts} aria-label="Route summary">
                        {distance !== null ? <span><b>{distance.toFixed(1)}</b> mi</span> : null}
                        {duration !== null ? <span><b>{Math.round(duration)}</b> min</span> : null}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      )
    }
    ''',
)

write(
    "src/components/discover/DiscoverDestination.module.css",
    r'''
    .destination {
      position: fixed;
      z-index: 22;
      inset: 0 0 0 84px;
      overflow: auto;
      padding: 28px clamp(24px, 4vw, 54px) 64px;
      background:
        radial-gradient(circle at 90% 8%, color-mix(in srgb, var(--sb-topo-sage, var(--sb-border)) 10%, transparent), transparent 26%),
        var(--sb-canvas);
      scrollbar-gutter: stable;
    }

    .surface {
      display: grid;
      width: min(100%, 1120px);
      min-width: 0;
      gap: 20px;
      margin: 0 auto;
    }

    .atlasLink {
      display: inline-flex;
      min-height: 44px;
      align-items: center;
      justify-content: center;
      gap: 7px;
      padding: 0 13px;
      border: 1px solid var(--sb-border);
      border-radius: 9px;
      background: var(--sb-paper);
      color: var(--sb-text-link);
      font-size: 12px;
      font-weight: 800;
      text-decoration: none;
    }

    .atlasLink svg { width: 16px; height: 16px; }

    .atlasLink:focus-visible,
    .routeLink:focus-visible,
    .state button:focus-visible,
    .toolbar input:focus-visible {
      outline: 3px solid var(--sb-focus-fill);
      outline-offset: 2px;
    }

    .toolbar {
      display: grid;
      min-height: 50px;
      grid-template-columns: 28px minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px;
      padding: 3px 10px 3px 12px;
      border: 1px solid var(--sb-border);
      border-radius: 12px;
      background: var(--sb-paper);
      box-shadow: 0 4px 14px color-mix(in srgb, var(--sb-ink) 6%, transparent);
    }

    .toolbar > svg { width: 19px; height: 19px; color: var(--sb-text-muted); }

    .toolbar input {
      width: 100%;
      min-width: 0;
      min-height: 44px;
      border: 0;
      outline: 0;
      background: transparent;
      color: var(--sb-text);
      font: inherit;
      font-size: 14px;
    }

    .toolbar input::placeholder { color: var(--sb-text-muted); }

    .count {
      color: var(--sb-text-muted);
      font-size: 11px;
      font-weight: 750;
      white-space: nowrap;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0 24px;
      border-top: 1px solid var(--sb-border);
    }

    .route {
      display: grid;
      min-width: 0;
      align-content: start;
      gap: 8px;
      padding: 17px 2px 18px;
      border-bottom: 1px solid color-mix(in srgb, var(--sb-border) 78%, transparent);
    }

    .routeTopline {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 10px;
    }

    .routeTopline > span {
      color: var(--sb-ember-strong);
      font-size: 10px;
      font-weight: 850;
      letter-spacing: 0.09em;
      text-transform: uppercase;
    }

    .routeTopline small { color: var(--sb-text-muted); font-size: 10px; white-space: nowrap; }

    .routeLink {
      display: flex;
      min-width: 0;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      color: var(--sb-text);
      font-family: var(--font-display);
      font-size: 20px;
      font-weight: 600;
      line-height: 1.1;
      text-decoration: none;
    }

    .routeLink > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .routeLink svg { width: 18px; height: 18px; flex: 0 0 auto; color: var(--sb-text-link); }

    .route p {
      min-height: 2.8em;
      margin: 0;
      color: var(--sb-text-muted);
      font-size: 12px;
      line-height: 1.4;
    }

    .noDescription { font-style: italic; }

    .facts { display: flex; flex-wrap: wrap; gap: 12px; color: var(--sb-text-muted); font-size: 11px; }
    .facts b { color: var(--sb-text); font-size: 13px; }

    .state,
    .empty {
      display: grid;
      min-height: 150px;
      place-content: center;
      justify-items: center;
      gap: 8px;
      padding: 24px;
      border-top: 1px solid var(--sb-border);
      border-bottom: 1px solid var(--sb-border);
      color: var(--sb-text-muted);
      text-align: center;
    }

    .state > svg,
    .empty > svg { width: 28px; height: 28px; color: var(--sb-ember-strong); }
    .state > div, .empty { font-size: 12px; }
    .state > div { display: grid; gap: 2px; }

    .state strong,
    .empty strong {
      color: var(--sb-text);
      font-family: var(--font-display);
      font-size: 17px;
      font-weight: 600;
    }

    .state button {
      min-height: 44px;
      padding: 0 13px;
      border: 1px solid var(--sb-border);
      border-radius: 9px;
      background: var(--sb-paper);
      color: var(--sb-text-link);
      cursor: pointer;
      font: inherit;
      font-size: 12px;
      font-weight: 800;
    }

    @media (max-width: 760px) {
      .destination { inset: 0 0 72px; padding: 18px 14px 42px; }
      .surface { gap: 16px; }
      .grid { grid-template-columns: minmax(0, 1fr); }
      .toolbar input { font-size: 16px; }
    }

    @media (max-width: 420px) { .count { display: none; } }

    @media (orientation: landscape) and (max-height: 520px) {
      .destination { inset: 0 0 0 84px; padding: 12px 18px 28px; }
      .surface { gap: 12px; }
      .toolbar { min-height: 46px; }
      .route { gap: 6px; padding-block: 12px; }
      .route p {
        display: -webkit-box;
        min-height: 0;
        overflow: hidden;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
      }
    }
    ''',
)

replace_once("src/components/planner/PlannerShell.tsx", 'import Link from "next/link"\n', "")
replace_once(
    "src/components/planner/PlannerShell.tsx",
    'import { SettingsDestination } from "@/components/settings/SettingsDestination"\n',
    'import { SettingsDestination } from "@/components/settings/SettingsDestination"\nimport { DiscoverDestination } from "@/components/discover/DiscoverDestination"\n',
)
replace_once(
    "src/components/planner/PlannerShell.tsx",
    '''      {surface !== "ride" && surface !== "free-ride" && navigation.destination === "discover" ? (\n        <section className="destination-panel discover-panel" aria-labelledby="discover-title">\n          <header>\n            <p className="discover-eyebrow">Discover</p>\n            <h1 id="discover-title">Find a better road.</h1>\n            <p>\n              Rider-published routes and curated rides live here. Every line is the exact\n              sanitized artifact the owner chose to share.\n            </p>\n          </header>\n          <Link className="discover-atlas-link" href="/routes">Browse the community Atlas</Link>\n        </section>\n      ) : null}''',
    '''      {surface !== "ride" && surface !== "free-ride" && navigation.destination === "discover" ? (\n        <DiscoverDestination />\n      ) : null}''',
)

write(
    "src/components/settings/UiCustomizationSettings.tsx",
    r'''
    "use client"

    import { ArrowDown, ArrowUp, CaretDown, DotsSixVertical } from "@phosphor-icons/react"
    import { useState } from "react"
    import { layerCatalog } from "@/lib/client/map-layers"
    import {
      defaultRiderUiPreferences,
      type PlanQuickActionId,
      type RecordingMetricId,
      type RideMetricId,
      type RiderUiPreferences,
      type RouteDetailModuleId
    } from "@/lib/settings/rider-settings"
    import styles from "./UiCustomizationSettings.module.css"

    const PLAN_LABELS: Record<PlanQuickActionId, string> = {
      "free-ride": "Free Ride",
      record: "Record",
      "home-loop": "Home loop",
      "saved-place": "Saved place"
    }
    const RIDE_METRIC_LABELS: Record<RideMetricId, string> = {
      eta: "ETA",
      "remaining-distance": "Remaining distance",
      speed: "Speed",
      elevation: "Elevation",
      elapsed: "Elapsed"
    }
    const RECORDING_METRIC_LABELS: Record<RecordingMetricId, string> = {
      distance: "Distance",
      speed: "Speed",
      elevation: "Elevation",
      elapsed: "Elapsed"
    }
    const ROUTE_DETAIL_LABELS: Record<RouteDetailModuleId, string> = {
      overview: "Overview",
      "road-character": "Road character",
      "surface-elevation": "Surface & elevation",
      weather: "Weather & alerts",
      traffic: "Traffic & timing",
      stops: "Stops / fuel / daylight",
      directions: "Directions",
      offline: "Offline",
      actions: "Start & actions",
      evidence: "Evidence & data",
      trip: "Trip stages",
      "rating-publish": "Rating / publish"
    }
    const REQUIRED_ROUTE_DETAILS = new Set<RouteDetailModuleId>(["overview", "actions"])

    function moved<T>(items: T[], index: number, direction: -1 | 1): T[] {
      const target = index + direction
      if (target < 0 || target >= items.length) return items
      const next = [...items]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item!)
      return next
    }

    interface ReorderListProps<T extends string> {
      label: string
      items: T[]
      itemLabel(item: T): string
      onChange(items: T[]): void
    }

    function ReorderList<T extends string>({ label, items, itemLabel, onChange }: ReorderListProps<T>) {
      return (
        <section className={styles.group} role="group" aria-label={label}>
          <header><strong>{label}</strong><small>{items.length} shown</small></header>
          <ol>
            {items.map((item, index) => {
              const readable = itemLabel(item)
              return (
                <li key={item}>
                  <DotsSixVertical className={styles.grip} aria-hidden="true" />
                  <span>{readable}</span>
                  <button type="button" aria-label={`Move ${readable} earlier`} disabled={index === 0} onClick={() => onChange(moved(items, index, -1))}>
                    <ArrowUp aria-hidden="true" />
                  </button>
                  <button type="button" aria-label={`Move ${readable} later`} disabled={index === items.length - 1} onClick={() => onChange(moved(items, index, 1))}>
                    <ArrowDown aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ol>
        </section>
      )
    }

    export interface UiCustomizationSettingsProps {
      value: RiderUiPreferences
      onChange(value: RiderUiPreferences): void
    }

    export function UiCustomizationSettings({ value, onChange }: UiCustomizationSettingsProps) {
      const [expanded, setExpanded] = useState(false)
      const patch = <K extends keyof RiderUiPreferences>(key: K, next: RiderUiPreferences[K]) => {
        onChange({ ...value, [key]: next })
      }
      const layerName = (id: RiderUiPreferences["quickLayers"][number]) => (
        layerCatalog.find((layer) => layer.id === id)?.name ?? id
      )

      return (
        <section className={styles.customize} aria-label="Customize Switchback">
          <header className={styles.heading}>
            <div>
              <span>Curated controls</span>
              <h2>Customize</h2>
              <p>Choose what is easiest to reach. Safety-critical riding controls stay fixed.</p>
            </div>
            <button
              type="button"
              className={styles.toggleButton}
              aria-expanded={expanded}
              aria-controls="ui-customization-controls"
              onClick={() => setExpanded((open) => !open)}
            >
              <span>Customize controls</span>
              <CaretDown aria-hidden="true" />
            </button>
          </header>

          {expanded ? (
            <div id="ui-customization-controls" className={styles.controls}>
              <div className={styles.resetRow}>
                <button className={styles.resetButton} type="button" onClick={() => onChange(defaultRiderUiPreferences())}>
                  Reset to Switchback defaults
                </button>
              </div>

              <ReorderList label="Plan quick actions" items={value.planQuickActions} itemLabel={(id) => PLAN_LABELS[id]} onChange={(next) => patch("planQuickActions", next)} />
              <ReorderList label="Quick layers" items={value.quickLayers} itemLabel={layerName} onChange={(next) => patch("quickLayers", next)} />
              <ReorderList label="Ride HUD metrics" items={value.rideMetrics} itemLabel={(id) => RIDE_METRIC_LABELS[id]} onChange={(next) => patch("rideMetrics", next)} />
              <ReorderList label="Recording metrics" items={value.recordingMetrics} itemLabel={(id) => RECORDING_METRIC_LABELS[id]} onChange={(next) => patch("recordingMetrics", next)} />

              <section className={styles.group} role="group" aria-label="Route details">
                <header><strong>Route details</strong><small>Order and visibility</small></header>
                <ol>
                  {value.routeDetailOrder.map((module, index) => {
                    const label = ROUTE_DETAIL_LABELS[module]
                    const required = REQUIRED_ROUTE_DETAILS.has(module)
                    const visible = required || !value.hiddenRouteDetailModules.includes(module)
                    return (
                      <li key={module}>
                        <DotsSixVertical className={styles.grip} aria-hidden="true" />
                        <label className={styles.visibility}>
                          <input
                            type="checkbox"
                            aria-label={`Show ${label}`}
                            checked={visible}
                            disabled={required}
                            onChange={(event) => {
                              const hidden = event.currentTarget.checked
                                ? value.hiddenRouteDetailModules.filter((id) => id !== module)
                                : [...value.hiddenRouteDetailModules, module]
                              patch("hiddenRouteDetailModules", hidden)
                            }}
                          />
                          <span>{label}</span>
                        </label>
                        <button type="button" aria-label={`Move ${label} earlier`} disabled={index === 0} onClick={() => patch("routeDetailOrder", moved(value.routeDetailOrder, index, -1))}>
                          <ArrowUp aria-hidden="true" />
                        </button>
                        <button type="button" aria-label={`Move ${label} later`} disabled={index === value.routeDetailOrder.length - 1} onClick={() => patch("routeDetailOrder", moved(value.routeDetailOrder, index, 1))}>
                          <ArrowDown aria-hidden="true" />
                        </button>
                      </li>
                    )
                  })}
                </ol>
              </section>
            </div>
          ) : null}
        </section>
      )
    }
    ''',
)

write(
    "src/components/settings/UiCustomizationSettings.module.css",
    r'''
    .customize { display: grid; gap: 12px; color: var(--sb-text); }

    .heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--sb-border);
    }

    .heading > div { display: grid; gap: 2px; }
    .heading > div > span {
      color: var(--sb-ember-strong);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .heading h2 { margin: 0; font-family: var(--font-display); font-size: 24px; font-weight: 600; }
    .heading p { max-width: 560px; margin: 2px 0 0; color: var(--sb-text-muted); font-size: 12px; line-height: 1.4; }

    .toggleButton,
    .resetButton {
      display: inline-flex;
      min-height: 44px;
      align-items: center;
      justify-content: center;
      gap: 7px;
      padding: 0 12px;
      border: 1px solid var(--sb-border);
      border-radius: var(--sb-radius-chip, 8px);
      background: var(--sb-paper);
      color: var(--sb-text-link);
      cursor: pointer;
      font: inherit;
      font-size: 11px;
      font-weight: 750;
      white-space: nowrap;
    }

    .toggleButton svg { width: 16px; height: 16px; transition: transform 140ms ease; }
    .toggleButton[aria-expanded="true"] svg { transform: rotate(180deg); }
    .controls { display: grid; gap: 16px; }
    .resetRow { display: flex; justify-content: flex-end; }
    .group { display: grid; gap: 7px; }
    .group > header { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 0 2px; }
    .group > header strong { font-family: var(--font-display); font-size: 15px; font-weight: 600; }
    .group > header small { color: var(--sb-text-muted); font-size: 10px; }
    .group ol { display: grid; margin: 0; padding: 0; border-top: 1px solid var(--sb-border); list-style: none; }
    .group li {
      display: grid;
      min-height: 52px;
      grid-template-columns: 24px minmax(0, 1fr) 44px 44px;
      align-items: center;
      gap: 4px;
      border-bottom: 1px solid color-mix(in srgb, var(--sb-border) 76%, transparent);
    }
    .grip { width: 18px; height: 18px; color: var(--sb-text-muted); }
    .group li > span,
    .visibility > span { overflow: hidden; font-size: 12px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
    .group li > button {
      display: inline-flex;
      width: 44px;
      height: 44px;
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: var(--sb-radius-chip, 8px);
      background: transparent;
      color: var(--sb-text-link);
      cursor: pointer;
    }
    .group li > button:hover:not(:disabled) { background: var(--sb-surface-raised); }
    .group li > button:disabled { cursor: not-allowed; opacity: 0.3; }
    .group li > button:focus-visible,
    .toggleButton:focus-visible,
    .resetButton:focus-visible,
    .visibility:has(input:focus-visible) { outline: 3px solid var(--sb-focus-fill); outline-offset: 1px; }
    .group li > button svg { width: 17px; height: 17px; }
    .visibility { display: grid; min-width: 0; grid-template-columns: 28px minmax(0, 1fr); align-items: center; gap: 7px; cursor: pointer; }
    .visibility input { width: 18px; height: 18px; accent-color: var(--sb-ember-strong); }
    .visibility:has(input:disabled) { cursor: default; }

    @media (max-width: 600px) {
      .heading { display: grid; }
      .toggleButton, .resetButton { width: 100%; }
      .resetRow { display: block; }
    }

    @media (orientation: landscape) and (max-height: 520px) {
      .customize, .controls { gap: 10px; }
      .heading { padding-bottom: 8px; }
      .group li { min-height: 48px; }
    }
    ''',
)

replace_once(
    "src/components/planner/v2/RouteDecisionCard.tsx",
    '''        <span className={styles.heading}>\n          <span className={styles.role}>{presentation.role}</span>\n          <strong>{route.name}</strong>\n        </span>''',
    '''        <span className={styles.heading}>\n          <span className={styles.role}>{presentation.role}</span>\n          <strong>{route.name}</strong>\n        </span>\n        {selected ? <span className={styles.selectedMarker}>Selected</span> : null}''',
)

replace_once(
    "src/components/planner/v2/RouteDecisionCard.module.css",
    '''.card[data-selected="true"] {\n  border-color: var(--sb-ember-strong);\n  box-shadow: 0 0 0 2px color-mix(in srgb, var(--sb-ember-strong) 18%, transparent), 0 5px 16px rgb(22 29 28 / 12%);\n}''',
    '''.card[data-selected="true"] {\n  border-color: var(--sb-ember-strong);\n  background: color-mix(in srgb, var(--sb-ember-strong) 5%, var(--sb-surface));\n  box-shadow: 0 0 0 2px color-mix(in srgb, var(--sb-ember-strong) 18%, transparent), 0 5px 16px rgb(22 29 28 / 12%);\n}''',
)
replace_once("src/components/planner/v2/RouteDecisionCard.module.css", ".select {\n  display: grid;", ".select {\n  position: relative;\n  display: grid;")
replace_once(
    "src/components/planner/v2/RouteDecisionCard.module.css",
    "  font-size: 15px;\n  font-weight: 650;\n  letter-spacing: 0.02em;",
    "  font-size: 11px;\n  font-weight: 800;\n  letter-spacing: 0.08em;",
)
replace_once(
    "src/components/planner/v2/RouteDecisionCard.module.css",
    '''.heading strong {\n  overflow: hidden;\n  color: var(--sb-text);\n  font-size: 13px;\n  font-weight: 700;''',
    '''.heading strong {\n  overflow: hidden;\n  color: var(--sb-text);\n  font-family: var(--font-display);\n  font-size: 16px;\n  font-weight: 600;''',
)
replace_once(
    "src/components/planner/v2/RouteDecisionCard.module.css",
    "\n.metrics {\n",
    '''\n.selectedMarker {\n  position: absolute;\n  top: 11px;\n  right: 12px;\n  padding: 3px 6px;\n  border-radius: 999px;\n  background: var(--sb-ember-strong);\n  color: var(--sb-paper);\n  font-size: 10px;\n  font-weight: 800;\n  letter-spacing: 0.06em;\n  text-transform: uppercase;\n}\n\n.card[data-selected="true"] .heading {\n  padding-right: 72px;\n}\n\n.metrics {\n''',
)

replace_once(
    "src/app/styles/free-ride.css",
    '''.free-ride-suggestion-warning {\n  display: flex;\n  align-items: center;\n  gap: 5px;\n  color: var(--sb-warning);\n  font-size: 8px;\n  font-weight: 750;\n  letter-spacing: 0.13em;\n  text-transform: uppercase;\n}''',
    '''.free-ride-suggestion-warning {\n  display: flex;\n  align-items: center;\n  gap: 5px;\n  color: var(--sb-warning);\n  font-size: 10px;\n  font-weight: 750;\n  line-height: 1.2;\n  letter-spacing: 0.08em;\n  text-transform: uppercase;\n}''',
)

append_once(
    "src/app/styles/free-ride.css",
    "Short landscape keeps the riding instrument cluster glanceable",
    r'''
    /* Short landscape keeps the riding instrument cluster glanceable without
       taking over the route map or the left destination rail. */
    @media (orientation: landscape) and (max-height: 520px) {
      .free-ride-hud .free-ride-dock {
        right: 10px;
        bottom: max(8px, env(safe-area-inset-bottom));
        left: auto;
        width: min(430px, calc(100vw - 98px));
        margin: 0;
        gap: 6px;
      }
      .free-ride-hud .free-ride-dock .free-ride-speed { padding: 6px 12px 4px; }
      .free-ride-hud .free-ride-dock .free-ride-speed strong { font-size: 34px; }
      .free-ride-hud .free-ride-dock .free-ride-heading,
      .free-ride-hud .free-ride-dock .free-ride-instruction { padding: 6px 12px; }
      .free-ride-hud .free-ride-dock .free-ride-telemetry { padding: 8px 4px; }
      .free-ride-hud .free-ride-dock .free-ride-suggestion,
      .free-ride-hud .free-ride-dock .free-ride-empty { padding: 10px 12px; }
    }
    ''',
)

append_once(
    "src/components/settings/SettingsDestination.module.css",
    "Short landscape keeps Settings beside the rail",
    r'''
    /* Short landscape keeps Settings beside the rail instead of spending
       scarce height on desktop-scale destination padding. */
    @media (orientation: landscape) and (max-height: 520px) {
      .destination { inset: 0 0 0 84px; padding: 12px 18px 28px; }
      .sectionHeader { gap: 5px; padding-bottom: 6px; }
      .advanced { padding: 12px 14px; }
    }
    ''',
)

append_once(
    "src/components/settings/SettingsSurface.module.css",
    "Short landscape restores the bike summary to one compact row",
    r'''
    /* Short landscape restores the bike summary to one compact row. The
       880px tablet rule otherwise turns 844x390 into a tall two-row card. */
    @media (orientation: landscape) and (max-height: 520px) {
      .surface { gap: 16px; }
      .bikeSection { gap: 8px; }
      .sectionHeading { padding-bottom: 6px; }
      .bikeCard {
        min-height: 104px;
        grid-template-columns: minmax(200px, 1fr) minmax(220px, 1fr) auto;
        gap: 14px;
        padding: 12px 16px;
      }
      .bikeIcon { width: 48px; height: 48px; flex-basis: 48px; }
      .bikeIcon svg { width: 26px; height: 26px; }
      .bikeMetrics {
        grid-column: auto;
        grid-row: auto;
        grid-template-columns: minmax(90px, 0.75fr) minmax(130px, 1.25fr);
      }
      .bikeMetrics > span { min-height: 54px; padding: 7px 9px; }
      .sections { gap: 16px; }
    }
    ''',
)

append_once(
    "src/components/planner/v2/RouteDecisionRail.module.css",
    "Short landscape uses one dominant route choice",
    r'''
    /* Short landscape uses one dominant route choice at a time. A two-column
       tablet grid inside the 48vw planner sheet made both cards unreadably narrow. */
    @media (orientation: landscape) and (max-height: 520px) {
      .header small { display: none; }
      .rail {
        grid-auto-columns: minmax(82%, 1fr);
        grid-auto-flow: column;
        grid-template-columns: none;
        overflow-x: auto;
        overscroll-behavior-inline: contain;
        padding: 1px 12% 5px 1px;
        scroll-padding-inline: 1px;
        scroll-snap-type: x mandatory;
        scrollbar-width: none;
      }
      .rail::-webkit-scrollbar { display: none; }
    }
    ''',
)

append_once(
    "src/app/styles/plan-v2.css",
    "Short landscape planning status stays compact",
    r'''
    /* Short landscape planning status stays compact while preserving the
       cancel action and the map-first left-sheet composition. */
    @media (orientation: landscape) and (max-height: 520px) {
      .plan-v2 { gap: 5px; }
      .plan-v2__compact-rail { gap: 5px; }
      .plan-v2__status { min-height: 44px; padding: 7px 10px; }
      .plan-v2__contextual-content { gap: 8px; }
    }
    ''',
)

shell_css = root / "src/app/styles/shell-v2.css"
shell_text = shell_css.read_text(encoding="utf-8")
placeholder_marker = "/* Discover destination placeholder — wired to the existing community Atlas"
idx = shell_text.find(placeholder_marker)
if idx < 0:
    raise SystemExit("Discover placeholder CSS marker changed")
shell_css.write_text(shell_text[:idx].rstrip() + "\n", encoding="utf-8")

for temporary in (
    root / ".github/workflows/v2-red-check.yml",
    root / ".github/workflows/v2-implement-pass.yml",
    root / ".github/scripts/v2_harden.py",
):
    if temporary.exists():
        temporary.unlink()
