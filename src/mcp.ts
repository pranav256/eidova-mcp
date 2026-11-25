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
import { Projects } from './projects.js';
import { designConfigSchema } from './schema.js';
import { apiDispatcher } from './local-api.js';
import type { JsonStore } from './store.js';
import { ProjectRulesStore } from './project-rules-store.js';
import { firstVisitInputSchema, handleFirstVisit } from './first-visit.js';
import type { PrivateArchive } from './private-archive.js';
import { normalizeDtcg } from './dtcg.js';
import { designContext } from './design-context.js';
import { bundledEntries, bundledFile, bundledKinds, bundledManifest, entryUri, findBundledEntry, readBundledResource, resourceNote, searchResources } from './bundled-resources.js';

const unavailable = new Set(['make-sales-page','make-social-image','review-illustration','get-inspiration','finalize-dashboard-review']);
type RuntimeCallback = (...args: any[]) => any;
type RuntimeConfig = {description?:string;inputSchema?:z.ZodObject|z.ZodRawShape;outputSchema?:z.ZodObject|z.ZodRawShape;[key:string]:unknown};
function conciseSchema<T extends z.ZodType>(schema:T):T {
  const visit=(value:unknown):unknown=>{
    if(value instanceof z.ZodType) return value.clone(visit(value.def) as typeof value.def).meta({});
    if(Array.isArray(value))return value.map(visit);
    if(value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype) return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,visit(item)]));
    return value;
  };
  return visit(schema) as T;
}
const text = (value:string,structuredContent?:Record<string,unknown>) => ({content:[{type:'text' as const,text:value}],...(structuredContent?{structuredContent}:{})});
const failure = (message:string) => ({...text(message),isError:true});
export type ToolProfile='core'|'full';
export function createServer(store:JsonStore,identity?:string,privateArchive?:PrivateArchive,profile:ToolProfile='core') {
  if(privateArchive&&!identity)throw new Error('Private captures require a private local workspace.');
  const projects=new Projects(store,identity);
  const toolNames=new Set<string>();
  function configureTool(name:string,config:RuntimeConfig,callback:RuntimeCallback) {
    if((unavailable.has(name)&&!(name==='get-inspiration'&&privateArchive))||(profile==='core'&&!coreTools.has(name)))return null;
    let inputSchema=config.inputSchema instanceof z.ZodObject?config.inputSchema:z.object(config.inputSchema??{});
    let outputSchema=config.outputSchema instanceof z.ZodObject?config.outputSchema:config.outputSchema?z.object(config.outputSchema):undefined;
    let description=toolDescriptions[name]??config.description;
    if(privateArchive&&/^get-(?:ui-principle|ux-principle|react-native-guide|swiftui-guide|three-js-guide|sales-principle|motion-guide|shopify-guide|illustration-guide)$/.test(name)) description='Read the configured private offline guidance. Omit topic and query for its index. Saved source provenance and coverage limits are preserved.';
    switch(name) {
      case 'set-design-config':
        inputSchema=z.object({projectId:z.string().uuid(),config:designConfigSchema,context:z.string().max(280).optional()});
        break;
      case 'review-ui-code':
        inputSchema=z.object({files:z.array(z.object({path:z.string().min(1).max(400),content:z.string().max(120000)})).min(1).max(24),context:z.string().max(280).optional()});
        break;
      case 'get-inspiration':
        description='Search saved private reference sets. Returns inert captured content and source hashes; no requests or scripts are executed.';
        callback=(args:Parameters<PrivateArchive['inspiration']>[0])=>privateArchive!.inspiration(args);
        break;
      case 'get-design-system-kit': {
        const componentName=z.string().regex(/^(?:_shared|[a-z0-9][a-z0-9_-]{0,80})$/);
        const component=z.union([componentName,z.array(componentName).min(1).max(24)]).optional();
        inputSchema=inputSchema.extend({detail:z.enum(['summary','full']).optional().describe('HTML target only. Defaults to a concise handoff; use full to include complete prose instructions.')});
        inputSchema=inputSchema.extend({component});
        outputSchema=outputSchema!.extend({componentFiles:z.array(z.object({path:z.string(),content:z.string()})).optional(),dtcgReport:z.object({formatVersion:z.literal('2025.10'),typedTokens:z.number().int().nonnegative(),aliases:z.number().int().nonnegative(),unsupportedTokens:z.number().int().nonnegative()}).optional(),designContext:z.object({uri:z.string(),url:z.string().url()}).optional(),requiredTools:z.array(z.string()).optional(),optionalTools:z.array(z.object({name:z.string(),profile:z.string(),fallback:z.string()})).optional()});
        if(privateArchive) {
          description='Return catalog kits or saved private platform files. Captures retain their provenance; uncaptured kits and automatic installation are unavailable.';
          inputSchema=z.object({target:z.enum(['react','html','dtcg','store-screenshots','react-native','swiftui','shopify']),designSystemId:z.string().min(1).optional(),projectId:z.string().min(1).optional(),component,library:z.enum(['radix','base-ui']).optional(),screen:z.string().trim().min(1).max(80).optional(),install:z.boolean().optional(),detail:z.enum(['summary','full']).optional(),context:z.string().max(280).optional()});
          outputSchema=outputSchema.extend({archive:z.object({capture:z.string(),timestamp:z.string().datetime(),responseSha256:z.string().regex(/^[a-f0-9]{64}$/),designSystemId:z.string(),target:z.string(),fileCount:z.number().int(),installation:z.literal('not performed'),validation:z.literal('captured source only')}).optional()});
        }
        break;
      }
      case 'create-design-system':
        inputSchema=z.object({prompt:z.string().trim().min(1).max(10000),baseDesignSystemId:z.string().max(81).optional(),brandCss:z.string().max(50000).optional(),userConfirmedCustom:z.boolean().optional()});
        callback=async(args:{prompt:string;baseDesignSystemId?:string;brandCss?:string;userConfirmedCustom?:boolean})=>{
          if(!args.baseDesignSystemId&&!args.brandCss&&!args.userConfirmedCustom)return failure('Choose a base with find-design-system and pass baseDesignSystemId, or provide brandCss.');
          const project=await projects.create({value:args.prompt,designSystemId:args.baseDesignSystemId,brandCss:args.brandCss});
          return text(`Theme ready: ${project.name}\nProject id: ${project.id}\nInstall: npx shadcn@latest add ${baseUrl()}/api/projects/${project.id}/registry/all.json\nThis theme reuses its selected base's component implementations.`,{projectId:project.id,projectUrl:`${baseUrl()}/projects/${project.id}`,status:'completed'});
        };
        break;
      case 'get-design-system-status':
        callback=async({projectId}:{projectId:string})=>{
          const project=await projects.get(projectId);
          if(!project)return failure('Project not found. Use create-design-system to create a theme or pass an existing projectId.');
          const tokens=await projects.css(project),viewUrl=`${baseUrl()}/projects/${project.id}`;
          return text(`Theme ready: ${project.name}\n${viewUrl}\nInstall: npx shadcn@latest add ${baseUrl()}/api/projects/${project.id}/registry/all.json`,{status:'completed',name:project.name,viewUrl,tokensCss:tokens,installCommand:`npx shadcn@latest add ${baseUrl()}/api/projects/${project.id}/registry/all.json`});
        };
        break;
      case 'find-design-system':
        inputSchema=z.object({query:z.string().trim().min(1).max(2000),limit:z.number().int().min(1).max(8).optional(),requiredComponents:z.array(z.string().regex(/^[a-z0-9][a-z0-9_-]{0,80}$/)).min(1).max(12).optional()});
        callback=async({query,limit=5,requiredComponents}:{query:string;limit?:number;requiredComponents?:string[]})=>{
          const results=(await searchCatalog(query,limit,requiredComponents)).filter(item=>item.matchScore>0);
          const matches=results.map(item=>({id:item.id,name:item.title,description:item.family.description,personality:item.personality.join(', '),family:item.family.title,variant:item.variant,font:item.font,radius:item.borderRadius,matchedTerms:item.matchedTerms,useCases:item.family.useCases,tradeoff:item.family.tradeoff,previewUrl:`${process.env.EIDOVA_WEBSITE_URL??'https://eidova.vercel.app'}/?specimen=${item.family.representative}`,next:{tool:'get-design-system-kit',arguments:{target:'react',designSystemId:item.id,component:requiredComponents??['button','input']}}}));
          const result={buildInstructions:workflowNote,matches,...(!matches.length?{nextStep:'Try a family name, style or font, or remove component requirements; no matching systems were found.'}:{})};
          return text([workflowNote,...matches.map(item=>`${item.name} (${item.id}): ${item.useCases.join('; ')}. ${item.tradeoff}`),matches.length?`Next: get-design-system-kit with the selected designSystemId, target:react, component:${JSON.stringify(requiredComponents??['button','input'])}.`:result.nextStep].join('\n\n'),result);
        };
        break;
      case 'get-ui-principle':
      case 'get-ux-principle':
        if(!privateArchive) {
          const area=name==='get-ui-principle'?'ui':'ux';
          inputSchema=z.object({topic:z.string().max(120).optional(),query:z.string().max(2000).optional(),maxTokens:z.number().int().min(1).max(20000).optional(),detail:z.enum(['summary','full']).optional(),context:z.string().max(280).optional()});
          callback=async({topic,query,maxTokens,detail}:{topic?:string;query?:string;maxTokens?:number;detail?:string})=>{
            if(topic&&query)return failure('Pass topic or query, not both. Omit both to list the index.');
            if(!topic&&!query)return text(JSON.stringify(await listPrinciples(area)));
            const entries=topic?[await getPrincipleByTopic(topic,area)].filter(Boolean):await searchPrinciples(query!,3,area);
            if(!entries.length)return failure('No matching topic. Omit topic/query to list the index.');
            const budget=detail==='full'?Infinity:Math.min(3000,(maxTokens??750)*4);let used=0;
            const blocks=entries.map(entry=>{const body=`${entry!.title}\n${entry!.content}`;if(used+Buffer.byteLength(body)<=budget){used+=Buffer.byteLength(body);return body;}return `${entry!.title}\nRead full entry: design://principles/${area}/${entry!.topic} or call with topic:${entry!.topic}, detail:full.`;});
            return text(blocks.join('\n\n'));
          };
        }
        break;
      case 'get-review-rules':
        if(!privateArchive) {
          inputSchema=z.object({category:z.enum(['all','accessibility','visual-design','animation','content','comprehension','ai-features','coverage-gaps']).optional(),maxTokens:z.number().int().min(1).max(20000).optional(),detail:z.enum(['summary','full']).optional(),context:z.string().max(280).optional()});
          callback=async({category='all',detail,maxTokens}:{category?:string;detail?:string;maxTokens?:number})=>{
            const rules=await getReviewRules(category);
            if(!rules.length)return failure('No review rules available. Check the configured guidance library.');
            if(detail==='full'||(category!=='all'&&!maxTokens))return text(rules.map(rule=>`${rule.id} (${rule.severity}) ${rule.title}\n${rule.content}`).join('\n\n'));
            if(maxTokens) {
              const blocks:string[]=[];let used=0;
              for(const rule of rules){const block=`${rule.id} (${rule.severity}) ${rule.title}\n${rule.content}`;if(used+Buffer.byteLength(block)>maxTokens*4)break;blocks.push(block);used+=Buffer.byteLength(block);}
              return text(blocks.join('\n\n')+`\n\nShowing ${blocks.length} of ${rules.length} rules. Read a category or call with detail:full for complete definitions. Fix every critical and serious finding.`);
            }
            return text(JSON.stringify({rules:rules.map(({id,title,severity,category})=>({id,title,severity,category})),next:'Retrieve a category, detail:full, or design://review-rules/<id>. Critical/serious findings must be fixed.'}));
          };
        }
        break;
      case 'get-icon-files':config={...config,title:'Get icon files'};break;
      case 'get-video-render-commands':config={...config,title:'Get video render commands'};break;
    }
    if(['get-design-system-kit','extract-design-system','preview-design-system'].includes(name)) {
      const execute=callback;
      if(name!=='extract-design-system')outputSchema=outputSchema!.extend({viewLabel:z.enum(['View components','View tokens']).optional(),familyPreviewUrl:z.string().url().optional()});
      callback=async(args:Record<string,unknown>,extra:unknown)=>{
        if(args.designSystemId&&args.projectId)return failure('Use designSystemId or projectId, not both.');
        if(name==='get-design-system-kit') {
          if(args.designSystemId&&!(await catalog()).some(item=>item.id===args.designSystemId))return failure('Theme not found. Use find-design-system to choose a valid ID. Nothing was installed.');
          if(privateArchive&&['react-native','swiftui','shopify'].includes(String(args.target)))return privateArchive.kit(args as Parameters<PrivateArchive['kit']>[0]);
          if(privateArchive&&args.install)return failure('Automatic installation is unavailable. Call with install:false to retrieve a kit.');
          const selection=args.component;
          args={...args,library:args.library??'radix',...(selection!==undefined&&args.target==='react'?{component:[...new Set(Array.isArray(selection)?selection:[selection])]}:{})};
        }
        const result=await execute(args,extra);
        if(!result?.structuredContent||result.isError||result.structuredContent.status==='error')return result;
        const structured={...result.structuredContent};delete structured.shotUrl;
        if(name==='get-design-system-kit') {
          structured.requiredTools=['find-design-system','get-design-system-kit','get-ui-principle','get-ux-principle','get-review-rules','review-ui-code','check-comprehension','inspect-spacing'];
          structured.optionalTools=['find-icons','get-icon-files'].map(name=>({name,profile:'full',fallback:'Preserve icons already embedded in the kit, use text labels and omit extra decorative icons.'}));
          structured.iconInstructions='Preserve the kit’s embedded icons. Optional extra icon search: find-icons and get-icon-files are available in Full at /mcp/full; reconnect after switching. Core can use text labels and omit extra decorative icons.';
        }
        if(name==='get-design-system-kit'&&args.target==='dtcg'&&typeof structured.tokensJson==='string') {
          const {document,report}=normalizeDtcg(structured.tokensJson);
          structured.tokensJson=JSON.stringify(document,null,2);structured.dtcgReport=report;
          structured.buildInstructions='DTCG 2025.10 typed subset. Simple CSS variable aliases become token references. Unsupported values are retained under $extensions["org.eidova.export"].unsupported and in tokensCss; consumers may ignore them. No universal importer compatibility is claimed.';
        }
        if(name==='get-design-system-kit'&&args.target==='react'&&'buildInstructions'in structured)structured.buildInstructions=workflowNote+' Required: use Tailwind 4, the @/* alias and components.json; preserve embedded component icons. Optional icons: `find-icons` is in the Full profile at /mcp/full (reconnect after switching). In Core, keep embedded icons, use text labels and omit extra decorative icons.';
        if(name==='get-design-system-kit'&&args.target==='html'&&typeof structured.buildInstructions==='string'&&args.detail!=='full')structured.buildInstructions=[
          'Required: paste tokensCss and componentCss verbatim.',
          '1. Read designContext; merge it into DESIGN.md before building.',
          '2. Keep class="ds" on the root and ds-* classes on controls; start from componentExampleHtml.',
          '3. Replace APP_ROOT in hostIsolationCssTemplate and append it after host CSS. Custom CSS is layout-only.',
          '4. Apply hierarchyPolicy, compositionPolicy, hoverPolicy and textColorPolicy. Verify computed text contrast at 4.5:1.',
          '5. Review source, copy and rendered geometry; fix critical/serious findings, then inspect screenshots and test keyboard/task behavior. Unverified checks remain open.',
          '',
          'Optional: find-icons and get-icon-files are in Full at /mcp/full (reconnect after switching). Core preserves embedded icons, uses text labels and omits decorative icons.',
          'Full prose: detail:"full". CSS, examples and policies remain in structuredContent.',
        ].join('\n');
        if(name==='get-design-system-kit'&&args.target==='react'&&typeof structured.installCommand==='string')structured.installCommand=structured.installCommand.replace(/^\[ -f components\.json \][\s\S]*?\n\n/,'').replace(/ -o\b/g,'');
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
            structured.familyPreviewUrl=`${process.env.EIDOVA_WEBSITE_URL??'https://eidova.vercel.app'}/?specimen=${info.family.representative}`;
            structured.viewUrl=info.variant?`${baseUrl()}/registry/${info.id}/globals.json`:structured.familyPreviewUrl;
            structured.viewLabel=info.variant?'View tokens':'View components';
          }
        }
        const htmlHandoff=name==='get-design-system-kit'&&args.target==='html'&&args.detail!=='full';
        return {...result,structuredContent:structured,content:[{type:'text',text:htmlHandoff?String(structured.buildInstructions):JSON.stringify(structured)},...(result.content??[]).filter((block:{type:string})=>block.type!=='text')]};
      };
    }
    const execute=callback;
    const mutates=['create-design-system','set-design-config','set-team-rules'].includes(name);
    toolNames.add(name);
    return {name,config:{...config,description,inputSchema:conciseSchema(inputSchema),...(outputSchema?{outputSchema:conciseSchema(outputSchema)}:{}),annotations:{readOnlyHint:!mutates,destructiveHint:['set-team-rules','set-design-config'].includes(name),idempotentHint:name!=='create-design-system',openWorldHint:name==='extract-from-url'}},callback:async(args:unknown,extra:unknown)=>{
      try {
        const result=await execute(args,extra);
        return result?.structuredContent?.status==='error'?{...result,isError:true}:result;
      } catch(error) {return failure(error instanceof Error?error.message:'Tool request failed. Check the inputs and retry.');}
    }};
  }
  const server=createMcpServer({provider:createProvider(store,identity),apiFetch:apiDispatcher(projects,new ProjectRulesStore(store,identity)),name:'Eidova',version:'0.2.0',userId:identity,instructions:workflowNote,authContext:identity?{kind:'api-key',apiKey:'local-workspace'}:undefined,enableDesignPanel:false,enableMobileKits:Boolean(privateArchive),enableShopifyKit:Boolean(privateArchive),enableReviewUiCode:true,configureTool});
  registerReviewTool(server);
  if(!privateArchive)server.registerTool('get-shopify-guide',{inputSchema:{topic:z.string().max(120).optional(),query:z.string().max(2000).optional()}},async({topic,query})=>{
    if(topic&&query)return failure('Pass topic or query, not both. Omit both to list the index.');
    if(topic){const rule=await getPrincipleByTopic(topic,'shopify');return rule?text(rule.content):failure('Topic not found; omit topic for the available index.');}
    if(query){const rules=await searchPrinciples(query,5,'shopify');return rules.length?text(rules.map(rule=>rule.content).join('\n\n')):failure('No matching guide; omit query for the available index.');}
    return text(JSON.stringify(await listPrinciples('shopify')));
  });
  server.registerTool('check-first-visit',{inputSchema:firstVisitInputSchema},handleFirstVisit);
  server.registerTool('search-resources',{description:'Search the complete Eidova resource library: systems, components, design templates, plugin examples, image/video presets and skills. Read returned manifests for original files, previews and licenses.',inputSchema:{query:z.string().max(500).optional(),kind:z.enum(bundledKinds).optional(),limit:z.number().int().min(1).max(20).default(8),offset:z.number().int().min(0).max(1000).default(0)}},async({query,kind,limit,offset})=>text(JSON.stringify(await searchResources(query,kind,limit,offset))));
  server.registerTool('read-resource',{description:'Read an Eidova resource manifest or file using a URI from search-resources. Text is paginated by Unicode characters; follow nextOffset to finish. Binary assets return typed download links. File reads never execute content.',inputSchema:{uri:z.string().min(1).max(2000),offset:z.number().int().min(0).max(10000000).default(0),limit:z.number().int().min(1).max(24000).default(12000)}},async({uri,offset,limit})=>text(JSON.stringify(await readBundledResource(uri,offset,limit))));
  server.registerTool('get-capabilities',{inputSchema:{}},async()=>{
    const entries=await bundledEntries();
    return text(JSON.stringify({version:'0.2.0',profile,systems:(await catalog()).length,families:designFamilies.length,library:{total:entries.length,kinds:Object.fromEntries(bundledKinds.map(kind=>[kind,entries.filter(entry=>entry.kind===kind).length])),readTool:'read-resource',searchTool:'search-resources'},tools:[...toolNames],iconSearch:{tool:'find-icons',profile:'full',fallback:'Preserve icons embedded in the kit, use text labels and omit extra decorative icons.'},generation:'deterministic base reuse and supplied token overrides',retrieval:'lexical',execution:'source, evidence and commands only; no hosted installation/rendering',dashboardCapture:'Local browser capture: eidova-mcp review-browser <loopback-url>; hosted browser capture unavailable.',keyRecovery:'unavailable',fullEndpoint:`${baseUrl()}/mcp/full`,coreEndpoint:`${baseUrl()}/mcp`,omitted:[...unavailable].filter(name=>name!=='get-inspiration'||!privateArchive),privateWorkspace:Boolean(identity),...(privateArchive?{archive:privateArchive.summary()}:{})}));
  });
  const workflow=awaitWorkflow;
  server.registerResource('eidova-license','design://eidova/license',{mimeType:'text/plain',description:'Apache-2.0 license for the bundled Eidova content; package overrides are linked in each manifest.'},async uri=>({contents:[{uri:uri.href,mimeType:'text/plain',text:await readFile(resourcePath('content/eidova/LICENSE'),'utf8')}]}));
  server.registerResource('eidova-bundles',new ResourceTemplate('design://eidova/{kind}/{id}',{
    list:async()=>({resources:(await bundledEntries()).map(entry=>({uri:entryUri(entry),name:`Eidova: ${entry.name} (${entry.kind})`,mimeType:'application/json',description:entry.description}))}),
  }),{mimeType:'application/json',description:resourceNote},async(uri,{kind,id})=>{
    const entry=await findBundledEntry(String(kind),String(id));
    if(!entry)throw new Error('Bundled resource not found. Call search-resources for a valid kind, ID and URI.');
    return {contents:[{uri:uri.href,mimeType:'application/json',text:JSON.stringify(await bundledManifest(entry))}]};
  });
  server.registerResource('eidova-file',new ResourceTemplate('design://eidova/{kind}/{id}/files/{+file}',{list:undefined}),
    {description:'Verbatim bundled file. Read its package manifest for provenance, hashes and licenses; no code is executed.'},async(uri,{kind,id,file})=>{
      const result=await bundledFile(String(kind),String(id),String(file));
      if(!result)throw new Error('Bundled file not found. Read the manifest and copy a listed file URI.');
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
      const ruleId=decodeURIComponent(String(id));
      const entry=(await getReviewRules()).find(rule=>rule.id===ruleId);if(!entry)throw new Error('Review rule not found.');return {contents:[{uri:uri.href,mimeType:'text/markdown',text:entry.content}]};
    });
  }
  for(const [name,prompt] of [['choose-theme','Find a distinctive design family for this screen. Preserve an existing product design. Retrieve only needed React components.'],['preserve-brand','Extract my supplied brand CSS, retain its identity and components, then suggest the smallest necessary changes.'],['review-form','Review my supplied form source and copy. Ask for rendered DOM evidence where visual checks require it. Report actionable findings.']]) server.registerPrompt(name,{description:prompt},async()=>({messages:[{role:'user',content:{type:'text',text:prompt}}]}));
  return server;
}
const awaitWorkflow=readFile(resourcePath('content/workflow.md'),'utf8');
