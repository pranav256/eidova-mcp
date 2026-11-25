import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {reviewBrowser,browserStatesSchema} from '../src/browser-review.js';
import {createServer as createMcpServer} from '../src/mcp.js';
import {LocalFileStore} from '../src/store.js';

const html=await readFile(new URL('../fixtures/browser-review.html',import.meta.url));
const directory=await mkdtemp(path.join(tmpdir(),'eidova-browser-contract-'));
const listener=createServer((request,response)=>{response.setHeader('content-type','text/html');response.statusCode=request.url==='/missing'?404:200;response.end(html);});
listener.listen(0,'127.0.0.1');await once(listener,'listening');
const origin='http://127.0.0.1:'+(listener.address() as {port:number}).port;
const states=browserStatesSchema.parse([
  {name:'default',steps:[]},
  {name:'keyboard-focus',steps:[{action:'focus',selector:'#open'}]},
  {name:'details-open',steps:[{action:'click',selector:'#open'}]},
]);
try {
  assert.equal(browserStatesSchema.safeParse([{name:'../escape',steps:[]}]).success,false);
  const failed=await reviewBrowser(origin+'/missing',directory,undefined,[{name:'default',steps:[]}]);
  const incomplete=JSON.parse(await readFile(failed.report,'utf8'));
  assert.equal(failed.status,'partial');assert.equal(failed.coverage.complete,false);assert.equal(incomplete.geometry.score,undefined);assert.equal(failed.passed,false);
  assert.equal(incomplete.coverage.missingStates.length,6);
  const review=await reviewBrowser(origin,directory,undefined,states);
  const report=JSON.parse(await readFile(review.report,'utf8'));
  const capture=JSON.parse(await readFile(review.capture,'utf8'));
  assert.equal(review.status,'complete',JSON.stringify(report.coverage));assert.equal(review.coverage.complete,true);
  assert.equal(review.coverage.capturedStates,18);assert.equal(report.visual.screenshots.length,18);
  assert.equal(report.geometry.scope,'DOM geometry findings only');assert.ok(report.visual.unverified.length);
  assert.ok(capture.states.filter((state:any)=>state.name.includes('details-open')).every((state:any)=>state.elements.some((element:any)=>element.label==='Details')));
  for(const profile of ['core','full'] as const) {
    const server=createMcpServer(new LocalFileStore(directory),undefined,undefined,profile);
    const client=new Client({name:'browser-contract',version:'1'});const[a,b]=InMemoryTransport.createLinkedPair();
    try {
      await server.connect(b);await client.connect(a);
      const source=await client.callTool({name:'review-ui-code',arguments:{files:[{path:'browser-review.html',content:html.toString()}]}});
      assert.ok(!source.isError);assert.equal((source.structuredContent as any).evidence,'supplied-source');
      assert.equal((source.structuredContent as any).findings.filter((finding:any)=>finding.ruleId.startsWith('wcag/')).length,0);
      assert.ok((source.structuredContent as any).unverified.length);
      const response=await client.callTool({name:'inspect-spacing',arguments:capture});
      assert.ok(!response.isError,JSON.stringify(response));
      const result=response.structuredContent as any;
      assert.equal(result.status,'completed');assert.equal(result.coverage.complete,true);assert.deepEqual(result.missingWidths,[]);
      assert.ok(result.unverified.length);
      console.log(JSON.stringify({profile,captures:18,coverage:result.coverage.complete,geometryFindings:result.summary,unverified:result.unverified}));
    } finally {await client.close();await server.close();}
  }
} finally {
  listener.close();await once(listener,'close');
  await rm(directory,{recursive:true,force:true});
}
