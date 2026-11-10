import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { designFamilies, registryItem, sourceItem } from '../src/catalog.js';

const website=path.resolve(process.argv[2]??fileURLToPath(new URL('../../open-design-website',import.meta.url)));
const names=['button','input','card','dialog','table','sidebar'];
const manifest=[];
for(const family of designFamilies) {
  const id=family.representative;
  const directory=path.join(website,'src/previews/kits',id);
  const hashes:Record<string,string>={};
  const queue=[...names,'globals'];const visited=new Set<string>();
  while(queue.length) {
    const name=queue.shift()!;if(visited.has(name))continue;visited.add(name);
    const item=await sourceItem(id,name);
    const resolved=await registryItem(id,name);
    for(const dependency of resolved.registryDependencies??[]) {const local=dependency.match(/\/registry\/[^/]+\/([a-z0-9_-]+)\.json$/i);if(local)queue.push(local[1]);}
    for(const file of item.files??[]) {
      assert.ok(!file.path.includes('..')&&!path.isAbsolute(file.path));
      const destination=path.join(directory,file.path);
      await mkdir(path.dirname(destination),{recursive:true});
      await writeFile(destination,file.content);
      assert.ok(!file.content.includes('@iconify/react'),`Preview requires a bundled icon: ${id}/${file.path}`);
      hashes[file.path]=createHash('sha256').update(file.content).digest('hex');
    }
  }
  const globals=await sourceItem(id,'globals');
  const cssFile=globals.files!.find(file=>file.path.endsWith('.css'))!;
  const headingFont=id==='monochrome-industrial'?'var(--font-display)':cssFile.content.match(/html\s*\{[^}]*font-family:\s*([^;]+)/)?.[1]?.replace(/\s+/g,' ')??'inherit';
  const fonts=id==='monochrome-industrial'?['@fontsource/space-grotesk/latin-400.css','@fontsource/space-grotesk/latin-500.css','@fontsource/space-mono/latin-400.css','@fontsource/space-mono/latin-700.css','@fontsource/doto/latin-400.css','@fontsource/doto/latin-500.css','@fontsource/doto/latin-700.css']:['editorial-dark','vibrant-dark'].includes(id)?['@fontsource/inter/latin-400.css','@fontsource/inter/latin-500.css']:[];
  const sidebar=await sourceItem(id,'sidebar');
  const sidebarUsesLabel=(sidebar.files??[]).some(file=>/label:\s*string/.test(file.content));
  await writeFile(path.join(directory,'index.ts'),fonts.map(font=>`import '${font}';`).join('\n')+'\n'+names.map(name=>`export * from './components/ui/${name}';`).join('\n')+`\nimport css from './${cssFile.path}?inline';\nexport { css };\nexport const headingFont=${JSON.stringify(headingFont)};\nexport const sidebarUsesLabel=${sidebarUsesLabel};\n`);
  manifest.push({id,family:family.id,hashes});
}
await writeFile(path.join(website,'src/previews/manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await writeFile(path.join(website,'src/design-families.json'),JSON.stringify(designFamilies,null,2)+'\n');
assert.equal(manifest.length,8);
const notices=[['better-design-MIT.txt',fileURLToPath(new URL('../assets/LICENSE',import.meta.url))],['tabler-MIT.txt',fileURLToPath(new URL('../assets/TABLER-LICENSE',import.meta.url))],...['geist','inter','space-grotesk','space-mono','doto'].map(font=>[font+'-OFL.txt',path.join(website,'node_modules/@fontsource',font,'LICENSE')])];
for(const folder of ['licenses','public/licenses']) {
  await mkdir(path.join(website,folder),{recursive:true});
  for(const[name,source]of notices)await copyFile(source,path.join(website,folder,name));
}
// Verify synchronization without altering any public registry source.
for(const entry of manifest) for(const [file,hash] of Object.entries(entry.hashes)) assert.equal(createHash('sha256').update(await readFile(path.join(website,'src/previews/kits',entry.id,file))).digest('hex'),hash);
console.log(`Synced ${manifest.length} isolated specimens from exact public React registry files.`);
