import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { once } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createStudioBackend } from '../src/studio-backend.js';
import { StudioStore } from '../src/studio-store.js';
import { StudioClient } from '../src/studio-client.js';
import { registerStudioTools } from '../src/studio-mcp.js';

test('Studio tools use the authenticated HTTP backend, preserve bytes and reject stale writes', async () => {
  const db = new DatabaseSync(':memory:'), store = new StudioStore(db);
  const owner = store.createWorkspace('Website and agent', 'Owner');
  const http = createStudioBackend(store).listen(0, '127.0.0.1'); await once(http, 'listening');
  const url = 'http://127.0.0.1:' + (http.address() as { port: number }).port;
  const server = new McpServer({ name: 'studio-test', version: '1' });
  registerStudioTools(server, new StudioClient(url, owner.token));
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const call = async (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args });
  const data = (r: Awaited<ReturnType<typeof call>>) => { assert.ok(!r.isError, JSON.stringify(r)); return JSON.parse((r.content as { text: string }[])[0].text); };
  try {
    await server.connect(b); await client.connect(a);
    const list = await client.listTools(); assert.equal(list.tools.length, 14);
    assert.equal(list.tools.find(tool => tool.name === 'write-studio-file')!.annotations!.destructiveHint, true);
    assert.equal(data(await call('get-studio-workspace')).id, owner.workspaceId);
    const project = data(await call('create-studio-project', { name: 'Agent project' }));
    const args = { projectId: project.id, path: 'index.html', content: '<h1>Hi 👋</h1>', expectedVersion: 0 };
    assert.equal(data(await call('write-studio-file', args)).version, 1);
    assert.equal((await call('write-studio-file', args)).isError, true);
    assert.equal((await call('write-studio-file', { ...args, path: '../secret', expectedVersion: 1 })).isError, true);
    assert.equal(data(await call('list-studio-files', { projectId: project.id })).files[0].path, 'index.html');
    let content = '', offset = 0;
    for (;;) {
      const page = data(await call('read-studio-file', { projectId: project.id, path: 'index.html', offset, limit: 2 }));
      content += page.content; if (page.nextOffset === null) break; offset = page.nextOffset;
    }
    assert.equal(content, args.content);
    assert.equal(store.readFile(store.identity(owner.token), project.id, args.path).bytes.toString(), content);
    assert.equal(data(await call('commit-studio-files', { projectId: project.id, files: [{ path: 'index.html', content: 'New revision' }], expectedVersion: 1, message: 'Update from MCP' })).version, 2);
    assert.equal(data(await call('get-studio-history', { projectId: project.id })).revisions[0].version, 2);
    assert.equal(data(await call('read-studio-file', { projectId: project.id, path: 'index.html', version: 1 })).content, args.content);
    assert.equal(data(await call('restore-studio-revision', { projectId: project.id, version: 1, expectedVersion: 2 })).version, 3);
    assert.deepEqual(data(await call('get-studio-presence', { projectId: project.id })).members, []);
    const share = data(await call('share-studio-revision', { projectId: project.id, version: 3 }));
    data(await call('revoke-studio-share', { projectId: project.id, shareId: share.id }));
    const comment = data(await call('add-studio-comment', { projectId: project.id, body: 'Ready for review.', filePath: args.path }));
    data(await call('resolve-studio-comment', { projectId: project.id, commentId: comment.id, resolved: true }));
    assert.equal(data(await call('get-studio-comments', { projectId: project.id })).comments[0].resolved, 1);
    for (const endpoint of ['http://example.com', 'https://user:password@example.com', 'https://example.com/?token=x', 'https://example.com/#x']) {
      assert.throws(() => new StudioClient(endpoint, owner.token), /HTTPS Studio URL/);
    }
    assert.throws(() => new StudioClient(url, 'wrong'), /complete workspace key/);
    const bad = new StudioClient(url, 'x'.repeat(43)); await assert.rejects(bad.json('/api/workspace'), /401/);
    const controller = new AbortController(); controller.abort(); await assert.rejects(new StudioClient(url, owner.token).json('/api/workspace', 'GET', undefined, controller.signal));
  } finally {
    await client.close(); await server.close(); await new Promise<void>(resolve => http.close(() => resolve())); db.close();
  }
});
