import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createServer} from '../src/mcp.js';
import {LocalFileStore} from '../src/store.js';
import {workflowNote} from '../src/tool-descriptions.js';

test('source accessibility handles native labels, dynamic components and inline pairs across profiles',async()=>{
  for(const profile of ['core','full'] as const) {
    const directory=await mkdtemp(path.join(os.tmpdir(),'eidova-source-edges-'));
    const server=createServer(new LocalFileStore(directory),undefined,undefined,profile);
    const client=new Client({name:'source-edges',version:'1'});const[a,b]=InMemoryTransport.createLinkedPair();
    try {
      await server.connect(b);await client.connect(a);
      const review=async(content:string,path='edges.tsx')=>{
        const response=await client.callTool({name:'review-ui-code',arguments:{files:[{path,content}]}});
        assert.ok(!response.isError,JSON.stringify(response));return response.structuredContent as any;
      };
      for(const [css,count] of [
        ['.text{color:#111;background-color:#fff}',0],
        ['.text{color:#777;background-color:#fff;font-size:24px}',0],
        ['.text{color:#aaa;background-color:#fff;font-size:24px}',1],
        ['.text{color:#eee;color:var(--text);background-color:#fff}',0],
        ['.text{color:#eee;background-color:#fff;background:#111}',0],
        ['.text{color:rgba(255,255,255,.5);background-color:#fff}',0],
        ['.text{color:rgb(230,230,230);background:#fff}',1],
        ['.text{color:#111!important;color:#eee;background:#fff}',0],
      ] as const)assert.equal((await review(css,'colors.css')).findings.filter((finding:any)=>finding.ruleId==='wcag/explicit-contrast').length,count,css);
      const clean=await review(`export const Screen=({label,props})=><>
<button aria-label="Save"/><button {...props}/><button>{label}</button><button><UserName/></button>
<label htmlFor="email">Email</label><input id="email"/>
<label>Message<textarea/></label><span id="choice">Choice</span><select aria-labelledby="choice"/>
<label htmlFor={label}>Dynamic association</label><input id={label}/><div onClick={open} {...props}>Open</div>
<a id="anchor"/><a href="/save">Save</a><Button/><Input/>
</>`);
      assert.deepEqual(clean.findings.filter((finding:any)=>finding.ruleId.startsWith('wcag/')),[]);
      assert.ok(clean.unverified.some((value:string)=>value.includes('Dynamic')));
      const bad=await review(`export const Screen=()=> <>
<button aria-labelledby="missing"/>
<input type="button" value=""/>
<div role="button" tabIndex={-1} onClick={open}>Open</div>
<p style={{color:'#eee',backgroundColor:'#fff'}}>Unreadable</p>
</>`);
      for(const [rule,line] of [['wcag/control-name',2],['wcag/control-name',3],['wcag/keyboard-target',4],['wcag/explicit-contrast',5]])assert.ok(bad.findings.some((finding:any)=>finding.ruleId===rule&&finding.line===line),`${profile} ${rule} line ${line}`);
      const html=await review('<p style="color:#eee;background-color:#fff">Unreadable</p>','inline.html');
      assert.ok(html.findings.some((finding:any)=>finding.ruleId==='wcag/explicit-contrast'&&finding.line===1));
      const skipped=await review('{}','unsupported.json');
      assert.equal(skipped.status,'partial');assert.match(skipped.skipped[0],/unsupported source type/);
    } finally {await client.close();await server.close();await rm(directory,{recursive:true,force:true});}
  }
});

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

