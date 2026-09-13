"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adaptRecordedRide } from "@/features/recon/data/recorded-ride-adapter";
import { adaptCatalogRoute } from "@/features/recon/data/catalog-route-adapter";
import { fetchCatalogRoute } from "@/lib/gpx/catalog-client";
import { RideJournalLibrary } from "@/lib/storage/ride-journal";
import type { ReconTrack } from "@/features/recon/types";
import {
  emptyEvidence,
  fetchGravelEvidence,
  type GravelEvidence,
} from "@/features/recon/layers/gravel-evidence-layer";
import { groupPickerEntries, type CatalogEntry } from "./picker-groups";
import ReconRidePicker from "./ReconRidePicker";
import ReconHud, { type ReconHudAction } from "./ReconHud";

// MapLibre needs the browser: the map loads client-side only, after this
// route is already interactive. Recon never imports map code from a module
// that participates in ordinary app startup.
const ReconMap = dynamic(() => import("../map/ReconMap"), {
  ssr: false,
  loading: () => <div className="recon-map-loading" aria-hidden="true" />,
});

const EVIDENCE_NOTE =
  "Known gravel from the OpenGravel Gravel Atlas crosses this route.";

interface ReconShellProps {
  /** Deep link: pin the shell to one ride id from /labs/recon/replay/[rideId]. */
  focusedTrackId?: string;
  /** Test seam only: injects pre-adapted journal tracks. */
  initialRecordedTracks?: ReconTrack[];
}

type JournalState = "loading" | "ready" | "unavailable";

/**
 * The Recon Explorer shell: one map field owning 85–95% of the viewport,
 * a floating factual HUD, and a floating picker. Owns all data loading and
 * its lifecycle: journal loads degrade to an explicit unavailable state,
 * preview fetches abort on selection change and unmount, and every error is
 * tied to the selection that produced it — a failure for route A can never
 * surface under ride B.
 */
