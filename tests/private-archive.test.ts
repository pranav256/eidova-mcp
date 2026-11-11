import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { loadPrivateArchive } from '../src/private-archive.js';
import { createServer } from '../src/mcp.js';
import { LocalFileStore } from '../src/store.js';

const image={type:'image',mimeType:'image/png',data:Buffer.from('synthetic reference image').toString('base64')};
const text=(value:string)=>({type:'text',text:value});
async function temporary(run:(directory:string)=>Promise<void>) {
  const directory=await mkdtemp(join(tmpdir(),'eidova-archive-'));
  try {await run(directory);} finally {
    assert.equal(dirname(resolve(directory)),resolve(tmpdir()));
    await rm(directory,{recursive:true,force:true});
  }
}
async function capture(directory:string,number:number,name:string,args:unknown,result:unknown) {
  const response={jsonrpc:'2.0',id:number,result};
  const rawBody=JSON.stringify(response);
  const filename=join(directory,`${number}-tools-call.json`);
  await writeFile(filename,JSON.stringify({timestamp:'2026-11-07T00:00:00.000Z',httpStatus:200,arguments:{name,arguments:args},response,rawBody,responseSha256:createHash('sha256').update(rawBody).digest('hex')}));
  return filename;
}
const files=[{path:'Theme/Theme.swift',content:'// synthetic fixture\nimport SwiftUI'}];
const nativeResult=()=>({content:[text('# Fixture SwiftUI kit'),image],structuredContent:{status:'completed',name:'Linear',viewUrl:'https://better-design.com/design-systems/linear',buildInstructions:'Original captured instructions',tokensCss:':root { --primary: #123456; }',nativeFiles:files}});
async function references(directory:string) {
  await capture(directory,1,'get-inspiration',{type:'app-screens',platform:'web',query:'settings'},{content:[text('# Product screens'),text('## Sample: account settings (web)'),text('```html\n<button>Saved fixture</button>\n```'),image,text('## Other: workspace settings (web)'),image,text('Next: unrelated vendor next step')]});
  await capture(directory,2,'get-inspiration',{type:'app-screens',platform:'ios',query:'settings'},{content:[text('# Product screens'),text('## Phone: settings (ios)'),image]});
  await capture(directory,3,'get-inspiration',{type:'app-store-screenshots'},{content:[text('# App Store screenshot sets'),text('## Notebook (Productivity)'),image,text('## Puzzle (Games)'),image]});
  await capture(directory,4,'get-inspiration',{type:'html-flows',query:'onboarding'},{content:[text('# HTML flows'),text('<!-- better-design:html-flow -->\n## Sample: welcome (2 steps)\n```html\n<h1>Reference</h1>\n```'),image]});
}

test('offline search groups complete saved sets, honors filters and limits, and never searches reference code',async()=>temporary(async directory=> {
  await references(directory);
  const archive=await loadPrivateArchive(directory);
  assert.equal(archive.summary().referenceSets,6);
  const result=archive.inspiration({type:'app-screens',platform:'web',query:'settings',limit:1});
  assert.equal(result.structuredContent!.archive.returnedSets,1);
  assert.equal(result.structuredContent!.archive.availableMatches,2);
  assert.equal(result.content.filter(block=>block.type==='image').length,1);
  assert.doesNotMatch(JSON.stringify(result),/unrelated vendor next step/);
  assert.equal(archive.inspiration({type:'app-screens',query:'Saved fixture'}).structuredContent!.archive.returnedSets,0);
  assert.equal(archive.inspiration({type:'app-screens',platform:'android',query:'settings'}).structuredContent!.archive.returnedSets,0);
  const category=archive.inspiration({type:'app-store-screenshots',category:'PRODUCTIVITY'});
  assert.match(JSON.stringify(category),/Notebook/);assert.doesNotMatch(JSON.stringify(category),/Puzzle/);
  assert.equal(archive.inspiration({type:'app-store-screenshots',category:'Productivity',platform:'web'}).structuredContent!.archive.returnedSets,1);
  assert.equal(archive.inspiration({type:'app-screens',platform:'ios',query:'settings',category:'irrelevant'}).structuredContent!.archive.returnedSets,1);
  const flow=archive.inspiration({type:'html-flows',query:'onboarding'});
  assert.match(JSON.stringify(flow),/Reference/);assert.equal(flow.content.filter(block=>block.type==='image').length,1);
  assert.equal(archive.inspiration({type:'html-flows'}).isError,true);
  (result.content[1] as {text:string}).text='changed';
  assert.doesNotMatch(JSON.stringify(archive.inspiration({type:'app-screens',query:'settings'})),/changed/);
}));

test('native kits retain exact source and tokens but cannot synthesize a project or install files',async()=>temporary(async directory=> {
  await capture(directory,1,'get-design-system-kit',{target:'swiftui',designSystemId:'linear'},nativeResult());
  const archive=await loadPrivateArchive(directory);
  const result=archive.kit({target:'swiftui',designSystemId:'linear'});
  assert.ok(!result.isError);
  assert.deepEqual(result.structuredContent!.nativeFiles,files);
  assert.equal(result.structuredContent!.tokensCss,nativeResult().structuredContent.tokensCss);
  assert.equal(result.structuredContent!.viewUrl,undefined);
  assert.equal(result.content.filter(block=>block.type==='image').length,1);
  result.structuredContent!.nativeFiles![0].content='changed';
  assert.deepEqual(archive.kit({target:'swiftui',designSystemId:'linear'}).structuredContent!.nativeFiles,files);
  for (const request of [{target:'swiftui',designSystemId:'other'},{target:'swiftui',designSystemId:'linear',projectId:'custom'},{target:'swiftui',designSystemId:'linear',install:true}]) assert.equal(archive.kit(request).isError,true);
  assert.deepEqual(archive.summary().kits,[{target:'swiftui',designSystemId:'linear',files:1}]);
}));

