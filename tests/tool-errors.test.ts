import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import os from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createServer} from '../src/mcp.js';
import {LocalFileStore} from '../src/store.js';

test('missing, invalid and unsupported tool requests consistently return errors',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'eidova-tool-errors-'));
  const server=createServer(new LocalFileStore(directory),undefined,undefined,'full');
  const client=new Client({name:'tool-error-test',version:'1'});
  const[a,b]=InMemoryTransport.createLinkedPair();
  try {
    await server.connect(b);await client.connect(a);
    const tools=(await client.listTools()).tools;
    for(const name of ['render-video-frames','install-icons','finalize-dashboard-review'])assert.ok(!tools.some(tool=>tool.name===name));
    for(const name of ['get-icon-files','get-video-render-commands'])assert.ok(tools.some(tool=>tool.name===name));
    const missingTopics=['get-ui-principle','get-ux-principle','get-sales-principle','get-react-native-guide','get-swiftui-guide','get-three-js-guide','get-motion-guide','get-illustration-guide','get-shopify-guide'].map(name=>({name,arguments:{topic:'missing-eidova-test-topic'}}));
    const cases=[...missingTopics,
      {name:'get-ui-principle',arguments:{topic:'spacing',query:'color'}},
      {name:'create-design-system',arguments:{prompt:'Eidova test'}},
      {name:'get-icon-files',arguments:{libraryId:'missing',names:['house'],format:'svg'}},
      {name:'get-icon-files',arguments:{libraryId:'lucide',names:['missing-eidova-test-icon'],format:'svg'}},
      {name:'get-icon-files',arguments:{libraryId:'lucide',names:['house','missing-eidova-test-icon'],format:'svg'}},
      {name:'find-icons',arguments:{libraryId:'missing',query:'home'}},
      {name:'preview-design-system',arguments:{designSystemId:'missing'}},
      {name:'read-resource',arguments:{uri:'design://eidova/skills/missing'}},
      {name:'get-design-system-kit',arguments:{target:'react',designSystemId:'missing'}},
    ];
    for(const request of cases){const result=await client.callTool(request);assert.equal(result.isError,true,request.name+': '+JSON.stringify(result));}
    assert.ok(!(await client.callTool({name:'find-icons',arguments:{libraryId:'lucide',query:'missing-eidova-test-icon'}})).isError,'A valid search with no matches remains successful.');
  } finally {await client.close();await server.close();assert.equal(path.dirname(directory),os.tmpdir());await rm(directory,{recursive:true,force:true});}
});

test('unavailable configured guidance returns protocol errors, not only error telemetry',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'eidova-empty-guidance-'));
  const library=path.join(directory,'library.json');
  try {
    await writeFile(library,JSON.stringify({version:1,principles:[],reviewRules:[]}));
    execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',`
      import assert from 'node:assert/strict';
      import {Client} from '@modelcontextprotocol/sdk/client/index.js';
      import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
      import {createServer} from './src/mcp.ts';
      import {LocalFileStore} from './src/store.ts';
      const server=createServer(new LocalFileStore(process.env.EIDOVA_STATE_DIR),undefined,undefined,'full');
      const client=new Client({name:'empty-guidance-test',version:'1'});
      const[a,b]=InMemoryTransport.createLinkedPair();
      try {
        await server.connect(b);await client.connect(a);
        for(const request of [{name:'get-widget-guide',arguments:{widgetType:'calculator'}},{name:'get-review-rules',arguments:{}}]) {
          const result=await client.callTool(request);assert.equal(result.isError,true,request.name+': '+JSON.stringify(result));
        }
      } finally {await client.close();await server.close();}
    `],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,EIDOVA_CONTENT_LIBRARY:library,EIDOVA_STATE_DIR:directory},stdio:'pipe'});
  } finally {assert.equal(path.dirname(directory),os.tmpdir());await rm(directory,{recursive:true,force:true});}
});
