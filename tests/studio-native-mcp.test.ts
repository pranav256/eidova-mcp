import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema,
  ToolListChangedNotificationSchema, type Tool } from '@modelcontextprotocol/sdk/types.js';
import { createStudioMcpBridge, nativeStudioTransport } from '../src/studio-native-mcp.js';
import { createServer } from '../src/mcp.js';
import { LocalFileStore } from '../src/store.js';

const nativeTool: Tool = { name: 'get_project', description: 'Native project reader', inputSchema: {
  type: 'object', properties: { project: { type: 'string', minLength: 1 }, options: { oneOf: [{ const: 'a' }, { const: 'b' }] } },
  required: ['project'], additionalProperties: false,
}, annotations: { readOnlyHint: true }, _meta: { ui: { resourceUri: 'ui://open-design/brief' } } };

function fixture() {
  const design = new McpServer({ name: 'design', version: '1' });
  design.registerTool('design-tool', {}, async () => ({ content: [{ type: 'text', text: 'design' }] }));
  design.registerResource('design', 'design://workflow/v1', {}, async uri => ({ contents: [{ uri: uri.href, text: 'workflow' }] }));
  design.registerResource('preview', 'ui://widget/ds-preview-v12.html', {}, async uri => ({ contents: [{ uri: uri.href, text: 'design preview' }] }));
  design.registerPrompt('review-form', {}, async () => ({ messages: [{ role: 'user', content: { type: 'text', text: 'Review form' } }] }));
  const native = new Server({ name: 'native', version: '1' }, { capabilities: { tools: { listChanged: true }, resources: {} } });
  let catalog: Tool[] = [nativeTool, { name: 'start_run', inputSchema: { type: 'object' } }];
  let calls = 0;
  native.setRequestHandler(ListToolsRequestSchema, async req => req.params?.cursor === 'second'
    ? { tools: catalog.slice(1) } : { tools: catalog.slice(0, 1), nextCursor: 'second' });
  native.setRequestHandler(CallToolRequestSchema, async req => { calls++; return {
    content: [{ type: 'text', text: JSON.stringify(req.params.arguments) }], structuredContent: { forwarded: req.params.arguments },
    _meta: { retained: true },
  }; });
  native.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [
    { uri: 'ui://open-design/brief', name: 'brief', mimeType: 'text/html;profile=mcp-app', _meta: { ui: { prefersBorder: true } } },
  ] }));
  native.setRequestHandler(ReadResourceRequestSchema, async req => ({ contents: [{ uri: req.params.uri, text: '<p>Native brief</p>', _meta: { version: '1' } }] }));
  return { design, native, calls: () => calls, setCatalog: (value: Tool[]) => { catalog = value; } };
}

