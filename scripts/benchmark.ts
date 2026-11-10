import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/mcp.js';
import { LocalFileStore } from '../src/store.js';

type Call = {name:string; arguments:Record<string,unknown>; error?:boolean};
const fixtures: {task:string; calls:Call[]}[] = [
  {task:'choose-install',calls:[{name:'find-design-system',arguments:{query:'minimal SaaS dashboard'}},{name:'get-design-system-kit',arguments:{target:'react',designSystemId:'minimal-light',component:['button','input'],library:'radix'}}]},
  {task:'preserve-brand',calls:[{name:'extract-design-system',arguments:{sources:[{name:'brand.css',kind:'css',content:':root { --primary: #123456; --radius: 8px; --font-sans: Georgia, serif; }'}]}}]},
  {task:'review-form',calls:[{name:'get-ux-principle',arguments:{topic:'forms'}},{name:'review-ui-code',arguments:{files:[{path:'form.tsx',content:'export const Form = () => <form><input /><button>Save</button></form>;'}]}},{name:'check-comprehension',arguments:{screen:'Profile settings',headline:'Profile settings',body:['Change the name shown to your team.'],actions:['Save name']}}]},
  {task:'spacing',calls:[{name:'inspect-spacing',arguments:{detail:'summary',states:[{name:'mobile',viewport:{width:390,height:844},elements:[{id:'save',tag:'button',interactive:true,rect:{x:24,y:160,width:120,height:44}}]}]}}]},
  {task:'owner-rules',calls:[{name:'set-team-rules',arguments:{markdown:'Keep focus visible.',personApproved:true}},{name:'get-team-rules',arguments:{}}]},
  {task:'recover-invalid-input',calls:[{name:'review-ui-code',arguments:{files:[{path:'server.ts'}]},error:true},{name:'get-design-system-kit',arguments:{target:'react',designSystemId:'not-a-system'},error:true}]},
];
const bytes = (value:unknown) => Buffer.byteLength(JSON.stringify(value),'utf8');
const directory = await mkdtemp(path.join(os.tmpdir(),'open-design-benchmark-'));
const report:Record<string,unknown> = {node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,measurement:'compact JSON UTF-8 wire bytes; not model tokens or client traces',tasks:[],coreTasks:[]};
try {
  for (const [owner,profile,label] of [[undefined,'full','public'],['benchmark-owner','full','owner'],[undefined,'core','core']] as const) {
    const server=createServer(new LocalFileStore(directory),owner,undefined,profile);
    const client=new Client({name:'benchmark',version:'1'});
    const [a,b]=InMemoryTransport.createLinkedPair();
    const start=performance.now();
    try {
      await server.connect(b); await client.connect(a);
      const discovery=await client.listTools();
      const entry={tools:discovery.tools.length,manifestBytes:bytes(discovery),instructionsBytes:Buffer.byteLength(client.getInstructions()??''),connectMs:Math.round((performance.now()-start)*100)/100};
      report[label]=entry;
      if(process.argv.includes('--check'))assert.ok(entry.manifestBytes<=(profile==='core'?32:70)*1024);
      for (const fixture of fixtures.filter(f=>Boolean(owner)===(f.task==='owner-rules'))) {
        const calls=[];
        for (const call of fixture.calls) {
          const started=performance.now();
          const result=await client.callTool(call);
          if(process.argv.includes('--check')) assert.equal(Boolean(result.isError),Boolean(call.error),`${fixture.task}: ${call.name}`);
          if(process.argv.includes('--check')&&call.name==='find-design-system')assert.ok(bytes(result)<=8*1024);
          if(process.argv.includes('--check')&&/^get-(ui|ux)-principle$/.test(call.name))assert.ok(bytes(result)<=4*1024);
          if(process.argv.includes('--check')&&call.name==='get-design-system-kit'&&call.arguments.component)assert.ok(Array.isArray((result.structuredContent as Record<string,unknown>|undefined)?.componentFiles),'Explicit source retrieval must retain the requested files.');
          calls.push({tool:call.name,requestBytes:bytes({name:call.name,arguments:call.arguments}),responseBytes:bytes(result),isError:Boolean(result.isError),expectedError:Boolean(call.error),ms:Math.round((performance.now()-started)*100)/100});
        }
        ((label==='core'?report.coreTasks:report.tasks) as unknown[]).push({task:fixture.task,calls,totalBytes:entry.manifestBytes+entry.instructionsBytes+calls.reduce((sum,c)=>sum+c.requestBytes+c.responseBytes,0)});
      }
      if (label==='public') {
        for (const [name,args,key] of [
          ['get-ui-principle',{topic:'spacing',maxTokens:600},'warmGuidanceP95Ms'],
          ['find-design-system',{query:'minimal SaaS dashboard'},'warmCatalogP95Ms'],
        ] as const) {
          const samples=[];
          for(let i=0;i<20;i++) {
            const started=performance.now();const result=await client.callTool({name,arguments:args});
            if(process.argv.includes('--check'))assert.ok(!result.isError,name+': warm call must succeed.');
            samples.push(performance.now()-started);
          }
          report[key]=Math.round(samples.sort((a,b)=>a-b)[18]*100)/100;
        }
      }
    } finally {await client.close();await server.close();}
  }
  assert.equal((report.tasks as unknown[]).length,6);
  assert.equal((report.coreTasks as unknown[]).length,5);
  if(process.argv.includes('--check')) {
    const baseline=JSON.parse(await readFile(new URL('../docs/BENCHMARK-BASELINE.json',import.meta.url),'utf8')) as {tasks:{task:string;totalBytes:number}[]};
    for(const task of report.tasks as {task:string;totalBytes:number}[])assert.ok(task.totalBytes<=baseline.tasks.find(original=>original.task===task.task)!.totalBytes*.5,task.task+': workflow byte reduction must reach 50%.');
  }
  if(process.argv.includes('--check'))for(const key of ['warmGuidanceP95Ms','warmCatalogP95Ms'])assert.ok(Number(report[key])<=200,key+': local warm p95 must stay within 200 ms.');
  const output=JSON.stringify(report,null,2)+'\n';
  const destination=process.argv.slice(2).find(arg=>!arg.startsWith('--'));
  if(destination) await writeFile(path.resolve(destination),output);
  console.log(output);
} finally {
  assert.equal(path.dirname(directory),os.tmpdir());
  await rm(directory,{recursive:true,force:true});
}
