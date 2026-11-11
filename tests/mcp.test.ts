import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { mkdtemp,rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createServer } from '../src/mcp.js';
import { LocalFileStore } from '../src/store.js';
import { Projects } from '../src/projects.js';

test('MCP advertises working tools and refuses server filesystem reads',async()=> {
  const directory=await mkdtemp(path.join(os.tmpdir(),'eidova-mcp-'));
  const store=new LocalFileStore(directory);
  const server=createServer(store);
  const client=new Client({name:'test-client',version:'0.1.0'});
  const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);await client.connect(clientTransport);
    const tools=await client.listTools();
    assert.ok(tools.tools.some(t=>t.name==='get-ui-principle'));
    assert.ok(!tools.tools.some(t=>t.name==='set-team-rules'));
    assert.ok(!tools.tools.some(t=>t.name==='send-feedback'));
    const guidance=await client.callTool({name:'get-ui-principle',arguments:{topic:'spacing'}});
    assert.ok(!guidance.isError);assert.match(JSON.stringify(guidance),/spacing/i);
    const refusal=await client.callTool({name:'review-ui-code',arguments:{files:[{path:'src/app.ts'}]}});
    assert.equal(refusal.isError,true);
    const review=await client.callTool({name:'review-ui-code',arguments:{files:[{path:'sample.tsx',content:'export const Screen = () => <button><svg /></button>;'}]}});
    assert.match(JSON.stringify(review),/1 finding.*1 serious/);
    const primitive=await client.callTool({name:'review-ui-code',arguments:{files:[{path:'site/src/components/ui/input.tsx',content:'export const Input = (props: any) => <input {...props} />;'}]}});
    assert.doesNotMatch(JSON.stringify(primitive),/element\/input/);
    const misplaced=await client.callTool({name:'review-ui-code',arguments:{files:[{path:'screens/input.tsx',content:'export const Input = (props: any) => <input {...props} />;'}]}});
    assert.match(JSON.stringify(misplaced),/element\/input/);
    const wrongExport=await client.callTool({name:'review-ui-code',arguments:{files:[{path:'components/ui/input.tsx',content:'export const Other = (props: any) => <input {...props} />;'}]}});
    assert.match(JSON.stringify(wrongExport),/element\/input/);
    const sidebarSource='const SidebarItem = (props: any) => <button {...props}><img /></button>; export { SidebarItem };';
    const sidebar=await client.callTool({name:'review-ui-code',arguments:{files:[{path:'src/previews/kits/linear/components/ui/sidebar.tsx',content:sidebarSource}]}});
    assert.doesNotMatch(JSON.stringify(sidebar),/element\/button/);
    assert.match(JSON.stringify(sidebar),/wcag\/img-alt.*missing/);
    const sample=await client.callTool({name:'review-ui-code',arguments:{files:[{path:'components/ui/sidebar.tsx',content:sidebarSource+' export const Example = () => <button>Save</button>;'}]}});
    assert.match(JSON.stringify(sample),/element\/button/);
    const icons=await client.callTool({name:'find-icons',arguments:{libraryId:'lucide',query:'home'}});
    assert.match(JSON.stringify(icons),/house/);
    const brief=await client.callTool({name:'check-first-visit',arguments:{step:'brief',task:'Find a theme',url:'http://localhost:3000'}});
    assert.ok(!brief.isError);
    assert.equal((brief.structuredContent as {walks:unknown[]}).walks.length,5);
  } finally {
    await client.close();await server.close();
    assert.ok(directory.startsWith(path.join(os.tmpdir(),'eidova-mcp-')));
    await rm(directory,{recursive:true,force:true});
  }
});

