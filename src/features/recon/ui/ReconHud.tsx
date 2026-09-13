"use client";

import type { ReconTrack } from "@/features/recon/types";
import { formatTrackHudLine } from "./recon-format";

/**
 * The compact factual HUD. Observed facts only: a preview never shows a
 * clock, an unmeasured surface is never named, and colour never carries the
 * recorded-vs-preview distinction alone — the badge always names the kind.
 */

export interface ReconHudAction {
  href: string;
  label: string;
}

interface ReconHudProps {
  track: ReconTrack;
  /** Provenance line shown only when gravel evidence actually renders. */
  evidenceNote: string | null;
  previewError: string | null;
  /** The one dominant action, when the HUD should offer one. */
  action: ReconHudAction | null;
}

export default function ReconHud({
  track,
  evidenceNote,
  previewError,
  action,
}: ReconHudProps) {
  const kind =
    track.playbackKind === "recorded" ? "Recorded ride" : "Route preview";
  // Phone GPS altitude is noisy, so climb totals are presented as
  // approximate — a derived estimate, never an unqualified observed fact.
  const elevation =
    track.facts.ascentMeters !== null && track.facts.descentMeters !== null
      ? ` · ↑≈${Math.round(track.facts.ascentMeters)} m ↓≈${Math.round(
          track.facts.descentMeters,
        )} m (approx.)`
      : "";

  return (
    <section className="recon-hud" aria-live="polite">
      <p className="recon-hud-eyebrow">{kind}</p>
      <h2 className="recon-hud-name">{track.name}</h2>
      <p className="recon-hud-meta">
        {formatTrackHudLine(track)}
        {elevation}
      </p>
      {evidenceNote ? (
        <p className="recon-hud-note">{evidenceNote}</p>
      ) : null}
      {previewError ? <p className="recon-hud-error">{previewError}</p> : null}
      {action ? (
        <a className="recon-hud-action" href={action.href}>
          {action.label}
        </a>
      ) : null}
    </section>
  );
}