test('source-review fixtures report names, labels, keyboard targets and explicit contrast without clean-fixture false positives in both profiles',async(t)=>{
  const source=async(name:string)=>readFile(new URL(`../fixtures/${name}`,import.meta.url),'utf8');
  const broken=await Promise.all(['review-ui-negative.tsx','review-ui-negative.css'].map(async name=>({path:name,content:await source(name)})));
  const clean=await Promise.all(['review-ui-clean.tsx','review-ui-clean.css'].map(async name=>({path:name,content:await source(name)})));
  const expected=[
    ['wcag/control-name',3,/Add descriptive text or a non-empty aria-label/],
    ['wcag/control-label',4,/<label>|aria-label/],
    ['wcag/keyboard-target',5,/Use a <button>|keyboard handling/],
    ['wcag/explicit-contrast',2,/4\.5:1 contrast ratio|foreground\/background token pair/],
  ] as const;
  for(const profile of ['core','full'] as const) {
    const directory=await mkdtemp(path.join(os.tmpdir(),'eidova-source-fixture-'));
    const server=createServer(new LocalFileStore(directory),undefined,undefined,profile);
    const client=new Client({name:'source-fixture-contract',version:'1'});const[a,b]=InMemoryTransport.createLinkedPair();
    try {
      await server.connect(b);await client.connect(a);
      const tools=(await client.listTools()).tools.map(tool=>tool.name);
      assert.equal(tools.includes('review-ui-code'),true);assert.equal(tools.includes('inspect-spacing'),true);
      const negative=await client.callTool({name:'review-ui-code',arguments:{files:broken}});
      const report=String((negative.content as {text:string}[])[0].text);
      for(const [rule,line,fix] of expected) {
        const match=report.match(new RegExp(`\\x60${rule}\\x60 line (\\d+)`));
        assert.equal(Number(match?.[1]),line,`${profile}: ${rule} line`);
        assert.match(report,fix,`${profile}: ${rule} fix`);
      }
      assert.match(report,/Unverified: rendered\/computed colors and contrast/);
      const positive=await client.callTool({name:'review-ui-code',arguments:{files:clean}});
      const cleanReport=String((positive.content as {text:string}[])[0].text);
      for(const [rule] of expected)assert.doesNotMatch(cleanReport,new RegExp(rule),`${profile}: false positive ${rule}`);
      assert.match(cleanReport,/No deterministic issues found in the supplied source/);
      assert.match(cleanReport,/Unverified: rendered\/computed colors and contrast/);
      const html=await client.callTool({name:'review-ui-code',arguments:{files:[{path:'broken.html',content:await source('review-ui-negative.html')}] }});
      const htmlFindings=(html.structuredContent as {findings:Array<{ruleId:string;line:number;file:string;fix:string}>}).findings;
      for(const [rule,line] of [['wcag/control-name',11],['wcag/control-label',12],['wcag/keyboard-target',13],['wcag/explicit-contrast',6]] as const) {
        const finding=htmlFindings.find(finding=>finding.ruleId===rule);
        assert.equal(finding?.line,line,profile+' HTML '+rule);
        assert.equal(finding?.file,'broken.html');assert.ok(finding?.fix);
      }
      const cleanHtml=await client.callTool({name:'review-ui-code',arguments:{files:[{path:'clean.html',content:await source('review-ui-clean.html')}]}});
      assert.equal((cleanHtml.structuredContent as any).summary.total,0,JSON.stringify(cleanHtml));
      assert.equal((cleanHtml.structuredContent as any).evidence,'supplied-source');
      assert.ok((cleanHtml.structuredContent as any).unverified.length>0);
      t.diagnostic(JSON.stringify({profile,toolCoverage:tools.length,expectedSourceDetections:8,missedFindings:0,cleanFixtureFalsePositives:0,locationAndFixChecks:8,unverifiedEvidence:true}));
    } finally {await client.close();await server.close();await rm(directory,{recursive:true,force:true});}
  }
});

