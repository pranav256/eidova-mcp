import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const client=new Client({name:'stdio-package-verification',version:'1'});
try {
  await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../dist/stdio.js',import.meta.url))],cwd:os.tmpdir()}));
  const catalog=await client.callTool({name:'find-design-system',arguments:{query:'minimal light'}});
  assert.ok(!catalog.isError);assert.match(JSON.stringify(catalog),/minimal-light/);
  const content=await client.callTool({name:'get-ui-principle',arguments:{topic:'spacing'}});
  assert.ok(!content.isError);assert.match(JSON.stringify(content),/spacing/);
  console.log('Built stdio works from another working directory with packaged catalog and content.');
} finally { await client.close(); }
