import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { bundledEntries, bundledFile, bundledManifest, bundledPreviewFile, findBundledEntry, fileUri, searchResources } from '../src/bundled-resources.js';
import { resourcePath } from '../src/resources.js';
import { createServer } from '../src/mcp.js';
import { app } from '../src/app.js';

test('Vercel API routes preserve the resource path query', async () => {
  const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
  const route=config.rewrites.find((route:{source:string})=>route.source.startsWith('/api/:'));
  assert.ok(route);
  assert.doesNotMatch(route.source,/:path\*/, 'A Vercel wildcard must not replace the filename path query.');
});

test('Vercel excludes workspace files only at the repository root', async () => {
  const rules=(await readFile(new URL('../.vercelignore',import.meta.url),'utf8')).split(/\r?\n/).filter(line=>line.trim()&&!line.startsWith('#'));
  for(const rule of rules) {
    assert.ok(rule.startsWith('/'), `${rule} would also exclude matching resource folders.`);
    assert.ok(!rule.startsWith('/content'), 'Bundled resource files must remain in the deployment.');
  }
});

test('the curated library includes distinct templates, plugins and their original assets', async () => {
  const entries=await bundledEntries();
  assert.equal(entries.length,784);
  for(const [kind,count] of Object.entries({'design-systems':152,skills:169,'design-templates':115,plugins:343,templates:3,catalogs:2})) {
    assert.equal(entries.filter(entry=>String(entry.kind)===kind).length,count,kind);
    assert.equal((await searchResources('',kind,20)).total,count,kind);
  }
  const template=entries.find(entry=>String(entry.kind)==='design-templates'&&entry.id==='aster-atelier');
  assert.ok(template?.files.some(file=>file.path==='example.html'));
  const image=entries.find(entry=>String(entry.kind)==='plugins'&&entry.id==='image-templates-3d-stone-staircase-evolution-infographic');
  assert.equal(image?.license,'CC-BY-4.0');
  assert.ok(image.files.some(file=>file.path==='template.json'));
  const original=await bundledFile('design-templates','open-design-landing','assets/hero.png');
  assert.ok(original && original.bytes.length>1024*1024);
  assert.equal((await searchResources('infographic','plugins')).matches.every(entry=>entry.kind==='plugins'),true);
});

test('curation preserves legacy links, shared bytes and the complete licensed craft workflow', async () => {
  const catalog=JSON.parse(await readFile(resourcePath('content/open-design/index.json'),'utf8'));
  assert.equal(catalog.legacyEntries.length,137);
  for(const entry of catalog.legacyEntries) {
    assert.ok(await findBundledEntry(entry.kind,entry.id));
    assert.ok(!(await bundledEntries()).some(active=>active.kind===entry.kind&&active.id===entry.id));
    for(const file of entry.files)assert.ok(await bundledFile(entry.kind,entry.id,file.path));
  }
  for(const id of ['arc','canva','discord','duolingo','github','huggingface','openai'])assert.ok((await bundledEntries()).some(entry=>entry.kind==='plugins'&&entry.id==='design-systems-'+id));
  const image='assets/hero.png';
  const original=await bundledFile('design-templates','open-design-landing',image);
  const shared=await bundledFile('plugins','examples-open-design-landing',image);
  assert.deepEqual(shared!.bytes,original!.bytes);assert.ok(shared!.metadata.storagePath);
  assert.deepEqual((await bundledPreviewFile('plugins/_official/examples/open-design-landing/'+image))!.bytes,original!.bytes);
  const skill=(await findBundledEntry('skills','unslop'))!;
  const manifest=await bundledManifest(skill);
  assert.equal(skill.license,'CC-BY-4.0');assert.equal(skill.entrypoint,'SKILL.md');
  assert.match(manifest.repository,/heydamir\/unslop$/);
  assert.match(manifest.licenses[0].sourceUrl,/97daa3e.*skills\/unslop\/LICENSE$/);
  for(const file of ['SKILL.md','LICENSE','references/signs.md','references/tokens.md','references/refs/unslop-hero-after.webp','scripts/snapshot.mjs'])assert.ok(await bundledFile('skills','unslop',file));
  const metadata=shared!.metadata,previous=metadata.storagePath;
  try {
    for(const path of ['../LICENSE','/etc/passwd','C:/Windows/win.ini','skills\\unslop\\LICENSE','skills/./unslop/LICENSE']) {
      metadata.storagePath=path;assert.equal(await bundledFile('plugins','examples-open-design-landing',image),null);
    }
    metadata.storagePath=previous;
    const sha=metadata.sha256;
    try {metadata.sha256='0'.repeat(64);await assert.rejects(bundledFile('plugins','examples-open-design-landing',image),/integrity/);} finally {metadata.sha256=sha;}
  } finally {metadata.storagePath=previous;}
});

