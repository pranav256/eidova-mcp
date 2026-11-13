import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resourcePath } from './resources.js';
import { baseUrl } from './catalog.js';

export const bundledKinds = ['design-systems','design-templates','plugins','templates','catalogs','skills'] as const;
export type BundledEntry = {kind:typeof bundledKinds[number];id:string;sourcePath?:string;name:string;description:string;category:string;license:string;entrypoint:string;sourceUrl:string;preview?:{type:'html';path:string}|{type:'image'|'video';url:string};attributionUris?:string[];licensePaths:string[];files:{path:string;bytes:number;sha256:string;binary:boolean;mimeType?:string}[]};
type Bundle = {repository:string;revision:string;entries:BundledEntry[]};
const bundle = readFile(resourcePath('content/open-design/index.json'), 'utf8').then(text => JSON.parse(text) as Bundle);
export const resourceNote = 'Eidova bundled systems, components, templates, plugin manifests and assets. Read the manifest, entrypoint, build instructions and licenses; retrieve companion files as needed. Some packages link to external workflows or media. File reads return data, and HTML previews run in an isolated sandbox. Existing project rules and user permissions still apply.';
export const entryUri = (entry:Pick<BundledEntry,'kind'|'id'>) => `design://open-design/${entry.kind}/${entry.id}`;
export const fileUri = (entry:Pick<BundledEntry,'kind'|'id'>, file:string) => `${entryUri(entry)}/files/${file.split('/').map(encodeURIComponent).join('/')}`;
const sourcePath = (entry:BundledEntry) => entry.sourcePath ?? `${entry.kind}/${entry.id}`;
const previewFiles = bundle.then(({entries}) => new Map<string,{entry:BundledEntry;path:string}>(entries.flatMap(entry => entry.files.map(file => [`${sourcePath(entry)}/${file.path}`, {entry,path:file.path}] as const))));
export async function bundledPreviewFile(path:string) {
  const match=(await previewFiles).get(path);
  return match ? bundledFile(match.entry.kind,match.entry.id,match.path) : null;
}
export async function bundledEntries() {return (await bundle).entries;}
export async function findBundledEntry(kind:string, id:string) {return (await bundledEntries()).find(entry => entry.kind === kind && entry.id === id);}
export async function searchResources(query='', kind?:string, limit=8, offset=0) {
  const terms = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const entries = (await bundledEntries()).filter(entry => !kind || entry.kind === kind).map(entry => {
    const title = `${entry.id} ${entry.name}`.toLowerCase();
    const body = `${title} ${entry.category} ${entry.description}`.toLowerCase();
    return {entry,score:terms.every(term => body.includes(term)) ? terms.reduce((sum,term) => sum + (title.includes(term)?3:1), 0) + 1 : 0};
  }).filter(item => item.score > 0).sort((a,b) => b.score-a.score || bundledKinds.indexOf(a.entry.kind)-bundledKinds.indexOf(b.entry.kind) || a.entry.id.localeCompare(b.entry.id));
  return {total:entries.length,offset,nextOffset:offset+limit<entries.length?offset+limit:null,note:resourceNote,
    matches:entries.slice(offset,offset+limit).map(({entry:{files,licensePaths,...entry}}) => ({...entry,fileCount:files.length,uri:entryUri(entry),entrypointUri:fileUri(entry,entry.entrypoint),next:{tool:'read-resource',arguments:{uri:entryUri(entry)}}}))};
}
export async function bundledManifest(entry:BundledEntry) {
  const {repository,revision} = await bundle;
  const endpoint=`${baseUrl()}/api/resources/${entry.kind}/${entry.id}`;
  return { ...entry, repository, revision, note:resourceNote,
    ...(entry.preview?.type==='html'?{preview:{...entry.preview,url:`${endpoint}/preview?path=${encodeURIComponent(entry.preview.path)}`}}:{}),
    licenses:entry.licensePaths.map(path => {const relative=path.split('/').slice(2).join('/');return {path,uri:path==='LICENSE'?'design://open-design/license':fileUri(entry,relative),sourceUrl:`${repository}/blob/${revision}/${path==='LICENSE'?path:sourcePath(entry)+'/'+relative}`};}),
    files:entry.files.map(file => ({...file,uri:fileUri(entry,file.path),url:`${endpoint}/file?path=${encodeURIComponent(file.path)}`,...(file.mimeType==='text/html'?{previewUrl:`${endpoint}/preview?path=${encodeURIComponent(file.path)}`}:{})})) };
}
export async function bundledFile(kind:string, id:string, file:string) {
  const entry = await findBundledEntry(kind,id);
  const metadata = entry?.files.find(item => item.path === file);
  if (!metadata || file.split('/').some(part => part === '..' || !part) || file.includes('\\')) return null;
  const bytes = await readFile(resourcePath(`content/open-design/${sourcePath(entry!)}/${file}`));
  if (bytes.length !== metadata.bytes || createHash('sha256').update(bytes).digest('hex') !== metadata.sha256) throw new Error('Bundled resource integrity check failed.');
  return {bytes,metadata};
}

export async function readBundledResource(uri:string, offset=0, limit=12000) {
  if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>24000) throw new Error('Use a nonnegative offset and a limit from 1 to 24000 characters.');
  let bytes:Buffer, path:string, sha256:string, url:string;
  if(uri==='design://open-design/license') {
    bytes=await readFile(resourcePath('content/open-design/LICENSE'));
    path='LICENSE';sha256=createHash('sha256').update(bytes).digest('hex');url=`${baseUrl()}/api/resources/license`;
  } else {
    const match=uri.match(/^design:\/\/open-design\/([a-z-]+)\/([a-z0-9-]+)(?:\/files\/(.+))?$/);
    if(!match)throw new Error('Use a bundled resource URI returned by search-resources.');
    const [,kind,id,encodedPath]=match;
    const entry=await findBundledEntry(kind,id);
    if(!entry)throw new Error('Bundled resource not found.');
    if(!encodedPath)return {uri,...await bundledManifest(entry)};
    try {path=decodeURIComponent(encodedPath);} catch {throw new Error('Invalid resource file path.');}
    const file=await bundledFile(kind,id,path);
    if(!file)throw new Error('Bundled file not found.');
    ({bytes}=file);sha256=file.metadata.sha256;
    url=`${baseUrl()}/api/resources/${kind}/${id}/file?path=${encodeURIComponent(path)}`;
    if(file.metadata.binary)return {uri,path,sha256,bytes:bytes.length,url,binary:true,mimeType:file.metadata.mimeType??'application/octet-stream',note:'Download the original binary file from url; binary content is not expanded into tool context.'};
  }
  const characters=Array.from(bytes.toString('utf8'));
  if(offset>characters.length)throw new Error('Offset exceeds the file length.');
  const nextOffset=offset+limit<characters.length?offset+limit:null;
  return {uri,path,sha256,bytes:bytes.length,url,note:resourceNote,offset,totalCharacters:characters.length,nextOffset,
    text:characters.slice(offset,offset+limit).join(''),...(nextOffset===null?{}:{next:{tool:'read-resource',arguments:{uri,offset:nextOffset,limit}}})};
}
