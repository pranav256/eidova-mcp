import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { bundledEntries, bundledFile, bundledManifest, fileUri, searchResources } from '../src/bundled-resources.js';
import { resourcePath } from '../src/resources.js';
import { createServer } from '../src/mcp.js';
import { app } from '../src/app.js';

test('all imported files retain hashes, entrypoints and retrievable license notices', async () => {
  const entries=await bundledEntries();
  assert.equal(entries.filter(entry=>entry.kind==='design-systems').length,152);
  assert.equal(entries.filter(entry=>entry.kind==='skills').length,169);
  assert.equal(new Set(entries.map(entry=>entry.kind+'/'+entry.id)).size,321);
  assert.match(await readFile(resourcePath('content/open-design/LICENSE'),'utf8'),/Apache License/);
  for(const entry of entries) {
    assert.ok(entry.name && entry.description);
    assert.ok(entry.files.some(file=>file.path===entry.entrypoint));
    for(const file of entry.files) assert.ok(await bundledFile(entry.kind,entry.id,file.path));
    for(const license of entry.licensePaths.filter(file=>file!=='LICENSE')) assert.ok(entry.files.some(file=>file.path===license.split('/').slice(2).join('/')));
  }
  const first=await searchResources('',undefined,20);
  const second=await searchResources('',undefined,20,20);
  assert.equal(first.total,321);assert.equal(first.nextOffset,20);
  assert.ok(!second.matches.some(entry=>first.matches.some(previous=>previous.uri===entry.uri)));
  assert.equal((await searchResources('linear','design-systems')).matches[0].id,'linear-app');
  assert.equal((await searchResources('not-a-real-resource-12345')).total,0);
  assert.equal((await searchResources('animation','skills')).matches.every(entry=>entry.kind==='skills'),true);
  for(const file of ['../../LICENSE','../linear-app/DESIGN.md','%2e%2e/LICENSE','DESIGN.md/../tokens.css','C:\\Windows\\win.ini']) assert.equal(await bundledFile('design-systems','linear-app',file),null);
  assert.equal(await bundledFile('..','linear-app','DESIGN.md'),null);
});

