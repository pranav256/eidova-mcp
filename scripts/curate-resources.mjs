import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../content/open-design/', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourcePath = entry => entry.sourcePath ?? `${entry.kind}/${entry.id}`;
function diskPath(relative) {
  assert.ok(!/[\\:\x00-\x1f]/.test(relative) && !relative.split('/').some(part => !part || part === '.' || part === '..'));
  const resolved = path.resolve(root, relative);
  assert.ok(resolved.startsWith(root), 'Resource paths must stay inside the bundle.');
  return resolved;
}

async function importUnslop() {
  const repository = 'https://github.com/heydamir/unslop';
  const revision = '97daa3eb365670ea3f87ed85356cbfcee18105a5';
  const treeResponse = await fetch(`https://api.github.com/repos/heydamir/unslop/git/trees/${revision}?recursive=1`, {signal:AbortSignal.timeout(30000)});
  assert.ok(treeResponse.ok, 'Could not load the pinned skill inventory.');
  const tree = await treeResponse.json();
  assert.equal(tree.truncated, false);
  const prefix = 'skills/unslop/';
  const names = tree.tree.filter(item => item.type === 'blob' && item.path.startsWith(prefix)).map(item => item.path).concat('LICENSE');
  const files = [];
  for (const name of names.sort()) {
    const response = await fetch(`https://raw.githubusercontent.com/heydamir/unslop/${revision}/${name}`, {signal:AbortSignal.timeout(30000)});
    assert.ok(response.ok, `Could not download ${name}.`);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.ok(bytes.length <= 16 * 1024 * 1024);
    const relative = name === 'LICENSE' ? 'LICENSE' : name.slice(prefix.length);
    const output = diskPath(prefix + relative);
    await mkdir(path.dirname(output), {recursive:true});
    await writeFile(output, bytes);
    const binary = bytes.includes(0) || !bytes.equals(Buffer.from(bytes.toString('utf8')));
    files.push({path:relative,bytes:bytes.length,sha256:hash(bytes),binary,mimeType:relative.endsWith('.webp')?'image/webp':relative.endsWith('.md')?'text/markdown':relative.endsWith('.mjs')?'text/javascript':'text/plain'});
  }
  return {kind:'skills',id:'unslop',sourcePath:'skills/unslop',name:'Unslop',description:'Polish an existing interface: audit its craft, preserve its product identity, refine spacing, copy, typography and interaction, then verify the rendered result.',category:'Interface craft',license:'CC-BY-4.0',entrypoint:'SKILL.md',repository,revision,sourceUrl:`${repository}/tree/${revision}/skills/unslop`,licensePaths:['skills/unslop/LICENSE'],files};
}

export async function curateResources(website) {
  const catalog = JSON.parse(await readFile(diskPath('index.json'), 'utf8'));
  const all = [...catalog.entries, ...catalog.legacyEntries ?? []];
  if (!all.some(entry => entry.kind === 'skills' && entry.id === 'unslop')) all.push(await importUnslop());
  const systems = new Map(all.filter(entry => entry.kind === 'design-systems').map(entry => [entry.id, entry]));
  const legacyEntries = all.filter(entry => {
    if (entry.kind === 'skills' && entry.id === 'ui-ux-pro-max') return true;
    if (entry.kind !== 'plugins' || !entry.id.startsWith('design-systems-')) return false;
    const system = systems.get(entry.id.slice('design-systems-'.length));
    const payload = entry.files.filter(file => !['README.md','open-design.json'].includes(file.path));
    return system && payload.length && payload.every(file => system.files.some(original => original.path === file.path && original.sha256 === file.sha256 && original.bytes === file.bytes));
  });
  assert.equal(legacyEntries.length, 137, 'Review curation when the pinned inventory changes.');
  const entries = all.filter(entry => !legacyEntries.includes(entry));
  assert.equal(entries.length, 784);
  const storage = new Map(), remove = new Map();
  for (const entry of [...entries, ...legacyEntries]) for (const file of entry.files) {
    const logicalPath = `${sourcePath(entry)}/${file.path}`;
    const current = file.storagePath ?? logicalPath;
    const bytes = await readFile(diskPath(current));
    assert.equal(bytes.length, file.bytes);
    assert.equal(hash(bytes), file.sha256, `Integrity: ${current}`);
    const key = `${file.sha256}:${file.bytes}`;
    const retained = storage.get(key) ?? current;
    storage.set(key, retained);
    if (retained !== logicalPath) file.storagePath = retained;
    else delete file.storagePath;
    if (current !== retained) remove.set(current, file.bytes);
  }
  for (const retained of storage.values()) remove.delete(retained);
  await writeFile(diskPath('index.json'), JSON.stringify({...catalog,entries,legacyEntries}, null, 2) + '\n');
  if (website) await writeFile(path.resolve(website,'src/resource-catalog.json'), JSON.stringify({entries:entries.map(({kind,id,name,description,category,license,entrypoint,preview,files}) => ({kind,id,name,description,category,license,entrypoint,...preview?{preview}:{},fileCount:files.length}))}, null, 2) + '\n');
  for (const relative of remove.keys()) await unlink(diskPath(relative));
  return {packages:entries.length,legacyLinks:legacyEntries.length,removedCopies:remove.size,savedBytes:[...remove.values()].reduce((sum,bytes) => sum + bytes, 0)};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await curateResources(process.argv[2])));
