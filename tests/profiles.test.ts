import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createServer} from '../src/mcp.js';
import {LocalFileStore} from '../src/store.js';
import {getReviewRules} from '../src/guidance.js';

test('core discovery is small, typed, read-only and preserves executable validation',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'open-design-profile-'));
  const server=createServer(new LocalFileStore(directory),undefined,undefined,'core');
  const client=new Client({name:'plain-mcp-client',version:'1'});const[a,b]=InMemoryTransport.createLinkedPair();
  try {
    await server.connect(b);await client.connect(a);
    const list=await client.listTools();assert.equal(list.tools.length,11);assert.ok(Buffer.byteLength(JSON.stringify(list))<=32*1024);
    assert.ok(list.tools.every(tool=>tool.annotations?.readOnlyHint));
    assert.ok(!list.tools.some(tool=>tool.name==='set-team-rules'));
    const review=list.tools.find(tool=>tool.name==='review-ui-code')!;
    assert.equal((review.inputSchema.properties!.files as {maxItems:number}).maxItems,24);
    assert.equal((await client.callTool({name:'review-ui-code',arguments:{files:[{path:'server.ts'}]}})).isError,true);
    assert.equal((await client.callTool({name:'get-design-system-kit',arguments:{target:'react',designSystemId:'unknown'}})).isError,true);
    const search=await client.callTool({name:'find-design-system',arguments:{query:'minimal SaaS dashboard'}});assert.ok(!search.isError);assert.ok(Buffer.byteLength(JSON.stringify(search))<=8*1024);
    const data=search.structuredContent as {matches:{id:string;family:string}[]};assert.ok(data.matches.length>0);assert.equal(new Set(data.matches.map(item=>item.family)).size,data.matches.length);
    const kit=await client.callTool({name:'get-design-system-kit',arguments:{target:'react',designSystemId:'minimal-light',component:'button'}});
    const details=kit.structuredContent as Record<string,unknown>;
    assert.ok(!kit.isError);assert.match(JSON.stringify(details.componentFiles),/buttonVariants/);
    assert.equal((details.iconLibrary as {id:string}).id,'lucide');
    assert.match(String(details.viewUrl),/specimen=minimal-light/);
    assert.doesNotMatch(String(details.installCommand),/ -o\b/);
    assert.equal((await client.callTool({name:'get-design-system-kit',arguments:{target:'react',designSystemId:'minimal-light',component:'missing-component'}})).isError,true);
    assert.equal((await client.callTool({name:'find-design-system',arguments:{query:' ',limit:99}})).isError,true);
    const resource=await client.readResource({uri:'design://principles/ux/forms'});assert.match(JSON.stringify(resource),/label/i);
    const rules=await getReviewRules();const rule=await client.readResource({uri:'design://review-rules/'+encodeURIComponent(rules[0].id)});assert.match(JSON.stringify(rule),/content/);
    const workflow=await client.readResource({uri:'design://workflow/v1'});assert.match(JSON.stringify(workflow),/version 1/);
    assert.equal((await client.listPrompts()).prompts.length,3);
    assert.match(JSON.stringify(await client.getPrompt({name:'choose-theme'})),/existing product design/);
  } finally {await client.close();await server.close();assert.equal(path.dirname(directory),os.tmpdir());await rm(directory,{recursive:true,force:true});}
});

test('full profile preserves discovery and stays within the compatibility budget',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'open-design-full-profile-'));
  const server=createServer(new LocalFileStore(directory),'owner');const client=new Client({name:'full-client',version:'1'});const[a,b]=InMemoryTransport.createLinkedPair();
  try {await server.connect(b);await client.connect(a);const list=await client.listTools();assert.equal(list.tools.length,41);assert.ok(Buffer.byteLength(JSON.stringify(list))<=70*1024);assert.ok(list.tools.some(tool=>tool.name==='set-team-rules'));assert.ok((client.getInstructions()??'').length<1000);}
  finally {await client.close();await server.close();assert.equal(path.dirname(directory),os.tmpdir());await rm(directory,{recursive:true,force:true});}
});
