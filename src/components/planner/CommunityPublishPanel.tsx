"use client"

import { LockKey, ShieldCheck, UploadSimple } from "@phosphor-icons/react"
import { useMemo, useState } from "react"
import { authenticatePasskey, csrfHeaders } from "@/lib/client/passkey"
import { createPublishPrivacyPreview, type PrivacyZone } from "@/lib/community/privacy-preview"
import type { CommunityVisibility } from "@/lib/community/contracts"
import type { PlannedRoute } from "@/lib/routing/types"
import { CommunityPreviewMap } from "@/components/community/CommunityPreviewMap"

interface CommunityPublishPanelProps {
  route: PlannedRoute
}

async function responseMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json() as { error?: { message?: string } }
    return payload.error?.message ?? fallback
  } catch {
    return fallback
  }
}

async function previewFingerprint(value: unknown): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value))))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export function CommunityPublishPanel({ route }: CommunityPublishPanelProps) {
  const [protectStart, setProtectStart] = useState(true)
  const [protectFinish, setProtectFinish] = useState(false)
  const [radiusMiles, setRadiusMiles] = useState(1)
  const [title, setTitle] = useState(route.name)
  const [description, setDescription] = useState("")
  const [visibility, setVisibility] = useState<CommunityVisibility>("public")
  const [publishedRouteId, setPublishedRouteId] = useState<string | null>(null)
  const [busy, setBusy] = useState<"publish" | "unpublish" | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const zones = useMemo<PrivacyZone[]>(() => {
    const radiusMeters = Math.max(0.1, Math.min(10, radiusMiles)) * 1_609.344
    const first = route.geometry[0]
    const last = route.geometry.at(-1)
    return [
      ...(protectStart && first ? [{ center: first, radiusMeters }] : []),
      ...(protectFinish && last ? [{ center: last, radiusMeters }] : [])
    ]
  }, [protectFinish, protectStart, radiusMiles, route.geometry])

  const previewResult = useMemo(() => {
    try {
      return {
        preview: createPublishPrivacyPreview({
          geometry: route.geometry,
          instructions: route.instructions,
          distanceMiles: route.distanceMiles,
          durationMinutes: route.durationMinutes,
          zones
        }),
        error: null
      }
    } catch (caught) {
      return {
        preview: null,
        error: caught instanceof Error ? caught.message : "A public preview could not be created."
      }
    }
  }, [route.distanceMiles, route.durationMinutes, route.geometry, route.instructions, zones])
  const preview = previewResult.preview

  const publish = async () => {
    if (!preview) return
    setBusy("publish")
    setMessage(null)
    try {
      await authenticatePasskey()
      const fingerprint = await previewFingerprint(preview.publicGeometry)
      const response = await fetch("/api/community/routes", {
        method: "POST",
        credentials: "same-origin",
        headers: csrfHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          title: title.trim() || route.name,
          description: description.trim() || null,
          routeFingerprint: fingerprint,
          stats: {
            distanceMiles: preview.publicDistanceMiles,
            durationMinutes: preview.publicDurationMinutes,
            twistiness: route.twistiness,
            turnCount: route.turnCount
          },
          provenanceClass: route.routingSource === "live" ? "built-and-verified" : "curated-planned",
          visibility,
          preview: {
            geometry: preview.publicGeometry,
            distanceMiles: preview.publicDistanceMiles,
            durationMinutes: preview.publicDurationMinutes,
            exactPreviewRequired: true
          }
        })
      })
      if (!response.ok) throw new Error(await responseMessage(response, "This route could not be published."))
      const payload = await response.json() as { routeId?: string }
      if (typeof payload.routeId !== "string") throw new Error("The publish response was invalid.")
      setPublishedRouteId(payload.routeId)
      setMessage(`${visibility === "public" ? "Published" : "Saved as unlisted"}. Only the preview shown above is available.`)
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "This route could not be published.")
    } finally {
      setBusy(null)
    }
  }

  const unpublish = async () => {
    if (!publishedRouteId) return
    setBusy("unpublish")
    setMessage(null)
    try {
      await authenticatePasskey()
      const response = await fetch(`/api/community/routes/${publishedRouteId}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: csrfHeaders()
      })
      if (!response.ok) throw new Error(await responseMessage(response, "This route could not be unpublished."))
      setPublishedRouteId(null)
      setMessage("Route unpublished. Its public and unlisted links are now unavailable.")
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "This route could not be unpublished.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="route-share-panel community-publish-panel" aria-label="Publish route to community">
      <div>
        <span className="eyebrow"><ShieldCheck aria-hidden="true" /> Privacy preview first</span>
        <strong>Publish a sanitized route</strong>
        <p>The server receives only the exact preview below. Your private route, original geometry, and protected start/finish sections never enter the community store.</p>
      </div>
      {preview ? (
        <CommunityPreviewMap geometry={preview.publicGeometry} ariaLabel="Exact public privacy preview map" redactedPointCount={preview.redactedPointCount} />
      ) : null}
      <div className="route-share-controls">
        <label><input type="checkbox" checked={protectStart} onChange={(event) => setProtectStart(event.currentTarget.checked)} /> Hide start</label>
        <label><input type="checkbox" checked={protectFinish} onChange={(event) => setProtectFinish(event.currentTarget.checked)} /> Hide finish</label>
        <label>Privacy radius
          <input aria-label="Publish privacy radius miles" type="number" min="0.1" max="10" step="0.1" value={radiusMiles} onChange={(event) => setRadiusMiles(Number(event.currentTarget.value))} />
          <small>miles</small>
        </label>
      </div>
      <label>Public title
        <input aria-label="Public route title" value={title} maxLength={180} onChange={(event) => setTitle(event.currentTarget.value)} />
      </label>
      <label>Description
        <textarea aria-label="Public route description" value={description} maxLength={4_000} onChange={(event) => setDescription(event.currentTarget.value)} />
      </label>
      <label>Visibility
        <select aria-label="Public route visibility" value={visibility} onChange={(event) => setVisibility(event.currentTarget.value as CommunityVisibility)}>
          <option value="public">Public — listed at /routes</option>
          <option value="unlisted">Unlisted — link only</option>
        </select>
      </label>
      <div className="route-share-actions">
        <button type="button" disabled={busy !== null || !preview} onClick={() => void publish()}>
          <UploadSimple aria-hidden="true" />
          {busy === "publish" ? "Publishing…" : "Authenticate and publish"}
        </button>
        {publishedRouteId ? <button type="button" disabled={busy !== null} onClick={() => void unpublish()}>
          <LockKey aria-hidden="true" />
          {busy === "unpublish" ? "Unpublishing…" : "Unpublish"}
        </button> : null}
        {publishedRouteId ? <a href={`/routes/${publishedRouteId}`}>Open published route</a> : null}
      </div>
      {(message ?? previewResult.error) ? <p className="route-share-message" role="status">{message ?? previewResult.error}</p> : null}
    </section>
  )
}
