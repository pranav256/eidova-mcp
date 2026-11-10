import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {syncBuiltinESMExports} from 'node:module';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {safeFetchPublic} from '../src/safe-fetch.js';
import {apiDispatcher} from '../src/local-api.js';
import {Projects} from '../src/projects.js';
import {LocalFileStore} from '../src/store.js';

test('pinned public fetch preserves redirect base and rejects unsafe redirects and bodies',async()=>{
  const original=http.request;
  let replies:{status:number;headers?:Record<string,string>;body?:string}[]=[];
  const paths:string[]=[];
  http.request=((options:{path:string;lookup:Function},callback:Function)=>{
    paths.push(options.path);
    const reply=replies.shift();assert.ok(reply,'Unexpected network request');
    options.lookup('ignored',{},(_error:unknown,address:string)=>assert.equal(address,'8.8.8.8'));
    const request=new EventEmitter() as EventEmitter&{end():void;setTimeout():void;destroy(error:Error):void};
    request.setTimeout=()=>{};
    request.destroy=error=>request.emit('error',error);
    request.end=()=>queueMicrotask(()=>{
      const incoming=Readable.from([Buffer.from(reply.body??'')]) as Readable&{statusCode:number;headers:Record<string,string>};
      incoming.statusCode=reply.status;incoming.headers=reply.headers??{};callback(incoming);
    });
    return request;
  }) as unknown as typeof http.request;
  syncBuiltinESMExports();
  try {
    replies=[{status:302,headers:{location:'/brand/page'}},{status:200,body:'<link rel="stylesheet" href="./theme.css">'}];
    const response=await safeFetchPublic('http://8.8.8.8/start');
    assert.equal(response.url,'http://8.8.8.8/brand/page');assert.equal(response.redirected,true);
    assert.equal(new URL('./theme.css',response.url).pathname,'/brand/theme.css');
    replies=[{status:302,headers:{location:'/brand/page'}},{status:200,body:'<link rel="stylesheet" href="./theme.css">'},{status:200,body:':root { --primary: #123456; }'}];
    const dispatch=apiDispatcher(new Projects(new LocalFileStore('.work/unused-extraction-test')));
    const extraction=await dispatch('http://localhost:3000/api/v1/brand-extract/from-url?url='+encodeURIComponent('http://8.8.8.8/start'));
    assert.equal(extraction.status,200);assert.equal(paths.at(-1),'/brand/theme.css');
    const extracted=await extraction.json();assert.equal(extracted.summary.tokenCount,1);assert.equal(extracted.summary.primary,'oklch(0.3192 0.0725 251.17)');
    replies=[{status:302,headers:{location:'http://127.0.0.1/private'}}];
    await assert.rejects(safeFetchPublic('http://8.8.8.8/redirect'),/Private, local/);assert.equal(replies.length,0);
    replies=Array.from({length:4},()=>({status:302,headers:{location:'/loop'}}));
    await assert.rejects(safeFetchPublic('http://8.8.8.8/loop'),/Too many redirects/);
    replies=[{status:200,headers:{'content-encoding':'gzip'}}];
    await assert.rejects(safeFetchPublic('http://8.8.8.8/compressed'),/Compressed response/);
    replies=[{status:200,body:'a'.repeat(1_000_001)}];
    await assert.rejects(safeFetchPublic('http://8.8.8.8/large'),/1 MB fetch limit/);
    replies=[{status:204}];assert.equal((await safeFetchPublic('http://8.8.8.8/empty')).status,204);
    const before=paths.length;
    await assert.rejects(safeFetchPublic('http://8.8.8.8/cancelled',0,AbortSignal.abort()));
    await assert.rejects(safeFetchPublic('http://8.8.8.8:8080/'),/custom port/);
    assert.equal(paths.length,before);
  } finally {http.request=original;syncBuiltinESMExports();}
});
