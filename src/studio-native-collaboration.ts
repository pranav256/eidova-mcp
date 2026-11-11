import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { StudioError, type StudioIdentity, StudioStore } from './studio-store.js';
import { StudioNativeStore, nativeFileFacts } from './studio-native-store.js';
import { studioPath } from './studio-client.js';

const seq = z.number().int().nonnegative().safe();
const id = z.string().min(1).max(120);
const text = z.string().max(10000);
const position = z.object({ x: z.number().finite(), y: z.number().finite(), width: z.number().nonnegative().finite(), height: z.number().nonnegative().finite() }).strict();
const style = z.object(Object.fromEntries(['color', 'backgroundColor', 'fontSize', 'fontWeight', 'lineHeight', 'textAlign', 'fontFamily', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderRadius'].map(key => [key, z.string().max(1000).optional()]))).strict();
export const nativeCommentInput = z.object({ id, projectId: id, conversationId: text, memberId: id, seq,
  note: text, filePath: studioPath, elementId: text, selector: text, label: text, text, htmlHint: text, position,
  style: style.optional(), selectionKind: z.enum(['element', 'pod']).optional(), memberCount: seq.optional(),
  podMembers: z.array(z.object({ elementId: text, selector: text, label: text, text, htmlHint: text, position, style: style.optional() }).strict()).max(100).optional(),
  slideIndex: seq.optional(), attachments: z.array(z.object({ path: studioPath, name: z.string().max(120) }).strict()).max(20).optional(),
  status: z.enum(['open', 'attached', 'applying', 'needs_review', 'resolved', 'failed']), anchorState: z.enum(['anchored', 'reanchored', 'stale', 'lost']).optional(),
  anchoredVersion: seq.optional(), lastGoodPosition: position.optional(), createdAt: seq, updatedAt: seq, deleted: z.boolean().optional(),
  sourceFileId: z.string().uuid().optional(), sourceFilePath: studioPath.optional(), authorKind: z.enum(['member', 'user']).optional(), authorAppUserId: id.optional(), authorDisplayName: text.optional(), authorKey: text.optional(),
}).strict();
type NativeComment = z.infer<typeof nativeCommentInput>;
const receipt = z.object({ resourceId: z.string().uuid(), versionId: z.string().regex(/^\d+$/) }).strict();
export const nativeFileMutation = z.object({ schemaVersion: z.literal(1), baseRevision: seq, resourceId: z.string().uuid(), versionId: z.string().regex(/^\d+$/),
  files: z.array(z.object({ sourceFileId: z.string().uuid(), sourceFilePath: studioPath, entryPath: studioPath, retired: z.boolean(), receipt: receipt.optional() }).strict()).min(1).max(1000),
}).strict();

/** Native anchor lifetimes, author identity and cursors are owned by this backend. */
export class StudioNativeCollaboration {
  readonly native: StudioNativeStore;
  readonly signingKey: string;
  constructor(readonly store: StudioStore) {
    this.native = new StudioNativeStore(store);
    store.db.prepare("INSERT OR IGNORE INTO studio_secrets VALUES ('native-cursors',?)").run(randomBytes(32).toString('base64url'));
    this.signingKey = String(store.db.prepare("SELECT value FROM studio_secrets WHERE name='native-cursors'").get()!.value);
  }
  files(identity: StudioIdentity, projectId: string) { return nativeFileFacts(this.store, this.native.registration(identity, projectId).resourceId); }
  admit(identity: StudioIdentity, projectId: string, input: z.infer<typeof nativeFileMutation>) {
    return this.store.transaction(() => {
      const project = this.native.registration(identity, projectId, true), state = nativeFileFacts(this.store, project.resourceId);
      if (input.resourceId !== project.resourceId || state.revision !== input.baseRevision) throw new StudioError(409, 'Comment file authority changed. Reload before retrying.');
      if (new Set(input.files.map(file => file.sourceFileId)).size !== input.files.length) throw new StudioError(400, 'Duplicate comment file identities.');
      for (const file of input.files) {
        const old = state.files.find(fact => fact.sourceFileId === file.sourceFileId), committed = file.receipt ?? input;
        if (!/\.html?$/i.test(file.sourceFilePath) || file.sourceFilePath !== file.entryPath || committed.resourceId !== project.resourceId) throw new StudioError(400, 'Use a committed native HTML file.');
        if (old && (old.sourceFilePath !== file.sourceFilePath || old.entryPath !== file.entryPath || old.retired && !file.retired)) throw new StudioError(409, 'A retired file identity cannot be reused.');
        if (file.retired) {
          if (!old || old.resourceId !== committed.resourceId || old.versionId !== committed.versionId) throw new StudioError(409, 'The retirement must match its original receipt.');
          this.store.db.prepare('UPDATE native_file_facts SET retired=1 WHERE project_id=? AND source_id=?').run(project.resourceId, file.sourceFileId);
        } else {
          if (file.receipt || Number(input.versionId) !== project.version || state.files.some(fact => !fact.retired && fact.sourceFilePath === file.sourceFilePath && fact.sourceFileId !== file.sourceFileId)) throw new StudioError(409, 'The active file identity or content version changed.');
          this.store.readFile(identity, project.resourceId, file.entryPath);
          this.store.db.prepare('INSERT INTO native_file_facts VALUES (?,?,?,?,?,0) ON CONFLICT(project_id,source_id) DO UPDATE SET version=excluded.version').run(project.resourceId, file.sourceFileId, file.sourceFilePath, file.entryPath, project.version);
        }
      }
      this.store.db.prepare('INSERT INTO native_file_state VALUES (?,1) ON CONFLICT(project_id) DO UPDATE SET revision=revision+1').run(project.resourceId);
      return nativeFileFacts(this.store, project.resourceId);
    });
  }
  push(identity: StudioIdentity, projectId: string, comment: NativeComment, idempotencyKey?: string) {
    return this.store.transaction(() => {
      const project = this.native.registration(identity, projectId), db = this.store.db;
      if (comment.projectId !== projectId || comment.authorKind === 'user' || comment.authorAppUserId) throw new StudioError(400, 'Use the authenticated member comment identity.');
      const fingerprint = createHash('sha256').update(JSON.stringify({ ...comment, seq: 0, authorDisplayName: undefined, authorKey: undefined })).digest('hex');
      const key = idempotencyKey ?? fingerprint;
      const previous = db.prepare('SELECT hash,seq FROM native_comment_keys WHERE project_id=? AND member_id=? AND key=?').get(project.resourceId, identity.memberId, key);
      if (previous) {
        if (previous.hash !== fingerprint) throw new StudioError(409, 'An idempotency key cannot identify different comments.');
        const event = db.prepare('SELECT member_id FROM native_comment_events WHERE seq=?').get(previous.seq);
        return { seq: Number(previous.seq), authorKey: String(event!.member_id) };
      }
      const row = db.prepare('SELECT member_id,payload,seq FROM native_comment_events WHERE project_id=? AND comment_id=? ORDER BY seq DESC LIMIT 1').get(project.resourceId, comment.id);
      const existing = row ? JSON.parse(String(row.payload)) as NativeComment : null;
      const author = row ? String(row.member_id) : identity.memberId;
      if (comment.memberId !== author || (row && author !== identity.memberId && project.ownerMemberId !== identity.memberId)) throw new StudioError(403, 'Only the comment author or project creator can update feedback.');
      if (existing?.deleted) throw new StudioError(409, 'Deleted comments cannot be restored.');
      if (existing && (existing.filePath !== comment.filePath || existing.sourceFileId !== comment.sourceFileId || existing.sourceFilePath !== comment.sourceFilePath || existing.createdAt !== comment.createdAt)) throw new StudioError(409, 'A comment cannot change its author, file identity or creation time.');
      if (!comment.deleted) {
        const fact = nativeFileFacts(this.store, project.resourceId).files.find(file => file.sourceFileId === comment.sourceFileId);
        if (!fact || fact.retired || fact.sourceFilePath !== comment.sourceFilePath || fact.sourceFilePath !== comment.filePath) throw new StudioError(409, 'Comment file authority is unavailable or retired.');
        this.store.readFile(identity, project.resourceId, comment.filePath);
        for (const attachment of comment.attachments ?? []) this.store.readFile(identity, project.resourceId, attachment.path);
      } else if (!existing) throw new StudioError(404, 'Comment not found.');
      if (comment.updatedAt > Date.now() + 60000 || comment.createdAt > comment.updatedAt || existing && comment.updatedAt < existing.updatedAt) throw new StudioError(409, 'Comment timestamps changed or are invalid.');
      if (Buffer.byteLength(JSON.stringify(comment)) > 65536) throw new StudioError(413, 'A native comment can be up to 64 KiB.');
      if (Number(db.prepare('SELECT count(*) AS n FROM native_comment_events').get()!.n) >= 100000) throw new StudioError(413, 'The server comment history limit was reached.');
      const authorName = existing?.authorDisplayName ?? identity.displayName;
      const payload = { ...comment, memberId: author, authorKind: 'member', authorDisplayName: authorName, authorKey: author, seq: 0 };
      const result = db.prepare('INSERT INTO native_comment_events(project_id,comment_id,member_id,payload) VALUES (?,?,?,?)').run(project.resourceId, comment.id, author, JSON.stringify(payload));
      const assigned = Number(result.lastInsertRowid);
      db.prepare('INSERT INTO native_comment_keys VALUES (?,?,?,?,?)').run(project.resourceId, identity.memberId, key, fingerprint, assigned);
      return { seq: assigned, authorKey: author };
    });
  }
  pull(identity: StudioIdentity, projectId: string, sinceSeq: number) {
    const project = this.native.registration(identity, projectId), db = this.store.db;
    const rows = db.prepare('SELECT seq,payload FROM native_comment_events WHERE project_id=? AND seq>? ORDER BY seq LIMIT 1000').all(project.resourceId, sinceSeq);
    return { comments: rows.map(row => ({ ...JSON.parse(String(row.payload)), seq: Number(row.seq) })), latestSeq: rows.length ? Number(rows.at(-1)!.seq) : sinceSeq };
  }
  present(identity: StudioIdentity, projectId: string) {
    const project = this.native.registration(identity, projectId), db = this.store.db;
    db.prepare('DELETE FROM native_presence_leases WHERE seen_at<?').run(Date.now() - 86400000);
    const rows = db.prepare(`SELECT p.member_id AS memberId,m.display_name AS name,m.role,p.file_path AS filePath,p.activity,p.seen_at AS seenAt
      FROM native_presence_leases p JOIN members m ON m.id=p.member_id
      WHERE p.project_id=? AND p.seen_at>? AND p.is_left=0 AND m.revoked=0 ORDER BY p.seen_at DESC`).all(project.resourceId, Date.now() - 60000);
    const members = new Set<string>();
    return rows.filter(row => { if (members.has(String(row.memberId))) return false; members.add(String(row.memberId)); return true; }).map(row => ({ memberId: String(row.memberId), name: String(row.name), role: String(row.role), filePath: row.filePath, activity: row.activity ? JSON.parse(String(row.activity)) : null, heartbeatAt: new Date(Number(row.seenAt)).toISOString() }));
  }
  presence(identity: StudioIdentity, projectId: string, input: { clientId: string; sequence: number; filePath?: string | null; activity?: unknown }, leave = false) {
    const project = this.native.registration(identity, projectId), db = this.store.db;
    if (input.filePath) this.store.readFile(identity, project.resourceId, input.filePath);
    const payload = JSON.stringify(input.activity ?? null);
    if (Buffer.byteLength(payload) > 4096) throw new StudioError(413, 'Presence activity can be up to 4 KiB.');
    const previous = db.prepare('SELECT sequence FROM native_presence_leases WHERE project_id=? AND member_id=? AND client_id=?').get(project.resourceId, identity.memberId, input.clientId);
    if (previous && input.sequence <= Number(previous.sequence)) return this.present(identity, projectId);
    if (!previous && Number(db.prepare('SELECT count(*) AS n FROM native_presence_leases WHERE project_id=?').get(project.resourceId)!.n) >= 1000) throw new StudioError(413, 'Too many active presence sessions.');
    db.prepare('INSERT INTO native_presence_leases VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(project_id,member_id,client_id) DO UPDATE SET sequence=excluded.sequence,seen_at=excluded.seen_at,file_path=excluded.file_path,activity=excluded.activity,is_left=excluded.is_left').run(project.resourceId, identity.memberId, input.clientId, input.sequence, Date.now(), input.filePath ?? null, payload, leave ? 1 : 0);
    return this.present(identity, projectId);
  }
  page(identity: StudioIdentity, projectId: string, query: { mode: 'snapshot' | 'incremental'; limit: number; pageToken?: string; resumeToken?: string }) {
    const project = this.native.registration(identity, projectId), db = this.store.db;
    const scope = createHash('sha256').update(JSON.stringify([project.resourceId, identity.memberId, project.policyVersion])).digest('hex');
    const sign = (input: Record<string, unknown>) => {
      const body = Buffer.from(JSON.stringify(input)).toString('base64url');
      return body + '.' + createHmac('sha256', this.signingKey).update(body).digest('base64url');
    };
    const decode = (token: string): { scope: string; mode: string; watermark: number; after: number } => {
      const [body, supplied, extra] = token.split('.'), expected = createHmac('sha256', this.signingKey).update(body ?? '').digest('base64url');
      if (!body || !supplied || extra || supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) throw new StudioError(409, 'INVALID_CURSOR');
      let cursor: { scope: string; mode: string; watermark: number; after: number };
      try { cursor = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { throw new StudioError(409, 'INVALID_CURSOR'); }
      if (cursor.scope !== scope) throw new StudioError(409, 'SCOPE_CHANGED');
      if (![cursor.watermark, cursor.after].every(n => Number.isSafeInteger(n) && n >= 0) || cursor.after > cursor.watermark) throw new StudioError(409, 'INVALID_CURSOR');
      return cursor;
    };
    const head = Number(db.prepare('SELECT coalesce(max(seq),0) AS n FROM native_comment_events WHERE project_id=?').get(project.resourceId)!.n);
    let watermark = head, after = 0;
    if (query.pageToken) { const cursor = decode(query.pageToken); if (cursor.mode !== query.mode) throw new StudioError(409, 'INVALID_CURSOR'); watermark = cursor.watermark; after = cursor.after; }
    else if (query.resumeToken) { const cursor = decode(query.resumeToken); if (query.mode !== 'incremental' || cursor.mode !== 'resume') throw new StudioError(409, 'INVALID_CURSOR'); after = cursor.watermark; }
    const rows = query.mode === 'snapshot'
      ? db.prepare(`SELECT e.seq,e.payload FROM native_comment_events e JOIN (SELECT comment_id,max(seq) AS seq FROM native_comment_events WHERE project_id=? AND seq<=? GROUP BY comment_id) h ON h.seq=e.seq WHERE e.seq>? ORDER BY e.seq LIMIT ?`).all(project.resourceId, watermark, after, query.limit + 1)
      : db.prepare('SELECT seq,payload FROM native_comment_events WHERE project_id=? AND seq>? AND seq<=? ORDER BY seq LIMIT ?').all(project.resourceId, after, watermark, query.limit + 1);
    const hasMore = rows.length > query.limit, selected = rows.slice(0, query.limit), scan = hasMore ? Number(selected.at(-1)!.seq) : watermark;
    const resumeToken = hasMore ? null : sign({ scope, mode: 'resume', watermark, after: watermark });
    return { mode: query.mode, comments: selected.map(row => ({ ...JSON.parse(String(row.payload)), seq: Number(row.seq) })), hasMore, complete: !hasMore,
      nextPageToken: hasMore ? sign({ scope, mode: query.mode, watermark, after: scan }) : null, resumeToken, scopeToken: scope, watermarkSeq: watermark, scanThroughSeq: scan,
      handoff: !hasMore && query.mode === 'snapshot' ? { sinceSeq: watermark, resumeToken, scopeToken: scope } : null, streamEpoch: project.resourceId,
      latestSeq: head, nextSeq: scan, snapshotAt: query.mode === 'snapshot' ? Date.now() : null };
  }
}
