import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const revision = 'b4ec310921f49ae512de1f0a1f3a4e7ce3d05f2f';
const repository = 'https://github.com/nexu-io/open-design';
const source = path.resolve(process.argv[2] || '../.reference/nexu-open-design');
const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.join(root, 'content/open-design');
const git = (...args) => execFileSync('git', ['-c', `safe.directory=${source.replaceAll('\\', '/')}`, '-C', source, ...args], { encoding: 'utf8' });
assert.equal(git('rev-parse', 'HEAD').trim(), revision, 'Review provenance before importing another revision.');
assert.equal(git('status', '--porcelain', '--untracked-files=no', '--', 'design-systems', 'skills', 'LICENSE').trim(), '', 'Import a clean source checkout.');
const paths = git('ls-files', '-z', '--', 'design-systems', 'skills', 'LICENSE', 'NOTICE').split('\0').filter(Boolean).sort();
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
for (const [name, bytes] of files) {
  const match = name.match(/^(design-systems|skills)\/([a-z0-9-]+)\/(DESIGN|SKILL)\.md$/);
  if (!match) continue;
  const [, kind, id] = match;
  if (match[3] !== (kind === 'skills' ? 'SKILL' : 'DESIGN')) continue;
  const prefix = `${kind}/${id}/`;
  const body = bytes.toString('utf8');
  const manifest = files.get(prefix + 'manifest.json');
  const metadata = manifest ? JSON.parse(manifest) : null;
  if (metadata) assert.equal(metadata.id, id);
  const packageFiles = [...files.keys()].filter(file => file.startsWith(prefix));
  const notices = packageFiles.filter(file => /(?:^|\/)(?:licen[sc]e|notice)(?:\.[^/]*)?$/i.test(file));
  let license = 'Apache-2.0';
  for (const notice of notices.filter(file => /licen[sc]e/i.test(file))) {
    const text = files.get(notice).toString('utf8');
    assert.ok(/MIT License|Apache License/.test(text), `Review license: ${notice}`);
    if (/MIT License/.test(text)) license = 'MIT';
  }
  const declared = field(body.split(/^---\s*$/m)[1] || '', 'license');
  assert.ok(!declared || declared === 'MIT' && license === 'MIT' || /LICENSE/i.test(declared) && notices.length, `Review declared license: ${name}`);
  entries.push({ kind, id, name: metadata?.name || field(body, 'name') || id,
    description: metadata?.description || field(body, 'description') || `Bundled ${id} reference.`,
    category: metadata?.category || 'Skills', license, entrypoint: name.slice(prefix.length),
    sourceUrl: `${repository}/tree/${revision}/${kind}/${id}`,
    licensePaths: ['LICENSE', ...notices],
    files: packageFiles.map(file => ({ path: file.slice(prefix.length), bytes: files.get(file).length, sha256: hash(files.get(file)), binary: file.endsWith('.png') })),
  });
}
assert.equal(entries.filter(entry => entry.kind === 'design-systems').length, 152);
assert.equal(entries.filter(entry => entry.kind === 'skills').length, 169);
const included = new Set(['LICENSE', ...['NOTICE', 'design-systems/README.md', 'skills/README.md'].filter(name => files.has(name))]);
for (const entry of entries) for (const file of entry.files) included.add(`${entry.kind}/${entry.id}/${file.path}`);
for (const name of included) {
  const output = path.join(destination, name);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, files.get(name));
}
const catalog = { repository, revision, license: 'Apache-2.0 with per-package MIT notices', excludedFiles, entries };
await writeFile(path.join(destination, 'index.json'), JSON.stringify(catalog, null, 2) + '\n');
const website = process.argv[3];
if (website) await writeFile(path.resolve(website, 'src/resource-catalog.json'), JSON.stringify({ repository, revision,
  entries: entries.map(({files, licensePaths, ...entry}) => ({...entry, fileCount: files.length})) }, null, 2) + '\n');
console.log(JSON.stringify({revision, packages: entries.length, files: included.size, bytes: [...included].reduce((sum, name) => sum + files.get(name).length, 0)}));