async function connect(value: ReturnType<typeof fixture>) {
  const [nativeClientTransport, nativeServerTransport] = InMemoryTransport.createLinkedPair();
  await value.native.connect(nativeServerTransport);
  const bridge = await createStudioMcpBridge(value.design, nativeClientTransport);
  const client = new Client({ name: 'host', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await bridge.server.connect(b); await client.connect(a);
  return { client, bridge, close: async () => { await client.close(); await bridge.close(); await value.native.close(); } };
}

test('combined MCP preserves native schemas, App metadata, resources, prompts and paginated discovery', async () => {
  const value = fixture(), session = await connect(value);
  try {
    const tools = (await session.client.listTools()).tools;
    assert.equal(tools.length, 3); assert.deepEqual(tools.find(tool => tool.name === nativeTool.name), nativeTool);
    const result = await session.client.callTool({ name: 'get_project', arguments: { project: 'native-project', options: 'a' } });
    assert.deepEqual(result.structuredContent, { forwarded: { project: 'native-project', options: 'a' } });
    assert.deepEqual(result._meta, { retained: true });
    assert.equal((await session.client.callTool({ name: 'design-tool' })).isError, undefined);
    const resources = (await session.client.listResources()).resources;
    assert.equal(resources.length, 3); assert.deepEqual(resources.find(resource => resource.uri === 'ui://open-design/brief')!._meta, { ui: { prefersBorder: true } });
    const designContent = (await session.client.readResource({ uri: 'design://workflow/v1' })).contents[0];
    const nativeContent = (await session.client.readResource({ uri: 'od://focus/active' })).contents[0];
    assert.ok('text' in designContent); assert.equal(designContent.text, 'workflow');
    assert.ok('text' in nativeContent); assert.equal(nativeContent.text, '<p>Native brief</p>');
    const previewContent = (await session.client.readResource({ uri: 'ui://widget/ds-preview-v12.html' })).contents[0];
    assert.ok('text' in previewContent); assert.equal(previewContent.text, 'design preview');
    assert.deepEqual((await session.client.readResource({ uri: 'ui://open-design/brief' })).contents[0]._meta, { version: '1' });
    await assert.rejects(session.client.readResource({ uri: 'file:///private' }), /Unsupported Studio/);
    assert.equal((await session.client.listPrompts()).prompts[0].name, 'review-form');
    assert.equal((await session.client.getPrompt({ name: 'review-form' })).messages[0].content.type, 'text');
    assert.deepEqual((await session.client.listResourceTemplates()).resourceTemplates, []);
  } finally { await session.close(); }
});

test('combined MCP retains the actual Eidova core catalog and preview widget resources', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'eidova-native-'));
  const value = fixture(); await value.design.close();
  value.design = createServer(new LocalFileStore(directory), undefined, undefined, 'core');
  const session = await connect(value);
  try {
    assert.equal((await session.client.listTools()).tools.length, 15);
    const resources = (await session.client.listResources()).resources;
    const widget = resources.find(resource => resource.uri.startsWith('ui://widget/'));
    assert.ok(widget); assert.ok((await session.client.readResource({ uri: widget.uri })).contents.length);
    assert.ok((await session.client.listResourceTemplates()).resourceTemplates.length);
    assert.equal((await session.client.listPrompts()).prompts.length, 3);
    const design = await session.client.callTool({ name: 'find-design-system', arguments: { query: 'minimal light' } });
    assert.ok(!design.isError);
  } finally {
    await session.close();
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('eidova-native-'));
    await rm(directory, { recursive: true, force: true });
  }
});

test('native mutations are never replayed and cloud/default generation is refused', async () => {
  const value = fixture(), session = await connect(value);
  try {
    for (const agent of [undefined, '', ' ', 'amr', ' AMR ', 'vela']) {
      assert.equal((await session.client.callTool({ name: 'start_run', arguments: { ...(agent === undefined ? {} : { agent }) } })).isError, true);
    }
    assert.equal(value.calls(), 0);
    assert.equal((await session.client.callTool({ name: 'start_run', arguments: { agent: 'codex', requestId: 'same-request' } })).isError, undefined);
    assert.equal(value.calls(), 1);
    let failedCalls = 0;
    value.native.setRequestHandler(CallToolRequestSchema, async () => { failedCalls++; throw new Error('Response lost after write'); });
    await assert.rejects(session.client.callTool({ name: 'start_run', arguments: { agent: 'codex' } }), /Response lost after write/);
    assert.equal(failedCalls, 1);
  } finally { await session.close(); }
});

test('MCP progress and request cancellation reach the native adapter', async () => {
  const value = fixture();
  let entered!: () => void, canceled!: () => void;
  const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
  const canceledPromise = new Promise<void>(resolve => { canceled = resolve; });
  value.native.setRequestHandler(CallToolRequestSchema, async (_req, extra) => {
    await extra.sendNotification({ method: 'notifications/progress', params: { progressToken: extra._meta!.progressToken!, progress: 1, total: 2 } });
    entered();
    await new Promise<void>(resolve => extra.signal.addEventListener('abort', () => { canceled(); resolve(); }, { once: true }));
    return { content: [] };
  });
  const session = await connect(value), controller = new AbortController();
  const progress: number[] = [];
  try {
    const result = session.client.callTool({ name: 'get_project', arguments: { project: 'project' } }, undefined, {
      signal: controller.signal, onprogress: event => progress.push(event.progress),
    });
    await enteredPromise; controller.abort();
    await assert.rejects(result);
    await Promise.race([canceledPromise, new Promise((_, reject) => setTimeout(() => reject(new Error('Native request was not canceled')), 1500).unref())]);
    assert.deepEqual(progress, [1]);
  } finally { await session.close(); }
});

