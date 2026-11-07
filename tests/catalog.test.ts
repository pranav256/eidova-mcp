import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalog, registryItem, searchCatalog, systemWithComponents } from '../src/catalog.js';
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
