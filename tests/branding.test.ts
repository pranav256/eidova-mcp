import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createServer} from '../src/mcp.js';
import {LocalFileStore} from '../src/store.js';
import {registryItem} from '../src/catalog.js';

test('Eidova tool copy and generated files use current branding and supported commands',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'eidova-branding-'));
  const server=createServer(new LocalFileStore(directory),undefined,undefined,'full');
  const client=new Client({name:'branding-test',version:'1'});
  const[a,b]=InMemoryTransport.createLinkedPair();
  const unrelated=/better[ -]?design|hooky|uclips|cashmere|nexu/i;
  try {
    await server.connect(b);await client.connect(a);
    assert.doesNotMatch(client.getInstructions()??'',unrelated);
    assert.doesNotMatch(JSON.stringify(await client.listTools()),unrelated);
    for(const [name,args] of [
      ['get-store-listing-guide',{}],
      ['get-motion-guide',{component:'stat-count'}],
      ['build-feature-map',{files:['src/app/settings/page.tsx'],product:'Eidova'}],
      ['get-design-system-kit',{target:'react',designSystemId:'minimal-light',component:'button'}],
      ['get-design-system-kit',{target:'html',designSystemId:'minimal-light'}],
    ] as const) {
      const result=await client.callTool({name,arguments:args});
      assert.ok(!result.isError,JSON.stringify(result));
      assert.doesNotMatch(JSON.stringify(result),unrelated,name);
      assert.doesNotMatch(JSON.stringify(result),/npx(?: -y)? eidova(?:-mcp)?(?:@latest)? (?:review|listing|init)\b/,name);
      if(name==='build-feature-map') assert.match(JSON.stringify(result),/\.eidova\/feature-map\.json/);
    }
    const video=await registryItem('video','stat-count');
    assert.ok(video.files?.length);
    assert.ok(video.files.every(file=>file.path.startsWith('eidova/')));
    assert.doesNotMatch(JSON.stringify(video),unrelated);
  } finally {
    await client.close();await server.close();
    assert.equal(path.dirname(directory),os.tmpdir());await rm(directory,{recursive:true,force:true});
  }
});
