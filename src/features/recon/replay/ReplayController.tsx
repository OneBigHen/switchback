"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import type { ReconTrack } from "../types";
import {
  decimateTrackForDisplay,
  displayCutIndex,
  replayDurationMs,
  sampleReplay,
} from "./replay-timeline";
import { classifyExploration } from "./exploration";
import {
  defaultCameraMode,
  ReconCameraDirector,
  type ReconCameraMode,
  type ReconDirectorEnvironment,
} from "./camera-director";
import type {
  ReplayOverlayController,
  ReplayVertexStatus,
} from "../layers/create-replay-overlay";
import ReconPlaybackControls from "../ui/ReconPlaybackControls";

/**
 * Owns Replay: the requestAnimationFrame playback loop, the camera
 * director, and the deck.gl overlay lifecycle.
 *
 * High-frequency state (playback position, camera pose, deck layer data)
 * lives in refs and is applied straight to the map and the overlay — React
 * never sees 60 Hz state. React renders only the control surface, refreshed
 * at a throttled cadence. The map is driven with `jumpTo` once per frame;
 * `flyTo()` is never called per frame.
 */

/** Nominal full-route traversal for previews. Pure animation cadence for
 * distance-normalized progress — never displayed as elapsed time. */
const PREVIEW_TRAVERSAL_MS = 45_000;

/** UI refresh cadence for the scrubber/HUD mirror, well under 60 Hz. */
const UI_THROTTLE_MS = 120;

/** Arrow-key seek step, as a fraction of the ride. */
const KEYBOARD_SEEK_STEP = 0.02;

/** Phone-class breakpoint for the Overview default (mobile contract). */
const COMPACT_VIEWPORT_PX = 640;

export interface ReplayControllerProps {
  /** The loaded Recon map instance (the one MapLibre context). */
  map: MapLibreMap;
  track: ReconTrack;
  /** Recorded rides to compare against; the ride itself must be excluded. */
  historyTracks: ReconTrack[];
  exitHref: string;
}

function environmentFor(map: MapLibreMap): ReconDirectorEnvironment {
  const container = map.getContainer();
  const width = container.clientWidth || 1024;
  const height = container.clientHeight || 768;
  return {
    viewport: { width, height },
    reducedMotion:
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    compactViewport: width < COMPACT_VIEWPORT_PX,
  };
}

