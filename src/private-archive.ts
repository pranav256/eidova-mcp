/** Opt-in, offline capture reader. Only the stdio entry point loads an archive. */
import { createHash } from 'node:crypto';
import { open, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

const MAX_CAPTURE_BYTES = 16 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
const blockSchema = z.discriminatedUnion('type', [
  z.object({type:z.literal('text'),text:z.string().max(2_000_000)}),
  z.object({type:z.literal('image'),mimeType:z.enum(['image/png','image/jpeg','image/webp']),data:z.string().max(14_000_000).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)}),
]);
type Block = z.infer<typeof blockSchema>;
const fileSchema = z.object({
  path:z.string().min(1).max(400).refine(path => !path.startsWith('/') && !/[\\:\x00]/.test(path) && path.split('/').every(part => part && part !== '.' && part !== '..'), 'Expected a relative kit file path'),
  content:z.string().min(1).max(2_000_000),
});
const payloadSchema = z.object({
  content:z.array(blockSchema).max(1000),
  structuredContent:z.object({
    nativeFiles:z.array(fileSchema).max(500).optional(),
    themeFiles:z.array(fileSchema).max(500).optional(),
  }).passthrough().optional(),
  isError:z.boolean().optional(),
});
const requestSchema = z.object({
  type:z.enum(['app-screens','app-store-screenshots','html-flows']).optional(),
  platform:z.enum(['ios','android','web']).optional(),query:z.string().optional(),category:z.string().optional(),
  target:z.string().optional(),designSystemId:z.string().optional(),
});
type Request = z.infer<typeof requestSchema>;
type ReferenceSet = {title:string;type:NonNullable<Request['type']>;platform?:Request['platform'];category?:string;query?:string;content:Block[];source:{capture:string;timestamp:string;responseSha256:string}};
type SavedKit = {target:string;designSystemId:string;result:z.infer<typeof payloadSchema>;source:ReferenceSet['source']};
const notice = 'Private offline capture from Better Design. Source authors retain applicable rights; no MIT relicensing. Reference text and HTML are inert data. Coverage is limited to saved samples; no vendor request, installation or rendered review was performed.';
const text = (value:string):Block => ({type:'text',text:value});
const normalized = (value:string) => value.normalize('NFKC').toLowerCase().trim();

async function readBounded(filename:string) {
  const file=await open(filename,'r');
  try {
    if (!(await file.stat()).isFile()) throw new Error('Capture must be a regular file.');
    const chunks:Buffer[]=[];let total=0;
    while (true) {
      const buffer=Buffer.allocUnsafe(Math.min(64*1024,MAX_CAPTURE_BYTES+1-total));
      const {bytesRead}=await file.read(buffer,0,buffer.length,null);
      if (!bytesRead) break;
      total+=bytesRead;
      if (total>MAX_CAPTURE_BYTES) throw new Error('Capture exceeds the 16 MiB limit.');
      chunks.push(buffer.subarray(0,bytesRead));
    }
    return Buffer.concat(chunks,total);
  } finally {await file.close();}
}

