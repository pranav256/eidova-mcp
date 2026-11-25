import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffTokens } from '../src/token-diff.js';
import { previewInstall } from '../src/install-preview.js';
import {mkdtemp,mkdir,copyFile,writeFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

test('token diff reports mode-scoped additions, removals and changes', () => {
  const before = ':root { --primary: #111111; } .dark { --primary: #eeeeee; --radius: 8px; }';
  const after = ':root { --primary: #222222; --background: #fff; } .dark { --primary: #eeeeee; }';
  assert.deepEqual(diffTokens(before, after, 'css').changes, [
    { scope: 'light', path: ['--background'], kind: 'added', before: undefined, after: { type: undefined, value: '#fff' } },
    { scope: 'light', path: ['--primary'], kind: 'changed', before: { type: undefined, value: '#111111' }, after: { type: undefined, value: '#222222' } },
    { scope: 'dark', path: ['--radius'], kind: 'removed', before: { type: undefined, value: '8px' }, after: undefined },
  ]);
});

test('install preview resolves local dependencies and flags conflicts', async () => {
  const result = await previewInstall('minimal-light', ['button'], {
    files: ['src/components/ui/button.tsx', 'src/lib/utils.ts'],
    paths: { ui: 'src/components/ui', lib: 'src/lib', css: 'src/index.css', utils: 'src/lib/utils.ts' },
    dependencies: { react: '19.2.0' },
    devDependencies: {},
  });
  assert.ok(result.items.includes('button'));
  assert.equal(result.files.find(file => file.path.endsWith('/button.tsx'))?.status, 'existing');
  assert.ok(result.dependencies.some(dependency => dependency.requested === '@radix-ui/react-slot'));
  assert.deepEqual(result.unresolvedRegistryDependencies, []);
});

test('token diff reports changed DTCG aliases in the dark group', () => {
  const doc = (alias: string) => JSON.stringify({ dark: {
    $extensions: { 'io.eidova.mode': 'dark' },
    accent: { $type: 'color', $value: alias },
  } });
  const { changes } = diffTokens(doc('{primary}'), doc('{secondary}'), 'dtcg');
  assert.equal(changes.length, 1);
  assert.equal(changes[0].scope, 'dark');
  assert.equal(changes[0].after?.value, '{secondary}');
});

test('the private launcher consumes its archive argument and explicitly selects full',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'eidova-private-launcher-'));
  try {
    await mkdir(join(directory,'scripts'));await mkdir(join(directory,'dist'));
    await copyFile(new URL('../scripts/start-private.mjs',import.meta.url),join(directory,'scripts/start-private.mjs'));
    await writeFile(join(directory,'dist/stdio.js'),'process.stdout.write(JSON.stringify({args:process.argv.slice(2),archive:process.env.EIDOVA_PRIVATE_ARCHIVE}));');
    const archive=join(directory,'private archive');
    const result=JSON.parse(execFileSync(process.execPath,[join(directory,'scripts/start-private.mjs'),archive],{encoding:'utf8'}));
    assert.deepEqual(result.args,['--profile','full']);assert.equal(result.archive,archive);
  } finally {assert.equal(dirname(directory),tmpdir());await rm(directory,{recursive:true,force:true});}
});

test('standalone stdio serves catalog and persisted themes on loopback and respects a configured origin',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'eidova-stdio-registry-'));
  try {
    for(const configured of [undefined,'https://registry.example.test']) {
      const client=new Client({name:'stdio-registry-test',version:'1'});
      try {
        await client.connect(new StdioClientTransport({command:process.execPath,args:['--import',import.meta.resolve('tsx'),fileURLToPath(new URL('../src/stdio.ts',import.meta.url)),'--profile','full'],cwd:directory,...(configured?{env:{EIDOVA_BASE_URL:configured}}:{})}));
        const kit=await client.callTool({name:'get-design-system-kit',arguments:{target:'react',designSystemId:'minimal-light',component:['button']}});
        assert.ok(!kit.isError);const details=kit.structuredContent as {designContext:{url:string};installCommand:string};
        const origin=new URL(details.designContext.url).origin;
        assert.ok(details.installCommand.includes(origin+'/registry/'));
        if(configured){assert.equal(origin,configured);continue;}
        assert.match(origin,/^http:\/\/127\.0\.0\.1:\d+$/);
        const component=await fetch(origin+'/registry/minimal-light/button.json');assert.equal(component.status,200);assert.ok((await component.json()).files.length>0);
        const created=await client.callTool({name:'create-design-system',arguments:{prompt:'Local theme',baseDesignSystemId:'minimal-light'}});
        assert.ok(!created.isError);const projectId=(created.structuredContent as {projectId:string}).projectId;
        const project=await fetch(origin+'/projects/'+projectId);assert.equal(project.status,200);
        const registry=await fetch((await project.json()).registryUrl);assert.equal(registry.status,200);
        const buttonUrl=origin+'/api/projects/'+projectId+'/registry/button.json';
        assert.ok((await registry.json()).registryDependencies.includes(buttonUrl));
        const button=await fetch(buttonUrl);assert.equal(button.status,200);assert.ok((await button.json()).files.length>0);
      } finally {await client.close();}
    }
  } finally {assert.equal(dirname(directory),tmpdir());await rm(directory,{recursive:true,force:true});}
});
