import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const website=path.resolve(process.env.WEBSITE_SOURCE_DIR||'../eidova-website');
const origin=new URL(process.env.WEBSITE_REVIEW_URL||'http://127.0.0.1:5174');
assert.ok(['localhost','127.0.0.1','::1','[::1]'].includes(origin.hostname),'Capture the local candidate only.');
const source=await readFile(path.join(website,'src/previews/manifest.json'),'utf8');
const manifest=JSON.parse(source);
const families=JSON.parse(await readFile(path.join(website,'src/design-families.json'),'utf8'));
assert.equal(manifest.length,8);assert.equal(families.length,8);
const directory=path.join(website,'public/family-previews');
await mkdir(directory,{recursive:true});
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined),headless:true});
const captures=[];
try {
  for(const family of families) {
    const id=family.representative;assert.match(id,/^[a-z0-9-]+$/);
    const entry=manifest.find(item=>item.id===id);assert.ok(entry);
    for(const [file,hash] of Object.entries(entry.hashes))assert.equal(createHash('sha256').update(await readFile(path.join(website,'src/previews/kits',id,file))).digest('hex'),hash,id+'/'+file+': source differs');
    const context=await browser.newContext({viewport:{width:448,height:1000},deviceScaleFactor:2,reducedMotion:'reduce'});
    const page=await context.newPage();
    assert.equal((await page.goto(new URL('/?specimen='+id,origin).href,{waitUntil:'networkidle'})).status(),200);
    const card=page.locator('#workspace-details');await card.waitFor();await page.evaluate(()=>document.fonts.ready);
    assert.equal(await page.locator('#workspace-name').inputValue(),'Acme Studio');
    assert.ok((await card.boundingBox()).width>=350);
    const image=await card.screenshot({animations:'disabled'});
    const destination=path.join(directory,id+'.png');assert.equal(path.dirname(destination),directory);
    await writeFile(destination,image);
    captures.push({id,file:'/family-previews/'+id+'.png',bytes:image.byteLength,sha256:createHash('sha256').update(image).digest('hex')});
    await context.close();
  }
} finally {await browser.close();}
const report={sourceManifestSha256:createHash('sha256').update(source).digest('hex'),specimenSha256:createHash('sha256').update(await readFile(path.join(website,'src/previews/Specimen.tsx'))).digest('hex'),specimenCssSha256:createHash('sha256').update(await readFile(path.join(website,'src/previews/specimen.css'))).digest('hex'),viewport:{width:448,height:1000,deviceScaleFactor:2},scope:'Actual native workspace details cards; source and fonts settled before capture.',captures};
await writeFile(path.join(website,'src/family-preview-manifest.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({captured:captures.length,sourceManifestSha256:report.sourceManifestSha256}));
