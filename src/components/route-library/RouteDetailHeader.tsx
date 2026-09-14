"use client"

import { ArrowLeft, Check, DotsThree, ShareNetwork } from "@phosphor-icons/react"
import Link from "next/link"
import { useState } from "react"
import styles from "./RouteDetailHeader.module.css"

export interface RouteDetailHeaderProps {
  routeName: string
  /** Anchor for the technical detail section the overflow menu jumps to. */
  detailsAnchor: string
}

/**
 * Compact route-detail chrome: back, the surface's name, share, overflow.
 *
 * Share uses the platform sheet where there is one and falls back to copying
 * the link, so the control always does something real rather than appearing
 * and failing on desktop.
 */
export function RouteDetailHeader({ routeName, detailsAnchor }: RouteDetailHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const copyLink = async () => {
    setMenuOpen(false)
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2_400)
    } catch {
      // Clipboard permission refused: the address bar still holds the link.
    }
  }

  const share = async () => {
    const shareData = { title: routeName, url: typeof window === "undefined" ? "" : window.location.href }
    if (typeof navigator.share === "function") {
      try {
        await navigator.share(shareData)
        return
      } catch {
        // Dismissed or unsupported for this payload; fall through to copying.
      }
    }
    await copyLink()
  }

  return (
    <header className={styles.header}>
      <Link className={styles.iconButton} href="/gpx-library" aria-label="Back to the GPX Library">
        <ArrowLeft weight="bold" aria-hidden="true" />
      </Link>
      <h1 className={styles.title}>Route details</h1>
      <button type="button" className={styles.iconButton} aria-label={`Share ${routeName}`} onClick={() => void share()}>
        {copied ? <Check weight="bold" aria-hidden="true" /> : <ShareNetwork weight="bold" aria-hidden="true" />}
      </button>
      <div className={styles.overflow}>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="More route actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <DotsThree weight="bold" aria-hidden="true" />
        </button>
        {menuOpen ? (
          <div className={styles.menu} role="menu">
            <button type="button" role="menuitem" onClick={() => void copyLink()}>Copy link</button>
            <a role="menuitem" href={`#${detailsAnchor}`} onClick={() => setMenuOpen(false)}>
              Route data &amp; diagnostics
            </a>
          </div>
        ) : null}
      </div>
      <p className={styles.status} role="status" aria-live="polite">{copied ? "Link copied" : ""}</p>
    </header>
  )
}