test('all imported files retain hashes, entrypoints and retrievable license notices', async () => {
  const entries=await bundledEntries();
  assert.equal(entries.filter(entry=>entry.kind==='design-systems').length,152);
  assert.equal(entries.filter(entry=>entry.kind==='skills').length,169);
  assert.equal(new Set(entries.map(entry=>entry.kind+'/'+entry.id)).size,784);
  assert.match(await readFile(resourcePath('content/open-design/LICENSE'),'utf8'),/Apache License/);
  for(const entry of entries) {
    assert.ok(entry.name && entry.description);
    assert.ok(entry.files.some(file=>file.path===entry.entrypoint));
    for(const file of entry.files) assert.ok(await bundledFile(entry.kind,entry.id,file.path));
    for(const license of entry.licensePaths.filter(file=>file!=='LICENSE')) assert.ok(entry.files.some(file=>file.path===license.split('/').slice(2).join('/')));
  }
  const first=await searchResources('',undefined,20);
  const second=await searchResources('',undefined,20,20);
  assert.equal(first.total,784);assert.equal(first.nextOffset,20);
  assert.ok(!second.matches.some(entry=>first.matches.some(previous=>previous.uri===entry.uri)));
  assert.equal((await searchResources('linear','design-systems')).matches[0].id,'linear-app');
  assert.equal((await searchResources('linear')).matches[0].id,'linear-app');
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
    const capabilities=JSON.parse(((await client.callTool({name:'get-capabilities',arguments:{}})).content as {text:string}[])[0].text);
    assert.equal(capabilities.library.total,784);
    assert.equal(capabilities.library.kinds['design-templates'],115);
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
    assert.equal((await client.listResources()).resources.filter(resource=>/^design:\/\/open-design\/[^/]+\//.test(resource.uri)).length,784);
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
    const plugin=(await bundledEntries()).find(entry=>entry.kind==='plugins'&&entry.files.some(file=>file.path.endsWith('.woff2')))!;
    const fontName=plugin.files.find(file=>file.path.endsWith('.woff2'))!.path;
    const font=await client.readResource({uri:fileUri(plugin,fontName)});
    assert.equal(font.contents[0].mimeType,'font/woff2');
    assert.equal((await readTool(fileUri(plugin,fontName))).mimeType,'font/woff2');
    for(const kind of ['design-templates','plugins','templates','catalogs']) {
      assert.ok(!(await client.callTool({name:'search-resources',arguments:{kind}})).isError,kind);
      assert.equal((await fetch(origin+'/api/resources?kind='+kind)).status,200);
    }
    const templateUri='design://open-design/design-templates/aster-atelier/files/example.html';
    assert.match((await readTool(templateUri)).text,/<!doctype html>/i);
    const preview=await fetch(origin+'/api/resources/design-templates/aster-atelier/preview?path=example.html');
    assert.equal(preview.status,200);
    assert.match(preview.headers.get('content-type')!,/^text\/html/);
    assert.match(preview.headers.get('content-security-policy')!,/sandbox allow-scripts/);
    assert.doesNotMatch(preview.headers.get('content-security-policy')!,/allow-same-origin/);
    assert.match(preview.headers.get('content-security-policy')!,/connect-src 'none'; form-action 'none'/);
    assert.equal(preview.headers.get('referrer-policy'),'no-referrer');
    assert.equal(preview.headers.get('content-disposition'),null);
    const previewHtml=await preview.text();
    assert.match(previewHtml,/<base href="\/api\/resource-previews\/design-templates\/aster-atelier\/">/);
    assert.match(previewHtml,/parent.postMessage\(\{type:"eidova-preview-escape"\}/);
    const stylesheet=await fetch(origin+'/api/resource-previews/design-systems/linear-app/tokens.css');
    assert.equal(stylesheet.status,200);assert.match(stylesheet.headers.get('content-type')!,/^text\/css/);
    assert.deepEqual(Buffer.from(await stylesheet.arrayBuffer()),(await bundledFile('design-systems','linear-app','tokens.css'))!.bytes);
    for(const path of ['path=SKILL.md','path=..%2Fexample.html','path=missing.html'])assert.equal((await fetch(origin+'/api/resources/design-templates/aster-atelier/preview?'+path)).status,404);
    assert.equal((await fetch(origin+'/api/resource-previews/LICENSE')).status,404);
    assert.equal((await fetch(origin+'/api/resource-previews/design-templates/not-present/example.html')).status,404);
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
