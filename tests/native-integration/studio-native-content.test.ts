import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { StudioStore } from '../../src/studio-store.js';
import { createStudioBackend } from '../../src/studio-backend.js';
const { createEidovaWorkspaceAuthority } = await import(new URL('../../../eidova-studio/apps/daemon/src/collab/eidova-workspace-context.ts', import.meta.url).href);
const { createEidovaProjectCatalog, eidovaSharedMetadata, parseEidovaRegistration } = await import(new URL('../../../eidova-studio/apps/daemon/src/collab/eidova-project-catalog.ts', import.meta.url).href);
const { createEidovaProjectContent, parseEidovaContentSnapshot, readEidovaProjectContent, validateEidovaContentPath } = await import(new URL('../../../eidova-studio/apps/daemon/src/collab/eidova-project-content.ts', import.meta.url).href);

test('real native catalog and journaled content sync protect private files, revisions, cross-device edits and membership', async () => {
  const db = new DatabaseSync(':memory:'), store = new StudioStore(db), workspace = store.createWorkspace('Design studio', 'Owner');
  const owner = store.identity(workspace.token), joined = store.join(store.invite(owner).invite, 'Reviewer'), viewer = store.identity(joined.token);
  const server = createStudioBackend(store).listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const root = await mkdtemp(path.join(tmpdir(), 'native-content-'));
  const principal = (identity: typeof owner) => ({ teamId: identity.workspaceId, memberId: identity.memberId, role: identity.role, lifecycleState: 'active' as const, workspaceType: 'team' as const });
  const authority = createEidovaWorkspaceAuthority({ url, key: workspace.token }), catalog = createEidovaProjectCatalog(authority);
  const reviewerAuthority = createEidovaWorkspaceAuthority({ url, key: joined.token }), reviewerCatalog = createEidovaProjectCatalog(reviewerAuthority);
  const device = (name: string, auth = authority) => createEidovaProjectContent({ authority: auth, stateDir: path.join(root, name + '-state'),
    resolveProjectDir: () => path.join(root, name), resolvePullDir: () => path.join(root, name),
    describeProject: () => ({ skillId: 'website', metadata: { baseDir: 'private-folder', apiKey: 'private-key', title: 'Product launch' } }),
    durability: { syncDirectory: async () => {} },
  });
  const first = device('owner'), second = device('second'), review = device('reviewer', reviewerAuthority);
  const input = { projectId: 'launch', principal: principal(owner), reason: 'save' };
  try {
    await mkdir(path.join(root, 'owner')); await writeFile(path.join(root, 'owner', 'index.html'), '<h1>Launch</h1>');
    await writeFile(path.join(root, 'owner', '.ENV.local'), 'MODEL_KEY=private');
    await mkdir(path.join(root, 'owner', 'node_modules')); await writeFile(path.join(root, 'owner', 'node_modules', 'generated'), 'private');
    const published = await first.adapter.publish(input); assert.equal(published?.version, 1);
    const registration = await catalog.getRegistration('launch', principal(owner)); assert.ok(registration);
    assert.deepEqual(store.files(owner, registration.resourceId).map(file => file.path), ['index.html']);
    assert.deepEqual((await reviewerCatalog.list(owner.workspaceId)), []);
    await catalog.setVisibility('launch', 'team', principal(owner));
    const listed = await reviewerCatalog.list(owner.workspaceId); assert.equal(listed[0]?.name, 'launch');
    assert.equal(listed[0]?.metadata.title, 'Product launch');
    assert.deepEqual(listed[0]?.metadata._commentFiles.files, []);
    const pulled = await review.adapter.pull({ projectId: 'launch', principal: principal(viewer) }); assert.equal(pulled?.resourceId, registration.resourceId);
    assert.equal(await readFile(path.join(root, 'reviewer', 'index.html'), 'utf8'), '<h1>Launch</h1>');
    await second.adapter.pull(input);
    await writeFile(path.join(root, 'second', '.env'), 'keep local credentials');
    await writeFile(path.join(root, 'owner', 'index.html'), '<h1>Updated</h1>');
    assert.equal((await first.adapter.publish(input))?.version, 2);
    await writeFile(path.join(root, 'second', 'index.html'), '<h1>Other device edits</h1>');
    await assert.rejects(second.adapter.publish(input), /Remote project changed/);
    await assert.rejects(second.adapter.pull(input), /Local work conflicts/);
    assert.equal(store.readFile(owner, registration.resourceId, 'index.html').bytes.toString(), '<h1>Updated</h1>');
    await writeFile(path.join(root, 'second', 'index.html'), '<h1>Launch</h1>');
    await second.adapter.pull(input);
    assert.equal(await readFile(path.join(root, 'second', '.env'), 'utf8'), 'keep local credentials');
    assert.equal(await readFile(path.join(root, 'second', 'index.html'), 'utf8'), '<h1>Updated</h1>');
    await catalog.upsert({ projectId: 'launch', displayName: 'New launch' }, principal(owner));
    assert.deepEqual(store.snapshot(owner, registration.resourceId).metadata.metadata, { title: 'Product launch' });
    assert.equal((await catalog.getRegistration('launch', principal(owner)))?.name, 'New launch');
    await assert.rejects(review.adapter.publish({ ...input, principal: principal(viewer) }), /failed \(409\)/);
    await catalog.setVisibility('launch', 'private', principal(owner));
    assert.equal(await review.adapter.pull({ projectId: 'launch', principal: principal(viewer) }), null);
    assert.equal(await readFile(path.join(root, 'reviewer', 'index.html'), 'utf8'), '<h1>Launch</h1>');
    store.revoke(owner, viewer.memberId);
    await assert.rejects(review.adapter.syncLatest!({ projectId: 'launch', principal: principal(viewer) }), /workspace_not_authorized/);
    await second.recover(root);
    assert.equal(JSON.stringify(await readEidovaProjectContent(path.join(root, 'owner'))).includes('MODEL_KEY'), false);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); db.close(); await rm(root, { recursive: true }); }
});