test('native list changes refresh routing and duplicate tool names fail closed', async () => {
  const value = fixture(), session = await connect(value);
  try {
    let changed!: () => void;
    const notification = new Promise<void>(resolve => { changed = resolve; });
    session.client.setNotificationHandler(ToolListChangedNotificationSchema, () => changed());
    value.setCatalog([{ ...nativeTool, name: 'new_native_tool' }]);
    await value.native.sendToolListChanged(); await notification;
    await session.client.callTool({ name: 'new_native_tool', arguments: { project: 'project' } });
    await assert.rejects(session.client.callTool({ name: 'get_project', arguments: { project: 'project' } }), /Unknown MCP tool/);
    value.setCatalog([{ ...nativeTool, name: 'design-tool' }]);
    await assert.rejects(session.client.listTools(), /Duplicate MCP tool name/);
  } finally { await session.close(); }
  const collision = fixture(); collision.setCatalog([{ ...nativeTool, name: 'design-tool' }]);
  const [a, b] = InMemoryTransport.createLinkedPair(); await collision.native.connect(b);
  await assert.rejects(createStudioMcpBridge(collision.design, a), /Duplicate MCP tool name/);
  assert.equal(collision.design.isConnected(), false);
});

test('repeating native pagination is rejected before advertising an incomplete catalog', async () => {
  const value = fixture(), [a, b] = InMemoryTransport.createLinkedPair();
  value.native.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [nativeTool], nextCursor: 'repeat' }));
  await value.native.connect(b);
  await assert.rejects(createStudioMcpBridge(value.design, a), /repeating MCP catalog/);
});

test('native launch is loopback-only, excludes parent credentials, and closes its child', async () => {
  const entry = fileURLToPath(new URL('./fixtures/native-studio.mjs', import.meta.url));
  await assert.rejects(nativeStudioTransport({}), /EIDOVA_NATIVE_STUDIO_ENTRY/);
  await assert.rejects(nativeStudioTransport({ EIDOVA_NATIVE_STUDIO_ENTRY: './relative.js' }), /absolute path/);
  for (const url of ['https://example.com', 'http://192.168.1.2:7456', 'http://localhost/api', 'http://key@localhost', 'http://localhost?key=secret', 'http://localhost#fragment']) {
    await assert.rejects(nativeStudioTransport({ EIDOVA_NATIVE_STUDIO_ENTRY: entry, EIDOVA_NATIVE_STUDIO_URL: url }), /loopback origin/);
  }
  const previous = process.env.EIDOVA_STUDIO_KEY;
  process.env.EIDOVA_STUDIO_KEY = 'secret-must-not-leave-parent';
  const nativeTransport = await nativeStudioTransport({ EIDOVA_NATIVE_STUDIO_ENTRY: entry });
  const design = fixture().design;
  let bridge: Awaited<ReturnType<typeof createStudioMcpBridge>> | undefined;
  try {
    bridge = await createStudioMcpBridge(design, nativeTransport);
    const client = new Client({ name: 'child-test', version: '1' }), [a, b] = InMemoryTransport.createLinkedPair();
    await bridge.server.connect(b); await client.connect(a);
    const result = await client.callTool({ name: 'native_probe' });
    assert.deepEqual(JSON.parse((result.content as { text: string }[])[0].text), { credentialInherited: false, args: ['mcp', '--daemon-url', 'http://127.0.0.1:7456'] });
    assert.ok(nativeTransport.pid);
    await client.close(); await bridge.close();
    assert.equal(nativeTransport.pid, null);
  } finally {
    await bridge?.close(); await nativeTransport.close();
    if (previous === undefined) delete process.env.EIDOVA_STUDIO_KEY; else process.env.EIDOVA_STUDIO_KEY = previous;
  }
});

test('combined stdio exits on host EOF without requiring a termination signal', { timeout: 15000 }, async () => {
  const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('../src/stdio.ts', import.meta.url)), '--profile', 'core', '--native-studio'], {
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, EIDOVA_NATIVE_STUDIO_ENTRY: fileURLToPath(new URL('./fixtures/native-studio.mjs', import.meta.url)) },
  });
  const lines = createInterface({ input: child.stdout });
  const exited = once(child, 'exit');
  let errors = ''; child.stderr.on('data', chunk => { errors += chunk; });
  const timer = setTimeout(() => child.kill(), 10000);
  try {
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'eof-test', version: '1' },
    } }) + '\n');
    const response = JSON.parse((await once(lines, 'line'))[0]);
    assert.equal(response.id, 1); assert.ok(response.result, errors);
    child.stdin.end();
    const [code, signal] = await exited;
    assert.equal(signal, null, errors); assert.equal(code, 0, errors);
  } finally { clearTimeout(timer); lines.close(); if (child.exitCode === null && child.signalCode === null) child.kill(); }
});
