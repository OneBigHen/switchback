import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { CommunityRepository } from "@/lib/community/repository"

describe("community backend", () => {
  const resources: Array<{ repository: CommunityRepository; directory: string }> = []

  afterEach(() => {
    for (const resource of resources.splice(0)) {
      resource.repository.close()
      rmSync(resource.directory, { recursive: true, force: true })
    }
  })

  it("keeps anonymous browse separate from bounded identity-owned writes", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "switchback-community-"))
    const repository = new CommunityRepository(path.join(directory, "community.sqlite"))
    resources.push({ repository, directory })
    const identityId = repository.createIdentity("Rider <one>")
    const created = repository.createRoute(identityId, {
      title: "River loop",
      description: "<b>Plain</b> notes",
      routeFingerprint: "fingerprint-1",
      stats: { distanceMiles: 42.5, durationMinutes: 95 },
      provenanceClass: "rider-recorded",
      visibility: "public",
      preview: {
        geometry: [[[-76.9, 40.2], [-76.7, 40.4]]],
        distanceMiles: 25,
        durationMinutes: 40,
        exactPreviewRequired: true
      }
    })

    expect(repository.listPublicRoutes()).toMatchObject([{ id: created.routeId, title: "River loop", description: "Plain notes" }])
    expect(repository.getRoute(created.routeId)?.preview.geometry).toHaveLength(1)
    expect(repository.addComment(identityId, created.routeId, "<script>alert(1)</script>Good road")).toMatch(/^comment-/)
    expect(repository.listComments(created.routeId)[0]?.body).toBe("alert(1)Good road")
    expect(repository.addArtifact(identityId, created.routeId, created.revisionId, {
      kind: "preview",
      sha256: "a".repeat(64),
      bytes: 128
    })).toMatch(/^artifact-/)
    expect(repository.addRigContribution(identityId, created.routeId, created.revisionId, {
      segmentIds: ["seg-1", "seg-2"],
      evidenceKind: "ride-confirmation",
      routeRole: "primary",
      positiveWeight: 1,
      negativeWeight: 0,
      observedAt: "2026-08-12T12:00:00Z"
    })).toMatch(/^rig-/)
    const reportId = repository.report(identityId, "route", created.routeId, "Needs review")
    expect(reportId).toMatch(/^report-/)
    expect(repository.listReports()).toMatchObject([{ id: reportId, status: "open", objectId: created.routeId }])
    repository.updateReportStatus(reportId, "reviewed")
    repository.setRouteActive(created.routeId, false)
    expect(repository.listPublicRoutes().some((route) => route.id === created.routeId)).toBe(false)
    repository.setRouteActive(created.routeId, true)
    expect(() => repository.addRevision("rider-missing", created.routeId, {
      title: "No",
      description: null,
      routeFingerprint: "fingerprint-2",
      stats: {},
      provenanceClass: "unknown",
      visibility: "public",
      preview: {
        geometry: [[[-76.9, 40.2], [-76.7, 40.4]]],
        distanceMiles: 1,
        durationMinutes: 2,
        exactPreviewRequired: true
      }
    })).toThrow(/owned|active/i)

    const unlisted = repository.createRoute(identityId, {
      title: "Unlisted loop",
      description: null,
      routeFingerprint: "fingerprint-unlisted",
      stats: {},
      provenanceClass: "curated-planned",
      visibility: "unlisted",
      preview: {
        geometry: [[[-76.9, 40.2], [-76.7, 40.4]]],
        distanceMiles: 1,
        durationMinutes: 2,
        exactPreviewRequired: true
      }
    })
    expect(repository.listPublicRoutes().some((route) => route.id === unlisted.routeId)).toBe(false)
    expect(repository.getRoute(unlisted.routeId)?.visibility).toBe("unlisted")
    repository.unpublish(identityId, created.routeId)
    expect(repository.getRoute(created.routeId)).toBeNull()
  })
})