test('native snapshots reject private paths, path collisions, malformed bytes, wrong hashes and mismatched versions', () => {
  for (const name of ['../keys', '/absolute', '.env', '.ENV.production', 'nested/.ssh/id', 'NUL.txt', 'x\\y', 'a/./b', '.eidova-sync/state.json']) assert.throws(() => validateEidovaContentPath(name));
  const content = Buffer.from('safe'), file = { path: 'index.html', content: content.toString('base64'), encoding: 'base64', sha256: createHash('sha256').update(content).digest('hex') };
  const snapshot = { projectId: 'resource', version: 3, files: [file] };
  assert.equal(parseEidovaContentSnapshot(snapshot, 'resource', 3).files.length, 1);
  for (const files of [[{ ...file, content: 'invalid%' }], [{ ...file, sha256: '0'.repeat(64) }], [file, { ...file, path: 'INDEX.HTML' }], [{ ...file, path: 'index.html/a' }, file]]) assert.throws(() => parseEidovaContentSnapshot({ ...snapshot, files }, 'resource', 3));
  assert.throws(() => parseEidovaContentSnapshot(snapshot, 'other', 3));
  assert.throws(() => parseEidovaContentSnapshot(snapshot, 'resource', 4));
});

test('native registration and metadata do not import endpoints, credentials or local paths', () => {
  const uuid = '11111111-1111-4111-8111-111111111111';
  const registration = { workspaceId: uuid, resourceId: uuid, ownerMemberId: uuid, projectId: 'launch', name: 'Launch', createdAt: new Date().toISOString(), updatedAt: Date.now(), version: 0, policyVersion: 0, visibility: 'private' };
  assert.equal(parseEidovaRegistration(registration).projectId, 'launch');
  for (const change of [{ resourceId: '../other' }, { ownerMemberId: 'owner' }, { workspaceId: 'workspace' }, { projectId: '../launch' }, { name: ' ' }]) assert.throws(() => parseEidovaRegistration({ ...registration, ...change }));
  assert.deepEqual(eidovaSharedMetadata({ name: 'Launch', metadata: { title: 'Design', apiKey: 'model', accessKey: 'workspace', token: 'session', customSecret: 'secret', baseDir: 'private', env: { PATH: 'private' }, nested: [{ refreshToken: 'private', width: 390 }] } }),
    { name: 'Launch', metadata: { title: 'Design', nested: [{ width: 390 }] } });
});
