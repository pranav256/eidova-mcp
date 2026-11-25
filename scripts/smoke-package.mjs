import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,rename,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const directory=await mkdtemp(path.join(os.tmpdir(),'Eidova Package '));
const npm=process.env.npm_execpath;assert.ok(npm,'Run through npm run smoke:package.');
try {
  // The full library's pack manifest exceeds Node's default 1 MiB buffer.
  const report=JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--ignore-scripts','--pack-destination',directory],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024}));
  const entries=Array.isArray(report)?report:Object.values(report);
  assert.equal(entries.length,1,'Expected one packed package.');
  const packed=entries[0];
  assert.ok(packed.files.some(file=>file.path==='dist/stdio.js'));
  assert.ok(!packed.files.some(file=>/^dist\/studio[^/]*\.js$|^docs\/STUDIO(?:-PARITY)?\.md$/i.test(file.path)), 'Removed editor code must not ship.');
  assert.ok(packed.files.some(file=>file.path==='content/design-families.json'));
  const bundle=JSON.parse(await readFile(path.join(root,'content/eidova/index.json'),'utf8'));
  const packedPaths=new Set(packed.files.map(file=>file.path));
  assert.ok(packedPaths.has('vendor/upstream/provenance.json'));
  assert.ok(packedPaths.has('content/eidova/LICENSE'));
  for(const entry of bundle.entries)for(const file of entry.files)assert.ok(packedPaths.has(`content/eidova/${file.storagePath??(entry.sourcePath??entry.kind+'/'+entry.id)+'/'+file.path}`),`Missing bundled bytes: ${entry.id}/${file.path}`);
  for(const notice of ['LICENSE','NOTICE','assets/LICENSE','assets/TABLER-LICENSE','vendor/upstream/LICENSE'])assert.ok(packed.files.some(file=>file.path===notice),`Missing notice: ${notice}`);
  for(const document of ['README.md','CHANGELOG.md','SECURITY.md','server.json','docs/CLIENTS.md','docs/BENCHMARK.md','docs/DESIGN-FAMILIES.md','docs/DTCG.md','docs/RELEASE-VERIFICATION.md'])assert.ok(packed.files.some(file=>file.path===document),`Missing release document: ${document}`);
  assert.ok(packed.files.every(file=>!/(^|\/)(\.work|\.eidova|\.open-design|private-captures|\.env|node_modules)(\/|$)/.test(file.path)));
  assert.equal(path.basename(packed.filename),packed.filename);
  const consumer=path.join(directory,'consumer with spaces');await mkdir(consumer);
  execFileSync(process.execPath,[npm,'install','--ignore-scripts','--no-audit','--no-fund','--no-package-lock',path.join(directory,packed.filename)],{cwd:consumer,encoding:'utf8'});
  const entry=path.join(consumer,'node_modules/eidova-mcp/dist/stdio.js');
  const version=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version;
  const help=execFileSync(process.execPath,[entry,'--help'],{cwd:consumer,encoding:'utf8'});
  assert.doesNotMatch(help,/studio/i);
  for(const option of ['--studio','--native-studio'])assert.throws(()=>execFileSync(process.execPath,[entry,option],{cwd:consumer,stdio:'pipe'}));
  assert.equal(execFileSync(process.execPath,[entry,'--version'],{cwd:consumer,encoding:'utf8'}).trim(),version);
  execFileSync(process.execPath,['--input-type=module','-e','import {createServer} from "eidova-mcp"; import assert from "node:assert/strict"; assert.equal(typeof createServer,"function");'],{cwd:consumer,encoding:'utf8'});
  assert.match(execFileSync(process.execPath,[entry,'doctor'],{cwd:consumer,encoding:'utf8'}),/package assets available/);
  for(const relative of ['content/workflow.md','content/design-families.json','content/eidova/index.json','content/eidova/LICENSE','content/library.json','../@iconify-json/lucide/icons.json']) {
    const asset=path.join(consumer,'node_modules/eidova-mcp',relative);
    await rename(asset,asset+'.missing');
    try {assert.throws(()=>execFileSync(process.execPath,[entry,'doctor'],{cwd:consumer,stdio:'pipe'}),error=>/Reinstall the package or rebuild/.test(String(error.stderr)),relative);}
    finally {await rename(asset+'.missing',asset);}
  }
  for(const [relative,invalid] of [['content/design-families.json','{}'],['content/eidova/index.json','{}'],['content/library.json','{'],['content/library.json','{"version":1,"principles":[],"reviewRules":[]}'],['../@iconify-json/lucide/icons.json','{}']]) {
    const asset=path.join(consumer,'node_modules/eidova-mcp',relative),original=await readFile(asset);
    await writeFile(asset,invalid);
    try {assert.throws(()=>execFileSync(process.execPath,[entry,'doctor'],{cwd:consumer,stdio:'pipe'}),error=>/Reinstall the package or rebuild/.test(String(error.stderr)),relative);}
    finally {await writeFile(asset,original);}
  }
  assert.throws(()=>execFileSync(process.execPath,[entry,'--profile','invalid'],{cwd:consumer,stdio:'pipe'}));
  const client=new Client({name:'packed-package-client',version:'1'});
  try {
    await client.connect(new StdioClientTransport({command:process.execPath,args:[entry],cwd:consumer}));
    assert.equal((await client.listTools()).tools.length,13);
    const kit=await client.callTool({name:'get-design-system-kit',arguments:{target:'react',designSystemId:'minimal-light',component:['button']}});
    assert.ok(!kit.isError);const origin=new URL(kit.structuredContent.designContext.url).origin;
    assert.match(origin,/^http:\/\/127\.0\.0\.1:\d+$/);
    assert.ok(kit.structuredContent.installCommand.includes(origin+'/registry/'));
    const component=await fetch(origin+'/registry/minimal-light/button.json');assert.equal(component.status,200);assert.ok((await component.json()).files.length>0);
    assert.ok(!(await client.callTool({name:'find-design-system',arguments:{query:'editorial'}})).isError);
    assert.match(JSON.stringify(await client.readResource({uri:'design://workflow/v1'})),/version 1/);
    assert.ok(!(await client.callTool({name:'search-resources',arguments:{query:'linear'}})).isError);
    assert.match(JSON.stringify(await client.callTool({name:'read-resource',arguments:{uri:'design://eidova/design-systems/linear-app/files/DESIGN.md'}})),/Linear/);
    assert.match(JSON.stringify(await client.readResource({uri:'design://eidova/design-systems/linear-app/files/DESIGN.md'})),/Linear/);
    const capabilities=JSON.parse((await client.callTool({name:'get-capabilities',arguments:{}})).content[0].text);
    assert.equal(capabilities.library.total,784);
    assert.equal((await client.callTool({name:'read-resource',arguments:{uri:'design://eidova/plugins/design-systems-airbnb'}})).isError,true);
    assert.match(JSON.stringify(await client.callTool({name:'read-resource',arguments:{uri:'design://eidova/skills/unslop/files/SKILL.md'}})),/CC-BY-4.0/);
    assert.match(JSON.stringify(await client.readResource({uri:'design://eidova/design-templates/aster-atelier/files/example.html'})),/Aster/);
    const font=await client.callTool({name:'read-resource',arguments:{uri:'design://eidova/plugins/video-templates-frame-build-minimal/files/source/fonts/f6e772e776f666632.woff2'}});
    assert.equal(JSON.parse(font.content[0].text).mimeType,'font/woff2');
  } finally {await client.close();}
  console.log(JSON.stringify({version,files:packed.files.length,packedBytes:packed.size,unpackedBytes:packed.unpackedSize,scope:'tarball install, assets, diagnostics and stdio core from a path containing spaces'}));
} finally {assert.equal(path.dirname(directory),os.tmpdir());await rm(directory,{recursive:true,force:true});}