export default function ReconShell({
  focusedTrackId,
  initialRecordedTracks,
}: ReconShellProps = {}) {
  const [journalTracks, setJournalTracks] = useState<ReconTrack[] | null>(
    initialRecordedTracks ?? null,
  );
  const [journalState, setJournalState] = useState<JournalState>(
    initialRecordedTracks ? "ready" : "loading",
  );
  const [journalRejectedCount, setJournalRejectedCount] = useState(0);
  const [catalogEntries, setCatalogEntries] = useState<CatalogEntry[] | null>(
    null,
  );
  const [catalogUnavailable, setCatalogUnavailable] = useState(false);
  const [catalogTracks, setCatalogTracks] = useState<Map<string, ReconTrack>>(
    () => new Map(),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<{
    trackId: string;
    message: string;
  } | null>(null);
  const [evidence, setEvidence] = useState<{
    trackId: string;
    result: GravelEvidence;
  } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(true);
  const previewAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    const journal = new RideJournalLibrary();
    journal
      .list()
      .then((rides) => {
        if (cancelled) return;
        const tracks: ReconTrack[] = [];
        let rejected = 0;
        for (const ride of rides) {
          const track = adaptRecordedRide(ride);
          if (track) tracks.push(track);
          else rejected += 1;
        }
        setJournalTracks(tracks);
        setJournalRejectedCount(rejected);
        setJournalState("ready");
      })
      .catch(() => {
        // An unavailable journal is an explicit state, never a false
        // "no recorded rides yet".
        if (!cancelled) setJournalState("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    fetch("/api/gpx-library", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`catalog ${response.status}`);
        return (await response.json()) as unknown;
      })
      .then((body) => {
        if (!cancelled) setCatalogEntries(parseCatalogEntries(body));
      })
      .catch(() => {
        if (cancelled || controller.signal.aborted) return;
        setCatalogUnavailable(true);
        setCatalogEntries([]);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  // The effective selection: the deep-linked ride in focused mode, else the
  // rider's explicit choice, else the first available track.
  const resolvedSelectedId =
    focusedTrackId ??
    selectedId ??
    (journalTracks !== null && journalTracks.length > 0
      ? journalTracks[0]!.id
      : null) ??
    (catalogEntries !== null && catalogEntries.length > 0
      ? catalogEntries[0]!.id
      : null);

  const selectedTrack = useMemo(() => {
    if (resolvedSelectedId === null) return null;
    return (
      journalTracks?.find((track) => track.id === resolvedSelectedId) ??
      catalogTracks.get(resolvedSelectedId) ??
      null
    );
  }, [resolvedSelectedId, journalTracks, catalogTracks]);

  // Catalog geometry loads lazily, one route at a time, when selected.
  // Lifecycle (R2): the previous fetch is aborted whenever the selection
  // changes or the shell unmounts, and every error is stored against the
  // track id that produced it, so a stale failure can never render under a
  // different ride.
  useEffect(() => {
    previewAbortRef.current?.abort();
    previewAbortRef.current = null;
    if (
      resolvedSelectedId === null ||
      selectedTrack !== null ||
      catalogEntries === null ||
      !catalogEntries.some((entry) => entry.id === resolvedSelectedId)
    ) {
      return;
    }
    const trackId = resolvedSelectedId;
    const controller = new AbortController();
    previewAbortRef.current = controller;
    let cancelled = false;
    const fetcher: typeof fetch = (input, init) =>
      fetch(input, { ...init, signal: controller.signal });

    fetchCatalogRoute(trackId, fetcher)
      .then((route) => {
        if (cancelled) return;
        const track = adaptCatalogRoute(route);
        if (!track) {
          setPreviewError({
            trackId,
            message: "That route preview could not be read.",
          });
          return;
        }
        setPreviewError(null);
        setCatalogTracks((previous) => new Map(previous).set(trackId, track));
      })
      .catch(() => {
        if (cancelled || controller.signal.aborted) return;
        setPreviewError({
          trackId,
          message: "Route preview is unavailable right now.",
        });
      })
      .finally(() => {
        if (previewAbortRef.current === controller) {
          previewAbortRef.current = null;
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [resolvedSelectedId, selectedTrack, catalogEntries]);

  // Gravel evidence: fetched per selection, aborted on change and unmount.
  // The result is tagged with the track that produced it and derived at
  // render, so a selection change drops stale evidence without any
  // synchronous setState in the effect. Absence of evidence renders as
  // nothing — never as a surface claim.
  useEffect(() => {
    if (!selectedTrack) return;
    const track = selectedTrack;
    const controller = new AbortController();
    let cancelled = false;
    fetchGravelEvidence(track, controller.signal)
      .then((result) => {
        if (!cancelled) setEvidence({ trackId: track.id, result });
      })
      .catch(() => {
        if (!cancelled && !controller.signal.aborted) {
          setEvidence({ trackId: track.id, result: emptyEvidence() });
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedTrack]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    setPreviewError(null);
  }, []);

  const groups = useMemo(
    () => groupPickerEntries(journalTracks ?? [], catalogEntries ?? []),
    [journalTracks, catalogEntries],
  );

  // Ride history: recorded rides only, minus the selection. Journal
  // geometry without timestamps is a preview, not ride history.
  const historyTracks = useMemo(
    () =>
      journalTracks?.filter(
        (track) =>
          track.playbackKind === "recorded" && track.id !== selectedTrack?.id,
      ) ?? [],
    [journalTracks, selectedTrack],
  );

  const catalogSettled = catalogEntries !== null;
  const journalSettled =
    journalState === "ready" || journalState === "unavailable";
  const loading = !journalSettled || !catalogSettled;
  const hasAnyTrack =
    (journalTracks?.length ?? 0) > 0 || (catalogEntries?.length ?? 0) > 0;
  const focusedNotFound =
    focusedTrackId !== undefined &&
    !loading &&
    !journalTracks?.some((track) => track.id === focusedTrackId) &&
    !catalogEntries?.some((entry) => entry.id === focusedTrackId);

  const activePreviewError =
    previewError !== null && previewError.trackId === resolvedSelectedId
      ? previewError.message
      : null;

  const hudAction: ReconHudAction | null = selectedTrack
    ? focusedTrackId !== undefined
      ? null
      : {
          href: `/labs/recon/replay/${encodeURIComponent(selectedTrack.id)}`,
          label:
            selectedTrack.playbackKind === "recorded"
              ? "Open ride view"
              : "Open route view",
        }
    : null;

  // Evidence reads through the tag: a result belongs to the selection it
  // was fetched for, so a changed selection shows nothing until its own
  // fetch resolves.
  const activeEvidence =
    evidence && selectedTrack && evidence.trackId === selectedTrack.id
      ? evidence.result
      : null;

  return (
    <div className="recon-shell">
      <ReconMap
        selectedTrack={selectedTrack}
        historyTracks={historyTracks}
        evidence={activeEvidence?.collection ?? null}
      />

      {!loading && !hasAnyTrack ? (
        <div className="recon-empty">
          <div className="recon-empty-card">
            <span className="recon-empty-mark" aria-hidden="true" />
            <p className="recon-eyebrow">OpenGravel Labs</p>
            <h1 className="recon-wordmark">Recon</h1>
            <p className="recon-empty-copy">
              Record a ride and Recon will bring it back to life.
            </p>
            <p className="recon-empty-note">
              Recon is an experimental way to explore the rides and routes
              OpenGravel already owns. Nothing here edits your routes or your
              ride journal.
            </p>
            <Link className="recon-back-link" href="/">
              ← OpenGravel planner
            </Link>
          </div>
        </div>
      ) : focusedNotFound ? (
        <div className="recon-empty">
          <div className="recon-empty-card">
            <p className="recon-eyebrow">OpenGravel Labs</p>
            <h1 className="recon-wordmark">Recon</h1>
            <p className="recon-empty-copy">
              That ride isn&apos;t in your journal or the Route Library.
            </p>
            <Link className="recon-back-link" href="/labs/recon">
              ← All rides
            </Link>
          </div>
        </div>
      ) : (
        <>
          {focusedTrackId !== undefined ? (
            <Link className="recon-back-chip" href="/labs/recon">
              ← All rides
            </Link>
          ) : (
            <>
              <button
                type="button"
                className="recon-picker-toggle"
                aria-expanded={pickerOpen}
                aria-controls="recon-picker-panel"
                onClick={() => setPickerOpen((open) => !open)}
              >
                Rides
              </button>
              {pickerOpen ? (
                <div className="recon-panel" id="recon-picker-panel">
                  <header className="recon-panel-header">
                    <div>
                      <p className="recon-eyebrow">OpenGravel Labs</p>
                      <h1 className="recon-wordmark">Recon</h1>
                    </div>
                    <Link className="recon-back-link" href="/">
                      ← Planner
                    </Link>
                  </header>
                  <ReconRidePicker
                    groups={groups}
                    journalState={journalState}
                    journalRejectedCount={journalRejectedCount}
                    catalogUnavailable={catalogUnavailable}
                    selectedId={resolvedSelectedId}
                    onSelect={handleSelect}
                  />
                </div>
              ) : null}
            </>
          )}

          {selectedTrack ? (
            <ReconHud
              track={selectedTrack}
              evidenceNote={activeEvidence?.hasEvidence ? EVIDENCE_NOTE : null}
              previewError={activePreviewError}
              action={hudAction}
            />
          ) : activePreviewError ? (
            <div className="recon-notice" role="status">
              {activePreviewError}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function parseCatalogEntries(body: unknown): CatalogEntry[] {
  if (!body || typeof body !== "object") return [];
  const routes = (body as { routes?: unknown }).routes;
  if (!Array.isArray(routes)) return [];
  const entries: CatalogEntry[] = [];
  for (const item of routes) {
    if (!item || typeof item !== "object") continue;
    const record = item as { id?: unknown; name?: unknown };
    if (
      typeof record.id === "string" &&
      record.id.length > 0 &&
      typeof record.name === "string"
    ) {
      entries.push({ id: record.id, name: record.name });
    }
    if (entries.length >= 50) break;
  }
  return entries;
}
