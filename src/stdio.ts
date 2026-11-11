#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { parseArgs } from 'node:util';
import { resourcePath } from './resources.js';
const {values,positionals}=parseArgs({options:{profile:{type:'string',default:'full'},studio:{type:'boolean'},'native-studio':{type:'boolean'},help:{type:'boolean'},version:{type:'boolean'}},allowPositionals:true});
if(!['full','core'].includes(values.profile!)){process.stderr.write('Use --profile full or --profile core. Run --help for examples.\n');process.exit(1);}
if(values.help){process.stdout.write('Eidova MCP\nUsage: eidova-mcp [--profile full|core] [--studio] [--native-studio]\n       eidova-mcp doctor | --version\nPublic catalog and reviews need no key.\n--studio adds private team tools using EIDOVA_STUDIO_URL and EIDOVA_STUDIO_KEY.\n--native-studio adds the installed native engine using EIDOVA_NATIVE_STUDIO_ENTRY and optional EIDOVA_NATIVE_STUDIO_URL (loopback7456).\n');process.exit(0);}
if(values.version){process.stdout.write('0.2.0\n');process.exit(0);}
if(positionals[0]==='doctor'&&positionals.length===1){
  try{for(const asset of ['assets/registry','content/library.json','content/design-families.json','content/workflow.md'])resourcePath(asset);}
  catch(error){process.stderr.write((error instanceof Error?error.message:'Package assets are unavailable.')+' Reinstall the package or rebuild the checkout.\n');process.exit(1);}
  process.stdout.write('Eidova 0.2.0: package assets available; stdio supported. No network or credential checks performed.\n');process.exit(0);
}
if(positionals.length){process.stderr.write('Unknown command. Use --help.\n');process.exit(1);}
const {createServer}=await import('./mcp.js');
const {createStore}=await import('./store.js');
const {workspaceId}=await import('./provider.js');
const {loadPrivateArchive}=await import('./private-archive.js');
const archiveDirectory=process.env.EIDOVA_PRIVATE_ARCHIVE ?? process.env.OPEN_DESIGN_PRIVATE_ARCHIVE;
const archive=archiveDirectory ? await loadPrivateArchive(archiveDirectory) : undefined;
const server=createServer(createStore(),workspaceId((process.env.EIDOVA_WORKSPACE_KEY ?? process.env.OPEN_DESIGN_WORKSPACE_KEY),true),archive,values.profile as 'core'|'full');
if(values.studio){
  const {registerStudioTools}=await import('./studio-mcp.js');
  const {StudioClient}=await import('./studio-client.js');
  if(!process.env.EIDOVA_STUDIO_URL) throw new Error('Set EIDOVA_STUDIO_URL before enabling --studio.');
  registerStudioTools(server,new StudioClient(process.env.EIDOVA_STUDIO_URL,process.env.EIDOVA_STUDIO_KEY ?? ''));
}
if(values['native-studio']){
  const {createStudioMcpBridge,nativeStudioTransport}=await import('./studio-native-mcp.js');
  const bridge=await createStudioMcpBridge(server,await nativeStudioTransport());
  for(const signal of ['SIGINT','SIGTERM'] as const) process.once(signal,()=>{void bridge.close();});
  process.stdin.once('end',()=>{void bridge.close();});
  process.stdin.once('error',()=>{void bridge.close();});
  process.stdout.once('error',()=>{void bridge.close();});
  try {await bridge.server.connect(new StdioServerTransport());}
  catch(error){await bridge.close();throw error;}
} else await server.connect(new StdioServerTransport());
