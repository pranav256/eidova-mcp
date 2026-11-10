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
