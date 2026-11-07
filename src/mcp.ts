import './public-fetch.js';
import { createMcpServer, registerReviewTool } from '../vendor/upstream/runtime.mjs';
import { z } from 'zod';
import { baseUrl, catalog } from './catalog.js';
import { createProvider } from './provider.js';
import { Projects, configSchema } from './projects.js';
import { apiDispatcher } from './local-api.js';
import type { JsonStore } from './store.js';
import { ProjectRulesStore } from './project-rules-store.js';
import { firstVisitInputSchema, handleFirstVisit } from './first-visit.js';
import type { PrivateArchive } from './private-archive.js';

const unavailable = ['make-sales-page','make-social-image','review-illustration','get-inspiration'];
type RuntimeCallback = (...args: unknown[]) => unknown;
type RuntimeTool = {handler:RuntimeCallback;outputSchema?:z.ZodObject;remove():void;update(changes:Record<string,unknown>):void};
const text = (value: string, structuredContent?: Record<string, unknown>) => ({content:[{type:'text' as const,text:value}],...(structuredContent ? {structuredContent} : {})});
export function createServer(store: JsonStore, identity?: string, privateArchive?: PrivateArchive) {
  if (privateArchive && !identity) throw new Error('Private captures require a private local workspace.');
  const projects = new Projects(store,identity);
  const server = createMcpServer({
    provider:createProvider(store,identity), apiFetch:apiDispatcher(projects,new ProjectRulesStore(store,identity)),
    name:'OpenDesign',version:'0.1.0',userId:identity,
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
      tool.update({description:`Load ${privateArchive?'the configured private offline':'original Open Design'} ${name.replace(/^get-/,'').replaceAll('-',' ')} guidance. Omit topic and query to list available topics, or provide a topic/alias or query. Search uses local lexical ranking. ${privateArchive?'Saved captures preserve their provenance and may be incomplete.':'Content is independently authored; this is not the vendor’s hosted corpus.'}`});
    }
  }
  const kit = handles['get-design-system-kit'];
  if (kit) {
    const callback = kit.handler;
    kit.update({
      ...(privateArchive ? {
        description:'Return React/HTML/DTCG catalog kits, or saved private Linear react-native, swiftui and shopify file payloads. Archived files and tokens are verbatim captures, not newly generated, installed or rendered. Uncaptured mobile/Shopify systems and custom projects are unavailable. install:true is refused.',
        paramsSchema:{target:z.enum(['react','html','dtcg','store-screenshots','react-native','swiftui','shopify']),designSystemId:z.string().min(1).optional(),projectId:z.string().min(1).optional(),component:z.union([z.string(),z.array(z.string())]).optional(),library:z.enum(['radix','base-ui']).optional(),screen:z.string().trim().min(1).max(80).optional(),install:z.boolean().optional(),context:z.string().max(280).optional()},
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
  server.registerTool('get-capabilities',{
    description:'Report this server’s exact local features and remaining external-service gaps.',inputSchema:{},
  },async()=>text(JSON.stringify({systems:(await catalog()).length,tools:Object.keys(handles),generation:'deterministic base reuse and supplied token overrides',retrieval:'lexical',omitted:unavailable.filter(name=>name!=='get-inspiration' || !privateArchive),privateWorkspace:Boolean(identity),...(privateArchive?{archive:privateArchive.summary()}:{})},null,2)));
  return server;
}