test('MCP project rule schemas retain approval, screen selection and owner isolation',async()=> {
  const directory=await mkdtemp(path.join(os.tmpdir(),'eidova-project-rules-mcp-'));
  const store=new LocalFileStore(directory);
  const project=await new Projects(store,'alice').create({value:'Rules protocol test',designSystemId:'minimal-light'});
  async function connect(owner:string) {
    const server=createServer(store,owner); const client=new Client({name:'project-rule-test',version:'1'});
    const [a,b]=InMemoryTransport.createLinkedPair(); await server.connect(b); await client.connect(a);
    return {server,client};
  }
  const alice=await connect('alice');const bob=await connect('bob');
  try {
    const args={projectId:project.id,screen:'Billing',part:'Button',markdown:'Show saved billing changes.',personApproved:true};
    const rejected=await alice.client.callTool({name:'set-team-rules',arguments:{...args,personApproved:false}});
    assert.equal(rejected.isError,true);
    assert.ok(!(await alice.client.callTool({name:'set-team-rules',arguments:args})).isError);
    const read=await alice.client.callTool({name:'get-team-rules',arguments:{projectId:project.id,screen:'billing',parts:['Button']}});
    assert.ok(!read.isError);assert.match(JSON.stringify(read),/Show saved billing changes/);
    const unrelated=await alice.client.callTool({name:'get-team-rules',arguments:{projectId:project.id,screen:'profile'}});
    assert.doesNotMatch(JSON.stringify(unrelated),/Show saved billing changes/);
    const denied=await bob.client.callTool({name:'get-team-rules',arguments:{projectId:project.id,screen:'billing'}});
    assert.equal(denied.isError,true);assert.doesNotMatch(JSON.stringify(denied),/Show saved billing changes/);
  } finally {
    await alice.client.close();await alice.server.close();await bob.client.close();await bob.server.close();
    assert.ok(directory.startsWith(path.join(os.tmpdir(),'eidova-project-rules-mcp-')));
    await rm(directory,{recursive:true,force:true});
  }
});

test('approved workspace rules report saved and are visible only to their owner',async()=> {
  const directory=await mkdtemp(path.join(os.tmpdir(),'eidova-rules-'));
  const store=new LocalFileStore(directory);
  async function connected(owner: string) {
    const server=createServer(store,owner);
    const client=new Client({name:'rules-test',version:'1'});
    const [a,b]=InMemoryTransport.createLinkedPair();
    await server.connect(b);await client.connect(a);
    return {server,client};
  }
  const alice=await connected('alice');const bob=await connected('bob');
  try {
    const marker='Release verification: maintain visible focus.';
    const save=await alice.client.callTool({name:'set-team-rules',arguments:{markdown:marker,personApproved:true}});
    assert.match(JSON.stringify(save),/saved/i);
    assert.doesNotMatch(JSON.stringify(save),/nothing was replaced|not saved/);
    assert.match(JSON.stringify(await alice.client.callTool({name:'get-team-rules',arguments:{}})),/Release verification/);
    assert.doesNotMatch(JSON.stringify(await bob.client.callTool({name:'get-team-rules',arguments:{}})),/Release verification/);
  } finally {
    await alice.client.close();await alice.server.close();await bob.client.close();await bob.server.close();
    assert.ok(directory.startsWith(path.join(os.tmpdir(),'eidova-rules-')));
    await rm(directory,{recursive:true,force:true});
  }
});

test('project writes are owner-isolated, durable and reject CSS injection',async()=> {
  const directory=await mkdtemp(path.join(os.tmpdir(),'eidova-project-'));
  try {
    const store=new LocalFileStore(directory);
    const alice=new Projects(store,'alice');const bob=new Projects(store,'bob');
    const project=await alice.create({value:'Example theme',designSystemId:'minimal-light'});
    await alice.setConfig(project.id,{colors:{primary:'#123456'},radius:'12px'});
    await assert.rejects(bob.setConfig(project.id,{radius:'20px'}),/not found/);
    await assert.rejects(alice.setConfig(project.id,{colors:{primary:'red; } body { display:none'}}));
    const fresh=await new Projects(new LocalFileStore(directory),'alice').get(project.id);
    assert.equal(fresh!.config.colors!.primary,'#123456');
    assert.match(await alice.css(fresh!),/--primary: #123456/);
    const registry=await alice.item(fresh!,'all');assert.ok(registry.registryDependencies!.every(dep=>!dep.includes('better-design.com')));
    await assert.rejects(new Projects(store).create({value:'Anonymous theme'}),/workspace key/);
  } finally {
    assert.ok(directory.startsWith(path.join(os.tmpdir(),'eidova-project-')));
    await rm(directory,{recursive:true,force:true});
  }
});
