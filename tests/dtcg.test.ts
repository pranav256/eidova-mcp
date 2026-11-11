import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDtcg} from '../src/dtcg.js';
import {catalog} from '../src/catalog.js';
import {createServer} from '../src/mcp.js';
import {LocalFileStore} from '../src/store.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('DTCG exports resolve typed aliases, keep mode scope and preserve unsupported CSS separately',()=>{
  const result=normalizeDtcg(JSON.stringify({
    color:{$type:'color',$value:{colorSpace:'oklch',components:[0.6,0.2,120],hex:'#123456'}},
    alias:{$value:'var(--color)'},chained:{$value:'var(--alias)'},
    radius:{$type:'dimension',$value:{value:8,unit:'px'}},
    calc:{$value:'calc(1rem - 4px)'},font:{$type:'fontFamily',$value:['var(--missing-font)','sans-serif']},
    cycleA:{$value:'var(--cycleB)'},cycleB:{$value:'var(--cycleA)'},
    badWeight:{$type:'fontWeight',$value:5000},
    dark:{$extensions:{'com.better-design.mode':'dark'},color:{$type:'color',$value:{colorSpace:'oklch',components:[0.1,0,0]}},alias:{$value:'var(--color)'}},
  }));
  const document=result.document as Record<string,any>;
  assert.equal(document.alias.$type,'color');assert.equal(document.alias.$value,'{color}');assert.equal(document.chained.$value,'{alias}');assert.equal(document.dark.alias.$value,'{dark.color}');
  assert.equal(result.report.aliases,3);assert.equal(result.report.unsupportedTokens,5);assert.ok(!document.calc&&!document.font&&!document.cycleA&&!document.badWeight);
  const retained=document.$extensions['org.eidova.export'].unsupported;assert.equal(retained.calc.$value,'calc(1rem - 4px)');assert.equal(retained.badWeight.$value,5000);
  assert.ok(document.radius.$type);assert.equal(document.$schema,undefined);
});

test('DTCG references use DEFAULT for a token that also owns a group',()=>{
  const document=normalizeDtcg(JSON.stringify({primary:{DEFAULT:{$type:'number',$value:1},foreground:{$type:'number',$value:2}},alias:{$value:'var(--primary)'}})).document as Record<string,any>;
  assert.equal(document.alias.$value,'{primary.DEFAULT}');
});

test('unsupported token names and types cannot change prototypes or lose source',()=>{
  const result=normalizeDtcg('{"__proto__":{"$value":"calc(1rem + 4px)"},"constructor":{"$type":"__proto__","$value":2}}');
  const retained=(result.document.$extensions as Record<string,any>)['org.eidova.export'].unsupported;
  assert.equal(Object.getPrototypeOf(retained),null);
  assert.equal(retained.__proto__.$value,'calc(1rem + 4px)');
  assert.equal(retained.constructor.$type,'__proto__');
  assert.equal(result.report.unsupportedTokens,2);
  assert.equal(JSON.parse(JSON.stringify(retained)).__proto__.$value,'calc(1rem + 4px)');
});

test('all 31 public kits export typed DTCG with live aliases and original CSS',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'eidova-dtcg-'));
  const server=createServer(new LocalFileStore(directory));
  const client=new Client({name:'dtcg-catalog-test',version:'1'});
  const[a,b]=InMemoryTransport.createLinkedPair();
  try {
    await server.connect(b);await client.connect(a);
    const systems=await catalog();assert.equal(systems.length,31);
    for(const system of systems) {
      const result=await client.callTool({name:'get-design-system-kit',arguments:{target:'dtcg',designSystemId:system.id}});
      assert.ok(!result.isError,system.id+': export failed');
      const data=result.structuredContent as {tokensJson:string;tokensCss:string;dtcgReport:{typedTokens:number;unsupportedTokens:number}};
      const document=JSON.parse(data.tokensJson);
      assert.match(data.tokensCss,/:root/,system.id);
      assert.ok(data.dtcgReport.typedTokens>0,system.id+': no typed tokens');
      const tokens=new Map<string,{$type:string;$value:unknown}>();
      function collect(group:Record<string,any>,prefix:string[]=[]) {
        for(const[key,node]of Object.entries(group)) {
          if(key.startsWith('$')||!node||typeof node!=='object'||Array.isArray(node))continue;
          const next=[...prefix,key];
          if(Object.hasOwn(node,'$value')){assert.ok(node.$type,system.id+': untyped '+next.join('.'));tokens.set(next.join('.'),node);}
          else collect(node,next);
        }
      }
      collect(document);assert.equal(tokens.size,data.dtcgReport.typedTokens,system.id);
      for(const token of tokens.values())if(typeof token.$value==='string'&&token.$value.startsWith('{')) {
        const target=tokens.get(token.$value.slice(1,-1));assert.ok(target,system.id+': dangling alias '+token.$value);assert.equal(token.$type,target.$type);
      }
      assert.equal(Object.keys(document.$extensions['org.eidova.export'].unsupported).length,data.dtcgReport.unsupportedTokens);
    }
  } finally {await client.close();await server.close();assert.equal(path.dirname(directory),os.tmpdir());await rm(directory,{recursive:true,force:true});}
});
