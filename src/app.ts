import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomBytes } from 'node:crypto';
import { catalog, registryItem, baseUrl, systemWithComponents } from './catalog.js';
import { iconSvg } from './icons.js';
import { workspaceId } from './provider.js';
import { createStore } from './store.js';
import { createServer } from './mcp.js';
import { Projects } from './projects.js';
import { apiDispatcher } from './local-api.js';
import { ProjectRulesStore } from './project-rules-store.js';

export const app = express();
app.disable('x-powered-by');
app.use((req,res,next)=> {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  if (req.path.startsWith('/mcp') || req.path.startsWith('/api/') || req.path.startsWith('/registry/')) {
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization, MCP-Protocol-Version, Mcp-Session-Id');
    res.setHeader('Access-Control-Allow-Methods','GET, POST, PATCH, PUT, OPTIONS');
    if (req.method === 'OPTIONS') {res.status(204).end();return;}
  }
  next();
});
app.use(express.json({limit:'4mb',strict:true}));
const store=createStore();
app.get('/health',(_req,res)=>res.json({status:'ok',name:'Open Design MCP',version:'0.1.0'}));
app.get('/api/catalog',async (_req,res)=>res.json(await catalog()));
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
app.all(['/mcp','/api/mcp'],async (req,res)=> {
  if (req.method !== 'POST') {res.status(405).json({jsonrpc:'2.0',error:{code:-32000,message:'Use MCP Streamable HTTP POST requests.'},id:null});return;}
  let owner:string|undefined;
  try {owner=identity(req);} catch {res.status(401).json({error:'Invalid workspace key format'});return;}
  const server=createServer(store,owner);
  const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  const close=()=> {void transport.close();void server.close();};
  res.on('close',close);
  try {await server.connect(transport);await transport.handleRequest(req,res,req.body);}
  catch (error) {if (!res.headersSent) res.status(500).json({error:'MCP request failed'});close();}
});
app.all(/^\/api\/(?:projects|fragments|v1)\//,async (req,res)=> {
  let owner:string|undefined;
  try {owner=identity(req);} catch {res.status(401).json({error:'Invalid workspace key format'});return;}
  const response=await apiDispatcher(new Projects(store,owner),new ProjectRulesStore(store,owner))(baseUrl()+req.originalUrl,{method:req.method,body:['GET','HEAD'].includes(req.method)?undefined:JSON.stringify(req.body)});
  res.status(response.status).type('application/json').send(await response.text());
});
app.get('/',(_req,res)=>res.json({name:'Open Design MCP',transport:'Streamable HTTP',endpoint:`${baseUrl()}/mcp`,website:'https://open-design-website.vercel.app',repository:'https://github.com/pranav256/open-design-mcp'}));
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
