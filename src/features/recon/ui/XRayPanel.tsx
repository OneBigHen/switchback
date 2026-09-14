"use client"

import { useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import type { ReconTrack } from "@/features/recon/types"
import type { ExplorationResult } from "@/features/recon/intel/exploration"
import { curvatureBandFor, explorationBins, type XRayReport } from "@/features/recon/intel/xray"
import type { ReplayEngine } from "@/features/recon/replay/replay-engine"
import { duration, feet, miles, mph } from "./recon-format"

interface XRayPanelProps {
  engine: ReplayEngine
  track: ReconTrack
  report: XRayReport
  exploration: ExplorationResult | null
  /** False when the Gravel Atlas could not be asked (unknown, not "no gravel"). */
  evidenceKnown: boolean
  onClose(): void
}

const W = 1000

/**
 * X-Ray: every strip shares one distance axis with the replay head. Drag
 * anywhere across the strips to scrub. Unknown data draws as a deliberate
 * hatched band with words, never as a flat zero line.
 */
export default function XRayPanel({ engine, track, report, exploration, evidenceKnown, onClose }: XRayPanelProps) {
  const cursorRef = useRef<HTMLDivElement>(null)
  const readRef = useRef<HTMLParagraphElement>(null)
  const stripsRef = useRef<HTMLDivElement>(null)
  const recorded = track.playbackKind === "recorded"
  const { bins, summary } = report
  const total = summary.distanceMeters
  const binWidth = W / bins.length
  const statuses = useMemo(() => (exploration ? explorationBins(exploration.segments, bins) : null), [exploration, bins])

  useEffect(
    () =>
      engine.onFrame(({ frame }) => {
        const fraction = frame.distanceMeters / Math.max(1, total)
        if (cursorRef.current) cursorRef.current.style.transform = `translateX(${(fraction * 100).toFixed(2)}cqw)`
        if (readRef.current) {
          const bin = bins[Math.min(bins.length - 1, Math.floor(fraction * bins.length))]
          const twist = bin?.twistiness
          const text = `Mile ${(frame.distanceMeters / 1609.344).toFixed(1)} · ${feet(bin?.altitudeMeters ?? null)}${recorded ? ` · ${mph(bin?.speedMph ?? null)}` : ""}${twist != null ? ` · ${curvatureBandFor(twist)} road` : ""}`
          if (readRef.current.textContent !== text) readRef.current.textContent = text
        }
      }),
    [engine, bins, total, recorded]
  )

  const scrubFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = stripsRef.current?.getBoundingClientRect()
    if (!box || box.width === 0) return
    const fraction = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width))
    engine.seekDistance(fraction * total)
  }

  const altitude = useMemo(() => {
    if (!report.altitudeRange) return null
    const [low, high] = report.altitudeRange
    const span = Math.max(15, high - low)
    let path = ""
    bins.forEach((bin, index) => {
      if (bin.altitudeMeters === null) return
      const x = index * binWidth + binWidth / 2
      const y = 56 - ((bin.altitudeMeters - low) / span) * 50
      path += `${path ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`
    })
    return { area: `${path}L${W},60L0,60Z`, line: path }
  }, [report.altitudeRange, bins, binWidth])

  const speed = useMemo(() => {
    if (!report.speedMax) return null
    const top = Math.max(15, report.speedMax)
    let path = ""
    let pen = false
    bins.forEach((bin, index) => {
      if (bin.speedMph === null) {
        pen = false
        return
      }
      const x = index * binWidth + binWidth / 2
      const y = 56 - (bin.speedMph / top) * 50
      path += `${pen ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`
      pen = true
    })
    return path
  }, [report.speedMax, bins, binWidth])

  const newMeters = exploration?.newToYouMeters ?? null

  return (
    <aside id="recon-xray" className="recon-xray recon-glass" aria-label="X-Ray ride breakdown">
      <header className="recon-xray-head">
        <div>
          <p className="recon-eyebrow">X-Ray</p>
          <h2 className="recon-xray-title">What this ride was made of</h2>
        </div>
        <button type="button" className="recon-icon-button" onClick={onClose} aria-label="Close X-Ray">
          ×
        </button>
      </header>

      <dl className="recon-xray-facts">
        <Fact label="Distance" value={miles(total)} />
        {recorded ? <Fact label="Recorded time" value={duration(summary.durationMinutes)} /> : null}
        {recorded ? <Fact label="Moving time" value={duration(summary.movingMinutes)} /> : null}
        {recorded ? <Fact label="Avg moving" value={mph(summary.averageMovingMph)} /> : null}
        {recorded ? <Fact label={summary.speedSource === "timestamps" ? "Top speed (GPS)" : "Top speed"} value={mph(summary.maxSpeedMph)} /> : null}
        <Fact label="Climb" value={summary.ascentMeters === null ? "—" : `≈${feet(summary.ascentMeters)}`} />
        <Fact label="Twistiness" value={summary.twistiness === null ? "—" : `${summary.twistiness}/100`} />
        {summary.onPlanPercent !== null ? <Fact label="On planned route" value={`${summary.onPlanPercent}%`} /> : null}
      </dl>

      <p className="recon-xray-read" ref={readRef} aria-live="off" />

      <div className="recon-strips" ref={stripsRef} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); scrubFromPointer(event) }} onPointerMove={(event) => { if (event.buttons === 1) scrubFromPointer(event) }}>
        <div className="recon-cursor" ref={cursorRef} aria-hidden="true" />

        <Strip label="Elevation" note={report.altitudeRange ? `${feet(report.altitudeRange[0])} – ${feet(report.altitudeRange[1])} · GPS, approx.` : "No elevation readings"}>
          {altitude ? (
            <>
              <path className="recon-x-area" d={altitude.area} />
              <path className="recon-x-line" d={altitude.line} />
            </>
          ) : (
            <Unknown />
          )}
        </Strip>

        <Strip label="Speed" note={!recorded ? "Previews have no recorded speed" : speed ? `peaks ${mph(report.speedMax)}${summary.speedSource === "timestamps" ? " · from GPS time" : ""}` : "No speed readings"}>
          {speed ? <path className="recon-x-speed" d={speed} /> : <Unknown />}
        </Strip>

        <Strip label="Curvature" note={summary.twistiness === null ? "—" : `ride ${summary.twistiness}/100 · planner twistiness formula`}>
          {bins.map((bin, index) =>
            bin.twistiness === null ? null : (
              <rect key={index} className={`recon-x-band-${curvatureBandFor(bin.twistiness)}`} x={index * binWidth} width={binWidth + 0.6} y={56 - Math.max(4, (Math.min(100, bin.twistiness) / 100) * 52)} height={Math.max(4, (Math.min(100, bin.twistiness) / 100) * 52)} />
            )
          )}
        </Strip>

        <Strip
          label="Surface"
          note={!evidenceKnown ? "Unknown — the Gravel Atlas couldn't be checked here" : summary.knownGravelMeters ? `${miles(summary.knownGravelMeters)} on known gravel · elsewhere unknown` : "No known gravel on this ride · surface otherwise unknown"}
          short
        >
          <rect className="recon-x-unknown" x={0} width={W} y={0} height={60} />
          {evidenceKnown ? bins.map((bin, index) => (bin.knownGravel ? <rect key={index} className="recon-x-gravel" x={index * binWidth} width={binWidth + 0.6} y={0} height={60} /> : null)) : null}
        </Strip>

        {recorded ? (
          <Strip
            label="New to you"
            note={newMeters === null ? "Waiting for your ride journal" : exploration?.comparedRideCount === 0 ? "No earlier rides on record — all new to you" : `${miles(newMeters)} new · ${miles(exploration!.previouslyRiddenMeters)} ridden before`}
            short
          >
            {statuses ? statuses.map((status, index) => <rect key={index} className={status === "previously-ridden" ? "recon-x-ridden" : "recon-x-new"} x={index * binWidth} width={binWidth + 0.6} y={0} height={60} />) : <Unknown />}
          </Strip>
        ) : null}

        {recorded ? (
          <Strip label="GPS" note={summary.gapCount === 0 ? "No signal gaps" : `${summary.gapCount} signal ${summary.gapCount === 1 ? "gap" : "gaps"} · shown, never filled in`} short>
            <rect className="recon-x-gps" x={0} width={W} y={26} height={8} />
            {bins.map((bin, index) => (bin.lowAccuracy ? <rect key={`a${index}`} className="recon-x-lowacc" x={index * binWidth} width={binWidth + 0.6} y={14} height={32} /> : null))}
            {report.gaps.map((gap, index) => (
              <rect key={`g${index}`} className="recon-x-gap" x={(gap.atMeters / total) * W - 2} width={Math.max(4, (gap.lengthMeters / total) * W)} y={0} height={60} />
            ))}
          </Strip>
        ) : null}

        {report.moments.length > 0 ? (
          <Strip label="Moments" note={`${report.moments.length} captured on the ride`} short>
            {report.moments.map((moment) => (
              <circle key={moment.id} className="recon-x-moment" cx={(moment.atMeters / total) * W} cy={30} r={9} />
            ))}
          </Strip>
        ) : null}
      </div>

      {report.moments.length > 0 ? (
        <ul className="recon-moments">
          {report.moments.map((moment) => (
            <li key={moment.id}>
              <button type="button" className="recon-row" onClick={() => engine.seekDistance(moment.atMeters)}>
                <span className="recon-row-name">{moment.caption || "Photo"}</span>
                <span className="recon-row-meta">Mile {(moment.atMeters / 1609.344).toFixed(1)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {track.note ? <p className="recon-xray-note">“{track.note}”</p> : null}
    </aside>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function Strip({ label, note, short, children }: { label: string; note: string; short?: boolean; children: ReactNode }) {
  return (
    <figure className={short ? "recon-strip is-short" : "recon-strip"}>
      <figcaption>
        <span className="recon-strip-label">{label}</span>
        <span className="recon-strip-note">{note}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} 60`} preserveAspectRatio="none" role="img" aria-label={`${label}: ${note}`}>
        {children}
      </svg>
    </figure>
  )
}

function Unknown() {
  return <rect className="recon-x-unknown" x={0} width={W} y={0} height={60} />
}
