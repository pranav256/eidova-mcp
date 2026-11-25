#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { parseArgs } from 'node:util';
import { resourcePath } from './resources.js';
import { createServer as createHttpServer } from 'node:http';
import { once } from 'node:events';
const argv = process.argv.slice(2);
const command = argv[0];
const args = argv.slice(1);
if (['review-browser', 'preview-install', 'diff-tokens'].includes(command)) {
  try {
    const {runLocalCommand} = await import('./local-commands.js');
    const result = await runLocalCommand(command, args);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (error) {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n');
    process.exitCode = 1;
  }
} else {
const {values,positionals}=parseArgs({args: argv, options:{profile:{type:'string',default:'core'},help:{type:'boolean'},version:{type:'boolean'}},allowPositionals:true});
if(!['full','core'].includes(values.profile!)){process.stderr.write('Use --profile full or --profile core. Run --help for examples.\n');process.exit(1);}
if(values.help){process.stdout.write('Eidova MCP\nUsage: eidova-mcp [--profile core|full]\n       eidova-mcp doctor | --version\n       eidova-mcp review-browser <loopback-url> [--output <directory>] [--ready-selector <selector>]\n       eidova-mcp preview-install <theme> <inventory.json> <component>...\n       eidova-mcp diff-tokens <before.css|json> <after.css|json>\nCore is the default. Use --profile full for specialist tools and owner features. Public catalog and reviews need no key.\n');process.exit(0);}
if(values.version){process.stdout.write('0.2.0\n');process.exit(0);}
if(positionals[0]==='doctor'&&positionals.length===1){
  try{
    const {readFile}=await import('node:fs/promises');
    for(const asset of ['content/workflow.md','content/eidova/LICENSE']) {
      const content=(await readFile(resourcePath(asset),'utf8')).trim();
      if(!content)throw new Error(`Required package resource is empty: ${asset}`);
    }
    const [{catalog},{bundledEntries},{iconLibrary},{principles,reviewRules}]=await Promise.all([import('./catalog.js'),import('./bundled-resources.js'),import('./icons.js'),import('./guidance.js')]);
    const [systems,entries,icons]=await Promise.all([catalog(),bundledEntries(),iconLibrary()]);
    if(!systems.length||!Array.isArray(entries)||!entries.length||!icons.iconCount||!principles.length||!reviewRules.length)throw new Error('Package catalog, resource index, icons or guidance are empty or invalid.');
    process.stdout.write(`Eidova 0.2.0: package assets available; ${systems.length} systems, ${entries.length} resources, ${principles.length} principles, ${reviewRules.length} review rules and ${icons.iconCount} icons validated. No network or credential checks performed.\n`);
  }
  catch(error){process.stderr.write((error instanceof Error?error.message:'Package assets are unavailable.')+' Reinstall the package or rebuild the checkout.\n');process.exit(1);}
  process.exit(0);
}
if(positionals.length){process.stderr.write('Unknown command. Use --help.\n');process.exit(1);}
if(!process.env.EIDOVA_BASE_URL){
  // Bind before importing tools: their registry origin is captured during initialization.
  const registry=createHttpServer();
  registry.listen(0,'127.0.0.1');
  await once(registry,'listening');
  registry.unref();
  process.env.EIDOVA_BASE_URL=`http://127.0.0.1:${(registry.address() as {port:number}).port}`;
  const {app}=await import('./app.js');
  registry.on('request',app);
}
const {createServer}=await import('./mcp.js');
const {createStore}=await import('./store.js');
const {workspaceId}=await import('./provider.js');
const {loadPrivateArchive}=await import('./private-archive.js');
const archiveDirectory=process.env.EIDOVA_PRIVATE_ARCHIVE;
const archive=archiveDirectory ? await loadPrivateArchive(archiveDirectory) : undefined;
const server=createServer(createStore(),workspaceId(process.env.EIDOVA_WORKSPACE_KEY,true),archive,values.profile as 'core'|'full');
await server.connect(new StdioServerTransport());
}
