import './public-fetch.js';
import { createMcpServer, registerReviewTool } from '../vendor/upstream/runtime.mjs';
import { z } from 'zod';
import { baseUrl, catalog } from './catalog.js';
import { createProvider } from './provider.js';
import { Projects, configSchema } from './projects.js';
import { apiDispatcher } from './local-api.js';
import type { JsonStore } from './store.js';

const unavailable = ['make-sales-page','make-social-image','review-illustration','get-inspiration'];
type RuntimeCallback = (...args: unknown[]) => unknown;
type RuntimeTool = {handler:RuntimeCallback;remove():void;update(changes:Record<string,unknown>):void};
const text = (value: string, structuredContent?: Record<string, unknown>) => ({content:[{type:'text' as const,text:value}],...(structuredContent ? {structuredContent} : {})});
export function createServer(store: JsonStore, identity?: string) {
  const projects = new Projects(store,identity);
  const server = createMcpServer({
    provider:createProvider(store,identity), apiFetch:apiDispatcher(projects),
    name:'OpenDesign',version:'0.1.0',userId:identity,
    authContext:identity ? {kind:'api-key',apiKey:'local-workspace'} : undefined,
    enableDesignPanel:false, enableMobileKits:false, enableShopifyKit:false, enableReviewUiCode:true,
  });
  registerReviewTool(server);
  // These pinned-SDK registration handles expose supported update/remove APIs.
  const handles = (server as unknown as {_registeredTools:Record<string,RuntimeTool>})._registeredTools;
  handles['get-team-rules']?.update({
    description:'Read private workspace team rules. Anonymous requests receive drafting guidance; project-specific rule slots are not implemented.',
    paramsSchema:{context:z.string().max(280).optional()},
  });
  handles['set-team-rules']?.update({
    description:'Save an approved Markdown rules document in this private workspace. Review existing rules before replacing them. Requires a workspace key; project-specific rule slots are not implemented.',
    paramsSchema:{markdown:z.string().min(1).max(32768),personApproved:z.literal(true),replaceExisting:z.boolean().optional(),context:z.string().max(280).optional()},
  });
  handles['set-design-config']?.update({
    description:'Merge validated semantic colors, foreground pairs, radius, fonts and density into an owner-scoped custom theme. Requires its workspace key.',
    paramsSchema:{projectId:z.string().uuid(),config:configSchema,context:z.string().max(280).optional()},
  });
  handles['review-ui-code']?.update({
    description:'Deterministically review supplied React, CSS, HTML, SVG and SwiftUI source. Every file requires inline content. This server never reads caller-selected files from its own filesystem and does not execute submitted code.',
    paramsSchema:{files:z.array(z.object({path:z.string().min(1).max(400),content:z.string().max(120000)})).min(1).max(24),context:z.string().max(280).optional()},
  });
  for (const name of unavailable) handles[name]?.remove();
  for (const [name, tool] of Object.entries(handles)) {
    if (/^get-(?:ui-principle|ux-principle|react-native-guide|swiftui-guide|three-js-guide|sales-principle|motion-guide)$/.test(name)) {
      tool.update({description:`Load original Open Design ${name.replace(/^get-/,'').replaceAll('-',' ')} guidance. Omit topic and query to list available topics, or provide a topic/alias or query. Search uses local lexical ranking. Content is independently authored; this is not the vendor’s hosted corpus.`});
    }
  }
  const kit = handles['get-design-system-kit'];
  if (kit) {
    const callback = kit.handler;
    kit.update({callback:async (args: Record<string,unknown>, extra: unknown) => callback({...args,library:args.library ?? 'radix'},extra)});
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
  server.registerTool('get-shopify-guide',{
    description:'Load independently authored Shopify Liquid and theme guidance. This server ships React catalog components, not Shopify theme kits.',
    inputSchema:{topic:z.string().optional(),query:z.string().optional()},
  },async ({topic,query}) => {
    const provider = createProvider(store,identity);
    if (topic) { const rule = await provider.getPrincipleByTopic(topic,'shopify'); return text(rule?.content ?? 'Topic not found; omit topic for the available index.'); }
    if (query) { const rules=await provider.searchPrinciples(query,5,'shopify'); return text(rules.map(r=>r.content).join('\n\n')); }
    return text(JSON.stringify(await provider.listPrinciples('shopify'),null,2));
  });
  server.registerTool('check-first-visit',{
    description:'Plan five first-visit task walkthroughs and rank supplied observations. This tool does not open a browser or invent test results.',
    inputSchema:{task:z.string().min(1).max(500),observations:z.array(z.object({scenario:z.string(),problem:z.string(),severity:z.enum(['critical','serious','moderate']),evidence:z.string()})).max(100).optional()},
  },async ({task,observations})=> {
    if (!observations?.length) return text(`Walk the task “${task}” in five conditions: first visit with sample data; empty workspace; keyboard only; narrow screen with zoom; a failed request. Record the exact point of confusion, observed evidence and a recovery action. Supply those observations here to rank them.`,{status:'needs-observations',tested:false});
    const ranked=[...observations].sort((a,b)=>['critical','serious','moderate'].indexOf(a.severity)-['critical','serious','moderate'].indexOf(b.severity));
    return text(JSON.stringify(ranked,null,2),{status:'reviewed-observations',tested:false,findings:ranked});
  });
  server.registerTool('get-capabilities',{
    description:'Report this server’s exact local features and remaining external-service gaps.',inputSchema:{},
  },async()=>text(JSON.stringify({systems:(await catalog()).length,tools:Object.keys(handles),generation:'deterministic base reuse and supplied token overrides',retrieval:'lexical',omitted:unavailable,privateWorkspace:Boolean(identity)},null,2)));
  return server;
}
