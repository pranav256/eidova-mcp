import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createServer} from '../src/mcp.js';
import {LocalFileStore} from '../src/store.js';

const file=path.resolve(process.argv[2]??'../eidova-website/src/showcase-data.json');
const data=JSON.parse(await readFile(file,'utf8'));
const directory=await mkdtemp(path.join(tmpdir(),'eidova-tool-directory-'));
try {
  const inventories=new Map();
  for(const profile of ['core','full'] as const) {
    const server=createServer(new LocalFileStore(directory),undefined,undefined,profile);
    const client=new Client({name:'website-tool-sync',version:'1'});
    const[a,b]=InMemoryTransport.createLinkedPair();
    try {
      await server.connect(b);await client.connect(a);
      inventories.set(profile,(await client.listTools()).tools);
    } finally {await client.close();await server.close();}
  }
  const core=new Set(inventories.get('core').map((tool:any)=>tool.name));
  data.tools=inventories.get('full').map((tool:any)=>({
    name:tool.name,description:tool.description,
    category:data.tools.find((entry:any)=>entry.name===tool.name)?.category??'Tools',
    profiles:core.has(tool.name)?['core','full']:['full'],
    parameters:Object.entries(tool.inputSchema.properties??{}).map(([name,value])=>{
      const schema=value as any;
      return {name,type:schema.type??(schema.anyOf?'union':'object'),required:(tool.inputSchema.required??[]).includes(name),choices:schema.enum??[]};
    }),
  }));
  data.publicTools=data.tools.length;
  await writeFile(file,JSON.stringify(data,null,2)+'\n');
  console.log(`Synced ${core.size} Core / ${data.tools.length} Full tools to ${file}`);
} finally {await rm(directory,{recursive:true,force:true});}
