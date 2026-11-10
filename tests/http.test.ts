import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {request} from 'node:http';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {app} from '../src/app.js';

test('HTTP full/core profiles reconnect statelessly and keep private responses out of caches',async()=>{
  const listener=app.listen(0,'127.0.0.1');await once(listener,'listening');
  const origin='http://127.0.0.1:'+(listener.address() as {port:number}).port;
  try {
    const health=await fetch(origin+'/health');assert.equal((await health.json()).version,'0.2.0');
    const catalog=await fetch(origin+'/api/catalog');const etag=catalog.headers.get('etag');assert.ok(etag);assert.match(catalog.headers.get('cache-control')!,/public/);
    assert.equal((await fetch(origin+'/api/catalog',{headers:{'if-none-match':etag},cache:'force-cache'})).status,304);
    for(const[path,count,owner]of [['/mcp',40,false],['/mcp/core',11,false],['/api/mcp/core',11,false],['/mcp',41,true]] as const) {
      const client=new Client({name:'http-test',version:'1'});
      try {
        await client.connect(new StreamableHTTPClientTransport(new URL(origin+path),{requestInit:owner?{headers:{Authorization:'Bearer '+'a'.repeat(43)}}:undefined}));
        assert.equal((await client.listTools()).tools.length,count);
        assert.ok((client.getInstructions()??'').length<1000);
        const guidance=await client.callTool({name:'get-ui-principle',arguments:{topic:'spacing'}});assert.ok(!guidance.isError);
        assert.equal((await client.callTool({name:'get-design-system-kit',arguments:{target:'unsupported'}})).isError,true);
        assert.match(JSON.stringify(await client.readResource({uri:'design://workflow/v1'})),/version 1/);
        assert.equal((await client.listPrompts()).prompts.length,3);
      } finally {await client.close();}
    }
    const protocol={jsonrpc:'2.0',id:1,method:'tools/list'};
    const headers={'Content-Type':'application/json',Accept:'application/json, text/event-stream'};
    const privateResponse=await fetch(origin+'/mcp',{method:'POST',headers:{...headers,Authorization:'Bearer '+'a'.repeat(43)},body:JSON.stringify(protocol)});
    assert.equal(privateResponse.status,200);assert.equal(privateResponse.headers.get('cache-control'),'no-store');assert.ok(privateResponse.headers.get('x-request-id'));
    const invalidKey=await fetch(origin+'/mcp',{method:'POST',headers:{...headers,Authorization:'Bearer short'},body:JSON.stringify(protocol)});
    assert.equal(invalidKey.status,401);assert.equal(invalidKey.headers.get('cache-control'),'no-store');assert.doesNotMatch(await invalidKey.text(),/short|[A-Z]:\\|node_modules/);
    assert.equal((await fetch(origin+'/mcp/core')).status,405);
    const tooLarge=await fetch(origin+'/mcp',{method:'POST',headers,body:JSON.stringify({...protocol,data:'a'.repeat(4*1024*1024)})});assert.equal(tooLarge.status,413);assert.equal(tooLarge.headers.get('cache-control'),'no-store');assert.ok(tooLarge.headers.get('x-request-id'));
  } finally {await new Promise<void>((resolve,reject)=>listener.close(error=>error?reject(error):resolve()));}
});

test('HTTP diagnostics retain sizes and boundary error classes without caller content',async()=>{
  const messages:string[]=[];const log=mock.method(process.stderr,'write',(chunk:unknown)=>{messages.push(String(chunk));return true;});
  const listener=app.listen(0,'127.0.0.1');await once(listener,'listening');
  const origin='http://127.0.0.1:'+(listener.address() as {port:number}).port;
  const secret='DO_NOT_LOG_SOURCE_OR_CREDENTIALS';
  const body=JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{source:secret}});
  try {
    const headers={'Content-Type':'application/json',Accept:'application/json, text/event-stream',Authorization:'Bearer '+'b'.repeat(43)};
    const response=await fetch(origin+'/mcp/core',{method:'POST',headers,body});await response.text();
    const requestId=response.headers.get('x-request-id');
    const successful=messages.map(message=>JSON.parse(message)).find(entry=>entry.requestId===requestId);
    assert.equal(successful.requestBytes,Buffer.byteLength(body));assert.equal(successful.operation,'tools/list');assert.equal(successful.errorClass,'none');assert.ok(successful.durationMs>=0);
    const invalid=await fetch(origin+'/mcp/core',{method:'POST',headers,body:'{'});await invalid.text();
    const failed=messages.map(message=>JSON.parse(message)).find(entry=>entry.requestId===invalid.headers.get('x-request-id'));
    assert.equal(failed.errorClass,'request');assert.equal(failed.status,400);assert.equal(failed.requestBytes,1);
    assert.doesNotMatch(messages.join(''),new RegExp(secret+'|'+ 'b'.repeat(43)+'|source|Authorization|node_modules'));
  } finally {await new Promise<void>((resolve,reject)=>listener.close(error=>error?reject(error):resolve()));log.mock.restore();}
});

test('process concurrency is bounded before reading bodies and released after cancellation',async()=>{
  const listener=app.listen(0,'127.0.0.1');await once(listener,'listening');
  const origin='http://127.0.0.1:'+(listener.address() as {port:number}).port;
  const held:{client:ReturnType<typeof request>;response:import('node:http').ServerResponse}[]=[];
  try {
    for(let index=0;index<16;index++) {
      const incoming=once(listener,'request');
      const client=request(origin+'/mcp/core',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':'1000'}});client.on('error',()=>{});client.write('{');
      const[,response]=await incoming;held.push({client,response});
    }
    const busy=await fetch(origin+'/api/v1/brand-extract/from-url?url=https://example.com');assert.equal(busy.status,429);assert.equal(busy.headers.get('retry-after'),'2');assert.equal(busy.headers.get('cache-control'),'no-store');
    assert.match(await busy.text(),/nothing was changed/);
    const released=held.map(({response})=>once(response,'close'));for(const entry of held)entry.client.destroy();await Promise.all(released);
    const available=await fetch(origin+'/mcp/core',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});assert.equal(available.status,200);await available.text();
  } finally {for(const entry of held)entry.client.destroy();await new Promise<void>((resolve,reject)=>listener.close(error=>error?reject(error):resolve()));}
});
