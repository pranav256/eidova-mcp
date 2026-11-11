import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalog, designFamilies, registryItem, searchCatalog, systemWithComponents } from '../src/catalog.js';
import { publicFetch } from '../src/public-fetch.js';
test('all checked-in systems can be searched and produce real component source',async()=> {
  const systems=await catalog();assert.equal(systems.length,31);
  const result=await searchCatalog('minimal light',3);assert.ok(result.some(s=>s.id==='minimal-light'));
  const system=await systemWithComponents('minimal-light',{componentNames:['button']});
  assert.match(system!.components[0].code,/React/);
});
test('font searches rank systems using that font ahead of unrelated themes',async()=> {
  const result=await searchCatalog('geist',20);
  const matches=result.filter(system=>system.matchScore>0);
  assert.ok(matches.some(system=>system.id==='minimal-light'));
  assert.ok(matches.some(system=>system.id==='linear'));
  assert.ok(matches.every(system=>/geist/i.test(system.font)));
  assert.ok(!matches.some(system=>system.id==='airbnb'));
});
test('registry aggregates and dependencies resolve locally instead of to vendor',async()=> {
  const all=await registryItem('airbnb','all');assert.ok(all.registryDependencies!.length>90);
  const dialog=await registryItem('airbnb','alert-dialog');
  assert.ok(dialog.registryDependencies!.every(dep=>!dep.includes('better-design.com')));
  const deps=dialog.registryDependencies!.filter(dep=>dep.startsWith('http://localhost:3000'));
  for (const dependency of deps) assert.equal((await publicFetch(dependency)).status,200);
  assert.equal((await publicFetch('http://localhost:3000/registry/beam-custom/_shared.json')).status,200);
  const themed=await registryItem('minimal-light','button');
  assert.ok(themed.cssVars?.light?.primary);
  assert.ok(Object.keys(themed.cssVars!.light).every(key=>!key.startsWith('--')));
});
test('registry identifiers cannot escape assets and responses are mutation-isolated',async()=> {
  await assert.rejects(registryItem('../..','index'));
  await assert.rejects(registryItem('minimal-light','../../.env'));
  const first=await registryItem('minimal-light','button');first.files![0].content='changed';
  assert.notEqual((await registryItem('minimal-light','button')).files![0].content,'changed');
  assert.equal((await publicFetch('https://better-design.com/registry/linear/button.json')).status,403);
});

test('eight distinct families retain all variants and exact ID selection',async()=>{
  const systems=await catalog();assert.equal(designFamilies.length,8);assert.equal(systems.filter(system=>!system.variant).length,8);
  assert.equal((await searchCatalog('metal-fx-silver',1))[0].id,'metal-fx-silver');
  const result=await searchCatalog('professional',5);assert.equal(new Set(result.map(system=>system.family.id)).size,result.length);
});

test('brief matching ignores filler and explains actual use-case matches',async()=>{
  const result=await searchCatalog('Please build me a dashboard',5);
  assert.equal(result[0].family.id,'precision');
  assert.deepEqual(result[0].matchedTerms,['dashboard']);
  assert.ok(result[0].family.tradeoff);
  assert.ok((await searchCatalog('a the please',5)).every(item=>item.matchScore===0));
  assert.ok((await searchCatalog('linear nonexistentword',5)).every(item=>!item.matchedTerms.includes('nonexistentword')));
  assert.ok((await searchCatalog('ear',5)).every(item=>item.matchScore===0),'partial words must not match clear or linear');
});

test('required components constrain every result without silently falling back',async()=>{
  const matching=await searchCatalog('forms',8,['button','input','dialog']);
  assert.ok(matching.length>0);
  assert.ok(matching.every(item=>['button','input','dialog'].every(name=>item.components.includes(name))));
  assert.deepEqual(await searchCatalog('linear',5,['not-a-component']),[]);
});

test('relative source helpers are included in registry dependency closure',async()=>{
  const button=await registryItem('tactile-minimal','button');assert.ok(button.registryDependencies!.some(dependency=>dependency.endsWith('/sound-provider.json')));
  const input=await registryItem('tactile-minimal','input');assert.ok(input.registryDependencies!.some(dependency=>dependency.endsWith('/_shared.json')));
});

test('Dialog close icons are embedded without an Iconify runtime or changed geometry',async()=>{
  for(const system of await catalog()) {
    const item=await registryItem(system.id,'dialog');const code=item.files![0].content;
    assert.ok(!code.includes('@iconify/react'),system.id);
    assert.ok(!item.dependencies?.includes('@iconify/react'),system.id);
    assert.match(code,/min-h-11 min-w-11/,system.id);
    if(code.includes('<svg'))assert.match(code,/d="M18 6L6 18M6 6l12 12"/,system.id);
  }
});

test('Tactile keeps one field style and provides its promoted material recipe',async()=>{
  const button=await registryItem('tactile-minimal','button'),card=await registryItem('tactile-minimal','card'),field=await registryItem('tactile-minimal','_shared');
  assert.match(button.files![0].content,/default: "h-11/);assert.match(button.files![0].content,/rounded-\[12px\].*shadow-/);
  assert.match(card.files![0].content,/rounded-\[20px\].*shadow-/);assert.match(field.files![0].content,/inset_0_2px_4px/);
  for(const name of ['input','textarea'])assert.match((await registryItem('tactile-minimal',name)).files![0].content,/formFieldBase/);
});