test('capture ingestion rejects altered bodies and responses and unsafe or duplicated kit paths',async()=>temporary(async directory=> {
  const filename=await capture(directory,1,'get-design-system-kit',{target:'swiftui',designSystemId:'linear'},nativeResult());
  const original=await readFile(filename,'utf8');
  const record=JSON.parse(original);record.rawBody+=' ';
  await writeFile(filename,JSON.stringify(record));
  await assert.rejects(loadPrivateArchive(directory),/hash mismatch/);
  const changed=JSON.parse(original);changed.response.result.structuredContent.nativeFiles[0].content='tampered';
  await writeFile(filename,JSON.stringify(changed));
  await assert.rejects(loadPrivateArchive(directory),/differs from its original body/);
  await capture(directory,1,'get-design-system-kit',{target:'swiftui',designSystemId:'linear'},{...nativeResult(),structuredContent:{...nativeResult().structuredContent,nativeFiles:[{path:'../outside.swift',content:'fixture'}]}});
  await assert.rejects(loadPrivateArchive(directory),/relative kit file path/);
  await capture(directory,1,'get-design-system-kit',{target:'swiftui',designSystemId:'linear'},{...nativeResult(),structuredContent:{...nativeResult().structuredContent,nativeFiles:[...files,...files]}});
  await assert.rejects(loadPrivateArchive(directory),/Duplicate kit file paths/);
}));

test('unsupported/rejected captures are ignored and duplicate reference sets are deduplicated',async()=>temporary(async directory=> {
  const result={content:[text('## Fixture: settings (web)'),image]};
  await capture(directory,1,'get-inspiration',{type:'app-screens',query:'settings',platform:'web'},result);
  await capture(directory,2,'get-inspiration',{type:'app-screens',query:'settings',platform:'web'},result);
  await capture(directory,3,'get-design-system-kit',{target:'react',designSystemId:'linear'},{content:[text('Not a platform kit')]});
  await capture(directory,4,'get-inspiration',{type:'app-screens',query:'settings'},{content:[],isError:true});
  assert.equal((await loadPrivateArchive(directory)).summary().referenceSets,1);
}));

test('private and public MCP instances keep separate schemas and return archived files through the protocol',async()=>temporary(async directory=> {
  await references(directory);
  await capture(directory,5,'get-design-system-kit',{target:'swiftui',designSystemId:'linear'},nativeResult());
  await capture(directory,6,'get-design-system-kit',{target:'shopify',designSystemId:'linear'},{content:[text('Synthetic Shopify kit')],structuredContent:{status:'completed',name:'Linear',tokensCss:':root{}',themeFiles:[{path:'snippets/fixture.liquid',content:'Fixture'}]}});
  const archive=await loadPrivateArchive(directory);const store=new LocalFileStore(join(directory,'state'));
  assert.throws(()=>createServer(store,undefined,archive),/private local workspace/);
  const privateServer=createServer(store,'local',archive);const publicServer=createServer(store);
  const privateClient=new Client({name:'private-fixture',version:'1'});const publicClient=new Client({name:'public-fixture',version:'1'});
  const [privateA,privateB]=InMemoryTransport.createLinkedPair();const [publicA,publicB]=InMemoryTransport.createLinkedPair();
  try {
    await privateServer.connect(privateB);await privateClient.connect(privateA);
    await publicServer.connect(publicB);await publicClient.connect(publicA);
    const privateTools=await privateClient.listTools();const publicTools=await publicClient.listTools();
    assert.equal(privateTools.tools.filter(tool=>tool.name==='get-shopify-guide').length,1);
    assert.ok(privateTools.tools.some(tool=>tool.name==='get-inspiration'));
    assert.ok(!publicTools.tools.some(tool=>tool.name==='get-inspiration'));
    const targets=(tools:typeof privateTools)=>(tools.tools.find(tool=>tool.name==='get-design-system-kit')!.inputSchema.properties!.target as {enum:string[]}).enum;
    assert.ok(targets(privateTools).includes('swiftui'));
    assert.ok(!targets(publicTools).includes('swiftui'));
    const native=await privateClient.callTool({name:'get-design-system-kit',arguments:{target:'swiftui',designSystemId:'linear',install:false}});
    assert.ok(!native.isError,JSON.stringify(native));assert.deepEqual((native.structuredContent as {nativeFiles:unknown}).nativeFiles,files);
    const shopify=await privateClient.callTool({name:'get-design-system-kit',arguments:{target:'shopify',designSystemId:'linear'}});
    assert.ok(!shopify.isError,JSON.stringify(shopify));assert.equal((shopify.structuredContent as {themeFiles:unknown[]}).themeFiles.length,1);
    const inspiration=await privateClient.callTool({name:'get-inspiration',arguments:{type:'app-screens',platform:'web',query:'settings',limit:1}});
    assert.ok(!inspiration.isError);assert.equal((inspiration.content as {type:string}[]).filter(block=>block.type==='image').length,1);
    const publicKit=await publicClient.callTool({name:'get-design-system-kit',arguments:{target:'swiftui',designSystemId:'linear'}});
    assert.equal(publicKit.isError,true);
    assert.equal((await privateClient.callTool({name:'get-design-system-kit',arguments:{target:'swiftui',designSystemId:'linear',install:true}})).isError,true);
    assert.doesNotMatch(JSON.stringify(await publicClient.callTool({name:'get-capabilities',arguments:{}})),/private-stdio-offline/);
  } finally {await privateClient.close();await publicClient.close();await privateServer.close();await publicServer.close();}
}));
