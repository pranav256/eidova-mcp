import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeComprehension} from '../vendor/upstream/src/mcp/comprehension/analyze.js';
import {extractScreenCopy} from '../vendor/upstream/src/mcp/comprehension/extract.js';

test('all heading levels and headings inside links retain their visible names',()=>{
  for (const tag of ['h1','h2','h3','h4','h5','h6']) {
    const copy=extractScreenCopy(`<section><${tag}>Your moments</${tag}><p>Choose a clip.</p></section>`);
    assert.equal(copy.headline,'Your moments');
  }
  const report=analyzeComprehension({screen:'Install',code:'<a href="#install"><h2>Stay creative.<br><span>Get hooky.</span></h2><svg /></a><button><svg /></button>'});
  assert.equal(report.copy.headline,'Stay creative. Get hooky.');
  assert.deepEqual(report.copy.actions,['Stay creative. Get hooky.']);
  const unlabelled=report.findings.find(finding=>finding.evidence.includes('icon-only'))!;
  assert.match(unlabelled.problem,/1 control/);
});

test('uppercase ordinary copy does not hide real unexplained acronyms',()=>{
  const report=analyzeComprehension({screen:'Pricing',headline:'THE PRICE OF CREATIVE FREEDOM',body:['THE GOOD PARTS ARE WAITING.','MAKE SOMETHING.'],actions:['Save clip']});
  assert.ok(!report.findings.some(finding=>finding.problem.includes('acronym')));
  const jargon=analyzeComprehension({screen:'Settings',headline:'Configure API and SSOT',body:['Save your settings.'],actions:['Save settings']});
  assert.match(jargon.findings.find(finding=>finding.problem.includes('acronym'))!.evidence,/API/);
  assert.match(jargon.findings.find(finding=>finding.problem.includes('acronym'))!.evidence,/SSOT/);
});

test('reference density checks orientation while retaining copy, action and accessibility checks',()=>{
  const body=Array.from({length:12},(_,index)=>`Setting ${index+1} controls how clips appear. Choose a value before saving.`);
  const input={screen:'Settings reference',headline:'Clip settings',body,actions:['Copy settings']};
  const reference=analyzeComprehension({...input,surface:'reference'});
  assert.equal(reference.verdict,'pass');
  assert.ok(reference.stats.words>60);
  assert.equal(analyzeComprehension(input).verdict,'revise');
  assert.ok(analyzeComprehension({...input,surface:'reference',headline:'',body:['word '.repeat(80)]}).findings.some(f=>f.severity==='critical'));
  assert.ok(analyzeComprehension({...input,surface:'reference',body:['word '.repeat(80)]}).findings.some(f=>f.problem.includes('sentence')));
  assert.ok(analyzeComprehension({...input,surface:'reference',actions:['Save','Copy','Delete','Export']}).findings.some(f=>f.problem.includes('actions')));
  assert.ok(analyzeComprehension({...input,surface:'reference',body:['Set API and SSO.']}).findings.some(f=>f.test==='mom'&&f.severity==='serious'));
  assert.ok(analyzeComprehension({...input,surface:'reference',bannedTerms:['clips']}).findings.some(f=>f.test==='brand'));
  assert.equal(analyzeComprehension({...input,surface:'slide'}).verdict,'revise');
});
