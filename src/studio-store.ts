import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { studioPath } from './studio-client.js';

export class StudioError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const token = () => randomBytes(32).toString('base64url');
export type StudioIdentity = { workspaceId: string; memberId: string; role: 'owner' | 'member'; displayName: string };
type MemberRow = { id: string; workspace_id: string; role: 'owner' | 'member'; display_name: string };
type ProjectRow = { id: string; workspace_id: string; name: string; version: number; updated_at: number };

/** Durable collaboration state; credentials are capabilities, stored only as hashes. */
export class StudioStore {
  constructor(readonly db: DatabaseSync) {
    const version = Number(db.prepare('PRAGMA user_version').get()!.user_version);
    if (version > 3) throw new Error('This Studio database needs a newer server.');
    db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS workspaces(id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS members(id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        display_name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','member')), token_hash TEXT UNIQUE NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS invites(token_hash TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), name TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS files(project_id TEXT NOT NULL REFERENCES projects(id), path TEXT NOT NULL, bytes BLOB NOT NULL, sha256 TEXT NOT NULL, version INTEGER NOT NULL, PRIMARY KEY(project_id,path));
      CREATE TABLE IF NOT EXISTS comments(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), member_id TEXT NOT NULL REFERENCES members(id), body TEXT NOT NULL, file_path TEXT, resolved INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS member_workspace ON members(workspace_id);
      CREATE INDEX IF NOT EXISTS project_workspace ON projects(workspace_id);
      CREATE INDEX IF NOT EXISTS comment_project ON comments(project_id,created_at);`);
    this.transaction(() => {
      db.exec(`CREATE TABLE IF NOT EXISTS revisions(project_id TEXT NOT NULL REFERENCES projects(id), version INTEGER NOT NULL, member_id TEXT REFERENCES members(id), message TEXT NOT NULL, metadata TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(project_id,version));
        CREATE TABLE IF NOT EXISTS file_revisions(project_id TEXT NOT NULL, path TEXT NOT NULL, version INTEGER NOT NULL, bytes BLOB, sha256 TEXT, PRIMARY KEY(project_id,path,version), FOREIGN KEY(project_id,version) REFERENCES revisions(project_id,version));
        CREATE TABLE IF NOT EXISTS recovery(member_id TEXT PRIMARY KEY REFERENCES members(id), token_hash TEXT UNIQUE NOT NULL);
        CREATE TABLE IF NOT EXISTS presence(project_id TEXT NOT NULL REFERENCES projects(id), member_id TEXT NOT NULL REFERENCES members(id), client_id TEXT NOT NULL, file_path TEXT, seen_at INTEGER NOT NULL, PRIMARY KEY(project_id,member_id,client_id));
        CREATE TABLE IF NOT EXISTS shares(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), version INTEGER NOT NULL, member_id TEXT NOT NULL REFERENCES members(id), token_hash TEXT UNIQUE NOT NULL, expires_at INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS native_projects(workspace_id TEXT NOT NULL REFERENCES workspaces(id), native_id TEXT NOT NULL,
          storage_id TEXT UNIQUE NOT NULL REFERENCES projects(id), owner_member_id TEXT NOT NULL REFERENCES members(id),
          visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','team')), created_at INTEGER NOT NULL,
          deleted_at INTEGER, policy_version INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(workspace_id,native_id));
        CREATE TABLE IF NOT EXISTS native_file_facts(project_id TEXT NOT NULL REFERENCES projects(id), source_id TEXT NOT NULL, path TEXT NOT NULL, entry_path TEXT NOT NULL, version INTEGER NOT NULL, retired INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(project_id,source_id));
        CREATE UNIQUE INDEX IF NOT EXISTS native_active_file ON native_file_facts(project_id,path) WHERE retired=0;
        CREATE TABLE IF NOT EXISTS native_file_state(project_id TEXT PRIMARY KEY REFERENCES projects(id), revision INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS native_comment_events(seq INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL REFERENCES projects(id), comment_id TEXT NOT NULL, member_id TEXT NOT NULL REFERENCES members(id), payload TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS native_comment_stream ON native_comment_events(project_id,seq);
        CREATE TABLE IF NOT EXISTS native_comment_keys(project_id TEXT NOT NULL, member_id TEXT NOT NULL, key TEXT NOT NULL, hash TEXT NOT NULL, seq INTEGER NOT NULL REFERENCES native_comment_events(seq), PRIMARY KEY(project_id,member_id,key));
        CREATE TABLE IF NOT EXISTS studio_secrets(name TEXT PRIMARY KEY,value TEXT NOT NULL);`);
      db.exec(`CREATE TABLE IF NOT EXISTS native_presence_leases(project_id TEXT NOT NULL REFERENCES projects(id), member_id TEXT NOT NULL REFERENCES members(id), client_id TEXT NOT NULL, sequence INTEGER NOT NULL, seen_at INTEGER NOT NULL, file_path TEXT, activity TEXT, is_left INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(project_id,member_id,client_id));`);
      if (version === 0) {
        db.exec(`INSERT INTO revisions(project_id,version,message,metadata,created_at) SELECT id,version,'Imported existing project','{}',updated_at FROM projects;
          INSERT INTO file_revisions SELECT f.project_id,f.path,p.version,f.bytes,f.sha256 FROM files f JOIN projects p ON p.id=f.project_id;
          PRAGMA user_version=1;`);
      }
      db.exec('PRAGMA user_version=3;');
    });
  }
  transaction<T>(operation: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = operation(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  createWorkspace(name: string, displayName: string) {
    return this.transaction(() => {
      if (Number(this.db.prepare('SELECT count(*) AS n FROM workspaces').get()!.n) >= 100) throw new StudioError(413, 'This server has reached its 100-workspace limit.');
      const workspaceId = randomUUID(), memberId = randomUUID(), key = token();
      this.db.prepare('INSERT INTO workspaces VALUES (?,?)').run(workspaceId, name);
      this.db.prepare('INSERT INTO members(id,workspace_id,display_name,role,token_hash) VALUES (?,?,?,?,?)').run(memberId, workspaceId, displayName, 'owner', hash(key));
      return { workspaceId, memberId, token: key };
    });
  }
  identity(key: string): StudioIdentity {
    const row = this.db.prepare('SELECT * FROM members WHERE token_hash=? AND revoked=0').get(hash(key)) as MemberRow | undefined;
    if (!row) throw new StudioError(401, 'Connect with a valid workspace key.');
    return { workspaceId: row.workspace_id, memberId: row.id, role: row.role, displayName: row.display_name };
  }
  owner(identity: StudioIdentity) {
    if (identity.role !== 'owner') throw new StudioError(403, 'Only the workspace owner can manage access.');
  }
  membership(identity: StudioIdentity) {
    const row = this.db.prepare(`SELECT w.id AS workspaceId,w.name AS workspaceName,m.id AS memberId,
      m.display_name AS displayName,m.role,
      (SELECT count(*) FROM members WHERE workspace_id=w.id AND revoked=0) AS memberCount
      FROM members m JOIN workspaces w ON w.id=m.workspace_id
      WHERE m.id=? AND m.workspace_id=? AND m.revoked=0`).get(identity.memberId, identity.workspaceId);
    if (!row) throw new StudioError(401, 'Connect with a valid workspace key.');
    return { schemaVersion: 1, ...row, memberLimit: 100 };
  }
  workspace(identity: StudioIdentity) {
    return {
      ...this.db.prepare('SELECT id,name FROM workspaces WHERE id=?').get(identity.workspaceId),
      memberId: identity.memberId, role: identity.role,
      members: this.db.prepare('SELECT id,display_name AS displayName,role FROM members WHERE workspace_id=? AND revoked=0 ORDER BY rowid').all(identity.workspaceId),
      projects: this.db.prepare(`SELECT p.id,p.name,p.version,p.updated_at AS updatedAt,
        CASE WHEN n.storage_id IS NULL OR n.owner_member_id=? THEN 1 ELSE 0 END AS canEdit,
        n.native_id AS nativeProjectId,n.visibility,n.owner_member_id AS ownerMemberId,n.policy_version AS nativePolicyVersion
        FROM projects p LEFT JOIN native_projects n ON n.storage_id=p.id
        WHERE p.workspace_id=? AND (n.storage_id IS NULL OR (n.deleted_at IS NULL AND (n.visibility='team' OR n.owner_member_id=?)))
        ORDER BY p.updated_at DESC`).all(identity.memberId, identity.workspaceId, identity.memberId),
    };
  }
  invite(identity: StudioIdentity) {
    this.owner(identity);
    const key = token(), expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    this.db.prepare('DELETE FROM invites WHERE expires_at<?').run(Date.now());
    const count = this.db.prepare('SELECT count(*) AS n FROM invites WHERE workspace_id=?').get(identity.workspaceId) as { n: number };
    if (count.n >= 25) throw new StudioError(409, 'This workspace already has 25 pending invitations.');
    this.db.prepare('INSERT INTO invites VALUES (?,?,?)').run(hash(key), identity.workspaceId, expiresAt);
    return { invite: key, expiresAt };
  }
  join(invite: string, displayName: string) {
    return this.transaction(() => {
      const row = this.db.prepare('SELECT workspace_id FROM invites WHERE token_hash=? AND expires_at>?').get(hash(invite), Date.now()) as { workspace_id: string } | undefined;
      if (!row) throw new StudioError(401, 'This invitation is invalid, expired, or already used.');
      if (Number(this.db.prepare('SELECT count(*) AS n FROM members WHERE workspace_id=? AND revoked=0').get(row.workspace_id)!.n) >= 100) throw new StudioError(413, 'A workspace can have up to 100 active members.');
      const key = token(), memberId = randomUUID();
      this.db.prepare('INSERT INTO members(id,workspace_id,display_name,role,token_hash) VALUES (?,?,?,?,?)').run(memberId, row.workspace_id, displayName, 'member', hash(key));
      this.db.prepare('DELETE FROM invites WHERE token_hash=?').run(hash(invite));
      return { workspaceId: row.workspace_id, memberId, token: key };
    });
  }
  revoke(identity: StudioIdentity, memberId: string) {
    this.owner(identity);
    if (memberId === identity.memberId) throw new StudioError(409, 'The owner cannot remove their own access.');
    const result = this.db.prepare("UPDATE members SET revoked=1 WHERE id=? AND workspace_id=? AND role='member'").run(memberId, identity.workspaceId);
    if (!result.changes) throw new StudioError(404, 'Member not found.');
  }
  createProject(identity: StudioIdentity, name: string) {
    return this.transaction(() => {
      if (Number(this.db.prepare('SELECT count(*) AS n FROM projects WHERE workspace_id=?').get(identity.workspaceId)!.n) >= 100) throw new StudioError(413, 'A workspace can hold up to 100 projects.');
      const id = randomUUID(), now = Date.now();
      this.db.prepare('INSERT INTO projects(id,workspace_id,name,updated_at) VALUES (?,?,?,?)').run(id, identity.workspaceId, name, now);
      this.db.prepare('INSERT INTO revisions VALUES (?,?,?,?,?,?)').run(id, 0, identity.memberId, 'Created project', '{}', now);
      return this.project(identity, id);
    });
  }
  project(identity: StudioIdentity, projectId: string) {
    const row = this.db.prepare('SELECT * FROM projects WHERE id=? AND workspace_id=?').get(projectId, identity.workspaceId) as ProjectRow | undefined;
    if (!row) throw new StudioError(404, 'Project not found in this workspace.');
    const native = this.db.prepare('SELECT native_id,owner_member_id,visibility,deleted_at,policy_version FROM native_projects WHERE storage_id=?').get(projectId);
    if (native && (native.deleted_at !== null || (native.visibility === 'private' && native.owner_member_id !== identity.memberId))) throw new StudioError(404, 'Project not found in this workspace.');
    return { id: row.id, name: row.name, version: row.version, updatedAt: row.updated_at,
      ...(native ? { canEdit: native.owner_member_id === identity.memberId ? 1 : 0, nativeProjectId: native.native_id, nativePolicyVersion: native.policy_version, visibility: native.visibility, ownerMemberId: native.owner_member_id } : {}) };
  }
  files(identity: StudioIdentity, projectId: string) {
    this.project(identity, projectId);
    return this.db.prepare('SELECT path,length(bytes) AS bytes,sha256,version FROM files WHERE project_id=? ORDER BY path').all(projectId);
  }
  readFile(identity: StudioIdentity, projectId: string, path: string) {
    this.project(identity, projectId);
    const row = this.db.prepare('SELECT bytes,sha256,version FROM files WHERE project_id=? AND path=?').get(projectId, path) as { bytes: Uint8Array; sha256: string; version: number } | undefined;
    if (!row) throw new StudioError(404, 'File not found.');
    return { ...row, bytes: Buffer.from(row.bytes) };
  }
  writeFile(identity: StudioIdentity, projectId: string, path: string, bytes: Buffer, expectedVersion: number) {
    const revision = this.commit(identity, projectId, [{ path, bytes }], [], expectedVersion, 'Saved ' + path);
    return { path, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, version: revision.version };
  }
  commit(identity: StudioIdentity, projectId: string, writes: { path: string; bytes: Buffer }[], deletes: string[], expectedVersion: number, message: string, metadata?: Record<string, unknown>, projectName?: string) {
    return this.transaction(() => {
      const project = this.project(identity, projectId);
      const native = this.db.prepare('SELECT owner_member_id FROM native_projects WHERE storage_id=?').get(projectId);
      if (native && native.owner_member_id !== identity.memberId) throw new StudioError(403, 'Only the native project creator can edit its files.');
      if (project.version !== expectedVersion) throw new StudioError(409, 'The project changed. Reload before saving; your edits have not been written.');
      const changed = [...writes.map(file => studioPath.parse(file.path)), ...deletes.map(path => studioPath.parse(path))];
      if (new Set(changed).size !== changed.length) throw new StudioError(400, 'Each changed path must occur once.');
      if (writes.some(file => file.bytes.length > 8 * 1024 * 1024)) throw new StudioError(413, 'Each file can be up to 8 MiB.');
      const current = new Map(this.files(identity, projectId).map(file => [String(file.path), Number(file.bytes)]));
      for (const path of deletes) { if (!current.delete(path)) throw new StudioError(404, 'File not found: ' + path); }
      for (const file of writes) current.set(file.path, file.bytes.length);
      if ([...current.values()].reduce((a, b) => a + b, 0) > 64 * 1024 * 1024 || current.size > 1000) throw new StudioError(413, 'A project can hold up to 64 MiB and 1,000 files.');
      const paths = [...current.keys()].map(path => path.toLowerCase()).sort();
      const pathSet = new Set(paths);
      if (pathSet.size !== paths.length || paths.some(path => path.split('/').slice(0, -1).some((_, i, parts) => pathSet.has(parts.slice(0, i + 1).join('/'))))) throw new StudioError(409, 'File paths must be unique across platforms and cannot also be directories.');
      const bytesAdded = writes.reduce((sum, file) => sum + file.bytes.length, 0);
      const previous = this.db.prepare('SELECT metadata FROM revisions WHERE project_id=? AND version=?').get(projectId, project.version)!;
      const metadataJson = metadata === undefined ? String(previous.metadata) : JSON.stringify(metadata);
      if (Buffer.byteLength(metadataJson) > 65536) throw new StudioError(413, 'Project metadata can be up to 64 KiB.');
      const used = Number(this.db.prepare('SELECT (SELECT coalesce(sum(length(bytes)),0) FROM file_revisions)+(SELECT coalesce(sum(length(metadata)+length(message)),0) FROM revisions) AS n').get()!.n);
      if (used + bytesAdded + Buffer.byteLength(metadataJson) + Buffer.byteLength(message) > 1024 * 1024 * 1024) throw new StudioError(413, 'The server has reached its 1 GiB revision storage limit. Contact its administrator.');
      if (project.version >= 10000) throw new StudioError(413, 'This project has reached its 10,000-revision limit. Export it before starting a new project.');
      const version = project.version + 1;
      const now = Date.now();
      this.db.prepare('INSERT INTO revisions VALUES (?,?,?,?,?,?)').run(projectId, version, identity.memberId, message, metadataJson, now);
      for (const { path, bytes } of writes) {
        const digest = createHash('sha256').update(bytes).digest('hex');
        this.db.prepare('INSERT INTO files VALUES (?,?,?,?,?) ON CONFLICT(project_id,path) DO UPDATE SET bytes=excluded.bytes,sha256=excluded.sha256,version=excluded.version').run(projectId, path, bytes, digest, version);
        this.db.prepare('INSERT INTO file_revisions VALUES (?,?,?,?,?)').run(projectId, path, version, bytes, digest);
      }
      for (const path of deletes) {
        this.db.prepare('DELETE FROM files WHERE project_id=? AND path=?').run(projectId, path);
        this.db.prepare('INSERT INTO file_revisions VALUES (?,?,?,NULL,NULL)').run(projectId, path, version);
        if (native) {
          const retired = this.db.prepare('UPDATE native_file_facts SET retired=1 WHERE project_id=? AND path=? AND retired=0').run(projectId, path);
          if (retired.changes) this.db.prepare('UPDATE native_file_state SET revision=revision+1 WHERE project_id=?').run(projectId);
        }
      }
      if (native) {
        const advanced = this.db.prepare('UPDATE native_file_facts SET version=? WHERE project_id=? AND retired=0 AND version!=?').run(version, projectId, version);
        if (advanced.changes) this.db.prepare('UPDATE native_file_state SET revision=revision+1 WHERE project_id=?').run(projectId);
      }
      this.db.prepare('UPDATE projects SET version=?,updated_at=?,name=coalesce(?,name) WHERE id=?').run(version, now, projectName ?? null, projectId);
      return { version, updatedAt: now, metadata: JSON.parse(metadataJson) };
    });
  }
  snapshot(identity: StudioIdentity, projectId: string, version = this.project(identity, projectId).version) {
    this.project(identity, projectId);
    const revision = this.db.prepare('SELECT version,metadata,created_at AS createdAt,message FROM revisions WHERE project_id=? AND version=?').get(projectId, version);
    if (!revision) throw new StudioError(404, 'Revision not found.');
    const rows = this.db.prepare(`SELECT f.path,f.bytes,f.sha256 FROM file_revisions f JOIN (SELECT path,max(version) AS version FROM file_revisions WHERE project_id=? AND version<=? GROUP BY path) latest ON latest.path=f.path AND latest.version=f.version WHERE f.project_id=? AND f.bytes IS NOT NULL ORDER BY f.path`).all(projectId, version, projectId) as { path: string; bytes: Uint8Array; sha256: string }[];
    return { projectId, ...revision, version, metadata: JSON.parse(String(revision.metadata)), files: rows.map(file => ({ path: file.path, sha256: file.sha256, content: Buffer.from(file.bytes).toString('base64'), encoding: 'base64' as const })) };
  }
  history(identity: StudioIdentity, projectId: string, before: number) {
    this.project(identity, projectId);
    return this.db.prepare('SELECT r.version,r.message,r.created_at AS createdAt,m.display_name AS author FROM revisions r LEFT JOIN members m ON r.member_id=m.id WHERE project_id=? AND version<? ORDER BY version DESC LIMIT 50').all(projectId, before);
  }
  restore(identity: StudioIdentity, projectId: string, version: number, expectedVersion: number) {
    const snapshot = this.snapshot(identity, projectId, version);
    const paths = new Set(snapshot.files.map(file => file.path));
    return this.commit(identity, projectId, snapshot.files.map(file => ({ path: file.path, bytes: Buffer.from(file.content, 'base64') })), this.files(identity, projectId).map(file => String(file.path)).filter(path => !paths.has(path)), expectedVersion, 'Restored revision ' + version, snapshot.metadata);
  }
  rotateKey(identity: StudioIdentity) {
    const key = token(); this.db.prepare('UPDATE members SET token_hash=? WHERE id=? AND revoked=0').run(hash(key), identity.memberId);
    return { token: key };
  }
  createRecovery(identity: StudioIdentity) {
    const key = token(); this.db.prepare('INSERT INTO recovery VALUES (?,?) ON CONFLICT(member_id) DO UPDATE SET token_hash=excluded.token_hash').run(identity.memberId, hash(key));
    return { recoveryKey: key };
  }
  recover(key: string) {
    return this.transaction(() => {
      const member = this.db.prepare('SELECT m.id FROM recovery r JOIN members m ON m.id=r.member_id WHERE r.token_hash=? AND m.revoked=0').get(hash(key));
      if (!member) throw new StudioError(401, 'This recovery key is invalid or already used.');
      const next = token(); this.db.prepare('UPDATE members SET token_hash=? WHERE id=?').run(hash(next), member.id!);
      this.db.prepare('DELETE FROM recovery WHERE member_id=?').run(member.id!);
      return { token: next };
    });
  }
  heartbeat(identity: StudioIdentity, projectId: string, clientId: string, filePath: string | null, now = Date.now()) {
    this.project(identity, projectId);
    this.db.prepare('DELETE FROM presence WHERE seen_at<?').run(now - 60000);
    const count = Number(this.db.prepare('SELECT count(*) AS n FROM presence WHERE member_id=?').get(identity.memberId)!.n);
    if (count >= 20 && !this.db.prepare('SELECT 1 FROM presence WHERE project_id=? AND member_id=? AND client_id=?').get(projectId, identity.memberId, clientId)) throw new StudioError(429, 'Up to 20 active sessions are allowed per member.');
    this.db.prepare('INSERT INTO presence VALUES (?,?,?,?,?) ON CONFLICT(project_id,member_id,client_id) DO UPDATE SET file_path=excluded.file_path,seen_at=excluded.seen_at').run(projectId, identity.memberId, clientId, filePath, now);
    return this.present(identity, projectId, now);
  }
  present(identity: StudioIdentity, projectId: string, now = Date.now()) {
    this.project(identity, projectId);
    return this.db.prepare('SELECT p.member_id AS memberId,m.display_name AS displayName,p.file_path AS filePath,max(p.seen_at) AS seenAt FROM presence p JOIN members m ON m.id=p.member_id WHERE project_id=? AND seen_at>? AND m.revoked=0 GROUP BY p.member_id,p.file_path ORDER BY m.display_name').all(projectId, now - 60000);
  }
  share(identity: StudioIdentity, projectId: string, version: number, hours: number) {
    this.manageProjectShare(identity, projectId);
    if (!this.db.prepare('SELECT 1 FROM revisions WHERE project_id=? AND version=?').get(projectId, version)) throw new StudioError(404, 'Revision not found.');
    this.db.prepare('DELETE FROM shares WHERE expires_at<? OR revoked=1').run(Date.now());
    if (Number(this.db.prepare('SELECT count(*) AS n FROM shares WHERE project_id=?').get(projectId)!.n) >= 25) throw new StudioError(409, 'This project already has 25 active shares.');
    const key = token(), id = randomUUID(), expiresAt = Date.now() + hours * 3600000;
    this.db.prepare('INSERT INTO shares(id,project_id,version,member_id,token_hash,expires_at) VALUES (?,?,?,?,?,?)').run(id, projectId, version, identity.memberId, hash(key), expiresAt);
    return { id, token: key, version, expiresAt };
  }
  shares(identity: StudioIdentity, projectId: string) {
    this.project(identity, projectId);
    return this.db.prepare('SELECT id,version,expires_at AS expiresAt FROM shares WHERE project_id=? AND revoked=0 AND expires_at>?').all(projectId, Date.now());
  }
  revokeShare(identity: StudioIdentity, projectId: string, id: string) {
    this.manageProjectShare(identity, projectId);
    if (!this.db.prepare('UPDATE shares SET revoked=1 WHERE project_id=? AND id=?').run(projectId, id).changes) throw new StudioError(404, 'Share not found.');
  }
  manageProjectShare(identity: StudioIdentity, projectId: string) {
    this.project(identity, projectId);
    const native = this.db.prepare('SELECT owner_member_id FROM native_projects WHERE storage_id=?').get(projectId);
    if (native) {
      if (native.owner_member_id !== identity.memberId) throw new StudioError(403, 'Only the native project creator can manage its share links.');
    } else this.owner(identity);
  }
  sharedSnapshot(key: string) {
    const share = this.db.prepare('SELECT s.project_id,s.version,m.* FROM shares s JOIN members m ON m.id=s.member_id WHERE s.token_hash=? AND s.revoked=0 AND m.revoked=0 AND s.expires_at>?').get(hash(key), Date.now()) as (MemberRow & { project_id: string; version: number }) | undefined;
    if (!share) throw new StudioError(404, 'This share is expired or unavailable.');
    return this.snapshot({ workspaceId: share.workspace_id, memberId: share.id, role: share.role, displayName: share.display_name }, share.project_id, share.version);
  }
  comments(identity: StudioIdentity, projectId: string) {
    this.project(identity, projectId);
    return this.db.prepare('SELECT c.id,c.body,c.file_path AS filePath,c.resolved,c.created_at AS createdAt,m.display_name AS author,c.member_id AS memberId FROM comments c JOIN members m ON m.id=c.member_id WHERE project_id=? ORDER BY c.created_at,c.id').all(projectId);
  }
  comment(identity: StudioIdentity, projectId: string, body: string, filePath: string | null) {
    this.project(identity, projectId);
    if (filePath) this.readFile(identity, projectId, filePath);
    const id = randomUUID();
    this.db.prepare('INSERT INTO comments(id,project_id,member_id,body,file_path,created_at) VALUES (?,?,?,?,?,?)').run(id, projectId, identity.memberId, body, filePath, Date.now());
    return { id };
  }
  resolveComment(identity: StudioIdentity, projectId: string, commentId: string, resolved: boolean) {
    this.project(identity, projectId);
    const row = this.db.prepare('SELECT member_id FROM comments WHERE project_id=? AND id=?').get(projectId, commentId) as { member_id: string } | undefined;
    if (!row) throw new StudioError(404, 'Comment not found.');
    const native = this.db.prepare('SELECT owner_member_id FROM native_projects WHERE storage_id=?').get(projectId);
    if (row.member_id !== identity.memberId && identity.role !== 'owner' && native?.owner_member_id !== identity.memberId) throw new StudioError(403, 'Only the author or owner can change this comment.');
    this.db.prepare('UPDATE comments SET resolved=? WHERE id=?').run(Number(resolved), commentId);
  }
}
