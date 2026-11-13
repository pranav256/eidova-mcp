import './public-fetch.js';
import { createMcpServer, registerReviewTool } from '../vendor/upstream/runtime.mjs';
import { z } from 'zod';
import { baseUrl, catalog, designFamilies, searchCatalog, sourceItem } from './catalog.js';
import { coreTools, toolDescriptions, workflowNote } from './tool-descriptions.js';
import { readFile } from 'node:fs/promises';
import { resourcePath } from './resources.js';
import { getPrincipleByTopic, listPrinciples, searchPrinciples, getReviewRules } from './guidance.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createProvider } from './provider.js';
import { Projects, configSchema } from './projects.js';
import { apiDispatcher } from './local-api.js';
import type { JsonStore } from './store.js';
import { ProjectRulesStore } from './project-rules-store.js';
import { firstVisitInputSchema, handleFirstVisit } from './first-visit.js';
import type { PrivateArchive } from './private-archive.js';
import { normalizeDtcg } from './dtcg.js';
import { designContext } from './design-context.js';
import { bundledEntries, bundledFile, bundledKinds, bundledManifest, entryUri, findBundledEntry, readBundledResource, resourceNote, searchResources } from './bundled-resources.js';

const unavailable = ['make-sales-page','make-social-image','review-illustration','get-inspiration'];
type RuntimeCallback = (...args: unknown[]) => unknown;
type RuntimeTool = {handler:RuntimeCallback;inputSchema?:z.ZodObject;outputSchema?:z.ZodObject;description?:string;remove():void;update(changes:Record<string,unknown>):void};
function conciseSchema(schema:z.ZodType):z.ZodType {
  const visit=(value:unknown):unknown=>{
    if(value instanceof z.ZodType) return value.clone(visit(value.def) as typeof value.def).meta({});
    if(Array.isArray(value))return value.map(visit);
    if(value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype) return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,visit(item)]));
    return value;
  };
  return visit(schema) as z.ZodType;
}
const text = (value: string, structuredContent?: Record<string, unknown>) => ({content:[{type:'text' as const,text:value}],...(structuredContent ? {structuredContent} : {})});
export type ToolProfile='full'|'core';
export function createServer(store: JsonStore, identity?: string, privateArchive?: PrivateArchive, profile:ToolProfile='full') {
  if (privateArchive && !identity) throw new Error('Private captures require a private local workspace.');
  const projects = new Projects(store,identity);
  const server = createMcpServer({
    provider:createProvider(store,identity), apiFetch:apiDispatcher(projects,new ProjectRulesStore(store,identity)),
    name:'Eidova',version:'0.2.0',userId:identity,instructions:workflowNote,
    authContext:identity ? {kind:'api-key',apiKey:'local-workspace'} : undefined,
    enableDesignPanel:false, enableMobileKits:Boolean(privateArchive), enableShopifyKit:Boolean(privateArchive), enableReviewUiCode:true,
  });
  registerReviewTool(server);
  // These pinned-SDK registration handles expose supported update/remove APIs.
  const handles = (server as unknown as {_registeredTools:Record<string,RuntimeTool>})._registeredTools;
  handles['get-team-rules']?.update({
    description:'Read private workspace rules or the owned project guidelines, rules for selected parts, brand bans and exact screen specifications. Anonymous requests receive drafting guidance. Project rules require the owning workspace key.',
  });
  handles['set-team-rules']?.update({
    description:'Save an approved workspace rules document or one owned project guideline, part rule, brand ban or screen specification. Requires personApproved:true and a private workspace key. Read existing rules and obtain approval before replacing a different value with replaceExisting:true.',
  });
  handles['set-design-config']?.update({
    description:'Merge validated semantic colors, foreground pairs, radius, fonts and density into an owner-scoped custom theme. Requires its workspace key.',
    paramsSchema:{projectId:z.string().uuid(),config:configSchema,context:z.string().max(280).optional()},
  });
  handles['review-ui-code']?.update({
    description:'Deterministically review supplied React, CSS, HTML, SVG and SwiftUI source. Every file requires inline content. This server never reads caller-selected files from its own filesystem and does not execute submitted code.',
    paramsSchema:{files:z.array(z.object({path:z.string().min(1).max(400),content:z.string().max(120000)})).min(1).max(24),context:z.string().max(280).optional()},
  });
  for (const name of unavailable) if (name!=='get-inspiration' || !privateArchive) handles[name]?.remove();
  if (privateArchive) handles['get-inspiration']?.update({
    description:'Search saved private reference sets by collection, platform, category and query. Returns original notes, inert reference HTML and images from local captures, with source hashes. Only saved samples are searchable; no vendor requests or scripts are executed.',
    callback:(args: Parameters<PrivateArchive['inspiration']>[0]) => privateArchive.inspiration(args),
  });
  for (const [name, tool] of Object.entries(handles)) {
    if (/^get-(?:ui-principle|ux-principle|react-native-guide|swiftui-guide|three-js-guide|sales-principle|motion-guide)$/.test(name)) {
      tool.update({description:`Load ${privateArchive?'the configured private offline':'original Eidova'} ${name.replace(/^get-/,'').replaceAll('-',' ')} guidance. Omit topic and query to list available topics, or provide a topic/alias or query. Search uses local lexical ranking. ${privateArchive?'Saved captures preserve their provenance and may be incomplete.':'Content is independently authored; this is not the vendor’s hosted corpus.'}`});
    }
  }
  const kit = handles['get-design-system-kit'];
  if (kit) {
    const callback = kit.handler;
    const componentName=z.string().regex(/^(?:_shared|[a-z0-9][a-z0-9_-]{0,80})$/);
    const componentSelection=z.union([componentName,z.array(componentName).min(1).max(24)]).optional();
    kit.update({
      paramsSchema:{...kit.inputSchema!.shape,component:componentSelection,components:componentSelection},
      ...(privateArchive ? {
        description:'Return React/HTML/DTCG catalog kits, or saved private Linear react-native, swiftui and shopify file payloads. Archived files and tokens are verbatim captures, not newly generated, installed or rendered. Uncaptured mobile/Shopify systems and custom projects are unavailable. install:true is refused.',
        paramsSchema:{target:z.enum(['react','html','dtcg','store-screenshots','react-native','swiftui','shopify']),designSystemId:z.string().min(1).optional(),projectId:z.string().min(1).optional(),component:componentSelection,components:componentSelection,library:z.enum(['radix','base-ui']).optional(),screen:z.string().trim().min(1).max(80).optional(),install:z.boolean().optional(),context:z.string().max(280).optional()},
        outputSchema:{...kit.outputSchema!.shape,archive:z.object({capture:z.string(),timestamp:z.string().datetime(),responseSha256:z.string().regex(/^[a-f0-9]{64}$/),designSystemId:z.string(),target:z.string(),fileCount:z.number().int(),installation:z.literal('not performed'),validation:z.literal('captured source only')}).optional()},
      } : {}),
      callback:async (args: Record<string,unknown>, extra: unknown) => {
        if (privateArchive && ['react-native','swiftui','shopify'].includes(String(args.target))) return privateArchive.kit(args as Parameters<PrivateArchive['kit']>[0]);
        if (privateArchive && args.install) return {...text('Automatic installation is unavailable. Call with install:false to retrieve a kit.'),isError:true};
        return callback({...args,library:args.library ?? 'radix'},extra);
      },
    });
  }
  handles['extract-from-url']?.update({description:'Extract tokens from an explicitly supplied public page’s inline and linked CSS. Fetching is DNS-pinned and limited. This tool does not render the page. For computed styles, supply a rendered sample to extract-design-system.'});
  handles['create-design-system']?.update({
    description:'Create a persistent custom theme from a selected catalog base or extracted brandCss. This deterministically reuses existing component code; it does not call an AI model. Requires a private workspace key on HTTP, or the local stdio workspace. Returns a completed project and usable registry links immediately.',
    paramsSchema:{prompt:z.string().min(1).max(10000),baseDesignSystemId:z.string().max(81).optional().describe('Catalog base supplying component implementations; defaults to minimal-light.'),brandCss:z.string().max(50000).optional().describe('Supplied CSS tokens applied over the selected base. Component implementations still come from that base.'),userConfirmedCustom:z.boolean().optional()},
    callback:(async (args: {prompt:string;baseDesignSystemId?:string;brandCss?:string;userConfirmedCustom?:boolean}) => {
      if (!args.baseDesignSystemId && !args.brandCss && !args.userConfirmedCustom) return text('Choose a base with find-design-system and pass baseDesignSystemId, or provide brandCss.');
      const project = await projects.create({value:args.prompt,designSystemId:args.baseDesignSystemId,brandCss:args.brandCss});
      return text(`Theme ready: ${project.name}\nProject id: ${project.id}\nInstall: npx shadcn@latest add ${baseUrl()}/api/projects/${project.id}/registry/all.json\nThis theme reuses its selected base’s component implementations.`,{projectId:project.id,projectUrl:`${baseUrl()}/projects/${project.id}`,status:'completed'});
    }),
  });
  handles['get-design-system-status']?.update({callback:(async ({projectId}:{projectId:string}) => {
    const project = await projects.get(projectId);
    if (!project) return {...text('Project not found.'),isError:true};
    const tokens = await projects.css(project);
    const viewUrl = `${baseUrl()}/projects/${project.id}`;
    return text(`Theme ready: ${project.name}\n${viewUrl}\nInstall: npx shadcn@latest add ${baseUrl()}/api/projects/${project.id}/registry/all.json`,{status:'completed',name:project.name,viewUrl,tokensCss:tokens,installCommand:`npx shadcn@latest add ${baseUrl()}/api/projects/${project.id}/registry/all.json`});
  })});
  // Original preview resources are token-based. No nonexistent screenshot links are emitted.
  for (const name of ['find-design-system','preview-design-system','get-design-system-kit']) {
    const tool = handles[name]; if (!tool) continue;
    const callback = tool.handler;
    tool.update({callback:(async (...args: unknown[]) => {
      const result = await (callback as (...params:unknown[])=>Promise<unknown>)(...args);
      if (result && typeof result === 'object' && 'structuredContent' in result) {
        const structured = (result as {structuredContent?:Record<string,unknown>}).structuredContent;
        if (structured) {
          delete structured.shotUrl;
          if (Array.isArray(structured.results)) for (const item of structured.results) if (item && typeof item === 'object') delete item.shotUrl;
        }
      }
      return result;
    }) as typeof callback});
  }
  if (!privateArchive) server.registerTool('get-shopify-guide',{
    description:'Load independently authored Shopify Liquid and theme guidance. This server ships React catalog components, not Shopify theme kits.',
    inputSchema:{topic:z.string().optional(),query:z.string().optional()},
  },async ({topic,query}) => {
    const provider = createProvider(store,identity);
    if (topic) { const rule = await provider.getPrincipleByTopic(topic,'shopify'); return text(rule?.content ?? 'Topic not found; omit topic for the available index.'); }
    if (query) { const rules=await provider.searchPrinciples(query,5,'shopify'); return text(rules.map(r=>r.content).join('\n\n')); }
    return text(JSON.stringify(await provider.listPrinciples('shopify'),null,2));
  });
  else handles['get-shopify-guide']?.update({description:'Load Shopify guidance from the configured private offline library. Omit topic and query for its index. Captured source provenance and coverage limits are preserved; no vendor request is performed.'});
  if (privateArchive) handles['get-illustration-guide']?.update({description:'Load illustration guidance from the configured private offline library; omit topic and query for available topics. Captures preserve source provenance and coverage limits.'});
  server.registerTool('check-first-visit',{
    description:'Plan five first-visit walks with step brief, rank supplied walk reports with step rank, then verify reported fixes with step recheck. A fix requires every originally reporting walk to rerun under its stated conditions. Receipts bind supplied evidence; this tool never opens a browser or claims real visitor research. Legacy task/observations inputs remain supported.',
    inputSchema:firstVisitInputSchema,
  },handleFirstVisit);
  server.registerTool('search-resources',{
    description:'Search the complete Eidova resource library: systems, components, design templates, plugin examples, image/video presets and skills. Read returned manifests for original files, previews and licenses.',
    inputSchema:{query:z.string().max(500).optional(),kind:z.enum(bundledKinds).optional(),limit:z.number().int().min(1).max(20).default(8),offset:z.number().int().min(0).max(1000).default(0)},
  },async ({query,kind,limit,offset}) => text(JSON.stringify(await searchResources(query,kind,limit,offset))));
  server.registerTool('read-resource',{
    description:'Read an Eidova resource manifest or file using a URI from search-resources. Text is paginated by Unicode characters; follow nextOffset to finish. Binary assets return typed download links. File reads never execute content.',
    inputSchema:{uri:z.string().min(1).max(2000),offset:z.number().int().min(0).max(10000000).default(0),limit:z.number().int().min(1).max(24000).default(12000)},
  },async ({uri,offset,limit})=>text(JSON.stringify(await readBundledResource(uri,offset,limit))));
  server.registerTool('get-capabilities',{
    description:'Report this server’s exact local features and remaining external-service gaps.',inputSchema:{},
  },async()=>{
    const entries=await bundledEntries();
    return text(JSON.stringify({version:'0.2.0',profile,systems:(await catalog()).length,families:designFamilies.length,library:{total:entries.length,kinds:Object.fromEntries(bundledKinds.map(kind=>[kind,entries.filter(entry=>entry.kind===kind).length])),readTool:'read-resource',searchTool:'search-resources'},tools:Object.keys(handles),generation:'deterministic base reuse and supplied token overrides',retrieval:'lexical',execution:'source, evidence and commands only; no hosted installation/rendering',dashboardCapture:'unavailable',keyRecovery:'unavailable',fullEndpoint:`${baseUrl()}/mcp`,coreEndpoint:`${baseUrl()}/mcp/core`,omitted:unavailable.filter(name=>name!=='get-inspiration' || !privateArchive),privateWorkspace:Boolean(identity),...(privateArchive?{archive:privateArchive.summary()}:{})}));
  });
  handles['find-design-system']?.update({
    paramsSchema:{query:z.string().trim().min(1).max(2000),limit:z.number().int().min(1).max(8).optional(),requiredComponents:z.array(z.string().regex(/^[a-z0-9][a-z0-9_-]{0,80}$/)).min(1).max(12).optional()},
    callback:async ({query,limit=5,requiredComponents}:{query:string;limit?:number;requiredComponents?:string[]})=>{
      const results=(await searchCatalog(query,limit,requiredComponents)).filter(item=>item.matchScore>0);
      const matches=results.map(item=>({id:item.id,name:item.title,description:item.family.description,personality:item.personality.join(', '),family:item.family.title,variant:item.variant,font:item.font,radius:item.borderRadius,matchedTerms:item.matchedTerms,useCases:item.family.useCases,tradeoff:item.family.tradeoff,previewUrl:`${(process.env.EIDOVA_WEBSITE_URL ?? process.env.OPEN_DESIGN_WEBSITE_URL)??'https://open-design-website.vercel.app'}/?specimen=${item.family.representative}`,next:{tool:'get-design-system-kit',arguments:{target:'react',designSystemId:item.id,component:requiredComponents??['button','input']}}}));
      const result={buildInstructions:workflowNote,matches,...(!matches.length?{nextStep:'Try a family name, style or font, or remove component requirements; no matching systems were found.'}:{})};
      return text([workflowNote,...matches.map(item=>`${item.name} (${item.id}): ${item.useCases.join('; ')}. ${item.tradeoff}`),matches.length?`Next: get-design-system-kit with the selected designSystemId, target:react, component:${JSON.stringify(requiredComponents??['button','input'])}.`:result.nextStep].join('\n\n'),result);
    },
  });
  if(!privateArchive) for(const [name,area] of [['get-ui-principle','ui'],['get-ux-principle','ux']] as const) handles[name]?.update({
    paramsSchema:{topic:z.string().max(120).optional(),query:z.string().max(2000).optional(),maxTokens:z.number().int().min(1).max(20000).optional(),detail:z.enum(['summary','full']).optional(),context:z.string().max(280).optional()},
    callback:async ({topic,query,maxTokens,detail}:{topic?:string;query?:string;maxTokens?:number;detail?:string})=>{
      if(!topic&&!query) return text(JSON.stringify(await listPrinciples(area)));
      const entries=topic?[await getPrincipleByTopic(topic,area)].filter(Boolean):await searchPrinciples(query!,3,area);
      if(!entries.length) return {...text('No matching topic. Omit topic/query to list the index.'),isError:true};
      const budget=detail==='full'?Infinity:Math.min(3000,(maxTokens??750)*4);let used=0;
      const blocks=entries.map(entry=>{const body=`${entry!.title}\n${entry!.content}`;if(used+Buffer.byteLength(body)<=budget){used+=Buffer.byteLength(body);return body;}return `${entry!.title}\nRead full entry: design://principles/${area}/${entry!.topic} or call with topic:${entry!.topic}, detail:full.`;});
      return text(blocks.join('\n\n'));
    },
  });
  if(!privateArchive) handles['get-review-rules']?.update({
    paramsSchema:{category:z.enum(['all','accessibility','visual-design','animation','content','comprehension','ai-features','coverage-gaps']).optional(),maxTokens:z.number().int().min(1).max(20000).optional(),detail:z.enum(['summary','full']).optional(),context:z.string().max(280).optional()},
    callback:async ({category='all',detail,maxTokens}:{category?:string;detail?:string;maxTokens?:number})=>{
      const rules=await getReviewRules(category);
      if(detail==='full'||(category!=='all'&&!maxTokens)) return text(rules.map(rule=>`${rule.id} (${rule.severity}) ${rule.title}\n${rule.content}`).join('\n\n'));
      if(maxTokens) {
        const blocks:string[]=[];let used=0;
        for(const rule of rules){const block=`${rule.id} (${rule.severity}) ${rule.title}\n${rule.content}`;if(used+Buffer.byteLength(block)>maxTokens*4)break;blocks.push(block);used+=Buffer.byteLength(block);}
        return text(blocks.join('\n\n')+`\n\nShowing ${blocks.length} of ${rules.length} rules. Read a category or call with detail:full for complete definitions. Fix every critical and serious finding.`);
      }
      return text(JSON.stringify({rules:rules.map(({id,title,severity,category})=>({id,title,severity,category})),next:'Retrieve a category, detail:full, or design://review-rules/<id>. Critical/serious findings must be fixed.'}));
    },
  });
  for(const name of ['get-design-system-kit','extract-design-system','preview-design-system']) {
    const tool=handles[name];if(!tool)continue;const callback=tool.handler;
    if(name==='get-design-system-kit')tool.update({outputSchema:{...tool.outputSchema!.shape,componentFiles:z.array(z.object({path:z.string(),content:z.string()})).optional(),dtcgReport:z.object({formatVersion:z.literal('2025.10'),typedTokens:z.number().int().nonnegative(),aliases:z.number().int().nonnegative(),unsupportedTokens:z.number().int().nonnegative()}).optional(),designContext:z.object({uri:z.string(),url:z.string().url()}).optional()}});
    if(name!=='extract-design-system')tool.update({outputSchema:{...tool.outputSchema!.shape,viewLabel:z.enum(['View components','View tokens']).optional(),familyPreviewUrl:z.string().url().optional()}});
    tool.update({callback:async (args:Record<string,unknown>,extra:unknown)=>{
      if(name==='get-design-system-kit'&&args.designSystemId&&!(await catalog()).some(item=>item.id===args.designSystemId)) return {...text('Theme not found. Use find-design-system to choose a valid ID. Nothing was installed.'),isError:true};
      if(name==='get-design-system-kit') {
        if(args.component!==undefined&&args.components!==undefined) return {...text('Use component or components, not both.'),isError:true};
        const selection=args.component??args.components;
        if(selection!==undefined&&args.target==='react') {
          const names=[...new Set(Array.isArray(selection)?selection:[selection])];
          args={...args,component:names};
        }
      }
      const result=await callback(args,extra) as {content?:{type:string;text?:string}[];structuredContent?:Record<string,unknown>;isError?:boolean};
      if(!result?.structuredContent||result.isError) return result;
      if(result.structuredContent.status==='error')return {...result,isError:true};
      const structured={...result.structuredContent};
      if(name==='get-design-system-kit'&&args.target==='dtcg'&&typeof structured.tokensJson==='string') {
        const {document,report}=normalizeDtcg(structured.tokensJson);
        structured.tokensJson=JSON.stringify(document,null,2);structured.dtcgReport=report;
        structured.buildInstructions='DTCG 2025.10 typed subset. Simple CSS variable aliases become token references. Unsupported values are retained under $extensions["org.eidova.export"].unsupported and in tokensCss; consumers may ignore them. No universal importer compatibility is claimed.';
      }
      if(name==='get-design-system-kit'&&args.target==='react'&&'buildInstructions' in structured) structured.buildInstructions=workflowNote+' Use Tailwind 4, the @/* alias and components.json; initialize shadcn if missing. Dependencies resolve through the registry command. Preserve embedded component icons; additional icon search uses Lucide.';
      if(name==='get-design-system-kit'&&args.target==='react'&&typeof structured.installCommand==='string') structured.installCommand=structured.installCommand.replace(/^\[ -f components\.json \][\s\S]*?\n\n/,'').replace(/ -o\b/g,'');
      if(name==='get-design-system-kit'&&args.target==='react'&&args.designSystemId&&args.component) {
        const info=(await catalog()).find(item=>item.id===args.designSystemId)!;
        const names=Array.isArray(args.component)?args.component:[args.component];
        const items=await Promise.all(names.filter(name=>typeof name==='string'&&info.components.includes(name)).map(name=>sourceItem(info.id,String(name))));
        structured.componentFiles=items.flatMap(item=>(item.files??[]).map(({path,content})=>({path,content})));
      }
      if(args.designSystemId) {
        const info=(await catalog()).find(item=>item.id===args.designSystemId);
        if(info) {
          if(name==='get-design-system-kit'&&['react','html','dtcg','store-screenshots'].includes(String(args.target))) {
            structured.designContext={uri:`design://systems/${info.id}/design.md`,url:`${baseUrl()}/api/design-systems/${info.id}/design.md`};
            structured.buildInstructions=String(structured.buildInstructions??'')+' Read designContext before implementation: save as DESIGN.md if absent, otherwise merge without overwriting existing rules; then read globals and only the needed components.';
          }
          structured.familyPreviewUrl=`${(process.env.EIDOVA_WEBSITE_URL ?? process.env.OPEN_DESIGN_WEBSITE_URL)??'https://open-design-website.vercel.app'}/?specimen=${info.family.representative}`;
          structured.viewUrl=info.variant?`${baseUrl()}/registry/${info.id}/globals.json`:structured.familyPreviewUrl;
          structured.viewLabel=info.variant?'View tokens':'View components';
        }
      }
      return {...result,...text(JSON.stringify(structured),structured),content:[{type:'text',text:JSON.stringify(structured)},...(result.content??[]).filter(block=>block.type!=='text')]};
    }});
  }
  for(const [name,tool] of Object.entries(handles)) {
    const changes:Record<string,unknown>={description:privateArchive&&/inspiration|guide|principle|get-design-system-kit/.test(name)?tool.description:toolDescriptions[name]??tool.description};
    const mutates=['create-design-system','set-design-config','set-team-rules'].includes(name);
    changes.annotations={readOnlyHint:!mutates,destructiveHint:name==='set-team-rules',idempotentHint:name!=='create-design-system',openWorldHint:name==='extract-from-url'};
    // Drop verbose parameter metadata without changing types, bounds or defaults.
    if(tool.inputSchema) changes.paramsSchema=Object.fromEntries(Object.entries(tool.inputSchema.shape).map(([key,value])=>[key,conciseSchema(value as z.ZodType)]));
    if(tool.outputSchema) changes.outputSchema=Object.fromEntries(Object.entries(tool.outputSchema.shape).map(([key,value])=>[key,conciseSchema(value as z.ZodType)]));
    tool.update(changes);
    if(profile==='core'&&!coreTools.has(name))tool.remove();
  }
  const workflow=awaitWorkflow;
  server.registerResource('open-design-license','design://open-design/license',{mimeType:'text/plain',description:'Apache-2.0 license for the bundled OpenDesign content; package overrides are linked in each manifest.'},async uri=>({contents:[{uri:uri.href,mimeType:'text/plain',text:await readFile(resourcePath('content/open-design/LICENSE'),'utf8')}]}));
  server.registerResource('open-design-bundles',new ResourceTemplate('design://open-design/{kind}/{id}',{
    list:async()=>({resources:(await bundledEntries()).map(entry=>({uri:entryUri(entry),name:`Eidova: ${entry.name} (${entry.kind})`,mimeType:'application/json',description:entry.description}))}),
  }),{mimeType:'application/json',description:resourceNote},async(uri,{kind,id})=>{
    const entry=await findBundledEntry(String(kind),String(id));
    if(!entry)throw new Error('Bundled resource not found.');
    return {contents:[{uri:uri.href,mimeType:'application/json',text:JSON.stringify(await bundledManifest(entry))}]};
  });
  server.registerResource('open-design-file',new ResourceTemplate('design://open-design/{kind}/{id}/files/{+file}',{list:undefined}),
    {description:'Verbatim bundled file. Read its package manifest for provenance, hashes and licenses; no code is executed.'},async(uri,{kind,id,file})=>{
      const result=await bundledFile(String(kind),String(id),String(file));
      if(!result)throw new Error('Bundled file not found.');
      return {contents:[{uri:uri.href,...(result.metadata.binary?{mimeType:result.metadata.mimeType??'application/octet-stream',blob:result.bytes.toString('base64')}:{mimeType:result.metadata.mimeType??'text/plain',text:result.bytes.toString('utf8')})}]};
    });
  server.registerResource('design-workflow','design://workflow/v1',{mimeType:'text/markdown',description:'Complete design/build/review workflow, version 1.'},async uri=>({contents:[{uri:uri.href,mimeType:'text/markdown',text:await workflow}]}));
  server.registerResource('design-system-context',new ResourceTemplate('design://systems/{id}/design.md',{
    list:async()=>({resources:(await catalog()).map(system=>({uri:`design://systems/${system.id}/design.md`,name:`${system.title} DESIGN.md`,mimeType:'text/markdown',description:`${system.family.title} family; exact ${system.id} tokens, components and usage.`}))}),
  }),{mimeType:'text/markdown',description:'Portable catalog design instructions, exact tokens and source links.'},async(uri,{id})=>{
    const markdown=await designContext(String(id));
    if(markdown===null)throw new Error('Design system not found.');
    return {contents:[{uri:uri.href,mimeType:'text/markdown',text:markdown}]};
  });
  if(!privateArchive) {
    server.registerResource('principle',new ResourceTemplate('design://principles/{area}/{topic}',{list:undefined}),{mimeType:'text/markdown'},async(uri,{area,topic})=>{
      const entry=await getPrincipleByTopic(String(topic),String(area) as Parameters<typeof getPrincipleByTopic>[1]);
      if(!entry)throw new Error('Principle not found.');return {contents:[{uri:uri.href,mimeType:'text/markdown',text:entry.content}]};
    });
    server.registerResource('review-rule',new ResourceTemplate('design://review-rules/{id}',{list:undefined}),{mimeType:'text/markdown'},async(uri,{id})=>{
      const ruleId=decodeURIComponent(String(id)).replace(/^rule\/open-design\//,'rule/eidova/');
      const entry=(await getReviewRules()).find(rule=>rule.id===ruleId);if(!entry)throw new Error('Review rule not found.');return {contents:[{uri:uri.href,mimeType:'text/markdown',text:entry.content}]};
    });
  }
  for(const [name,prompt] of [['choose-theme','Find a distinctive design family for this screen. Preserve an existing product design. Retrieve only needed React components.'],['preserve-brand','Extract my supplied brand CSS, retain its identity and components, then suggest the smallest necessary changes.'],['review-form','Review my supplied form source and copy. Ask for rendered DOM evidence where visual checks require it. Report actionable findings.']]) server.registerPrompt(name,{description:prompt},async()=>({messages:[{role:'user',content:{type:'text',text:prompt}}]}));
  return server;
}
const awaitWorkflow=readFile(resourcePath('content/workflow.md'),'utf8');
