import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,rename,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const directory=await mkdtemp(path.join(os.tmpdir(),'Open Design Package '));
const npm=process.env.npm_execpath;assert.ok(npm,'Run through npm run smoke:package.');
try {
  const report=JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--ignore-scripts','--pack-destination',directory],{cwd:root,encoding:'utf8'}));
  const entries=Array.isArray(report)?report:Object.values(report);
  assert.equal(entries.length,1,'Expected one packed package.');
  const packed=entries[0];
  assert.ok(packed.files.some(file=>file.path==='dist/stdio.js'));
  assert.ok(packed.files.some(file=>file.path==='content/design-families.json'));
  for(const notice of ['LICENSE','NOTICE','assets/LICENSE','assets/TABLER-LICENSE','vendor/upstream/LICENSE'])assert.ok(packed.files.some(file=>file.path===notice),`Missing notice: ${notice}`);
  for(const document of ['README.md','CHANGELOG.md','SECURITY.md','server.json','docs/CLIENTS.md','docs/BENCHMARK.md','docs/DESIGN-FAMILIES.md','docs/DTCG.md','docs/RELEASE-CANDIDATE.md','docs/SOL-IMPLEMENTATION-PLAN.md'])assert.ok(packed.files.some(file=>file.path===document),`Missing release document: ${document}`);
  assert.ok(packed.files.every(file=>!/(^|\/)(\.work|\.open-design|private-captures|\.env|node_modules)(\/|$)/.test(file.path)));
  assert.equal(path.basename(packed.filename),packed.filename);
  const consumer=path.join(directory,'consumer with spaces');await mkdir(consumer);
  execFileSync(process.execPath,[npm,'install','--ignore-scripts','--no-audit','--no-fund','--no-package-lock',path.join(directory,packed.filename)],{cwd:consumer,encoding:'utf8'});
  const entry=path.join(consumer,'node_modules/open-design-mcp/dist/stdio.js');
  const version=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version;
  assert.equal(execFileSync(process.execPath,[entry,'--version'],{cwd:consumer,encoding:'utf8'}).trim(),version);
  assert.match(execFileSync(process.execPath,[entry,'doctor'],{cwd:consumer,encoding:'utf8'}),/package assets available/);
  const asset=path.join(consumer,'node_modules/open-design-mcp/content/design-families.json');
  await rename(asset,asset+'.missing');
  try {assert.throws(()=>execFileSync(process.execPath,[entry,'doctor'],{cwd:consumer,stdio:'pipe'}),error=>/Reinstall the package or rebuild/.test(String(error.stderr)));}
  finally {await rename(asset+'.missing',asset);}
  assert.throws(()=>execFileSync(process.execPath,[entry,'--profile','invalid'],{cwd:consumer,stdio:'pipe'}));
  const client=new Client({name:'packed-package-client',version:'1'});
  try {
    await client.connect(new StdioClientTransport({command:process.execPath,args:[entry,'--profile','core'],cwd:consumer}));
    assert.equal((await client.listTools()).tools.length,11);
    assert.ok(!(await client.callTool({name:'find-design-system',arguments:{query:'editorial'}})).isError);
    assert.match(JSON.stringify(await client.readResource({uri:'design://workflow/v1'})),/version 1/);
  } finally {await client.close();}
  console.log(JSON.stringify({version,files:packed.files.length,packedBytes:packed.size,unpackedBytes:packed.unpackedSize,scope:'tarball install, assets, diagnostics and stdio core from a path containing spaces'}));
} finally {assert.equal(path.dirname(directory),os.tmpdir());await rm(directory,{recursive:true,force:true});}
