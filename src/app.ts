import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { catalog, registryItem, baseUrl, systemWithComponents } from './catalog.js';
import { iconSvg } from './icons.js';
import { workspaceId } from './provider.js';
import { createStore } from './store.js';
import { createServer } from './mcp.js';
import { Projects } from './projects.js';
import { apiDispatcher } from './local-api.js';
import { ProjectRulesStore } from './project-rules-store.js';
import { designContext } from './design-context.js';
import { readFile } from 'node:fs/promises';
import { resourcePath } from './resources.js';
import { bundledFile, bundledManifest, findBundledEntry, searchResources } from './bundled-resources.js';

export const app = express();
app.disable('x-powered-by');
const mcpPaths=['/mcp','/api/mcp','/mcp/core','/api/mcp/core'];
const operations=new Set(['initialize','tools/list','tools/call','resources/list','resources/read','resources/templates/list','prompts/list','prompts/get','notifications/initialized']);
let inFlight=0;
app.use((req,res,next)=> {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  if(req.path.startsWith('/mcp')||req.path.startsWith('/api/'))res.setHeader('Cache-Control','no-store');
  if(mcpPaths.includes(req.path)||req.path==='/api/v1/brand-extract/from-url') {
    const requestId=randomUUID(),started=Date.now();res.setHeader('X-Request-Id',requestId);
    res.once('close',()=>process.stderr.write(JSON.stringify({requestId,operation:operations.has(req.body?.method)?req.body.method:req.path==='/api/v1/brand-extract/from-url'?'extract-from-url':'protocol',durationMs:Date.now()-started,requestBytes:res.locals.requestBytes??0,status:res.statusCode,errorClass:res.locals.errorClass??(!res.writableFinished?'aborted':res.statusCode>=500?'server':res.statusCode>=400?'request':'none')})+'\n'));
  }
  if (req.path.startsWith('/mcp') || req.path.startsWith('/api/') || req.path.startsWith('/registry/')) {
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization, MCP-Protocol-Version, Mcp-Session-Id');
    res.setHeader('Access-Control-Allow-Methods','GET, POST, PATCH, PUT, OPTIONS');
    if (req.method === 'OPTIONS') {res.status(204).end();return;}
  }
  next();
});
app.use((req,res,next)=> {
  if(!mcpPaths.includes(req.path)&&req.path!=='/api/v1/brand-extract/from-url'){next();return;}
  // This process cap bounds memory; deployment-wide rate limits belong at the host.
  if(inFlight>=16){res.setHeader('Retry-After','2');res.status(429).json({error:'Server is busy. Retry in two seconds; nothing was changed.'});return;}
  inFlight++;res.once('close',()=>{inFlight--;});next();
});
app.use(express.json({limit:'4mb',strict:true,verify:(_req,res,buffer)=>{(res as Response).locals.requestBytes=buffer.byteLength;}}));
const store=createStore();
app.get('/health',(_req,res)=>res.json({status:'ok',name:'Eidova MCP',version:'0.2.0'}));
app.get('/api/catalog',async (_req,res)=>{res.setHeader('Cache-Control','public,max-age=300');res.json(await catalog());});
app.get('/api/resources',async (req,res)=>{
  const {query='',kind,offset='0'}=req.query;
  if(typeof query!=='string'||query.length>500||kind!==undefined&&!['design-systems','skills'].includes(String(kind))||typeof kind==='object'||typeof offset!=='string'||!/^\d{1,4}$/.test(offset)||Number(offset)>1000){res.status(400).json({error:'Use query text, kind design-systems or skills, and an offset from 0 to 1000.'});return;}
  res.setHeader('Cache-Control','public,max-age=300');res.json(await searchResources(query,kind as string|undefined,20,Number(offset)));
});
app.get('/api/resources/:kind/:id',async (req,res)=>{
  const entry=await findBundledEntry(req.params.kind,req.params.id);
  if(!entry){res.status(404).json({error:'Bundled resource not found'});return;}
  res.setHeader('Cache-Control','public,max-age=300');res.json(await bundledManifest(entry));
});
app.get('/api/resources/license',async (_req,res)=>{
  res.setHeader('Cache-Control','public,max-age=300');
  res.attachment('LICENSE');res.type('text/plain').send(await readFile(resourcePath('content/open-design/LICENSE')));
});
app.get('/api/resources/:kind/:id/file',async (req,res)=>{
  if(typeof req.query.path!=='string'){res.status(400).json({error:'Supply the path listed in the resource manifest'});return;}
  const file=await bundledFile(req.params.kind,req.params.id,req.query.path);
  if(!file){res.status(404).json({error:'Bundled file not found'});return;}
  res.setHeader('Cache-Control','public,max-age=300');
  res.setHeader('Content-Security-Policy',"sandbox; default-src 'none'");
  res.attachment(req.query.path.split('/').at(-1)!);
  res.type('application/octet-stream').send(file.bytes);
});
app.get('/api/design-systems/:id/design.md',async (req,res)=> {
  const markdown=await designContext(req.params.id);
  if(markdown===null){res.status(404).json({error:'Design system not found'});return;}
  res.setHeader('Cache-Control','public,max-age=300');
  res.setHeader('Content-Disposition','attachment; filename="DESIGN.md"');
  res.type('text/markdown').send(markdown);
});
app.post('/api/workspace-key',(_req,res)=> {
  res.setHeader('Cache-Control','no-store');
  res.json({key:randomBytes(32).toString('base64url'),note:'Keep this workspace capability key private. It is not recoverable by an email account.'});
});
app.get('/registry/:system/:component.json',async (req,res)=> {
  try {res.setHeader('Cache-Control','public,max-age=300');res.json(await registryItem(req.params.system,req.params.component));}
  catch {res.status(404).json({error:'Registry item not found'});}
});
app.get('/icons/lucide/:name.svg',async (req,res)=> {
  const svg=await iconSvg(req.params.name);
  if (!svg) {res.status(404).end();return;}
  res.type('image/svg+xml').send(svg);
});
function identity(req:Request) {
  const bearer=req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1];
  if (req.headers.authorization && !bearer) throw new Error('Use Authorization: Bearer <workspace-key>.');
  return workspaceId(bearer);
}
app.all(mcpPaths,async (req,res)=> {
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'POST') {res.status(405).json({jsonrpc:'2.0',error:{code:-32000,message:'Use MCP Streamable HTTP POST requests.'},id:null});return;}
  let owner:string|undefined;
  try {owner=identity(req);} catch {res.status(401).json({error:'Invalid workspace key format'});return;}
  const server=createServer(store,owner,undefined,req.path.endsWith('/core')?'core':'full');
  const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  const close=()=> {void transport.close();void server.close();};
  res.on('close',close);
  try {await server.connect(transport);await transport.handleRequest(req,res,req.body);}
  catch {res.locals.errorClass='transport';if (!res.headersSent) res.status(500).json({error:'MCP request failed'});close();}
});
app.all(/^\/api\/(?:projects|fragments|v1)\//,async (req,res)=> {
  res.setHeader('Cache-Control','no-store');
  let owner:string|undefined;
  try {owner=identity(req);} catch {res.status(401).json({error:'Invalid workspace key format'});return;}
  const response=await apiDispatcher(new Projects(store,owner),new ProjectRulesStore(store,owner))(baseUrl()+req.originalUrl,{method:req.method,body:['GET','HEAD'].includes(req.method)?undefined:JSON.stringify(req.body)});
  res.status(response.status).type('application/json').send(await response.text());
});
app.get('/',(_req,res)=>res.json({name:'Eidova MCP',transport:'Streamable HTTP',endpoint:`${baseUrl()}/mcp`,website:'https://open-design-website.vercel.app',repository:'https://github.com/pranav256/eidova-mcp'}));
app.get('/design-systems/:id',async (req,res)=> {
  const system=await systemWithComponents(req.params.id);
  if (!system) {res.status(404).json({error:'Design system not found'});return;}
  res.json(system);
});
app.get(['/projects/:id','/preview/:id'],async (req,res)=> {
  const projects=new Projects(store);
  const project=await projects.get(String(req.params.id));
  if (!project) {res.status(404).json({error:'Project not found'});return;}
  res.json({name:project.name,id:project.id,status:'completed',tokensCss:await projects.css(project),registryUrl:`${baseUrl()}/api/projects/${project.id}/registry/all.json`});
});
app.use((_req,res)=>res.status(404).json({error:'Not found'}));
app.use((error:unknown,_req:Request,res:Response,_next:NextFunction)=> {
  const status=(error as {status?:number})?.status;
  res.status(status && status>=400 && status<500?status:500).json({error:status===413?'Request exceeds the 4 MB limit.':'Request could not be processed.'});
});
