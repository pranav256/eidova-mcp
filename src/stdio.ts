#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { parseArgs } from 'node:util';
import { resourcePath } from './resources.js';
const {values,positionals}=parseArgs({options:{profile:{type:'string',default:'full'},help:{type:'boolean'},version:{type:'boolean'}},allowPositionals:true});
if(!['full','core'].includes(values.profile!)){process.stderr.write('Use --profile full or --profile core. Run --help for examples.\n');process.exit(1);}
if(values.help){process.stdout.write('Open Design MCP\nUsage: open-design-mcp [--profile full|core]\n       open-design-mcp doctor | --version\nPublic catalog and reviews need no key.\n');process.exit(0);}
if(values.version){process.stdout.write('0.2.0\n');process.exit(0);}
if(positionals[0]==='doctor'&&positionals.length===1){
  try{for(const asset of ['assets/registry','content/library.json','content/design-families.json','content/workflow.md'])resourcePath(asset);}
  catch(error){process.stderr.write((error instanceof Error?error.message:'Package assets are unavailable.')+' Reinstall the package or rebuild the checkout.\n');process.exit(1);}
  process.stdout.write('Open Design 0.2.0: package assets available; stdio supported. No network or credential checks performed.\n');process.exit(0);
}
if(positionals.length){process.stderr.write('Unknown command. Use --help.\n');process.exit(1);}
const {createServer}=await import('./mcp.js');
const {createStore}=await import('./store.js');
const {workspaceId}=await import('./provider.js');
const {loadPrivateArchive}=await import('./private-archive.js');
const archive=process.env.OPEN_DESIGN_PRIVATE_ARCHIVE ? await loadPrivateArchive(process.env.OPEN_DESIGN_PRIVATE_ARCHIVE) : undefined;
const server=createServer(createStore(),workspaceId(process.env.OPEN_DESIGN_WORKSPACE_KEY,true),archive,values.profile as 'core'|'full');
await server.connect(new StdioServerTransport());
