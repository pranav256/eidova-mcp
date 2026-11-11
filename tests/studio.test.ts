import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { StudioStore } from '../src/studio-store.js';
import { createStudioBackend } from '../src/studio-backend.js';

test('Studio persists collaboration, rejects stale edits, isolates teams and revokes access', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'eidova-studio-'));
  const file = join(directory, 'studio.sqlite');
  let db = new DatabaseSync(file);
  let store = new StudioStore(db);
  const app = createStudioBackend(store, ['http://localhost:5173']);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const request = async (path: string, method = 'GET', body?: unknown, token?: string, headers: Record<string, string> = {}) => fetch(origin + path, {
    method, headers: { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  try {
    const create = await request('/api/workspaces', 'POST', { name: 'Design team', displayName: 'Alice' }); assert.equal(create.status, 201);
    const owner = await create.json();
    const other = await (await request('/api/workspaces', 'POST', { name: 'Private team', displayName: 'Mallory' })).json();
    const invitation = await (await request('/api/invites', 'POST', {}, owner.token)).json();
    const member = await (await request('/api/join', 'POST', { invite: invitation.invite, displayName: 'Bob' })).json();
    assert.equal((await request('/api/join', 'POST', { invite: invitation.invite, displayName: 'Replay' })).status, 401);
    assert.equal((await request('/api/invites', 'POST', {}, member.token)).status, 403);
    const project = await (await request('/api/projects', 'POST', { name: 'Launch page' }, owner.token)).json();
    assert.equal((await request('/api/projects/' + project.id, 'GET', undefined, other.token)).status, 404);
    assert.equal((await request('/api/projects/' + project.id, 'GET')).status, 401);
    assert.equal((await request('/api/workspace', 'GET', undefined, owner.token, { origin: 'https://untrusted.example' })).status, 403);
    const fileRoute = '/api/projects/' + project.id + '/file';
    for (const path of ['../secrets', '/absolute', 'C:/Windows/file', 'a\\b', 'a//b', 'CON', 'NUL.txt', 'name.', 'name ', 'a?b']) assert.equal((await request(fileRoute, 'PUT', { path, content: 'bad', expectedVersion: 0 }, owner.token)).status, 400);
    const bytes = Buffer.from('<!doctype html><h1>Hello 👋</h1><script>throw new Error("never run on backend")</script>');
    const saved = await request(fileRoute, 'PUT', { path: 'index.html', content: bytes.toString('base64'), encoding: 'base64', expectedVersion: 0 }, owner.token);
    assert.equal(saved.status, 200); assert.equal((await saved.json()).version, 1);
    assert.equal((await request(fileRoute, 'PUT', { path: 'index.html', content: 'lost update', expectedVersion: 0 }, member.token)).status, 409);
    const download = await request(fileRoute + '?path=index.html', 'GET', undefined, member.token);
    assert.equal(download.status, 200); assert.match(download.headers.get('content-disposition')!, /attachment/); assert.match(download.headers.get('content-security-policy')!, /sandbox/);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
    const concurrent = await Promise.all(['one', 'two'].map(content => request(fileRoute, 'PUT', { path: 'tokens.css', content, expectedVersion: 1 }, member.token)));
    assert.deepEqual(concurrent.map(response => response.status).sort(), [200, 409]);
    const commentRoute = '/api/projects/' + project.id + '/comments';
    const comment = await (await request(commentRoute, 'POST', { body: 'Make the heading clearer.', filePath: 'index.html' }, member.token)).json();
    assert.equal((await request(commentRoute + '/' + comment.id, 'PATCH', { resolved: true }, owner.token)).status, 204);
    const comments = await (await request(commentRoute, 'GET', undefined, owner.token)).json();
    assert.equal(comments.comments[0].author, 'Bob'); assert.equal(comments.comments[0].resolved, 1);
    assert.equal((await request('/api/members/' + owner.memberId, 'DELETE', undefined, owner.token)).status, 409);
    assert.equal((await request('/api/members/' + member.memberId, 'DELETE', undefined, owner.token)).status, 204);
    assert.equal((await request(fileRoute + '?path=index.html', 'GET', undefined, member.token)).status, 401);
    const workspace = await (await request('/api/workspace', 'GET', undefined, owner.token)).json();
    assert.equal(workspace.members.length, 1);
    assert.ok(!JSON.stringify(workspace).includes(owner.token));
    const storedMembers = db.prepare('SELECT * FROM members').all();
    assert.ok(!JSON.stringify(storedMembers).includes(owner.token));
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    db.close(); db = new DatabaseSync(file); store = new StudioStore(db);
    const identity = store.identity(owner.token);
    assert.equal(store.workspace(identity).projects.length, 1);
    assert.deepEqual(store.readFile(identity, project.id, 'index.html').bytes, bytes);
    assert.equal(store.comments(identity, project.id).length, 1);
    assert.throws(() => store.identity(member.token), /valid workspace key/);
  } finally {
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    db.close(); assert.equal(dirname(directory), resolve(tmpdir())); await rm(directory, { recursive: true, force: true });
  }
});