export default function ReplayController({
  map,
  track,
  historyTracks,
  exitHref,
}: ReplayControllerProps) {
  const geometry = useMemo(() => decimateTrackForDisplay(track), [track]);

  const segments = useMemo(
    () => classifyExploration(track, historyTracks),
    [track, historyTracks],
  );

  /**
   * Exploration status per DECIMATED vertex, looked up through the segment
   * ranges (which index the original points). Null when history is absent:
   * no claim, neutral trail.
   */
  const vertexStatuses = useMemo<readonly ReplayVertexStatus[] | null>(() => {
    if (!geometry || !segments || segments.length === 0) return null;
    return geometry.originalIndices.map((originalIndex) => {
      for (const segment of segments) {
        if (
          originalIndex >= segment.fromIndex &&
          originalIndex <= segment.toIndex
        ) {
          return segment.status;
        }
      }
      return null;
    });
  }, [geometry, segments]);

  const durationMs = useMemo(
    () =>
      track.playbackKind === "recorded"
        ? (replayDurationMs(track) ?? 0)
        : PREVIEW_TRAVERSAL_MS,
    [track],
  );

  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [mode, setMode] = useState<ReconCameraMode>(() =>
    defaultCameraMode(environmentFor(map)),
  );
  const [followSuspended, setFollowSuspended] = useState(false);
  // Throttled mirror of the playback position for the control surface.
  const [position, setPosition] = useState(0);

  const positionRef = useRef(0);
  const playingRef = useRef(false);
  const rateRef = useRef(1);
  const modeRef = useRef<ReconCameraMode>(mode);
  const directorRef = useRef<ReconCameraDirector | null>(null);
  const overlayCtlRef = useRef<ReplayOverlayController | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const lastUiRef = useRef(0);
  const lastCutRef = useRef(-1);
  const cameraDirtyRef = useRef(true);
  const visualsDirtyRef = useRef(true);
  const statusesRef = useRef<readonly ReplayVertexStatus[] | null>(null);

  useEffect(() => {
    statusesRef.current = vertexStatuses;
    visualsDirtyRef.current = true;
  }, [vertexStatuses]);

  // A new track resets playback to its beginning, paused (no autoplay).
  // State adjustments on prop change happen during render, the sanctioned
  // React pattern; the matching ref resets happen in the loop effect below.
  const [renderedTrack, setRenderedTrack] = useState(track);
  if (renderedTrack !== track) {
    setRenderedTrack(track);
    setPosition(0);
    setPlaying(false);
  }

  // The director lives outside React and is recreated only when the map or
  // track identity changes; environment updates flow through setEnvironment.
  useEffect(() => {
    if (!geometry) return;
    const director = new ReconCameraDirector(environmentFor(map));
    director.setMode(modeRef.current);
    directorRef.current = director;

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const applyEnvironment = () => director.setEnvironment(environmentFor(map));
    applyEnvironment();
    media.addEventListener("change", applyEnvironment);
    map.on("resize", applyEnvironment);
    return () => {
      media.removeEventListener("change", applyEnvironment);
      map.off("resize", applyEnvironment);
      directorRef.current = null;
    };
  }, [map, geometry]);

  // Deck overlay: lazily imported (Replay/deck.gl is its own bundle step),
  // added to the ONE map as an interleaved control, removed on exit.
  useEffect(() => {
    let cancelled = false;
    let controller: ReplayOverlayController | null = null;
    import("../layers/create-replay-overlay")
      .then((module) => {
        if (cancelled) return;
        controller = module.createReplayOverlayController();
        overlayCtlRef.current = controller;
        map.addControl(controller.overlay);
        visualsDirtyRef.current = true;
      })
      .catch(() => {
        // A failed deck bundle must never take the ride down: the MapLibre
        // route and beacon-less view still render. Nothing to clean up.
      });
    return () => {
      cancelled = true;
      if (overlayCtlRef.current === controller) overlayCtlRef.current = null;
      if (controller) {
        try {
          map.removeControl(controller.overlay);
        } catch {
          // The map may already be gone during teardown ordering.
        }
      }
    };
  }, [map]);

  // Manual interaction suspends the director. Programmatic camera changes
  // (our own per-frame jumpTo) carry no originalEvent and never suspend.
  useEffect(() => {
    const onUserCamera = (event: MapMouseEvent) => {
      if (!event.originalEvent) return;
      directorRef.current?.suspend();
      setFollowSuspended(true);
    };
    const events = ["dragstart", "rotatestart", "pitchstart", "zoomstart"] as const;
    for (const event of events) map.on(event, onUserCamera);
    return () => {
      for (const event of events) map.off(event, onUserCamera);
    };
  }, [map]);

  // The playback loop. Always scheduled while mounted; per-frame work is
  // skipped when paused, not orbiting, and nothing is dirty.
  useEffect(() => {
    if (!geometry) return;
    // Track (re)mount: reset the high-frequency state this effect owns.
    positionRef.current = 0;
    playingRef.current = false;
    cameraDirtyRef.current = true;
    visualsDirtyRef.current = true;
    lastCutRef.current = -1;
    lastTimeRef.current = null;
    const statuses = () => statusesRef.current;

    const step = (now: number) => {
      rafRef.current = requestAnimationFrame(step);
      const last = lastTimeRef.current ?? now;
      lastTimeRef.current = now;
      const dt = Math.min(250, now - last);

      const director = directorRef.current;
      const cameraWanted =
        playingRef.current || modeRef.current === "orbit" || cameraDirtyRef.current;

      if (
        !playingRef.current &&
        modeRef.current !== "orbit" &&
        !cameraWanted &&
        !visualsDirtyRef.current &&
        overlayCtlRef.current !== null &&
        lastCutRef.current >= 0
      ) {
        return;
      }

      if (playingRef.current && durationMs > 0) {
        positionRef.current = Math.min(
          1,
          positionRef.current + (dt * rateRef.current) / durationMs,
        );
        if (positionRef.current >= 1) {
          positionRef.current = 1;
          playingRef.current = false;
          setPlaying(false);
        }
      }

      const frame = sampleReplay(track, positionRef.current);
      if (!frame) return;

      if (cameraWanted && director) {
        const pose = director.update(
          {
            coordinate: frame.coordinate,
            bearingDegrees: frame.bearingDegrees,
            paused: !playingRef.current,
          },
          {
            coordinates: geometry.coordinates,
            cumulativeDistancesMeters: geometry.cumulativeDistancesMeters,
            position: positionRef.current,
          },
          dt,
        );
        map.jumpTo({
          center: pose.center,
          bearing: pose.bearingDegrees,
          pitch: pose.pitch,
          zoom: pose.zoom,
        });
        cameraDirtyRef.current = false;
      }

      const controller = overlayCtlRef.current;
      const cutIndex = displayCutIndex(geometry, positionRef.current);
      if (
        controller &&
        (playingRef.current || visualsDirtyRef.current || cutIndex !== lastCutRef.current)
      ) {
        controller.update({
          geometry,
          cutIndex,
          head: {
            coordinate: frame.coordinate,
            bearingDegrees: frame.bearingDegrees,
          },
          vertexStatuses: statuses(),
          playbackKind: track.playbackKind,
        });
        lastCutRef.current = cutIndex;
        visualsDirtyRef.current = false;
      }

      if (now - lastUiRef.current > UI_THROTTLE_MS) {
        lastUiRef.current = now;
        setPosition(positionRef.current);
      }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTimeRef.current = null;
    };
  }, [map, track, geometry, durationMs]);

  const handlePlayPause = useCallback(() => {
    if (playingRef.current) {
      playingRef.current = false;
      setPlaying(false);
      return;
    }
    if (positionRef.current >= 1) {
      positionRef.current = 0;
      lastCutRef.current = -1;
    }
    playingRef.current = true;
    setPlaying(true);
    cameraDirtyRef.current = true;
  }, []);

  const handleScrub = useCallback((next: number) => {
    positionRef.current = Math.min(1, Math.max(0, next));
    setPosition(positionRef.current);
    visualsDirtyRef.current = true;
    cameraDirtyRef.current = true;
    if (positionRef.current < 1) lastCutRef.current = -1;
  }, []);

  const handleRateChange = useCallback((next: number) => {
    rateRef.current = next;
    setRate(next);
  }, []);

  const handleModeChange = useCallback((next: ReconCameraMode) => {
    modeRef.current = next;
    setMode(next);
    directorRef.current?.setMode(next);
    cameraDirtyRef.current = true;
  }, []);

  const handleResumeFollow = useCallback(() => {
    directorRef.current?.resume();
    setFollowSuspended(false);
    cameraDirtyRef.current = true;
  }, []);

  // Keyboard playback: Space toggles, arrows seek. Elements that own these
  // keys (range input, buttons, links, select) are left alone.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "SELECT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "BUTTON" ||
          target.tagName === "A")
      ) {
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        handlePlayPause();
      } else if (event.code === "ArrowRight") {
        event.preventDefault();
        handleScrub(positionRef.current + KEYBOARD_SEEK_STEP);
      } else if (event.code === "ArrowLeft") {
        event.preventDefault();
        handleScrub(positionRef.current - KEYBOARD_SEEK_STEP);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlePlayPause, handleScrub]);

  if (!geometry) return null;

  const frame = sampleReplay(track, position);
  const elapsedMs = frame?.elapsedMs ?? null;
  const speedMph = frame?.speedMph ?? null;
  const scrubberPosition = Math.round(position * 1000) / 1000;

  return (
    <ReconPlaybackControls
      playing={playing}
      position={scrubberPosition}
      elapsedMs={elapsedMs}
      speedMph={speedMph}
      rate={rate}
      mode={mode}
      followSuspended={followSuspended && mode !== "free"}
      playbackKind={track.playbackKind}
      remainingMeters={Math.max(0, (1 - position) * track.distanceMeters)}
      onPlayPause={handlePlayPause}
      onScrub={handleScrub}
      onRateChange={handleRateChange}
      onModeChange={handleModeChange}
      onResumeFollow={handleResumeFollow}
      exitHref={exitHref}
    />
  );
}