for(const profile of ['core','full'] as const) test(profile+' spacing results withhold scores until required widths and states are covered',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'eidova-spacing-contract-'));
  const server=createServer(new LocalFileStore(directory),undefined,undefined,profile);
  const client=new Client({name:'spacing-contract',version:'1'});const[a,b]=InMemoryTransport.createLinkedPair();
  const state=(width:number,size=48)=>({name:`${width}px`,viewport:{width,height:900},elements:[{id:'close',tag:'button',label:'Close',interactive:true,rect:{x:20,y:20,width:size,height:size}}]});
  try {
    await server.connect(b);await client.connect(a);
    const call=async(states:ReturnType<typeof state>[],requiredStates?:string[])=>{
      const response=await client.callTool({name:'inspect-spacing',arguments:{states,requiredStates}});
      assert.ok(!response.isError,JSON.stringify(response));
      return {data:response.structuredContent as Record<string,any>,text:String((response.content as {text:string}[])[0].text)};
    };
    const initial=await client.callTool({name:'inspect-spacing',arguments:{}});
    assert.equal((initial.structuredContent as any).coverage.complete,false);
    assert.equal((initial.structuredContent as any).score,undefined);
    assert.ok((initial.structuredContent as any).unverified.length);
    const widths=[390,1440,1728];
    const clean=await call(widths.map(width=>state(width)));
    assert.equal(clean.data.status,'completed');assert.equal(clean.data.coverage.complete,true);assert.equal(clean.data.score,100);assert.equal(clean.data.findings.length,0);assert.match(clean.text,/Complete geometry coverage/);assert.match(clean.text,/finding-penalty score/);
    const finding=await call(widths.map(width=>state(width,width===1440?16:48)));
    assert.equal(finding.data.status,'completed');assert.equal(finding.data.coverage.complete,true);assert.ok(finding.data.score<100);assert.ok(finding.data.findings.some((item:any)=>item.ruleId==='spacing/touch-target'));assert.match(finding.text,/tap area|44×44/);
    const partial=await call([state(390)]);
    assert.equal(partial.data.status,'partial');assert.equal(partial.data.score,undefined);assert.deepEqual(partial.data.coverage.missingWidths,[1440,1728]);assert.match(partial.text,/Partial coverage/);assert.match(partial.text,/No geometry score is reported/);
    const missingState=await call(widths.map(width=>({...state(width),name:'default'})),['default','menu-open']);
    assert.equal(missingState.data.status,'partial');assert.equal(missingState.data.score,undefined);assert.equal(missingState.data.coverage.missingStates.length,3);
    const empty=await call(widths.map(width=>({...state(width),elements:[]})));
    assert.equal(empty.data.status,'partial');assert.equal(empty.data.score,undefined);assert.equal(empty.data.coverage.emptyStates.length,3);
    const truncated=await call(widths.map(width=>({...state(width),captureCoverage:{totalEligibleElements:1501,capturedElements:1,truncated:true}})));
    assert.equal(truncated.data.status,'partial');assert.equal(truncated.data.score,undefined);assert.equal(truncated.data.coverage.truncatedStates.length,3);
  } finally {await client.close();await server.close();await rm(directory,{recursive:true,force:true});}
});