test('core MCP search, manifests, nested files and HTTP downloads expose the same bytes safely', async () => {
  const store={get:async()=>null,set:async()=>{throw new Error('Read-only test');},update:async()=>{throw new Error('Read-only test');}};
  const server=createServer(store,undefined,undefined,'core');
  const client=new Client({name:'bundle-test',version:'1'});
  const [a,b]=InMemoryTransport.createLinkedPair();
  const listener=app.listen(0,'127.0.0.1');await once(listener,'listening');
  const origin='http://127.0.0.1:'+(listener.address() as {port:number}).port;
  try {
    await server.connect(b);await client.connect(a);
    const search=await client.callTool({name:'search-resources',arguments:{query:'linear',kind:'design-systems'}});
    assert.ok(!search.isError);
    assert.match(JSON.stringify(search),/linear-app/);
    const readTool=async(uri:string,extra:Record<string,number>={})=>{
      const result=await client.callTool({name:'read-resource',arguments:{uri,...extra}});
      assert.ok(!result.isError,JSON.stringify(result));
      return JSON.parse((result.content as {type:string;text:string}[])[0].text);
    };
    const next=JSON.parse((search.content as {text:string}[])[0].text).matches[0].next;
    assert.equal(next.tool,'read-resource');
    const toolManifest=await readTool(next.arguments.uri);
    assert.ok(toolManifest.files.some((file:{path:string})=>file.path==='tokens.css'));
    assert.match((await readTool('design://open-design/license')).text,/Apache License/);
    const translatedUri='design://open-design/design-systems/airbnb/files/DESIGN-zh.md';
    let offset=0,reassembled='';
    do {const page=await readTool(translatedUri,{offset,limit:1000});reassembled+=page.text;if(page.nextOffset===null)break;assert.ok(page.nextOffset>offset);offset=page.nextOffset;}while(true);
    assert.equal(reassembled,(await bundledFile('design-systems','airbnb','DESIGN-zh.md'))!.bytes.toString('utf8'));
    for(const uri of ['file:///etc/passwd','https://example.com','design://open-design/skills/missing','design://open-design/design-systems/linear-app/files/%2E%2E%2FLICENSE','design://open-design/design-systems/linear-app/files/%ZZ'])assert.ok((await client.callTool({name:'read-resource',arguments:{uri}})).isError,uri);
    for(const extra of [{offset:-1},{offset:10000000},{limit:24001}])assert.ok((await client.callTool({name:'read-resource',arguments:{uri:translatedUri,...extra}})).isError);
    assert.equal((await client.listResources()).resources.filter(resource=>/^design:\/\/open-design\/(skills|design-systems)\//.test(resource.uri)).length,321);
    assert.match(JSON.stringify(await client.readResource({uri:'design://open-design/license'})),/Apache License/);
    const entry=(await bundledEntries()).find(entry=>entry.id==='linear-app')!;
    const manifest=await client.readResource({uri:'design://open-design/design-systems/linear-app'});
    assert.equal((manifest.contents[0] as {text:string}).text,JSON.stringify(await bundledManifest(entry)));
    for(const name of ['DESIGN.md','tokens.css','components.html','source/evidence.md']) {
      const expected=(await bundledFile(entry.kind,entry.id,name))!;
      const response=await fetch(origin+`/api/resources/${entry.kind}/${entry.id}/file?path=${encodeURIComponent(name)}`);
      assert.equal(response.status,200);assert.match(response.headers.get('content-disposition')!,/^attachment/);
      assert.match(response.headers.get('content-security-policy')!,/sandbox/);
      assert.equal(response.headers.get('x-content-type-options'),'nosniff');
      assert.deepEqual(Buffer.from(await response.arrayBuffer()),expected.bytes);
      const resource=await client.readResource({uri:fileUri(entry,name)});
      assert.equal((resource.contents[0] as {text:string}).text,expected.bytes.toString('utf8'));
    }
    const binaryEntry=(await bundledEntries()).find(entry=>entry.files.some(file=>file.binary))!;
    const binaryName=binaryEntry.files.find(file=>file.binary)!.path;
    const binary=await client.readResource({uri:fileUri(binaryEntry,binaryName)});
    assert.equal((binary.contents[0] as {blob:string}).blob,(await bundledFile(binaryEntry.kind,binaryEntry.id,binaryName))!.bytes.toString('base64'));
    const image=await readTool(fileUri(binaryEntry,binaryName));assert.equal(image.binary,true);assert.ok(image.url);assert.equal(image.text,undefined);
    const license=await fetch(origin+'/api/resources/license');assert.equal(license.status,200);assert.match(license.headers.get('content-disposition')!,/attachment/);assert.match(await license.text(),/Apache License/);
    for(const query of ['path=..%2F..%2FLICENSE','path=missing.html']) {
      const response=await fetch(origin+'/api/resources/design-systems/linear-app/file?'+query);
      assert.equal(response.status,404);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('content-disposition'),null);
    }
    assert.equal((await fetch(origin+'/api/resources?kind=other')).status,400);
    assert.equal((await fetch(origin+'/api/resources?offset=-1')).status,400);
    assert.equal((await (await fetch(origin+'/api/resources?query=linear')).json()).matches[0].id,'linear-app');
    await assert.rejects(client.readResource({uri:'design://open-design/skills/missing'}),/not found/);
    await assert.rejects(client.readResource({uri:'design://open-design/design-systems/linear-app/files/%2E%2E%2FLICENSE'}),/not found/);
    assert.ok((await client.callTool({name:'search-resources',arguments:{limit:1000}})).isError);
  } finally {await client.close();await server.close();await new Promise<void>((resolve,reject)=>listener.close(error=>error?reject(error):resolve()));}
});
