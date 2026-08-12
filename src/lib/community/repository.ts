import { randomUUID } from "node:crypto"
import { dirname } from "node:path"
import { mkdirSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"

import {
  validateStoredPasskeyCredential,
  type StoredPasskeyCredential
} from "@/lib/identity/passkey"
import {
  parseCommunityArtifactDraft,
  parseCommunityPreviewArtifact,
  parseCommunityRouteDraft,
  parseRigContributionDraft,
  sanitizePlainText,
  type CommunityArtifactDraft,
  type CommunityPreviewArtifact,
  type CommunityRouteDraft,
  type RigContributionDraft
} from "./contracts"

export interface CommunityRouteView {
  id: string
  revisionId: string
  title: string
  description: string | null
  routeFingerprint: string
  stats: Record<string, number | string | null>
  provenanceClass: string
  visibility: "public" | "unlisted"
  preview: CommunityPreviewArtifact
  updatedAt: string
}

export type CommunityRouteSummary = Omit<CommunityRouteView, "preview">

export interface CommunityCommentView {
  id: string
  identityId: string
  body: string
  createdAt: string
}

export interface CommunityReportView {
  id: string
  objectType: string
  objectId: string
  reason: string
  status: "open" | "reviewed" | "dismissed"
  createdAt: string
}

export interface CommunityStore {
  listPublicRoutes(limit?: number): CommunityRouteSummary[]
  getRoute(routeId: string): CommunityRouteView | null
  createIdentity(displayName?: string | null): string
  registerPasskeyCredential(credential: StoredPasskeyCredential): void
  getPasskeyCredential(credentialId: string): StoredPasskeyCredential | null
  updatePasskeyCounter(credentialId: string, signCount: number): void
  createRoute(identityId: string, draft: CommunityRouteDraft): { routeId: string; revisionId: string }
  addRevision(identityId: string, routeId: string, draft: CommunityRouteDraft): string
  unpublish(identityId: string, routeId: string): void
  addArtifact(identityId: string, routeId: string, revisionId: string, artifact: CommunityArtifactDraft): string
  addComment(identityId: string, routeId: string, body: string): string
  listComments(routeId: string, limit?: number): CommunityCommentView[]
  report(identityId: string | null, objectType: string, objectId: string, reason: string): string
  listReports(limit?: number): CommunityReportView[]
  updateReportStatus(reportId: string, status: CommunityReportView["status"]): void
  setRouteActive(routeId: string, active: boolean): void
  addRigContribution(identityId: string, routeId: string, revisionId: string, contribution: RigContributionDraft): string
}

interface RouteRow {
  id: string
  revision_id: string
  title: string
  description: string | null
  route_fingerprint: string
  stats_json: string
  provenance_class: string
  visibility: "public" | "unlisted"
  preview_json: string
  updated_at: string
}

export class CommunityRepository implements CommunityStore {
  private readonly database: DatabaseSync

  constructor(readonly databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true })
    this.database = new DatabaseSync(databasePath)
    this.database.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
    this.database.exec(`
      create table if not exists public_identity (
        id text primary key,
        display_name text,
        status text not null default 'active',
        created_at text not null
      );
      create table if not exists webauthn_credential (
        credential_id text primary key,
        identity_id text not null references public_identity(id),
        public_key blob not null,
        sign_count integer not null default 0,
        transports_json text,
        created_at text not null,
        last_used_at text
      );
      create table if not exists community_route (
        id text primary key,
        owner_identity_id text not null references public_identity(id),
        visibility text not null default 'public',
        current_revision_id text,
        created_at text not null,
        updated_at text not null,
        status text not null default 'active'
      );
      create table if not exists community_route_revision (
        id text primary key,
        route_id text not null references community_route(id),
        parent_revision_id text,
        route_fingerprint text not null,
        title text not null,
        description text,
        stats_json text not null,
        provenance_class text not null,
        preview_json text,
        created_at text not null
      );
      create table if not exists community_route_artifact (
        id text primary key,
        revision_id text not null references community_route_revision(id),
        kind text not null,
        storage_path text not null,
        sha256 text not null,
        bytes integer not null,
        created_at text not null
      );
      create table if not exists community_comment (
        id text primary key,
        route_id text not null references community_route(id),
        identity_id text not null references public_identity(id),
        body text not null,
        status text not null default 'visible',
        created_at text not null,
        edited_at text
      );
      create table if not exists community_report (
        id text primary key,
        reporter_identity_id text references public_identity(id),
        object_type text not null,
        object_id text not null,
        reason text not null,
        status text not null default 'open',
        created_at text not null
      );
      create table if not exists community_rig_contribution (
        id text primary key,
        route_id text not null references community_route(id),
        revision_id text not null references community_route_revision(id),
        identity_id text not null references public_identity(id),
        segment_ids_json text not null,
        evidence_kind text not null,
        route_role text not null,
        positive_weight real not null,
        negative_weight real not null,
        observed_at text,
        created_at text not null
      );
      create index if not exists community_route_updated_idx on community_route(updated_at);
      create index if not exists community_comment_route_idx on community_comment(route_id, created_at);
    `)
    const revisionColumns = this.database.prepare("pragma table_info(community_route_revision)").all() as Array<{ name: string }>
    if (!revisionColumns.some((column) => column.name === "preview_json")) {
      this.database.exec("alter table community_route_revision add column preview_json text")
    }
  }

  private now(): string {
    return new Date().toISOString()
  }

  private requireIdentity(identityId: string): void {
    const row = this.database.prepare("select id from public_identity where id = ? and status = 'active'").get(identityId)
    if (!row) throw new Error("Identity is not active")
  }

  private requireOwner(identityId: string, routeId: string): void {
    this.requireIdentity(identityId)
    const row = this.database.prepare("select id from community_route where id = ? and owner_identity_id = ? and status = 'active'").get(routeId, identityId)
    if (!row) throw new Error("Route is not owned by this identity")
  }

  listPublicRoutes(limit = 20): CommunityRouteSummary[] {
    const bounded = Math.max(1, Math.min(Math.floor(limit), 50))
    const rows = this.database.prepare(`
      select r.id, r.current_revision_id as revision_id, r.visibility, v.title, v.description,
             v.route_fingerprint, v.stats_json, v.provenance_class, v.preview_json, r.updated_at
      from community_route r
      join community_route_revision v on v.id = r.current_revision_id
      where r.visibility = 'public' and r.status = 'active'
      order by r.updated_at desc
      limit ?
    `).all(bounded) as unknown as RouteRow[]
    return rows.flatMap((row) => {
      const view = this.routeView(row)
      if (!view) return []
      return [{
        id: view.id,
        revisionId: view.revisionId,
        title: view.title,
        description: view.description,
        routeFingerprint: view.routeFingerprint,
        stats: view.stats,
        provenanceClass: view.provenanceClass,
        visibility: view.visibility,
        updatedAt: view.updatedAt
      }]
    })
  }

  getRoute(routeId: string): CommunityRouteView | null {
    const row = this.database.prepare(`
      select r.id, r.current_revision_id as revision_id, r.visibility, v.title, v.description,
             v.route_fingerprint, v.stats_json, v.provenance_class, v.preview_json, r.updated_at
      from community_route r
      join community_route_revision v on v.id = r.current_revision_id
      where r.id = ? and r.status = 'active'
    `).get(routeId) as RouteRow | undefined
    return row ? this.routeView(row) : null
  }

  private routeView(row: RouteRow): CommunityRouteView | null {
    try {
      const stats = JSON.parse(row.stats_json) as Record<string, number | string | null>
      const preview = parseCommunityPreviewArtifact(JSON.parse(row.preview_json))
      if (typeof stats !== "object" || stats === null || Array.isArray(stats)) return null
      return {
        id: row.id,
        revisionId: row.revision_id,
        title: row.title,
        description: row.description,
        routeFingerprint: row.route_fingerprint,
        stats,
        provenanceClass: row.provenance_class,
        visibility: row.visibility,
        preview,
        updatedAt: row.updated_at
      }
    } catch {
      return null
    }
  }

  createIdentity(displayName: string | null = null): string {
    const id = `rider-${randomUUID()}`
    this.database.prepare("insert into public_identity(id, display_name, created_at) values (?, ?, ?)")
      .run(id, displayName ? sanitizePlainText(displayName, 80) : null, this.now())
    return id
  }

  registerPasskeyCredential(credential: StoredPasskeyCredential): void {
    const parsed = validateStoredPasskeyCredential(credential)
    this.requireIdentity(parsed.identityId)
    this.database.prepare("insert into webauthn_credential(credential_id, identity_id, public_key, sign_count, created_at) values (?, ?, ?, ?, ?)")
      .run(parsed.credentialId, parsed.identityId, Buffer.from(parsed.publicKey), parsed.signCount, this.now())
  }

  getPasskeyCredential(credentialId: string): StoredPasskeyCredential | null {
    const row = this.database.prepare("select credential_id, identity_id, public_key, sign_count from webauthn_credential where credential_id = ?")
      .get(credentialId) as { credential_id: string; identity_id: string; public_key: Uint8Array; sign_count: number } | undefined
    if (!row) return null
    return {
      credentialId: row.credential_id,
      identityId: row.identity_id,
      publicKey: new Uint8Array(row.public_key),
      signCount: row.sign_count
    }
  }

  updatePasskeyCounter(credentialId: string, signCount: number): void {
    if (!Number.isSafeInteger(signCount) || signCount < 0) throw new Error("Passkey counter is invalid")
    this.database.prepare("update webauthn_credential set sign_count = ?, last_used_at = ? where credential_id = ?")
      .run(signCount, this.now(), credentialId)
  }

  createRoute(identityId: string, draft: CommunityRouteDraft): { routeId: string; revisionId: string } {
    const parsed = parseCommunityRouteDraft(draft)
    this.requireIdentity(identityId)
    const routeId = `route-${randomUUID()}`
    const revisionId = `revision-${randomUUID()}`
    const now = this.now()
    this.database.exec("begin immediate")
    try {
      this.database.prepare("insert into community_route(id, owner_identity_id, visibility, current_revision_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?)")
        .run(routeId, identityId, parsed.visibility, revisionId, now, now)
      this.database.prepare("insert into community_route_revision(id, route_id, route_fingerprint, title, description, stats_json, provenance_class, preview_json, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(revisionId, routeId, parsed.routeFingerprint, parsed.title, parsed.description, JSON.stringify(parsed.stats), parsed.provenanceClass, JSON.stringify(parsed.preview), now)
      this.database.exec("commit")
    } catch (error) {
      this.database.exec("rollback")
      throw error
    }
    return { routeId, revisionId }
  }

  addRevision(identityId: string, routeId: string, draft: CommunityRouteDraft): string {
    const parsed = parseCommunityRouteDraft(draft)
    this.requireOwner(identityId, routeId)
    const parent = this.database.prepare("select current_revision_id from community_route where id = ?").get(routeId) as { current_revision_id: string } | undefined
    if (!parent) throw new Error("Route does not exist")
    const revisionId = `revision-${randomUUID()}`
    const now = this.now()
    this.database.exec("begin immediate")
    try {
      this.database.prepare("insert into community_route_revision(id, route_id, parent_revision_id, route_fingerprint, title, description, stats_json, provenance_class, preview_json, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(revisionId, routeId, parent.current_revision_id, parsed.routeFingerprint, parsed.title, parsed.description, JSON.stringify(parsed.stats), parsed.provenanceClass, JSON.stringify(parsed.preview), now)
      this.database.prepare("update community_route set current_revision_id = ?, visibility = ?, updated_at = ? where id = ?")
        .run(revisionId, parsed.visibility, now, routeId)
      this.database.exec("commit")
    } catch (error) {
      this.database.exec("rollback")
      throw error
    }
    return revisionId
  }

  unpublish(identityId: string, routeId: string): void {
    this.requireOwner(identityId, routeId)
    this.database.prepare("update community_route set status = 'inactive', updated_at = ? where id = ?").run(this.now(), routeId)
  }

  addArtifact(identityId: string, routeId: string, revisionId: string, artifact: CommunityArtifactDraft): string {
    this.requireOwner(identityId, routeId)
    const parsed = parseCommunityArtifactDraft(artifact)
    const revision = this.database.prepare("select id from community_route_revision where id = ? and route_id = ?").get(revisionId, routeId)
    if (!revision) throw new Error("Revision does not belong to route")
    const id = `artifact-${randomUUID()}`
    this.database.prepare("insert into community_route_artifact(id, revision_id, kind, storage_path, sha256, bytes, created_at) values (?, ?, ?, ?, ?, ?, ?)")
      .run(id, revisionId, parsed.kind, `artifacts/${id}`, parsed.sha256, parsed.bytes, this.now())
    return id
  }

  addComment(identityId: string, routeId: string, body: string): string {
    this.requireIdentity(identityId)
    const route = this.database.prepare("select id from community_route where id = ? and status = 'active'").get(routeId)
    if (!route) throw new Error("Route does not exist")
    const clean = sanitizePlainText(body, 2_000)
    if (!clean) throw new Error("Comment must not be empty")
    const id = `comment-${randomUUID()}`
    this.database.prepare("insert into community_comment(id, route_id, identity_id, body, created_at) values (?, ?, ?, ?, ?)")
      .run(id, routeId, identityId, clean, this.now())
    return id
  }

  listComments(routeId: string, limit = 50): CommunityCommentView[] {
    const bounded = Math.max(1, Math.min(Math.floor(limit), 100))
    const rows = this.database.prepare("select id, identity_id, body, created_at from community_comment where route_id = ? and status = 'visible' order by created_at asc limit ?")
      .all(routeId, bounded) as Array<{ id: string; identity_id: string; body: string; created_at: string }>
    return rows.map((row) => ({ id: row.id, identityId: row.identity_id, body: row.body, createdAt: row.created_at }))
  }

  report(identityId: string | null, objectType: string, objectId: string, reason: string): string {
    if (identityId) this.requireIdentity(identityId)
    const type = sanitizePlainText(objectType, 40)
    const target = sanitizePlainText(objectId, 160)
    const cleanReason = sanitizePlainText(reason, 500)
    if (!type || !target || !cleanReason) throw new Error("Report fields are required")
    const id = `report-${randomUUID()}`
    this.database.prepare("insert into community_report(id, reporter_identity_id, object_type, object_id, reason, created_at) values (?, ?, ?, ?, ?, ?)")
      .run(id, identityId, type, target, cleanReason, this.now())
    return id
  }

  listReports(limit = 50): CommunityReportView[] {
    const bounded = Math.max(1, Math.min(Math.floor(limit), 100))
    const rows = this.database.prepare("select id, object_type, object_id, reason, status, created_at from community_report order by created_at desc limit ?")
      .all(bounded) as Array<{ id: string; object_type: string; object_id: string; reason: string; status: string; created_at: string }>
    return rows.flatMap((row) => {
      if (row.status !== "open" && row.status !== "reviewed" && row.status !== "dismissed") return []
      return [{ id: row.id, objectType: row.object_type, objectId: row.object_id, reason: row.reason, status: row.status, createdAt: row.created_at }]
    })
  }

  updateReportStatus(reportId: string, status: CommunityReportView["status"]): void {
    if (status !== "open" && status !== "reviewed" && status !== "dismissed") throw new Error("Report status is invalid")
    const result = this.database.prepare("update community_report set status = ? where id = ?").run(status, reportId)
    if (result.changes !== 1) throw new Error("Report does not exist")
  }

  setRouteActive(routeId: string, active: boolean): void {
    const result = this.database.prepare("update community_route set status = ?, updated_at = ? where id = ?")
      .run(active ? "active" : "inactive", this.now(), routeId)
    if (result.changes !== 1) throw new Error("Route does not exist")
  }

  addRigContribution(identityId: string, routeId: string, revisionId: string, contribution: RigContributionDraft): string {
    this.requireIdentity(identityId)
    const parsed = parseRigContributionDraft(contribution)
    const revision = this.database.prepare("select id from community_route_revision where id = ? and route_id = ?").get(revisionId, routeId)
    if (!revision) throw new Error("Revision does not belong to route")
    const id = `rig-${randomUUID()}`
    this.database.prepare("insert into community_rig_contribution(id, route_id, revision_id, identity_id, segment_ids_json, evidence_kind, route_role, positive_weight, negative_weight, observed_at, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, routeId, revisionId, identityId, JSON.stringify(parsed.segmentIds), parsed.evidenceKind, parsed.routeRole, parsed.positiveWeight, parsed.negativeWeight, parsed.observedAt, this.now())
    return id
  }

  close(): void {
    this.database.close()
  }
}
