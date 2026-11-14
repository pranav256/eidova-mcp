import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { curateResources } from './curate-resources.mjs';

const revision = 'b4ec310921f49ae512de1f0a1f3a4e7ce3d05f2f';
const repository = 'https://github.com/nexu-io/open-design';
const source = path.resolve(process.argv[2] || '../.reference/nexu-open-design');
const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.join(root, 'content/open-design');
const git = (...args) => execFileSync('git', ['-c', `safe.directory=${source.replaceAll('\\', '/')}`, '-C', source, ...args], { encoding: 'utf8' });
assert.equal(git('rev-parse', 'HEAD').trim(), revision, 'Review provenance before importing another revision.');
const roots = ['design-systems', 'skills', 'design-templates', 'plugins/_official', 'templates', 'data/plugin-previews/manifest.json', 'LICENSE', 'NOTICE'];
assert.equal(git('status', '--porcelain', '--untracked-files=no', '--', ...roots).trim(), '', 'Import a clean source checkout.');
const paths = git('ls-files', '-z', '--', ...roots).split('\0').filter(Boolean).sort();
const entries = [];
const files = new Map();
const excludedFiles = [];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
for (const name of paths) {
  if (name.endsWith('/.gitignore')) {excludedFiles.push({path:name,reason:'Repository ignore rules; npm excludes this control file.'});continue;}
  assert.ok(!name.split('/').some(part => !part || part === '..' || part === '.') && !name.includes('\\'), `Unsafe path: ${name}`);
  assert.ok((await lstat(path.join(source, name))).isFile(), `Only regular files: ${name}`);
  files.set(name, await readFile(path.join(source, name)));
}
const rootLicense = files.get('LICENSE').toString('utf8');
assert.match(rootLicense, /Apache License[\s\S]*Version 2\.0/);
// Only discovery copy is parsed; original frontmatter and companion files remain verbatim.
function field(text, key) {
  const match = text.match(new RegExp(`^${key}: *([^\\r\\n]*)(?:\\r?\\n((?:[ \\t]+[^\\r\\n]*\\r?\\n)*))?`, 'm'));
  if (!match) return '';
  return (/^[>|][-+]?\s*$/.test(match[1]) ? match[2] || '' : match[1]).trim().replace(/\s+/g, ' ').replace(/^(["'])(.*)\1$/, '$2');
}
const mimeTypes = {'.md':'text/markdown','.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.mp4':'video/mp4','.mp3':'audio/mpeg','.woff2':'font/woff2','.ttf':'font/ttf','.otf':'font/otf','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.gz':'application/gzip'};
const knownLicenses = new Set(['Apache-2.0','MIT','CC-BY-4.0','OFL-1.1']);
function addEntry(kind, id, sourcePath, entrypoint, metadata = {}, packageFiles = [...files.keys()].filter(file => file.startsWith(sourcePath + '/'))) {
  assert.match(id, /^[a-z0-9-]+$/);
  const prefix = sourcePath + '/';
  const body = files.get(prefix + entrypoint).toString('utf8');
  const notices = packageFiles.filter(file => /(?:licen[sc]e|notice|(?:^|[-/])ofl|attributions?)[^/]*$/i.test(file));
  let license = metadata.license || 'Apache-2.0';
  assert.ok(knownLicenses.has(license), `Review license: ${sourcePath}: ${license}`);
  for (const notice of notices.filter(file => /(?:^|\/)licen[sc]e(?:\.[^/]*)?$/i.test(file))) {
    const text = files.get(notice).toString('utf8');
    assert.ok(/MIT License|Apache License|SIL OPEN FONT LICENSE/.test(text), `Review license: ${notice}`);
    if (!metadata.license && /MIT License/.test(text)) license = 'MIT';
  }
  const declared = field(body.split(/^---\s*$/m)[1] || '', 'license');
  assert.ok(!declared || knownLicenses.has(declared) || /LICENSE/i.test(declared) && notices.length, `Review declared license: ${sourcePath}`);
  if (knownLicenses.has(declared)) license = declared;
  const candidates = [metadata.files?.components, metadata.od?.preview?.entry, 'components.html', 'example.html', 'index.html', 'template.html'];
  const previewPath = candidates.map(file => file?.replace(/^\.\//,'')).find(file => file && packageFiles.includes(prefix + file)) || packageFiles.map(file => file.slice(prefix.length)).find(file => file.endsWith('.html'));
  const upstreamPreview = metadata.od?.preview;
  let preview = previewPath ? {type:'html',path:previewPath} : undefined;
  if (!preview && ['image','video'].includes(upstreamPreview?.type)) {
    const url = upstreamPreview.type === 'video' ? upstreamPreview.video : upstreamPreview.poster;
    if (typeof url === 'string' && /^https:\/\//.test(url) && !new URL(url).username && !new URL(url).password) preview = {type:upstreamPreview.type,url};
  }
  const declaration = metadata.license && packageFiles.includes(prefix + 'open-design.json') ? [prefix + 'open-design.json'] : [];
  entries.push({kind, id, sourcePath, name: metadata.title || metadata.name || field(body, 'en_name') || field(body, 'name') || id,
    description: metadata.description || field(body, 'description') || `Bundled ${id} reference.`,
    category: metadata.category || (kind === 'skills' ? 'Skills' : metadata.od?.mode || 'Design templates'), license, entrypoint,
    sourceUrl: `${repository}/tree/${revision}/${sourcePath}`, ...(preview ? {preview} : {}),
    ...(sourcePath.startsWith('plugins/_official/video-templates/') ? {attributionUris:['design://open-design/catalogs/video-attributions']} : {}),
    licensePaths: ['LICENSE', ...new Set([...notices, ...declaration].map(file => `${kind}/${id}/${file.slice(prefix.length)}`))],
    files: packageFiles.map(file => {
      const bytes = files.get(file), extension = path.extname(file).toLowerCase();
      const binary = ['.png','.jpg','.jpeg','.gif','.webp','.mp4','.mp3','.woff2','.ttf','.otf','.glb','.gz'].includes(extension) || bytes.includes(0) || !bytes.equals(Buffer.from(bytes.toString('utf8')));
      return {path:file.slice(prefix.length),bytes:bytes.length,sha256:hash(bytes),binary,mimeType:mimeTypes[extension] || (binary ? 'application/octet-stream' : 'text/plain')};
    }),
  });
}
for (const [name] of files) {
  const match = name.match(/^(design-systems|skills|design-templates)\/([a-z0-9-]+)\/(DESIGN|SKILL)\.md$/);
  if (match && match[3] === (match[1] === 'design-systems' ? 'DESIGN' : 'SKILL')) {
    const [,kind,id,document] = match, sourcePath = `${kind}/${id}`;
    const manifest = files.get(`${sourcePath}/${kind === 'design-systems' ? 'manifest.json' : 'open-design.json'}`);
    const metadata = manifest ? JSON.parse(manifest) : {};
    if (kind === 'design-systems' && manifest) assert.equal(metadata.id,id);
    addEntry(kind,id,sourcePath,document + '.md',metadata);
  }
  const plugin = name.match(/^plugins\/_official\/([a-z0-9-]+)\/([a-z0-9-]+)\/open-design\.json$/);
  if (plugin) {
    const [,group,id] = plugin, sourcePath = `plugins/_official/${group}/${id}`;
    const metadata = JSON.parse(files.get(name));
    addEntry('plugins',`${group}-${id}`,sourcePath,'open-design.json',{...metadata,category:group.replaceAll('-',' ')});
  }
}
for (const id of ['deck-framework','kami-deck']) addEntry('templates',id,'templates',id + '.html',{name:id.replaceAll('-',' '),category:'Deck frameworks'},['templates/' + id + '.html']);
addEntry('templates','otd-operations-brief','templates/live-artifacts/otd-operations-brief','README.md',{name:'Operations brief',category:'Live artifacts'});
addEntry('catalogs','plugin-previews','data/plugin-previews','manifest.json',{name:'Plugin preview index',category:'Source documentation'},['data/plugin-previews/manifest.json']);
addEntry('catalogs','video-attributions','plugins/_official/video-templates','HYPERFRAMES-ATTRIBUTIONS.md',{name:'Hyperframes attributions',category:'Source documentation'},['plugins/_official/video-templates/HYPERFRAMES-ATTRIBUTIONS.md']);
assert.equal(entries.filter(entry => entry.kind === 'design-systems').length, 152);
assert.equal(entries.filter(entry => entry.kind === 'skills').length, 169);
assert.equal(entries.filter(entry => entry.kind === 'design-templates').length, 115);
assert.equal(entries.filter(entry => entry.kind === 'plugins').length, 479);
assert.equal(entries.length,920);
assert.equal(new Set(entries.map(entry => entry.kind + '/' + entry.id)).size,entries.length);
assert.ok(entries.every(entry => entry.files.length <= 500 && entry.files.every(file => file.bytes <= 16 * 1024 * 1024)), 'Review reader bounds before importing larger packages.');
const included = new Set(['LICENSE', ...['NOTICE', 'design-systems/README.md', 'skills/README.md', 'design-templates/AGENTS.md', 'plugins/README.md'].filter(name => files.has(name))]);
for (const entry of entries) for (const file of entry.files) included.add(`${entry.sourcePath}/${file.path}`);
for (const name of included) {
  const output = path.join(destination, name);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, files.get(name));
}
const catalog = { repository, revision, license: 'Apache-2.0 with per-package license declarations and asset notices', excludedFiles, entries };
await writeFile(path.join(destination, 'index.json'), JSON.stringify(catalog, null, 2) + '\n');
const website = process.argv[3];
if (website) await writeFile(path.resolve(website, 'src/resource-catalog.json'), JSON.stringify({ repository, revision,
  entries: entries.map(({files, licensePaths, ...entry}) => ({...entry, fileCount: files.length})) }, null, 2) + '\n');
console.log(JSON.stringify({revision, ...await curateResources(website)}));
