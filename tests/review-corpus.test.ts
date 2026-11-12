import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectSpacing} from '../vendor/upstream/runtime.mjs';

test('spacing corpus distinguishes scroll clipping from exposed square corners and real lost content',()=>{
  const rounded={horizontal:10,vertical:10},square={horizontal:0,vertical:0};
  const state={name:'Rounded table',viewport:{width:390,height:844},elements:[
    {id:'container',tag:'div',rect:{x:24,y:80,width:320,height:120},style:{padding:{top:0,right:0,bottom:0,left:0},borderRadius:{topLeft:rounded,topRight:rounded,bottomLeft:rounded,bottomRight:rounded},backgroundColor:'rgb(255,255,255)',overflowX:'auto',overflowY:'auto'}},
    {id:'header',tag:'thead',parentId:'container',rect:{x:25,y:81,width:318,height:40},style:{borderRadius:{topLeft:square,topRight:square,bottomLeft:square,bottomRight:square},backgroundColor:'rgb(240,240,240)'}},
  ]};
  const scroll=inspectSpacing({states:[state]});assert.ok(!scroll.findings.some(finding=>finding.ruleId==='spacing/non-concentric-radius'));
  const exposed=structuredClone(state);exposed.elements[0].style.overflowX='visible';exposed.elements[0].style.overflowY='visible';
  assert.ok(inspectSpacing({states:[exposed]}).findings.some(finding=>finding.ruleId==='spacing/non-concentric-radius'&&finding.severity==='serious'));
  const clipped=inspectSpacing({states:[{name:'Lost copy',viewport:{width:390,height:844},elements:[{id:'message',tag:'p',rect:{x:24,y:80,width:120,height:20},clientWidth:120,scrollWidth:220,clientHeight:20,scrollHeight:60,style:{overflowX:'hidden',overflowY:'hidden'}}]}]});
  const finding=clipped.findings.find(finding=>finding.ruleId==='spacing/clipped-content')!;
  assert.equal(finding.severity,'serious');assert.ok(finding.evidence.length>0);assert.match(finding.fix,/wrapping|scrollable/);
});

test('small icon hit areas fail and accessible hit areas pass the same touch check',()=>{
  const input=(size:number)=>({states:[{name:'Dialog close',viewport:{width:390,height:844},elements:[{id:'close',tag:'button',label:'Close',interactive:true,rect:{x:320,y:80,width:size,height:size}}]}]});
  const small=inspectSpacing(input(16));assert.ok(small.findings.some(finding=>finding.ruleId==='spacing/touch-target'&&finding.severity==='serious'));
  assert.ok(!inspectSpacing(input(44)).findings.some(finding=>finding.ruleId==='spacing/touch-target'));
});

test('viewport overflow uses ancestor clipping without hiding lost content or oversized containers',()=>{
  const state={name:'Scrolled documentation',viewport:{width:390,height:844},elements:[
    {id:'scroller',tag:'div',rect:{x:24,y:80,width:340,height:120},clientWidth:340,scrollWidth:800,style:{overflowX:'auto',overflowY:'auto'}},
    {id:'table',tag:'table',parentId:'scroller',rect:{x:-100,y:80,width:800,height:120}},
    {id:'cell',tag:'td',parentId:'table',rect:{x:500,y:80,width:180,height:40}},
  ]};
  const report=inspectSpacing({states:[state]});
  assert.ok(!report.findings.some(f=>f.ruleId==='spacing/viewport-overflow'));
  const hidden=structuredClone(state);hidden.elements[0].style!.overflowX='hidden';
  assert.ok(inspectSpacing({states:[hidden]}).findings.some(f=>f.ruleId==='spacing/clipped-content'));
  const visible=structuredClone(state);visible.elements[0].style!.overflowX='visible';
  assert.ok(inspectSpacing({states:[visible]}).findings.some(f=>f.ruleId==='spacing/viewport-overflow'));
  const oversized=structuredClone(state);oversized.elements[0].rect.width=500;
  assert.ok(inspectSpacing({states:[oversized]}).findings.some(f=>f.ruleId==='spacing/viewport-overflow'&&f.elementIds.includes('scroller')));
  const fixed={...state,elements:state.elements.map(element=>element.id==='cell'?{...element,style:{position:'fixed'}}:element)};
  assert.ok(inspectSpacing({states:[fixed]}).findings.some(f=>f.ruleId==='spacing/viewport-overflow'&&f.elementIds.includes('cell')));
});

test('ragged-row review compares blocks rather than inline code inside aligned table cells',()=>{
  const state={name:'Reference table',viewport:{width:390,height:844},elements:[
    {id:'row',tag:'tr',rect:{x:24,y:80,width:340,height:48}},
    {id:'a',tag:'td',parentId:'row',rect:{x:24,y:80,width:160,height:48}},
    {id:'b',tag:'td',parentId:'row',rect:{x:204,y:80,width:160,height:48}},
    {id:'ac',tag:'code',parentId:'a',lineCount:1,rect:{x:24,y:80,width:140,height:20},style:{display:'inline'}},
    {id:'bc',tag:'code',parentId:'b',lineCount:2,rect:{x:204,y:80,width:140,height:40},style:{display:'inline'}},
  ]};
  assert.ok(!inspectSpacing({states:[state]}).findings.some(f=>f.ruleId==='spacing/ragged-text-row'));
  const blocks=structuredClone(state);
  blocks.elements[0].tag='div';blocks.elements[1].tag='div';blocks.elements[2].tag='div';
  blocks.elements[3].tag='p';blocks.elements[4].tag='p';blocks.elements[3].style!.display='block';blocks.elements[4].style!.display='block';
  assert.ok(inspectSpacing({states:[blocks]}).findings.some(f=>f.ruleId==='spacing/ragged-text-row'));
});

test('intentional auto-margin flex separation does not mask ordinary sibling gap drift',()=>{
  const state={name:'Result row',viewport:{width:390,height:844},elements:[
    {id:'row',tag:'div',rect:{x:24,y:80,width:340,height:48},style:{display:'flex',flexDirection:'row'}},
    {id:'icon',parentId:'row',rect:{x:24,y:80,width:24,height:24}},
    {id:'text',parentId:'row',rect:{x:56,y:80,width:140,height:24}},
    {id:'arrow',parentId:'row',rect:{x:340,y:80,width:24,height:24},style:{autoMargins:['left']}},
  ]};
  assert.ok(!inspectSpacing({states:[state]}).findings.some(f=>f.ruleId==='spacing/sibling-gap-drift'));
  const drift=structuredClone(state);drift.elements[3].style!.autoMargins=[];
  assert.ok(inspectSpacing({states:[drift]}).findings.some(f=>f.ruleId==='spacing/sibling-gap-drift'));
});
