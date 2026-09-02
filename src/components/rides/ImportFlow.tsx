"use client"

import { FileArrowUp, LockKeyOpen, Path } from "@phosphor-icons/react"
import { useState } from "react"
import type { RoadLockMode } from "@/lib/roads/road-locks"
import styles from "./ImportFlow.module.css"

export interface ImportFlowProps {
  onImportRoute(file: File): void
  onImportRoads?(file: File, mode: RoadLockMode): void | Promise<void>
}

export function ImportFlow({ onImportRoute, onImportRoads }: ImportFlowProps) {
  const [file, setFile] = useState<File | null>(null)

  return (
    <section className={styles.flow} aria-label="Import ride">
      <label className={styles.filePicker}>
        <FileArrowUp weight="bold" aria-hidden="true" />
        <span>{file ? "Choose another file" : "Choose GPX, KML, or KMZ"}</span>
        <input
          type="file"
          accept=".gpx,.kml,.kmz,application/gpx+xml,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz,application/xml,text/xml"
          aria-label="Choose GPX, KML, or KMZ file"
          onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)}
        />
      </label>

      {file ? (
        <div className={styles.choices}>
          <header>
            <strong>{file.name}</strong>
            <small>What should Switchback do with it?</small>
          </header>
          <button type="button" onClick={() => onImportRoute(file)}>
            <Path weight="bold" aria-hidden="true" />
            <span><b>Open as a route</b><small>Load the imported track into Rides.</small></span>
          </button>
          {onImportRoads ? (
            <>
              <button type="button" onClick={() => void onImportRoads(file, "prefer")}>
                <LockKeyOpen aria-hidden="true" />
                <span><b>Prefer these roads</b><small>Favor this corridor when Switchback plans.</small></span>
              </button>
              <button type="button" onClick={() => void onImportRoads(file, "must")}>
                <LockKeyOpen weight="fill" aria-hidden="true" />
                <span><b>Require these roads</b><small>Keep this corridor unless access or safety makes it impossible.</small></span>
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
