import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const client=new Client({name:'stdio-package-verification',version:'1'});
try {
  await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../dist/stdio.js',import.meta.url))],cwd:os.tmpdir()}));
  assert.equal((await client.listTools()).tools.length,13,'Stdio defaults to the core profile.');
  const kit=await client.callTool({name:'get-design-system-kit',arguments:{target:'react',designSystemId:'minimal-light',component:['button']}});
  assert.ok(!kit.isError);
  const origin=new URL(kit.structuredContent.designContext.url).origin;
  assert.match(origin,/^http:\/\/127\.0\.0\.1:\d+$/);
  assert.ok(kit.structuredContent.installCommand.includes(origin+'/registry/'));
  const component=await fetch(origin+'/registry/minimal-light/button.json');assert.equal(component.status,200);
  assert.ok((await component.json()).files.length>0);
  assert.equal((await fetch(kit.structuredContent.designContext.url)).status,200);
  const catalog=await client.callTool({name:'find-design-system',arguments:{query:'minimal light'}});
  assert.ok(!catalog.isError);assert.match(JSON.stringify(catalog),/minimal-light/);
  const content=await client.callTool({name:'get-ui-principle',arguments:{topic:'spacing'}});
  assert.ok(!content.isError);assert.match(JSON.stringify(content),/spacing/);
  const search=await client.callTool({name:'search-resources',arguments:{query:'linear',kind:'design-systems'}});
  assert.ok(!search.isError);
  const next=JSON.parse(search.content[0].text).matches[0].next;
  const manifest=await client.callTool({name:next.tool,arguments:next.arguments});assert.ok(!manifest.isError);
  const file=JSON.parse(manifest.content[0].text).files.find(file=>file.path==='tokens.css');assert.ok(file);
  const read=await client.callTool({name:'read-resource',arguments:{uri:file.uri}});assert.ok(!read.isError);
  assert.match(JSON.parse(read.content[0].text).text,/linear/);
  console.log('Built stdio works from another working directory with packaged catalog and content.');
} finally { await client.close(); }
