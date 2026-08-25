"use client"

import { Copy, ShareNetwork } from "@phosphor-icons/react"
import { useMemo, useState } from "react"
import { createPortableShare, type PrivacyZone } from "@/lib/share/route-share"
import type { PlannedRoute } from "@/lib/routing/types"

interface RouteSharePanelProps {
  route: PlannedRoute
  onShareCreated?(url: string): void
}

export function RouteSharePanel({ route, onShareCreated }: RouteSharePanelProps) {
  const [protectStart, setProtectStart] = useState(true)
  const [protectFinish, setProtectFinish] = useState(false)
  const [radiusMiles, setRadiusMiles] = useState(1)
  const [message, setMessage] = useState("")
  const zones = useMemo<PrivacyZone[]>(() => {
    // Clamp to the same 0.1-10mi range the input advertises (type="number"
    // min/max are visual hints only outside a <form>; without this a manually
    // typed out-of-range value can produce a privacy zone that swallows the
    // entire route, matching CommunityPublishPanel's identical clamp).
    const radiusMeters = Math.max(0.1, Math.min(10, radiusMiles)) * 1_609.344
    const first = route.geometry[0]
    const last = route.geometry.at(-1)
    return [
      ...(protectStart && first ? [{ id: "share-start", label: "Start privacy zone", center: first, radiusMeters }] : []),
      ...(protectFinish && last ? [{ id: "share-finish", label: "Finish privacy zone", center: last, radiusMeters }] : [])
    ]
  }, [protectFinish, protectStart, radiusMiles, route.geometry])

  const buildShare = async (nativeShare: boolean) => {
    try {
      const share = createPortableShare(route, zones, window.location.origin)
      if (nativeShare && navigator.share) {
        await navigator.share({ title: route.name, text: "A private Switchback route copy", url: share.url })
        setMessage("Private route copy shared. Your protected zones were removed first.")
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(share.url)
        setMessage("Private route link copied. Anyone opening it gets an editable copy, not your live route.")
      } else {
        setMessage("Your browser cannot copy automatically. Use the Share button to send the private route copy.")
      }
      onShareCreated?.(share.url)
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Private route link could not be created.")
    }
  }

  return (
    <section className="route-share-panel" aria-label="Private route sharing">
      <div>
        <strong>Share an editable copy</strong>
        <p>Switchback removes the selected start/end zones before creating a portable link. It does not expose live location or your saved original.</p>
      </div>
      <div className="route-share-controls">
        <label><input type="checkbox" checked={protectStart} onChange={(event) => setProtectStart(event.currentTarget.checked)} /> Hide start</label>
        <label><input type="checkbox" checked={protectFinish} onChange={(event) => setProtectFinish(event.currentTarget.checked)} /> Hide finish</label>
        <label>Privacy radius
          <input aria-label="Share privacy radius miles" type="number" min="0.1" max="10" step="0.1" value={radiusMiles} onChange={(event) => setRadiusMiles(Number(event.currentTarget.value))} />
          <small>miles</small>
        </label>
      </div>
      <div className="route-share-actions">
        <button type="button" onClick={() => void buildShare(false)}><Copy aria-hidden="true" /> Copy private link</button>
        {typeof navigator !== "undefined" && typeof Reflect.get(navigator, "share") === "function" ? <button type="button" onClick={() => void buildShare(true)}><ShareNetwork aria-hidden="true" /> Share</button> : null}
      </div>
      {message ? <p className="route-share-message" role="status">{message}</p> : null}
    </section>
  )
}
