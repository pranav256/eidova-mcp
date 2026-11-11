import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { once } from 'node:events';
import { gzipSync } from 'node:zlib';
import { StudioStore } from '../src/studio-store.js';
import { StudioNativeStore } from '../src/studio-native-store.js';
import { createStudioBackend } from '../src/studio-backend.js';
import { checkStudioDatabase, copyStudioDatabase } from '../src/studio-backup.js';
import { studioBackendConfig } from '../src/studio-config.js';

test('online backup captures committed WAL history and native policy, restores a new database, and never replaces destinations', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'eidova-backup-'));
  const source = join(directory, 'live.sqlite'), output = join(directory, 'backup with spaces.sqlite'), restored = join(directory, 'restored.sqlite');
  const db = new DatabaseSync(source), store = new StudioStore(db);
  try {
    const created = store.createWorkspace('Design', 'Owner'), owner = store.identity(created.token);
    const member = store.join(store.invite(owner).invite, 'Member'), native = new StudioNativeStore(store);
    const project = native.ensure(owner, 'launch', 'Launch');
    store.writeFile(owner, project.resourceId, 'index.html', Buffer.from('<h1>First</h1>'), 0);
    native.policy(owner, 'launch', 'team', 0);
    store.writeFile(owner, project.resourceId, 'index.html', Buffer.from('<h1>Second</h1>'), 1);
    const share = store.share(owner, project.resourceId, 1, 24), recovery = store.createRecovery(owner);
    store.comment(store.identity(member.token), project.resourceId, 'Feedback', 'index.html');
    store.revoke(owner, member.memberId);
    const original = await readFile(source);
    assert.equal((await copyStudioDatabase(source, output)).schemaVersion, 3);
    assert.deepEqual(await readFile(source), original);
    assert.deepEqual(await checkStudioDatabase(output), { schemaVersion: 3, workspaces: 1, projects: 1 });
    await copyStudioDatabase(output, restored);
    const restoredDb = new DatabaseSync(restored), restoredStore = new StudioStore(restoredDb);
    try {
      const identity = restoredStore.identity(created.token);
      assert.equal(restoredStore.readFile(identity, project.resourceId, 'index.html').bytes.toString(), '<h1>Second</h1>');
      assert.equal(Buffer.from(restoredStore.sharedSnapshot(share.token).files[0].content, 'base64').toString(), '<h1>First</h1>');
      assert.equal(restoredStore.comments(identity, project.resourceId)[0].body, 'Feedback');
      assert.equal(new StudioNativeStore(restoredStore).registration(identity, 'launch').visibility, 'team');
      assert.throws(() => restoredStore.identity(member.token), /valid workspace key/);
      assert.ok(restoredStore.recover(recovery.recoveryKey).token);
    } finally { restoredDb.close(); }
    const bytes = await readFile(output);
    await assert.rejects(copyStudioDatabase(source, output), /already exists/);
    await assert.rejects(copyStudioDatabase(source, source), /already exists/);
    assert.deepEqual(await readFile(output), bytes);
    await writeFile(join(directory, 'invalid.sqlite'), 'corrupt');
    await assert.rejects(copyStudioDatabase(join(directory, 'invalid.sqlite'), join(directory, 'no-output.sqlite')));
    assert.ok(!(await readdir(directory)).some(file => file.startsWith('.eidova-backup-') || file === 'no-output.sqlite'));
    if (process.platform !== 'win32') {
      await symlink(source, join(directory, 'alias.sqlite'));
      await assert.rejects(checkStudioDatabase(join(directory, 'alias.sqlite')), /regular database file/);
    }
  } finally { db.close(); assert.equal(dirname(directory), resolve(tmpdir())); await rm(directory, { recursive: true, force: true }); }
});

test('Railway configuration consumes PORT, requires registration for public binds, and rejects ambiguous origins before touching storage', () => {
  const config = studioBackendConfig({ PORT: '8080', EIDOVA_STUDIO_HOST: '0.0.0.0', EIDOVA_STUDIO_REGISTRATION_KEY: 'a'.repeat(32), EIDOVA_STUDIO_ORIGINS: 'https://eidova.example,https://eidova.example/' });
  assert.equal(config.port, 8080); assert.deepEqual(config.origins, ['https://eidova.example']);
  assert.equal(studioBackendConfig({ PORT: '8080', EIDOVA_STUDIO_PORT: '3211' }).port, 3211);
  for (const env of [{ PORT: '0' }, { PORT: '0x20' }, { PORT: '1e3' }, { EIDOVA_STUDIO_HOST: '0.0.0.0' }, { VERCEL: '1' }, { EIDOVA_STUDIO_REGISTRATION_KEY: 'a'.repeat(257) }, ...['http://remote.example', 'https://user:pass@eidova.example', 'https://eidova.example/path', 'https://eidova.example?query=1'].map(origin => ({ EIDOVA_STUDIO_ORIGINS: origin }))]) assert.throws(() => studioBackendConfig(env));
});

test('future schemas fail before modification and private request bodies are authenticated before parsing or decompression', async () => {
  const future = new DatabaseSync(':memory:');
  future.exec('PRAGMA user_version=4; CREATE TABLE future_data(value TEXT); INSERT INTO future_data VALUES (\'preserved\');');
  assert.throws(() => new StudioStore(future), /newer server/);
  assert.equal(future.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get()!.n, 1); future.close();
  const db = new DatabaseSync(':memory:'), store = new StudioStore(db), created = store.createWorkspace('Team', 'Owner');
  const server = createStudioBackend(store).listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  try {
    for (const path of ['/api/projects', '/API/projects', '/api/projects/']) {
      assert.equal((await fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalid' })).status, 401);
    }
    assert.equal((await fetch(url + '/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + created.token }, body: '{invalid' })).status, 400);
    const compressed = await fetch(url + '/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', Authorization: 'Bearer ' + created.token }, body: gzipSync('{"name":"Compressed"}') });
    assert.equal(compressed.status, 415);
    assert.equal((await fetch(url + '/api/workspaces', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'a'.repeat(70000), displayName: 'Owner' }) })).status, 413);
    assert.equal(store.workspace(store.identity(created.token)).projects.length, 0);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); db.close(); }
});
