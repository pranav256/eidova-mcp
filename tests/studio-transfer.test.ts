import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StudioStore } from '../src/studio-store.js';
import { createStudioBackend } from '../src/studio-backend.js';
import { StudioClient } from '../src/studio-client.js';
import { transferStudioFile } from '../src/studio-transfer.js';

test('Explicit transfers round-trip binary files without overwriting local or newer team work', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'eidova-transfer-'));
  const db = new DatabaseSync(':memory:'), store = new StudioStore(db);
  const owner = store.createWorkspace('Studio transfer', 'Owner');
  const project = store.createProject(store.identity(owner.token), 'Native project');
  const server = createStudioBackend(store).listen(0, '127.0.0.1'); await once(server, 'listening');
  const client = new StudioClient('http://127.0.0.1:' + (server.address() as { port: number }).port, owner.token);
  const source = join(directory, 'source'), target = join(directory, 'download');
  const bytes = Buffer.from([0, 255, 128, 7, 9]);
  try {
    await mkdir(join(source, 'assets'), { recursive: true }); await mkdir(target);
    await writeFile(join(source, 'assets/image.bin'), bytes);
    const input = { directory: source, projectId: project.id, path: 'assets/image.bin', expectedVersion: 0 };
    assert.equal((await transferStudioFile(client, { ...input, direction: 'upload' })).version, 1);
    await assert.rejects(transferStudioFile(client, { ...input, direction: 'upload' }), /409/);
    await assert.rejects(transferStudioFile(client, { ...input, direction: 'upload', expectedVersion: undefined }), /expected project version/);
    await transferStudioFile(client, { ...input, direction: 'download', directory: target });
    assert.deepEqual(await readFile(join(target, input.path)), bytes);
    await writeFile(join(target, input.path), 'unsaved local edits');
    await assert.rejects(transferStudioFile(client, { ...input, direction: 'download', directory: target }), /already exists/);
    assert.equal(await readFile(join(target, input.path), 'utf8'), 'unsaved local edits');
    await assert.rejects(transferStudioFile(client, { ...input, direction: 'download', path: '../outside' }), /relative project file path/);
    await symlink(target, join(source, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(transferStudioFile(client, { ...input, direction: 'upload', path: 'linked/assets/image.bin', expectedVersion: 1 }), /links/);
    assert.equal(store.project(store.identity(owner.token), project.id).version, 1);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve())); db.close();
    assert.ok(directory.startsWith(join(tmpdir(), 'eidova-transfer-'))); await rm(directory, { recursive: true, force: true });
  }
});