test('kit/resource flows advertise working profile tools, concise HTML setup and recovery hints',async()=>{
  for(const profile of ['core','full'] as const) {
    const directory=await mkdtemp(path.join(os.tmpdir(),'eidova-kit-contract-'));
    const server=createServer(new LocalFileStore(directory),profile==='full'?'kit-contract-owner':undefined,undefined,profile);
    const client=new Client({name:'kit-resource-contract',version:'1'});const[a,b]=InMemoryTransport.createLinkedPair();
    try {
      await server.connect(b);await client.connect(a);
      const tools=(await client.listTools()).tools;
      const names=new Set(tools.map(tool=>tool.name));
      const search=await client.callTool({name:'find-design-system',arguments:{query:'minimal light workspace'}});
      const match=(search.structuredContent as {matches:Array<{id:string}>}).matches[0];assert.ok(match);
      const context=await client.readResource({uri:`design://systems/${match.id}/design.md`});
      assert.match((context.contents[0] as {text:string}).text,/tokens|components/i);
      const kit=await client.callTool({name:'get-design-system-kit',arguments:{target:'html',designSystemId:match.id}});
      assert.ok(!kit.isError,JSON.stringify(kit));
      const data=kit.structuredContent as Record<string,any>;
      for(const required of data.requiredTools as string[])assert.ok(names.has(required),`${profile} kit requires missing tool ${required}`);
      assert.equal(typeof data.componentCss,'string');
      assert.match(data.componentExampleHtml,/class=["'][^"']*\bds\b/);
      assert.match(data.componentCss,/\.ds-[a-z-]+/);
      assert.match(data.buildInstructions,/Required: paste tokensCss and componentCss verbatim/);
      assert.ok((String((kit.content as {text:string}[])[0].text)).length<String(JSON.stringify(data)).length);
      const icons=(data.optionalTools as Array<{name:string;profile:string;fallback:string}>).find(item=>item.name==='find-icons')!;
      assert.equal(icons.profile,'full');assert.match(icons.fallback,/lucide-react|omit/);assert.equal(names.has(icons.name),profile==='full');
      const capabilityResult=await client.callTool({name:'get-capabilities',arguments:{}});
      const capabilities=JSON.parse((capabilityResult.content as {text:string}[])[0].text);
      assert.equal(capabilities.iconSearch.profile,'full');assert.equal(capabilities.tools.includes('find-icons'),profile==='full');
      const extracted=await client.callTool({name:'extract-design-system',arguments:{css:':root { --primary: #123456; --radius: 8px; }'}});
      assert.ok(!extracted.isError);assert.match((extracted.structuredContent as any).tokensCss,/--primary:/);
      for(const detail of ['summary','full']) for(const target of ['html','react']) {
        const generated=await client.callTool({name:'get-design-system-kit',arguments:{target,detail,designSystemId:match.id,...(target==='react'?{component:'button'}:{})}});
        assert.ok(!generated.isError,JSON.stringify(generated));
        const output=generated.structuredContent as any;
        const references=[...new Set(JSON.stringify(output).match(/\b(?:find|get|review|inspect|check|extract|read|create|set|finalize)-[a-z]+(?:-[a-z]+)*/g)??[])];
        for(const name of references) {
          if(names.has(name))continue;
          assert.ok(output.optionalTools.some((tool:any)=>tool.name===name&&tool.profile==='full'&&tool.fallback),`${profile}/${target}/${detail}: unqualified missing tool ${name}`);
        }
        if(target==='html') {
          const css=output.componentCss as string;
          const [base,hover]=css.split('@media (hover:hover) and (pointer:fine){');
          assert.doesNotMatch(base,/:hover/);assert.match(hover,/:hover/);
          assert.doesNotMatch(css,/opacity:\s*0?\.\d/);
          for(const classes of (output.componentExampleHtml as string).matchAll(/class="([^"]+)"/g))for(const name of classes[1].split(/\s+/))if(name!=='ds')assert.ok(css.includes('.'+name),`Missing example class ${name}`);
        }
      }
      const invalid=await client.callTool({name:'read-resource',arguments:{uri:'design://eidova/design-systems/linear-app/files/NO_SUCH_FILE'}});
      assert.equal(invalid.isError,true);assert.match(JSON.stringify(invalid),/manifest|listed file URI/);
      const resources=await client.callTool({name:'search-resources',arguments:{query:'linear',kind:'design-systems'}});
      const resourceUri=(resources.structuredContent as any)?.matches?.[0]?.uri ?? JSON.parse(String((resources.content as {text:string}[])[0].text)).matches[0].uri;
      const manifest=await client.callTool({name:'read-resource',arguments:{uri:resourceUri}});
      assert.ok(!manifest.isError);assert.match(String((manifest.content as {text:string}[])[0].text),/tokens\.css/);
      if(profile==='full') {
        const extracted=await client.callTool({name:'extract-design-system',arguments:{css:':root { --primary: #123456; --radius: 8px; }'}});
        const tokensCss=(extracted.structuredContent as {tokensCss:string}).tokensCss;assert.match(tokensCss,/--primary:\s*oklch/);assert.match(tokensCss,/--radius:\s*8px/);
        const created=await client.callTool({name:'create-design-system',arguments:{prompt:'Extracted-token contract kit',brandCss:tokensCss}});
        assert.ok(!created.isError,JSON.stringify(created));
        const projectId=(created.structuredContent as {projectId:string}).projectId;assert.ok(projectId);
        const generated=await client.callTool({name:'get-design-system-kit',arguments:{target:'html',projectId}});
        assert.ok(!generated.isError,JSON.stringify(generated));assert.match((generated.structuredContent as {tokensCss:string}).tokensCss,/--primary:\s*oklch/);
      }
      if(profile==='core') {
        const fullKit=await client.callTool({name:'get-design-system-kit',arguments:{target:'html',designSystemId:match.id,detail:'full'}});
        assert.ok(!fullKit.isError);assert.ok(String((fullKit.structuredContent as any).buildInstructions).length>String(data.buildInstructions).length);
      }
    } finally {await client.close();await server.close();await rm(directory,{recursive:true,force:true});}
  }
});
