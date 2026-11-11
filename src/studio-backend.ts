import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { StudioError, StudioStore } from './studio-store.js';
import { StudioNativeStore } from './studio-native-store.js';
import { StudioNativeCollaboration, nativeCommentInput, nativeFileMutation } from './studio-native-collaboration.js';
import { studioPath as path } from './studio-client.js';
import { createHash, timingSafeEqual } from 'node:crypto';

const name = z.string().trim().min(1).max(120);
const key = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const version = z.number().int().nonnegative();
export const studioFileInput = z.object({ path, content: z.string().max(11_184_812), encoding: z.enum(['utf8', 'base64']).default('utf8') }).strict();
export function decodeStudioFile(input: z.infer<typeof studioFileInput>) {
  if (input.encoding === 'base64' && !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.content)) throw new StudioError(400, 'Invalid base64 content.');
  const bytes = Buffer.from(input.content, input.encoding);
  if (bytes.length > 8 * 1024 * 1024) throw new StudioError(413, 'Each file can be up to 8 MiB.');
  return { path: input.path, bytes };
}

export function createStudioBackend(store: StudioStore, allowedOrigins: string[] = [], options: { registrationKey?: string; requestsPerMinute?: number } = {}) {
  const app = express();
  const native = new StudioNativeStore(store);
  const collaboration = new StudioNativeCollaboration(store);
  const nativeId = z.string().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const origin = req.get('origin');
    if (origin && !allowedOrigins.includes(origin)) { res.status(403).json({ error: 'This website is not allowed to connect.' }); return; }
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    next();
  });
  const authenticate = (req: Request) => {
    const match = req.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/);
    if (!match) throw new StudioError(401, 'Connect with your workspace key.');
    return store.identity(match[1]);
  };
  const rates = new Map<string, { count: number; reset: number }>();
  app.use((req, res, next) => {
    const now = Date.now();
    for (const [ip, rate] of rates) if (rate.reset <= now) rates.delete(ip);
    const ip = req.ip || 'unknown', rate = rates.get(ip) || { count: 0, reset: now + 60000 };
    if (rates.size >= 10000 && !rates.has(ip)) throw new StudioError(429, 'The service is busy. Try again in a minute.');
    rates.set(ip, rate); rate.count++;
    if (rate.count > (options.requestsPerMinute ?? 600)) { res.setHeader('Retry-After', String(Math.ceil((rate.reset - now) / 1000))); throw new StudioError(429, 'Too many requests. Try again in a minute.'); }
    const pathname = req.path.toLowerCase().replace(/\/+$/, '');
    const publicRequest = req.method === 'POST' && ['/api/workspaces', '/api/join', '/api/recover'].includes(pathname) || req.method === 'GET' && pathname === '/api/share';
    if ((pathname === '/api' || pathname.startsWith('/api/')) && !publicRequest) res.locals.identity = authenticate(req);
    if (req.method === 'POST' && /^\/api\/projects\/[^/]+\/commit$/.test(pathname)) {
      res.locals.identity = authenticate(req);
      express.json({ limit: '90mb', strict: true, inflate: false })(req, res, next);
    } else express.json({ limit: publicRequest ? '64kb' : req.method === 'PUT' && /^\/api\/projects\/[^/]+\/file$/.test(pathname) ? '12mb' : '8mb', strict: true, inflate: false })(req, res, next);
  });
  app.get('/health', (_req, res) => res.json({ name: 'Eidova Studio backend', version: '0.2.0', storage: 'sqlite', registrationRequired: Boolean(options.registrationKey), capabilities: ['workspaces', 'invites', 'member-revocation', 'version-checked-files', 'comments', 'atomic-commits', 'revision-history', 'presence', 'expiring-shares', 'key-recovery', 'native-project-policy', 'native-comment-files', 'native-comment-stream', 'native-presence'] }));
  app.post('/api/workspaces', (req, res) => {
    const input = z.object({ name, displayName: name, registrationKey: z.string().max(256).optional() }).strict().parse(req.body);
    const digest = (value: string) => createHash('sha256').update(value).digest();
    if (options.registrationKey && !timingSafeEqual(digest(input.registrationKey ?? ''), digest(options.registrationKey))) throw new StudioError(403, 'Use the registration key supplied by your server administrator.');
    res.status(201).json(store.createWorkspace(input.name, input.displayName));
  });
  app.post('/api/join', (req, res) => {
    const input = z.object({ invite: key, displayName: name }).strict().parse(req.body);
    res.status(201).json(store.join(input.invite, input.displayName));
  });
  app.post('/api/recover', (req, res) => { res.json(store.recover(z.object({ recoveryKey: key }).strict().parse(req.body).recoveryKey)); });
  app.get('/api/share', (req, res) => {
    const value = key.parse(req.get('authorization')?.replace(/^Share /, ''));
    res.json(store.sharedSnapshot(value));
  });
  app.use('/api', (req, res, next) => {
    res.locals.identity ??= authenticate(req); next();
  });
  app.post('/api/key/rotate', (_req, res) => res.json(store.rotateKey(res.locals.identity)));
  app.post('/api/key/recovery', (_req, res) => res.json(store.createRecovery(res.locals.identity)));
  app.get('/api/identity', (_req, res) => res.json(store.membership(res.locals.identity)));
  app.get('/api/native/projects', (_req, res) => res.json({ projects: native.list(res.locals.identity) }));
  app.post('/api/native/projects', (req, res) => {
    const input = z.object({ projectId: nativeId, name }).strict().parse(req.body);
    res.status(201).json(native.ensure(res.locals.identity, input.projectId, input.name));
  });
  app.get('/api/native/projects/:id', (req, res) => res.json(native.registration(res.locals.identity, nativeId.parse(req.params.id))));
  app.get('/api/native/projects/:id/comment-files', (req, res) => res.json(collaboration.files(res.locals.identity, nativeId.parse(req.params.id))));
  app.post('/api/native/projects/:id/comment-files', (req, res) => res.json(collaboration.admit(res.locals.identity, nativeId.parse(req.params.id), nativeFileMutation.parse(req.body))));
  app.post('/api/native/projects/:id/comments', (req, res) => {
    const input = z.object({ comment: nativeCommentInput, idempotencyKey: z.string().min(1).max(256).optional() }).strict().parse(req.body);
    res.json(collaboration.push(res.locals.identity, nativeId.parse(req.params.id), input.comment, input.idempotencyKey));
  });
  app.get('/api/native/projects/:id/comments', (req, res) => {
    const projectId = nativeId.parse(req.params.id);
    if (req.query.mode === undefined) { res.json(collaboration.pull(res.locals.identity, projectId, z.coerce.number().int().nonnegative().safe().parse(req.query.sinceSeq ?? 0))); return; }
    const query = z.object({ mode: z.enum(['snapshot', 'incremental']), limit: z.coerce.number().int().min(1).max(500).default(200), pageToken: z.string().max(2000).optional(), resumeToken: z.string().max(2000).optional() }).strict().parse(req.query);
    if (query.pageToken && query.resumeToken || query.mode === 'snapshot' && query.resumeToken) throw new StudioError(400, 'Use one comment cursor.');
    res.json(collaboration.page(res.locals.identity, projectId, query));
  });
  app.get('/api/native/projects/:id/presence', (req, res) => res.json({ present: collaboration.present(res.locals.identity, nativeId.parse(req.params.id)) }));
  app.put('/api/native/projects/:id/presence', (req, res) => {
    const input = z.object({ clientId: z.string().min(1).max(120), sequence: z.number().int().nonnegative().safe(), filePath: path.nullable().optional(), activity: z.union([z.string().max(1000), z.record(z.string(), z.unknown()), z.null()]).optional() }).strict().parse(req.body);
    res.json({ present: collaboration.presence(res.locals.identity, nativeId.parse(req.params.id), input) });
  });
  app.delete('/api/native/projects/:id/presence', (req, res) => {
    const input = z.object({ clientId: z.string().min(1).max(120), sequence: z.number().int().nonnegative().safe() }).strict().parse(req.body);
    res.json({ present: collaboration.presence(res.locals.identity, nativeId.parse(req.params.id), input, true) });
  });
  app.patch('/api/native/projects/:id', (req, res) => {
    const input = z.object({ name: name.optional(), metadata: z.record(z.string(), z.unknown()), expectedVersion: version }).strict().parse(req.body);
    res.json(native.metadata(res.locals.identity, nativeId.parse(req.params.id), input.name, input.metadata, input.expectedVersion));
  });
  app.put('/api/native/projects/:id/visibility', (req, res) => {
    const input = z.object({ visibility: z.enum(['private', 'team']), expectedPolicyVersion: version }).strict().parse(req.body);
    res.json(native.policy(res.locals.identity, nativeId.parse(req.params.id), input.visibility, input.expectedPolicyVersion));
  });
  app.delete('/api/native/projects/:id', (req, res) => {
    const input = z.object({ expectedPolicyVersion: version }).strict().parse(req.body);
    native.remove(res.locals.identity, nativeId.parse(req.params.id), input.expectedPolicyVersion); res.status(204).end();
  });
  app.get('/api/workspace', (_req, res) => res.json(store.workspace(res.locals.identity)));
  app.post('/api/invites', (_req, res) => res.status(201).json(store.invite(res.locals.identity)));
  app.delete('/api/members/:id', (req, res) => { store.revoke(res.locals.identity, req.params.id); res.status(204).end(); });
  app.post('/api/projects', (req, res) => { const input = z.object({ name }).strict().parse(req.body); res.status(201).json(store.createProject(res.locals.identity, input.name)); });
  app.get('/api/projects/:id', (req, res) => res.json(store.project(res.locals.identity, req.params.id)));
  app.get('/api/projects/:id/files', (req, res) => res.json({ project: store.project(res.locals.identity, req.params.id), files: store.files(res.locals.identity, req.params.id) }));
  app.get('/api/projects/:id/snapshot', (req, res) => res.json(store.snapshot(res.locals.identity, req.params.id, req.query.version === undefined ? undefined : z.coerce.number().int().nonnegative().parse(req.query.version))));
  app.get('/api/projects/:id/history', (req, res) => res.json({ revisions: store.history(res.locals.identity, req.params.id, req.query.before === undefined ? Number.MAX_SAFE_INTEGER : z.coerce.number().int().nonnegative().parse(req.query.before)) }));
  app.post('/api/projects/:id/commit', (req, res) => {
    const input = z.object({ files: z.array(studioFileInput).max(1000), deletedPaths: z.array(path).max(1000).default([]), expectedVersion: version, message: z.string().trim().min(1).max(500), metadata: z.record(z.string(), z.unknown()).optional() }).strict().parse(req.body);
    res.json(store.commit(res.locals.identity, req.params.id, input.files.map(decodeStudioFile), input.deletedPaths, input.expectedVersion, input.message, input.metadata));
  });
  app.post('/api/projects/:id/restore', (req, res) => {
    const input = z.object({ version, expectedVersion: version }).strict().parse(req.body);
    res.json(store.restore(res.locals.identity, req.params.id, input.version, input.expectedVersion));
  });
  app.get('/api/projects/:id/presence', (req, res) => res.json({ members: store.present(res.locals.identity, req.params.id) }));
  app.put('/api/projects/:id/presence', (req, res) => {
    const input = z.object({ clientId: z.string().uuid(), filePath: path.nullable().default(null) }).strict().parse(req.body);
    res.json({ members: store.heartbeat(res.locals.identity, req.params.id, input.clientId, input.filePath) });
  });
  app.get('/api/projects/:id/shares', (req, res) => res.json({ shares: store.shares(res.locals.identity, req.params.id) }));
  app.post('/api/projects/:id/shares', (req, res) => { const input = z.object({ version, hours: z.number().int().min(1).max(168).default(24) }).strict().parse(req.body); res.status(201).json(store.share(res.locals.identity, req.params.id, input.version, input.hours)); });
  app.delete('/api/projects/:id/shares/:shareId', (req, res) => { store.revokeShare(res.locals.identity, req.params.id, req.params.shareId); res.status(204).end(); });
  app.get('/api/projects/:id/file', (req, res) => {
    const filename = path.parse(req.query.path);
    const revision = req.query.version === undefined ? null : store.snapshot(res.locals.identity, req.params.id, z.coerce.number().int().nonnegative().parse(req.query.version)).files.find(file => file.path === filename);
    if (revision === undefined) throw new StudioError(404, 'File not found in that revision.');
    const file = revision ? { sha256: revision.sha256, bytes: Buffer.from(revision.content, 'base64') } : store.readFile(res.locals.identity, req.params.id, filename);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent(filename.split('/').at(-1)!));
    res.setHeader('ETag', '"' + file.sha256 + '"');
    res.send(file.bytes);
  });
  app.put('/api/projects/:id/file', (req, res) => {
    const input = studioFileInput.extend({ expectedVersion: version }).strict().parse(req.body);
    res.json(store.writeFile(res.locals.identity, req.params.id, input.path, decodeStudioFile(input).bytes, input.expectedVersion));
  });
  app.get('/api/projects/:id/comments', (req, res) => res.json({ comments: store.comments(res.locals.identity, req.params.id) }));
  app.post('/api/projects/:id/comments', (req, res) => {
    const input = z.object({ body: z.string().trim().min(1).max(10000), filePath: path.nullable().default(null) }).strict().parse(req.body);
    res.status(201).json(store.comment(res.locals.identity, req.params.id, input.body, input.filePath));
  });
  app.patch('/api/projects/:id/comments/:commentId', (req, res) => {
    const input = z.object({ resolved: z.boolean() }).strict().parse(req.body);
    store.resolveComment(res.locals.identity, req.params.id, req.params.commentId, input.resolved); res.status(204).end();
  });
  app.use((_req, res) => { res.status(404).json({ error: 'Not found.' }); });
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const type = (error as { type?: string }).type;
    const status = error instanceof StudioError ? error.status : error instanceof z.ZodError || error instanceof SyntaxError ? 400 : type === 'entity.too.large' ? 413 : type === 'encoding.unsupported' ? 415 : 500;
    res.status(status).json({ error: error instanceof StudioError ? error.message : status === 400 ? 'Invalid request. Check the fields and try again.' : status === 413 ? 'The upload is too large.' : status === 415 ? 'Send an uncompressed JSON request.' : 'The operation failed. Nothing was confirmed saved.' });
  });
  return app;
}
