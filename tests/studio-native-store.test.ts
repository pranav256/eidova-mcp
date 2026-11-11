import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { once } from 'node:events';
import { StudioStore } from '../src/studio-store.js';
import { StudioNativeStore } from '../src/studio-native-store.js';
import { createStudioBackend } from '../src/studio-backend.js';

test('native projects remain private until published and retain creator-only editing through every file API', async () => {
  const db = new DatabaseSync(':memory:'), store = new StudioStore(db), native = new StudioNativeStore(store);
  const workspace = store.createWorkspace('Native work', 'Workspace owner'), owner = store.identity(workspace.token);
  const creatorKey = store.join(store.invite(owner).invite, 'Creator'), creator = store.identity(creatorKey.token);
  const viewerKey = store.join(store.invite(owner).invite, 'Viewer'), viewer = store.identity(viewerKey.token);
  const registered = native.ensure(creator, 'landing-page', 'Landing page');
  assert.deepEqual(native.ensure(creator, 'landing-page', 'Ignored name'), registered);
  assert.throws(() => native.ensure(viewer, 'landing-page', 'Overwrite'), /belongs to another member/);
  assert.equal(native.list(viewer).length, 0); assert.equal(store.workspace(viewer).projects.length, 0);
  for (const identity of [owner, viewer]) {
    assert.throws(() => store.project(identity, registered.resourceId), /not found/);
    assert.throws(() => store.snapshot(identity, registered.resourceId), /not found/);
  }
  assert.throws(() => native.policy(creator, registered.projectId, 'team', 0), /Publish project content/);
  store.commit(creator, registered.resourceId, [{ path: 'index.html', bytes: Buffer.from('<h1>Team design</h1>') }], [], 0, 'Publish');
  const shared = native.policy(creator, registered.projectId, 'team', 0); assert.equal(shared.policyVersion, 1);
  assert.equal(store.readFile(viewer, registered.resourceId, 'index.html').bytes.toString(), '<h1>Team design</h1>');
  assert.equal(native.list(viewer)[0]!.access.canEdit, false);
  for (const identity of [owner, viewer]) {
    assert.throws(() => store.writeFile(identity, registered.resourceId, 'index.html', Buffer.from('Stolen edit'), 1), /creator can edit/);
    assert.throws(() => store.restore(identity, registered.resourceId, 0, 1), /creator can edit/);
    assert.throws(() => native.metadata(identity, registered.projectId, 'Stolen name', {}, 1), /creator/);
    assert.throws(() => native.policy(identity, registered.projectId, 'private', 1), /creator/);
    assert.throws(() => store.share(identity, registered.resourceId, 1, 1), /creator/);
  }
  const feedback = store.comment(viewer, registered.resourceId, 'Adjust heading', 'index.html');
  store.resolveComment(creator, registered.resourceId, feedback.id, true);
  const link = store.share(creator, registered.resourceId, 1, 1); assert.equal(store.sharedSnapshot(link.token).version, 1);
  store.heartbeat(viewer, registered.resourceId, 'view-session', 'index.html');
  native.policy(creator, registered.projectId, 'private', 1);
  assert.throws(() => store.sharedSnapshot(link.token), /unavailable/);
  assert.throws(() => store.comments(viewer, registered.resourceId), /not found/);
  assert.equal(store.present(creator, registered.resourceId).length, 0);
  assert.throws(() => native.policy(creator, registered.projectId, 'team', 1), /sharing changed/);
  const metadata = native.metadata(creator, registered.projectId, 'Renamed', { kind: 'prototype', updatedAt: 42 }, 1);
  assert.equal(metadata.version, 2); assert.equal(metadata.name, 'Renamed');
  assert.throws(() => native.metadata(creator, registered.projectId, 'Lost rename', { large: 'x'.repeat(65537) }, 2), /64 KiB/);
  assert.equal(native.registration(creator, registered.projectId).name, 'Renamed');
  native.remove(creator, registered.projectId, 2);
  assert.equal(native.list(creator).length, 0); assert.equal(store.workspace(creator).projects.length, 0);
  assert.throws(() => store.snapshot(creator, registered.resourceId), /not found/);
  assert.throws(() => native.ensure(creator, registered.projectId, 'Resurrected'), /was deleted/);
  db.close();
});

test('native catalog HTTP routes enforce scope, policy versions and metadata transactions', async () => {
  const db = new DatabaseSync(':memory:'), store = new StudioStore(db);
  const workspace = store.createWorkspace('Catalog', 'Owner'), identity = store.identity(workspace.token);
  const member = store.join(store.invite(identity).invite, 'Member');
  const other = store.createWorkspace('Other', 'Other');
  const server = createStudioBackend(store).listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const call = (path: string, key = workspace.token, method = 'GET', body?: unknown) => fetch(url + path, {
    method, headers: { Authorization: 'Bearer ' + key, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  try {
    const result = await call('/api/native/projects', workspace.token, 'POST', { projectId: 'native-1', name: 'Native' }); assert.equal(result.status, 201);
    const registration = await result.json();
    assert.equal((await call('/api/native/projects/native-1', member.token)).status, 404);
    assert.equal((await call('/api/native/projects/native-1', other.token)).status, 404);
    assert.equal((await call('/api/native/projects', workspace.token, 'POST', { projectId: '../secret', name: 'Invalid' })).status, 400);
    assert.equal((await call('/api/native/projects/native-1/visibility', workspace.token, 'PUT', { visibility: 'team', expectedPolicyVersion: 0 })).status, 409);
    assert.equal((await call('/api/projects/' + registration.resourceId + '/file', workspace.token, 'PUT', { path: 'index.html', content: 'Native bytes', expectedVersion: 0 })).status, 200);
    assert.equal((await call('/api/native/projects/native-1/visibility', workspace.token, 'PUT', { visibility: 'team', expectedPolicyVersion: 0 })).status, 200);
    assert.equal((await (await call('/api/native/projects', member.token)).json()).projects.length, 1);
    assert.equal((await call('/api/native/projects/native-1', member.token, 'PATCH', { metadata: {}, expectedVersion: 1 })).status, 403);
    assert.equal((await call('/api/projects/' + registration.resourceId + '/commit', member.token, 'POST', { files: [], expectedVersion: 1, message: 'Viewer write' })).status, 403);
    assert.equal((await call('/api/native/projects/native-1', workspace.token, 'PATCH', { name: 'Updated', metadata: { skillId: 'web' }, expectedVersion: 1 })).status, 200);
    assert.equal((await call('/api/native/projects/native-1', workspace.token, 'PATCH', { name: 'Stale', metadata: {}, expectedVersion: 1 })).status, 409);
    assert.equal((await call('/api/native/projects/native-1', workspace.token, 'DELETE', { expectedPolicyVersion: 1 })).status, 204);
    assert.equal((await call('/api/projects/' + registration.resourceId + '/files', member.token)).status, 404);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); db.close(); }
});
