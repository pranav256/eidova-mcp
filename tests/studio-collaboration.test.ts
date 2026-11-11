import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StudioStore } from '../src/studio-store.js';
import { createStudioBackend } from '../src/studio-backend.js';
import { StudioClient } from '../src/studio-client.js';
import { syncStudioProject } from '../src/studio-sync.js';

test('Revision commits are atomic, restore preserves history, shares freeze content and credentials revoke', async () => {
  const db = new DatabaseSync(':memory:'), store = new StudioStore(db);
  const server = createStudioBackend(store, [], { registrationKey: 'test-registration-secret' }).listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  try {
    assert.equal((await fetch(origin + '/api/workspaces', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Denied', displayName: 'Denied' }) })).status, 403);
    const created = await fetch(origin + '/api/workspaces', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Team', displayName: 'Alex', registrationKey: 'test-registration-secret' }) });
    assert.equal(created.status, 201); const owner = await created.json(), client = new StudioClient(origin, owner.token);
    const project = await client.json('/api/projects', 'POST', { name: 'Versioned project' }), route = '/api/projects/' + project.id;
    const first = { files: [{ path: 'index.html', content: 'one' }, { path: 'style.css', content: 'style' }], expectedVersion: 0, message: 'First commit', metadata: { skill: 'landing-page' } };
    assert.equal((await client.json(route + '/commit', 'POST', first)).version, 1);
    await assert.rejects(client.json(route + '/commit', 'POST', { ...first, expectedVersion: 1, deletedPaths: ['missing'] }), /404/);
    assert.equal((await client.json(route)).version, 1);
    await assert.rejects(client.json(route + '/commit', 'POST', { ...first, files: [{ path: 'a', content: 'x' }, { path: 'a-b', content: 'x' }, { path: 'a/b', content: 'x' }], expectedVersion: 1 }), /409/);
    const share = await client.json(route + '/shares', 'POST', { version: 1, hours: 1 });
    await client.json(route + '/commit', 'POST', { files: [{ path: 'index.html', content: 'two' }], deletedPaths: ['style.css'], expectedVersion: 1, message: 'Second commit' });
    const publicRead = () => fetch(origin + '/api/share', { headers: { Authorization: 'Share ' + share.token } });
    const shared = await (await publicRead()).json();
    assert.equal(shared.version, 1); assert.equal(shared.files.length, 2); assert.equal(Buffer.from(shared.files[0].content, 'base64').toString(), 'one');
    assert.deepEqual(shared.metadata, first.metadata);
    assert.equal((await client.json(route + '/restore', 'POST', { version: 1, expectedVersion: 2 })).version, 3);
    assert.deepEqual((await client.json(route + '/history')).revisions.map((r: { version: number }) => r.version), [3, 2, 1, 0]);
    assert.equal((await client.json(route + '/snapshot?version=2')).files.length, 1);
    const invitation = await client.json('/api/invites', 'POST', {});
    const member = store.join(invitation.invite, 'Sam'), identity = store.identity(member.token);
    const second = new StudioClient(origin, member.token);
    await assert.rejects(second.json(route + '/shares', 'POST', { version: 3 }), /403/);
    store.heartbeat(identity, project.id, randomUUID(), 'index.html', 100000);
    assert.equal(store.present(identity, project.id, 100001).length, 1);
    assert.equal(store.present(identity, project.id, 160001).length, 0);
    await second.json(route + '/presence', 'PUT', { clientId: randomUUID(), filePath: 'index.html' });
    assert.equal((await client.json(route + '/presence')).members[0].displayName, 'Sam');
    const recovery = await second.json('/api/key/recovery', 'POST', {});
    const rotated = await second.json('/api/key/rotate', 'POST', {});
    await assert.rejects(second.json('/api/workspace'), /401/);
    const recover = () => fetch(origin + '/api/recover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(recovery) });
    const recovered = await (await recover()).json(); assert.ok(recovered.token);
    assert.equal((await recover()).status, 401);
    await assert.rejects(new StudioClient(origin, rotated.token).json('/api/workspace'), /401/);
    await client.json('/api/members/' + member.memberId, 'DELETE');
    await assert.rejects(new StudioClient(origin, recovered.token).json('/api/workspace'), /401/);
    assert.deepEqual((await client.json(route + '/presence')).members, []);
    await client.json(route + '/shares/' + share.id, 'DELETE'); assert.equal((await publicRead()).status, 404);
    const other = store.createWorkspace('Other', 'Other');
    await assert.rejects(new StudioClient(origin, other.token).json(route + '/snapshot?version=1'), /404/);
    assert.ok(!JSON.stringify(db.prepare('SELECT * FROM recovery').all()).includes(recovery.recoveryKey));
    assert.ok(!JSON.stringify(db.prepare('SELECT * FROM shares').all()).includes(share.token));
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); db.close(); }
});

test('Sync merges independent edits, rejects concurrent same-file changes and retains deleted local backups', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'eidova-sync-'));
  const db = new DatabaseSync(':memory:'), store = new StudioStore(db), owner = store.createWorkspace('Sync', 'Owner');
  const project = store.createProject(store.identity(owner.token), 'Synchronized project');
  const server = createStudioBackend(store).listen(0, '127.0.0.1'); await once(server, 'listening');
  const client = new StudioClient('http://127.0.0.1:' + (server.address() as { port: number }).port, owner.token);
  const a = join(directory, 'alice'), b = join(directory, 'bob'); await mkdir(a); await mkdir(b);
  const sync = (folder: string) => syncStudioProject(client, { directory: folder, projectId: project.id, paths: ['index.html', 'style.css'] });
  try {
    await writeFile(join(a, 'index.html'), 'first'); await writeFile(join(a, 'style.css'), 'first style');
    assert.equal((await sync(a)).uploaded, 2); assert.equal((await sync(b)).downloaded, 2);
    await writeFile(join(a, 'index.html'), 'Alice edits'); await sync(a);
    await writeFile(join(b, 'style.css'), 'Bob edits');
    const merged = await sync(b); assert.equal(merged.status, 'synced'); assert.equal(merged.uploaded, 1); assert.equal(merged.downloaded, 1);
    assert.equal(await readFile(join(b, 'index.html'), 'utf8'), 'Alice edits');
    assert.equal(await readFile(join(b, merged.backups![0]), 'utf8'), 'first');
    await sync(a);
    await writeFile(join(a, 'index.html'), 'Alice concurrent'); await writeFile(join(b, 'index.html'), 'Bob concurrent');
    await sync(a); const conflicted = await sync(b); assert.equal(conflicted.status, 'conflict'); assert.deepEqual(conflicted.conflicts, ['index.html']);
    assert.equal(await readFile(join(b, 'index.html'), 'utf8'), 'Bob concurrent');
    await writeFile(join(b, 'index.html'), 'Alice concurrent'); await sync(b);
    await unlink(join(a, 'style.css')); await sync(a); const deleted = await sync(b);
    await assert.rejects(readFile(join(b, 'style.css')), /ENOENT/);
    assert.equal(await readFile(join(b, deleted.backups![0]), 'utf8'), 'Bob edits');
    const savedState = await readFile(join(a, '.eidova-sync/state.json'), 'utf8'); assert.ok(!savedState.includes(owner.token));
    await assert.rejects(syncStudioProject(client, { directory: a, projectId: project.id, paths: ['another-file'] }), /different backend, project, or file set/);
    await writeFile(join(a, '.eidova-sync/lock'), 'another writer'); await assert.rejects(sync(a), /Another sync is active/); await unlink(join(a, '.eidova-sync/lock'));
    // Existing stores migrate current bytes once, without inventing earlier versions.
    db.exec('PRAGMA foreign_keys=OFF; DELETE FROM file_revisions; DELETE FROM revisions; PRAGMA user_version=0;');
    const migrated = new StudioStore(db), snapshot = migrated.snapshot(migrated.identity(owner.token), project.id);
    assert.equal(snapshot.files[0].content, Buffer.from('Alice concurrent').toString('base64'));
    assert.equal(migrated.history(migrated.identity(owner.token), project.id, 999).length, 1);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve())); db.close();
    assert.ok(directory.startsWith(join(tmpdir(), 'eidova-sync-'))); await rm(directory, { recursive: true, force: true });
  }
});

test('Rate limits fail explicitly without creating extra workspaces', async () => {
  const db = new DatabaseSync(':memory:');
  const server = createStudioBackend(new StudioStore(db), [], { requestsPerMinute: 1 }).listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const origin = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
    assert.equal((await fetch(origin + '/health')).status, 200);
    const denied = await fetch(origin + '/health'); assert.equal(denied.status, 429); assert.ok(denied.headers.get('retry-after'));
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); db.close(); }
});
