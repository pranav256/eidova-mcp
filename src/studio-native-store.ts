import { randomUUID } from 'node:crypto';
import { StudioError, StudioStore, type StudioIdentity } from './studio-store.js';

export function nativeFileFacts(store: StudioStore, resourceId: string) {
  const state = store.db.prepare('SELECT revision FROM native_file_state WHERE project_id=?').get(resourceId);
  const files = store.db.prepare('SELECT source_id AS sourceFileId,path AS sourceFilePath,entry_path AS entryPath,version,retired FROM native_file_facts WHERE project_id=? ORDER BY rowid').all(resourceId);
  return { schemaVersion: 1, revision: Number(state?.revision ?? 0), files: files.map(file => ({ sourceFileId: String(file.sourceFileId), sourceFilePath: String(file.sourceFilePath), entryPath: String(file.entryPath), resourceId, versionId: String(file.version), retired: Boolean(file.retired) })) };
}

type NativeRow = { native_id: string; storage_id: string; owner_member_id: string; visibility: 'private' | 'team'; created_at: number; deleted_at: number | null; policy_version: number };

/** Native project policy stays server-owned, separate from caller-supplied metadata. */
export class StudioNativeStore {
  constructor(readonly store: StudioStore) {}
  registration(identity: StudioIdentity, projectId: string, ownerOnly = false) {
    this.store.membership(identity);
    const row = this.store.db.prepare('SELECT * FROM native_projects WHERE workspace_id=? AND native_id=?').get(identity.workspaceId, projectId) as NativeRow | undefined;
    if (!row || row.deleted_at !== null || (row.visibility === 'private' && row.owner_member_id !== identity.memberId)) throw new StudioError(404, 'Native project not found.');
    if (ownerOnly && row.owner_member_id !== identity.memberId) throw new StudioError(403, 'Only the native project creator can change this project.');
    const project = this.store.project(identity, row.storage_id);
    return { workspaceId: identity.workspaceId, projectId, resourceId: row.storage_id, ownerMemberId: row.owner_member_id,
      visibility: row.visibility, createdAt: new Date(row.created_at).toISOString(), policyVersion: row.policy_version,
      version: project.version, name: project.name, updatedAt: project.updatedAt };
  }
  ensure(identity: StudioIdentity, projectId: string, name: string) {
    this.store.membership(identity);
    return this.store.transaction(() => {
      const previous = this.store.db.prepare('SELECT * FROM native_projects WHERE workspace_id=? AND native_id=?').get(identity.workspaceId, projectId) as NativeRow | undefined;
      if (previous) {
        if (previous.deleted_at !== null) throw new StudioError(409, 'This native project was deleted. Create a new project identity.');
        if (previous.owner_member_id !== identity.memberId) throw new StudioError(409, 'This native project identity belongs to another member.');
        return this.registration(identity, projectId, true);
      }
      if (Number(this.store.db.prepare('SELECT count(*) AS n FROM projects WHERE workspace_id=?').get(identity.workspaceId)!.n) >= 100) throw new StudioError(413, 'A workspace can hold up to 100 projects.');
      const id = randomUUID(), now = Date.now();
      this.store.db.prepare('INSERT INTO projects(id,workspace_id,name,updated_at) VALUES (?,?,?,?)').run(id, identity.workspaceId, name, now);
      this.store.db.prepare('INSERT INTO revisions VALUES (?,?,?,?,?,?)').run(id, 0, identity.memberId, 'Registered native project', '{}', now);
      this.store.db.prepare('INSERT INTO native_projects(workspace_id,native_id,storage_id,owner_member_id,created_at) VALUES (?,?,?,?,?)').run(identity.workspaceId, projectId, id, identity.memberId, now);
      return this.registration(identity, projectId, true);
    });
  }
  list(identity: StudioIdentity) {
    this.store.membership(identity);
    const rows = this.store.db.prepare(`SELECT native_id FROM native_projects WHERE workspace_id=? AND deleted_at IS NULL
      AND (visibility='team' OR owner_member_id=?) ORDER BY created_at DESC`).all(identity.workspaceId, identity.memberId);
    return rows.map(row => {
      const registration = this.registration(identity, String(row.native_id));
      const revision = this.store.db.prepare('SELECT metadata FROM revisions WHERE project_id=? AND version=?').get(registration.resourceId, registration.version)!;
      const descriptor = JSON.parse(String(revision.metadata));
      descriptor.metadata = { ...(descriptor.metadata ?? {}), _commentFiles: nativeFileFacts(this.store, registration.resourceId) };
      return { ...registration, metadata: descriptor, publishedVersionId: registration.version ? String(registration.version) : null,
        syncState: registration.version ? 'synced' : 'pending_upload',
        access: { canView: true, canComment: true, canEdit: registration.ownerMemberId === identity.memberId, frozen: false } };
    });
  }
  policy(identity: StudioIdentity, projectId: string, visibility: 'private' | 'team', expectedPolicyVersion: number) {
    return this.store.transaction(() => {
      const current = this.registration(identity, projectId, true);
      if (current.policyVersion !== expectedPolicyVersion) throw new StudioError(409, 'Native project sharing changed. Reload before changing visibility.');
      if (visibility === 'team' && current.version === 0) throw new StudioError(409, 'Publish project content before sharing it with the team.');
      this.store.db.prepare('UPDATE native_projects SET visibility=?,policy_version=policy_version+1 WHERE workspace_id=? AND native_id=?').run(visibility, identity.workspaceId, projectId);
      if (visibility === 'private') {
        this.store.db.prepare('DELETE FROM presence WHERE project_id=? AND member_id!=?').run(current.resourceId, identity.memberId);
        this.store.db.prepare('DELETE FROM native_presence_leases WHERE project_id=? AND member_id!=?').run(current.resourceId, identity.memberId);
        this.store.db.prepare('UPDATE shares SET revoked=1 WHERE project_id=?').run(current.resourceId);
      }
      return this.registration(identity, projectId, true);
    });
  }
  metadata(identity: StudioIdentity, projectId: string, name: string | undefined, descriptor: Record<string, unknown>, expectedVersion: number) {
    const current = this.registration(identity, projectId, true);
    const committed = this.store.commit(identity, current.resourceId, [], [], expectedVersion, 'Updated native project details', descriptor, name);
    return { ...this.registration(identity, projectId, true), version: committed.version };
  }
  remove(identity: StudioIdentity, projectId: string, expectedPolicyVersion: number) {
    this.store.transaction(() => {
      const current = this.registration(identity, projectId, true);
      if (current.policyVersion !== expectedPolicyVersion) throw new StudioError(409, 'Native project sharing changed. Reload before deleting.');
      this.store.db.prepare('UPDATE native_projects SET deleted_at=?,policy_version=policy_version+1 WHERE workspace_id=? AND native_id=?').run(Date.now(), identity.workspaceId, projectId);
      this.store.db.prepare('UPDATE shares SET revoked=1 WHERE project_id=?').run(current.resourceId);
      this.store.db.prepare('DELETE FROM presence WHERE project_id=?').run(current.resourceId);
      this.store.db.prepare('DELETE FROM native_presence_leases WHERE project_id=?').run(current.resourceId);
    });
  }
}
