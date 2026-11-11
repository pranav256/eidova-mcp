import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { app } from '../src/app.js';
import { baseUrl, catalog, sourceItem, tokensCss } from '../src/catalog.js';
import { designContext } from '../src/design-context.js';
import { createServer } from '../src/mcp.js';
import { LocalFileStore } from '../src/store.js';

test('every catalog handoff preserves exact identity, tokens, source hash and source-only limits', async () => {
  for (const system of await catalog()) {
    const markdown = await designContext(system.id);
    assert.ok(markdown);
    assert.equal(markdown, await designContext(system.id));
    assert.ok(markdown.includes(`Exact catalog ID: \`${system.id}\``));
    assert.ok(markdown.includes(system.family.useCases.join('; ')));
    assert.ok(markdown.includes(system.family.tradeoff));
    assert.ok(markdown.includes(createHash('sha256').update(await tokensCss(system.id)).digest('hex')));
    const globals = await sourceItem(system.id, 'globals');
    for (const [scope, values] of Object.entries(globals.cssVars ?? {})) {
      assert.ok(markdown.includes(`Registry scope: \`cssVars.${scope}\``));
      for (const [name, value] of Object.entries(values)) {
        assert.ok(markdown.includes(`${name.startsWith('--') ? name : `--${name}`}: ${value};`));
      }
    }
    assert.match(markdown, /not proof of a light appearance/);
    assert.match(markdown, /never overwrite existing rules automatically/);
    assert.match(markdown, /does not install components.*render a screen/);
    assert.ok(Buffer.byteLength(markdown) < 20 * 1024, system.id);
    if (system.variant) {
      assert.ok(markdown.includes(`representative preview uses \`${system.family.representative}\``));
      assert.ok(markdown.includes(`/registry/${system.id}/globals.json`));
    } else assert.match(markdown, /family representative shown/);
  }
  for (const id of ['unknown', '../linear', 'linear/../../.env', '%2e%2e', 'LINEAR', '']) {
    assert.equal(await designContext(id), null);
  }
});

test('HTTP downloads and discoverable MCP resources return the same public design contract', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'eidova-design-context-'));
  const server = createServer(new LocalFileStore(directory), undefined, undefined, 'core');
  const client = new Client({name:'design-context-test',version:'1'});
  const [a, b] = InMemoryTransport.createLinkedPair();
  const listener = app.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const origin = 'http://127.0.0.1:' + (listener.address() as {port:number}).port;
  try {
    await server.connect(b); await client.connect(a);
    const resources = (await client.listResources()).resources.filter(resource => resource.uri.startsWith('design://systems/'));
    assert.equal(resources.length, 31);
    assert.equal(new Set(resources.map(resource => resource.uri)).size, 31);
    assert.ok(Buffer.byteLength(JSON.stringify(resources)) < 12 * 1024);
    for (const id of ['linear', 'linear-quality', 'tactile-minimal']) {
      const expected = await designContext(id);
      const response = await fetch(`${origin}/api/design-systems/${id}/design.md`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type')!, /^text\/markdown; charset=utf-8$/);
      assert.equal(response.headers.get('content-disposition'), 'attachment; filename="DESIGN.md"');
      assert.match(response.headers.get('cache-control')!, /public/);
      assert.equal(await response.text(), expected);
      const resource = await client.readResource({uri:`design://systems/${id}/design.md`});
      assert.ok('text' in resource.contents[0]);
      assert.equal(resource.contents[0].text, expected);
    }
    for (const id of ['unknown', 'linear%2F..%2F..%2F.env']) {
      const response = await fetch(`${origin}/api/design-systems/${id}/design.md`);
      assert.equal(response.status, 404);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('content-disposition'), null);
    }
    await assert.rejects(client.readResource({uri:'design://systems/unknown/design.md'}), /not found/);
    await assert.rejects(client.readResource({uri:'design://systems/linear%2F..%2F..%2F.env/design.md'}), /not found/);
    assert.equal((await client.listTools()).tools.length,13);
    for (const target of ['react', 'html', 'dtcg']) {
      const kit = await client.callTool({name:'get-design-system-kit',arguments:{target,designSystemId:'linear',component:'button'}});
      assert.ok(!kit.isError, JSON.stringify(kit));
      const details = kit.structuredContent as Record<string, unknown>;
      assert.deepEqual(details.designContext, {uri:'design://systems/linear/design.md',url:`${baseUrl()}/api/design-systems/linear/design.md`});
      assert.match(String(details.buildInstructions), /save as DESIGN.md if absent/);
      assert.ok(!JSON.stringify(kit).includes('# Linear design system'));
    }
    const search = await client.callTool({name:'find-design-system',arguments:{query:'minimal SaaS dashboard'}});
    assert.ok(!search.isError);
    assert.ok(Buffer.byteLength(JSON.stringify(search)) <= 8 * 1024);
    const filtered = await client.callTool({name:'find-design-system',arguments:{query:'tactile',requiredComponents:['_shared']}});
    assert.equal(filtered.isError, true);
    const valid = await client.callTool({name:'find-design-system',arguments:{query:'tactile',requiredComponents:['sound-provider']}});
    assert.ok(!valid.isError);
    const matches = (valid.structuredContent as {matches:{id:string;matchedTerms:string[];useCases:string[];tradeoff:string;next:{arguments:{component:string[]}}}[]}).matches;
    assert.ok(matches.length > 0);
    for (const match of matches) {
      assert.ok((await catalog()).find(system => system.id === match.id)?.components.includes('sound-provider'));
      assert.ok(match.matchedTerms.includes('tactile'));
      assert.ok(match.useCases.length > 0 && match.tradeoff.length > 0);
      assert.deepEqual(match.next.arguments.component, ['sound-provider']);
    }
    const empty = await client.callTool({name:'find-design-system',arguments:{query:'minimal',requiredComponents:['missing-component']}});
    assert.deepEqual((empty.structuredContent as {matches:unknown[]}).matches, []);
    assert.match(JSON.stringify(empty), /remove component requirements/);
  } finally {
    await client.close(); await server.close();
    await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
    assert.equal(path.dirname(directory), os.tmpdir());
    await rm(directory, {recursive:true,force:true});
  }
});
