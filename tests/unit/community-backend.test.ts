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
      visibility: "public"
    })

    expect(repository.listPublicRoutes()).toMatchObject([{ id: created.routeId, title: "River loop", description: "Plain notes" }])
    expect(repository.addComment(identityId, created.routeId, "<script>alert(1)</script>Good road")).toMatch(/^comment-/)
    expect(repository.listComments(created.routeId)[0]?.body).toBe("alert(1)Good road")
    expect(repository.addArtifact(identityId, created.routeId, created.revisionId, {
      kind: "gpx",
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
    expect(repository.report(identityId, "route", created.routeId, "Needs review")).toMatch(/^report-/)
    expect(() => repository.addRevision("rider-missing", created.routeId, {
      title: "No",
      description: null,
      routeFingerprint: "fingerprint-2",
      stats: {},
      provenanceClass: "unknown",
      visibility: "public"
    })).toThrow(/owned|active/i)
  })
})
