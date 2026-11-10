import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { catalog, designFamilies, sourceItem } from '../src/catalog.js';

const themes=[];
for(const system of await catalog()) {
  const globals=await sourceItem(system.id,'globals');
  const css=(globals.files??[]).map(file=>file.content).join('\n');
  const components:Record<string,unknown>={};
  for(const name of ['button','input','card','dialog','table','sidebar']) {
    const item=await sourceItem(system.id,name);
    const source=(item.files??[]).map(file=>file.content).join('\n');
    components[name]={sourceHash:createHash('sha256').update(source).digest('hex'),shapes:[...new Set(source.match(/rounded-[\w[\].-]+/g)??[])],spacing:[...new Set(source.match(/\b(?:p[xy]?|gap|space-[xy])-\d+/g)??[])],shadows:[...new Set(source.match(/shadow[-\w[\].:/]+/g)??[])]};
  }
  themes.push({id:system.id,family:system.family.id,representative:!system.variant,font:system.font,radius:system.borderRadius,modes:Object.keys(globals.cssVars??{}),fontRules:[...css.matchAll(/(?:--font-[\w-]+|font-family)\s*:\s*([^;]+)/g)].map(match=>match[0]),components});
}
assert.equal(themes.length,31);assert.equal(designFamilies.length,8);
assert.equal(themes.filter(theme=>theme.representative).length,8);
const report={scope:'Static registry audit; source hashes are not a visual quality score.',families:designFamilies,themes};
await writeFile(process.argv[2]??'docs/THEME-AUDIT.json',JSON.stringify(report,null,2)+'\n');
console.log(`Audited ${themes.length} retained themes in ${designFamilies.length} families.`);
