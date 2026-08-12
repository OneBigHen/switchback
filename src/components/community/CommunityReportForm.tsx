"use client"

import { useState } from "react"
import { authenticatePasskey, csrfHeaders } from "@/lib/client/passkey"

export function CommunityReportForm({ routeId }: { routeId: string }) {
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!reason.trim()) return
    setBusy(true)
    setMessage(null)
    try {
      await authenticatePasskey()
      const response = await fetch("/api/community/reports", {
        method: "POST",
        credentials: "same-origin",
        headers: csrfHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ objectType: "route", objectId: routeId, reason: reason.trim() })
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null
        throw new Error(payload?.error?.message ?? "This report could not be submitted.")
      }
      setReason("")
      setMessage("Report received for operator review.")
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "This report could not be submitted.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="community-report" onSubmit={(event) => void submit(event)}>
      <h2>Report this route</h2>
      <p>Authenticate with your passkey so operators can review a bounded report.</p>
      <label>
        Reason
        <textarea value={reason} maxLength={500} required onChange={(event) => setReason(event.currentTarget.value)} />
      </label>
      <button type="submit" disabled={busy || reason.trim().length === 0}>{busy ? "Sending…" : "Authenticate and report"}</button>
      {message ? <p role="status">{message}</p> : null}
    </form>
  )
}
