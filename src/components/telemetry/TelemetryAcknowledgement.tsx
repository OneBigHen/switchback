"use client"

import { PRODUCT_BRAND } from "@/lib/brand/product-brand"
import { ModalFocusScope } from "@/components/planner/a11y/ModalFocusScope"
import styles from "./TelemetryAcknowledgement.module.css"

const TELEMETRY_SPEC_URL = "https://github.com/OneBigHen/switchback/blob/main/docs/superpowers/specs/2026-09-14-posthog-dev-observability-design.md"

interface TelemetryAcknowledgementProps {
  onAccept(): void
  onDecline(): void
}

export function TelemetryAcknowledgement({ onAccept, onDecline }: TelemetryAcknowledgementProps) {
  return (
    <ModalFocusScope onEscape={() => undefined}>
      <div className={styles.scrim} role="dialog" aria-modal="true" aria-labelledby="telemetry-acknowledgement-title">
        <section className={styles.panel}>
          <div className={styles.eyebrow}>Hosted beta · observability notice</div>
          <h1 id="telemetry-acknowledgement-title">Help us improve {PRODUCT_BRAND.name}</h1>
          <p className={styles.lede}>
            This hosted development instance records detailed usage information so a small beta group can help us find friction and regressions quickly.
          </p>

          <ul className={styles.scope}>
            <li>Session recordings of permitted app surfaces, plus clicks, taps, feature use and workflow timing.</li>
            <li>Device and browser details, errors, performance data, and IP/approximate network location.</li>
            <li>Release, build and feature-variant context so behavior can be compared across deployments.</li>
          </ul>

          <p className={styles.protection}>
            We do not intentionally send passwords, passkeys, tokens, raw GPX files, complete route geometry, raw GPS history, or private ride notes to analytics. Primary navigation and private-ride map canvases are excluded from replay.
          </p>
          <p className={styles.note}>
            Self-hosted {PRODUCT_BRAND.name} has telemetry disabled by default. You can inspect the public telemetry specification before choosing.
          </p>

          <a className={styles.specLink} href={TELEMETRY_SPEC_URL} target="_blank" rel="noreferrer">
            Read the telemetry specification
          </a>

          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={onAccept}>
              Acknowledge and continue
            </button>
            <button type="button" className={styles.secondary} onClick={onDecline}>
              Continue without telemetry
            </button>
          </div>
        </section>
      </div>
    </ModalFocusScope>
  )
}