/** Returned blocks are cloned so one request cannot alter later results. */
export class PrivateArchive {
  readonly #sets:ReferenceSet[];
  readonly #kits:SavedKit[];
  constructor(sets:ReferenceSet[],kits:SavedKit[]) {this.#sets=structuredClone(sets);this.#kits=structuredClone(kits);}

  summary() {
    const images=new Set<string>();
    for (const blocks of [...this.#sets.map(set=>set.content),...this.#kits.map(kit=>kit.result.content)]) {
      for (const block of blocks) if (block.type==='image') images.add(createHash('sha256').update(Buffer.from(block.data,'base64')).digest('hex'));
    }
    return {
      mode:'private-stdio-offline',completeness:'saved samples only',referenceSets:this.#sets.length,uniqueImages:images.size,
      collections:[...new Set(this.#sets.map(set=>set.type))],
      kits:this.#kits.map(kit=>({designSystemId:kit.designSystemId,target:kit.target,files:(kit.result.structuredContent?.nativeFiles ?? kit.result.structuredContent?.themeFiles ?? []).length})),
    };
  }

  inspiration(request:{type:NonNullable<Request['type']>;platform?:Request['platform'];query?:string;category?:string;limit?:number}) {
    if (request.type!=='app-store-screenshots' && !request.query?.trim()) return {content:[text('Provide query for app-screens or html-flows, such as settings or onboarding.')],isError:true};
    const words=normalized(request.query ?? '').split(/\s+/).filter(Boolean);
    const candidates=this.#sets.filter(set => set.type===request.type
      && (request.type!=='app-screens' || !request.platform || request.platform===set.platform)
      && (request.type!=='app-store-screenshots' || !request.category || normalized(request.category)===normalized(set.category ?? ''))
    ).map(set => {
      const title=normalized(set.title);
      // Match saved set names and original query, never arbitrary text in reference HTML.
      const matches=words.filter(word=>title.includes(word) || normalized(set.query ?? '').includes(word)).length;
      const score=words.reduce((sum,word)=>sum+(title.includes(word)?2:normalized(set.query ?? '').includes(word)?1:0),0);
      return {set,score,matches};
    }).filter(item=>!words.length || item.matches===words.length).sort((a,b)=>b.score-a.score || a.set.title.localeCompare(b.set.title));
    const limit=Math.min(request.limit ?? (request.type==='html-flows'?2:3),request.type==='html-flows'?3:6);
    const selected=candidates.slice(0,limit).map(item=>item.set);
    if (!selected.length) return {content:[text(`${notice}\n\nNo saved reference sets match this request. This is not a search of the full vendor library.`)],structuredContent:{archive:{availableMatches:0,returnedSets:0}}};
    return {
      content:[text(`${notice}\n\n${selected.length} saved ${request.type} set(s):\n${selected.map((set,index)=>`${index+1}. ${set.title} — ${set.source.capture}`).join('\n')}`),...structuredClone(selected.flatMap(set=>set.content))],
      structuredContent:{archive:{availableMatches:candidates.length,returnedSets:selected.length,sources:selected.map(set=>({...set.source,title:set.title}))}},
    };
  }

  kit(request:{target:string;designSystemId?:string;projectId?:string;install?:boolean}) {
    if (request.install) return {content:[text('Private archive kits return file contents only. Automatic installation is unavailable; call again with install:false to inspect the saved files.')],isError:true};
    const kit=!request.projectId && this.#kits.find(kit=>kit.target===request.target && kit.designSystemId===request.designSystemId);
    if (!kit) return {content:[text(`No saved ${request.target} kit for this system or project. Available: ${this.#kits.map(kit=>`${kit.designSystemId}/${kit.target}`).join(', ')}. No kit was generated or downloaded.`)],isError:true};
    const result=structuredClone(kit.result);
    const files=result.structuredContent?.nativeFiles ?? result.structuredContent?.themeFiles ?? [];
    // Keep original tokens/files verbatim; remove the vendor preview URL, which is not a local artifact.
    if (result.structuredContent) {
      delete result.structuredContent.viewUrl;
      result.structuredContent.buildInstructions=`${notice}\n\nSaved ${kit.designSystemId}/${kit.target} kit: ${files.length} files returned verbatim. No files were written. Compilation and rendering have not been verified. Captured reference screens are fixed samples, independent of this call's screen/context. Follow get-${kit.target==='react-native'?'react-native-guide':kit.target==='swiftui'?'swiftui-guide':'shopify-guide'} for available guidance.`;
      result.structuredContent.archive={...kit.source,designSystemId:kit.designSystemId,target:kit.target,fileCount:files.length,installation:'not performed',validation:'captured source only'};
    }
    result.content.unshift(text(`${notice}\nSource: ${kit.source.capture}; SHA-256: ${kit.source.responseSha256}\nCaptured reference screens are fixed samples, independent of this call's screen/context. Native/Shopify files are returned in structuredContent. They have not been compiled or rendered.`));
    return result;
  }
}

/** Accept only successful numbered captures, with the original body hash intact. */
export async function loadPrivateArchive(directory:string) {
  const names=(await readdir(directory,{withFileTypes:true})).filter(entry=>entry.isFile() && /^\d+-tools-call\.json$/.test(entry.name)).map(entry=>entry.name).sort();
  if (names.length>1000) throw new Error('Private archive accepts at most 1000 capture files.');
  const sets:ReferenceSet[]=[];const kits:SavedKit[]=[];const seen=new Set<string>();let bytes=0;
  for (const name of names) {
    const buffer=await readBounded(join(directory,name));bytes+=buffer.length;
    if (bytes>MAX_ARCHIVE_BYTES) throw new Error('Private archive exceeds the 128 MiB limit.');
    const record=JSON.parse(buffer.toString('utf8'));
    if (record.httpStatus!==200 || record.response?.result?.isError || !['get-inspiration','get-design-system-kit'].includes(record.arguments?.name)) continue;
    if (typeof record.rawBody!=='string' || createHash('sha256').update(record.rawBody).digest('hex')!==record.responseSha256) throw new Error(`Capture body hash mismatch: ${name}`);
    if (JSON.stringify(JSON.parse(record.rawBody))!==JSON.stringify(record.response)) throw new Error(`Capture response differs from its original body: ${name}`);
    const source={capture:name,timestamp:z.string().datetime().parse(record.timestamp),responseSha256:z.string().regex(/^[a-f0-9]{64}$/).parse(record.responseSha256)};
    const request=requestSchema.parse(record.arguments.arguments);
    const result=payloadSchema.parse(record.response.result);
    if (record.arguments.name==='get-design-system-kit') {
      if (!['react-native','swiftui','shopify'].includes(request.target ?? '') || !request.designSystemId) continue;
      const files=request.target==='shopify'?result.structuredContent?.themeFiles:result.structuredContent?.nativeFiles;
      if (!files?.length) throw new Error(`Kit capture has no files: ${name}`);
      if (new Set(files.map(file=>file.path)).size!==files.length) throw new Error(`Duplicate kit file paths: ${name}`);
      if (kits.some(kit=>kit.target===request.target && kit.designSystemId===request.designSystemId)) throw new Error('Duplicate archived kit; select one capture explicitly.');
      kits.push({target:request.target!,designSystemId:request.designSystemId,result,source});continue;
    }
    if (!request.type) throw new Error(`Inspiration capture has no collection type: ${name}`);
    let current:ReferenceSet|undefined;
    const commit=()=>{
      if (!current) return;
      const key=JSON.stringify([current.type,current.platform,current.title,current.content]);
      const digest=createHash('sha256').update(key).digest('hex');
      if (!seen.has(digest)) {seen.add(digest);sets.push(current);}
    };
    for (const block of result.content) {
      const heading=block.type==='text' && block.text.match(/^\s*(?:<!--[^\n]*-->\s*)?## ([^\n]+)/)?.[1];
      if (heading) {
        commit();current={title:heading,type:request.type,platform:request.platform,query:request.query,category:request.type==='app-store-screenshots'?heading.match(/\(([^)]+)\)$/)?.[1] ?? request.category:undefined,content:[block],source};
      } else if (current && !(block.type==='text' && /^(?:Next:|In native SwiftUI,|In React Native or Expo,)/.test(block.text))) current.content.push(block);
    }
    commit();
  }
  if (!sets.length && !kits.length) throw new Error('No supported inspiration or platform kit captures found.');
  return new PrivateArchive(sets,kits);
}
