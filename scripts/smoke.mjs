import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { mkdir, writeFile } from 'node:fs/promises';
const endpoint = process.argv[2] ?? 'http://localhost:3000/mcp';
const client = new Client({name:'eidova-verification',version:'0.1.0'});
await client.connect(new StreamableHTTPClientTransport(new URL(endpoint)));
await mkdir('.work/verification',{recursive:true});
const list=await client.listTools();
await writeFile('.work/verification/tools.json',JSON.stringify(list,null,2));
console.log(JSON.stringify({endpoint,tools:list.tools.map(t=>t.name)}));
const calls=[
  ['find-design-system',{query:'minimal professional developer tools'}],
  ['get-ui-principle',{topic:'spacing'}],
  ['get-ux-principle',{topic:'search'}],
  ['get-review-rules',{category:'all'}],
  ['check-comprehension',{screen:'Eidova landing page',headline:'Good interfaces start with good tools.',body:['Give your coding agent a real design system, practical guidance, and checks it can run before shipping.'],actions:['Copy MCP URL','Browse design systems'],knownTerms:['MCP','UI','React','HTTP','JSON','MIT','Geist']}],
  ['inspect-spacing',{}],
  ['check-first-visit',{step:'brief',task:'Find a theme',url:'https://open-design-website.vercel.app'}],
  ['find-icons',{libraryId:'lucide',query:'home'}],
  ['install-icons',{libraryId:'lucide',names:['house'],format:'svg'}],
  ['get-design-system-kit',{designSystemId:'minimal-light',target:'react',component:['button','input','card']}],
];
for (const [name,args] of calls) {
  const result=await client.callTool({name,arguments:args});
  await writeFile(`.work/verification/${name}.json`,JSON.stringify(result,null,2));
  console.log(JSON.stringify({name,error:result.isError??false,characters:JSON.stringify(result).length,summary:result.structuredContent??null}).slice(0,1200));
  if (result.isError) throw new Error(`${name} failed`);
}
await client.close();
