import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createServer} from '../src/mcp.js';
import {LocalFileStore} from '../src/store.js';
import {workflowNote} from '../src/tool-descriptions.js';

test('built MCP review retains reference mode, auto-margin evidence and authored CSS',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'eidova-review-'));
  const server=createServer(new LocalFileStore(directory),undefined,undefined,'full');
  const client=new Client({name:'review-regressions',version:'1'});
  const[a,b]=InMemoryTransport.createLinkedPair();
  try {
    await server.connect(b);await client.connect(a);
    const extracted=await client.callTool({name:'extract-design-system',arguments:{css:':root { --primary: #123456; --radius: 8px; }'}});
    assert.ok(!extracted.isError);
    const instructions=String((extracted.structuredContent as {buildInstructions:string}).buildInstructions);
    assert.ok(instructions.includes(workflowNote));
    assert.doesNotMatch(instructions,/Required, in this order|never skipped|Show the summary, the records/);
    const ambiguous=await client.callTool({name:'get-design-system-kit',arguments:{target:'react',designSystemId:'minimal-light',projectId:'00000000-0000-0000-0000-000000000000',component:'button'}});
    assert.equal(ambiguous.isError,true);assert.match(JSON.stringify(ambiguous),/Use designSystemId or projectId/);
    const preview=await client.callTool({name:'preview-design-system',arguments:{designSystemId:'minimal-light'}});
    assert.ok(!preview.isError);assert.doesNotMatch(JSON.stringify(preview),/shotUrl/);
    assert.deepEqual(JSON.parse((preview.content as {text:string}[])[0].text),preview.structuredContent);
    const anonymousRules=await client.callTool({name:'get-team-rules',arguments:{}});
    assert.match(JSON.stringify(anonymousRules),/private workspace/);
    assert.doesNotMatch(JSON.stringify(anonymousRules),/set-team-rules|dashboard\/settings/);
    const refused=await client.callTool({name:'extract-from-url',arguments:{url:'http://127.0.0.1/private'}});
    assert.equal(refused.isError,true);assert.match(JSON.stringify(refused),/Private, local and reserved/);
    assert.ok(!(await client.callTool({name:'get-review-rules',arguments:{category:'comprehension'}})).isError);
    const copy=await client.callTool({name:'check-comprehension',arguments:{screen:'Clip reference',surface:'reference',code:'<h4>Your moments</h4><a href="#install"><h2>Get Eidova</h2><svg /></a>'+Array.from({length:15},()=>'<p>Choose how the clips appear before saving.</p>').join('')}});
    const comprehension=copy.structuredContent as {surface:string;verdict:string;words:number;budgetWords:number};
    assert.equal(comprehension.verdict,'pass');assert.equal(comprehension.surface,'reference');
    assert.ok(comprehension.words>60);assert.ok(comprehension.budgetWords<10);
    const capture=await client.callTool({name:'inspect-spacing',arguments:{}});
    assert.match(String((capture.structuredContent as {captureScript:string}).captureScript),/autoMargins/);
    const state={name:'Result row',viewport:{width:390,height:844},elements:[
      {id:'row',rect:{x:24,y:80,width:340,height:48},style:{display:'flex'}},
      {id:'icon',parentId:'row',rect:{x:24,y:80,width:24,height:24}},
      {id:'text',parentId:'row',rect:{x:56,y:80,width:140,height:24}},
      {id:'arrow',parentId:'row',rect:{x:340,y:80,width:24,height:24},style:{autoMargins:['left']}},
    ]};
    const spacing=await client.callTool({name:'inspect-spacing',arguments:{states:[state]}});
    assert.ok(!spacing.isError);assert.doesNotMatch(JSON.stringify(spacing),/spacing\/sibling-gap-drift/);
    const source='export const Preview = ({frame,tone}: any) => <div className={`frame-${frame} bg-${tone}-500`}>Sample clip</div>;';
    const css='/* #ff0000 and .bg-red-500 {} are comments */\n:root { --primary: #123456; --shadow: 0 2px 4px\n rgba(0, 0, 0, .2); }\n@media (min-width:20rem) {.frame-auto, .frame-manual {color:var(--primary)}}\n.example::after {content:".bg-blue-500 {}"}\n.bad {background:#abcdef}';
    const review=await client.callTool({name:'review-ui-code',arguments:{files:[{path:'preview.tsx',content:source},{path:'theme.css',content:css}]}});
    const report=JSON.stringify(review);
    assert.doesNotMatch(report,/Hardcoded color #123456|Hardcoded color rgba|Hardcoded color #ff0000/);
    assert.match(report,/Hardcoded color #abcdef/);assert.match(report,/line 6/);
    assert.doesNotMatch(report,/"frame-\$\{…\}" builds/);assert.match(report,/bg-\$\{…\}-500/);
    const withoutCss=await client.callTool({name:'review-ui-code',arguments:{files:[{path:'preview.tsx',content:source}]}});
    assert.match(JSON.stringify(withoutCss),/frame-\$\{…\}/);
    const picker=await client.callTool({name:'review-ui-code',arguments:{files:[{path:'picker.tsx',content:'export const Picker = () => <label>Theme<select name="theme"><option>Neutral</option><option>Warm</option><option>Ink</option><option>Paper</option><option>Slate</option></select></label>;'}]}});
    assert.match(JSON.stringify(picker),/\*\*moderate\*\* `element\/select`/);
    assert.doesNotMatch(JSON.stringify(picker),/\*\*serious\*\* `element\/select`/);
  } finally {
    await client.close();await server.close();assert.equal(path.dirname(directory),os.tmpdir());await rm(directory,{recursive:true,force:true});
  }
});
