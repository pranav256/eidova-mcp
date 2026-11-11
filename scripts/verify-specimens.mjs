import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {measureTextContrast} from './browser-contrast.mjs';

const origin=process.env.WEBSITE_REVIEW_URL||'http://127.0.0.1:5173';
const website=path.resolve(process.env.WEBSITE_SOURCE_DIR||'../eidova-website');
const directory=path.resolve(process.argv[2]||'.work/verification/specimens');
const manifest=JSON.parse(await readFile(path.join(website,'src/previews/manifest.json'),'utf8'));
const families=JSON.parse(await readFile(path.join(website,'src/design-families.json'),'utf8'));
const save=(name,value)=>writeFile(path.join(directory,name+'.json'),JSON.stringify(value,null,2)+'\n');
await mkdir(directory,{recursive:true});
assert.equal(manifest.length,families.length);
for(const entry of manifest)for(const[file,hash]of Object.entries(entry.hashes))assert.equal(createHash('sha256').update(await readFile(path.join(website,'src/previews/kits',entry.id,file))).digest('hex'),hash,`${entry.id}/${file} differs from registry source`);

const client=new Client({name:'eidova-family-review',version:'0.2.0'});
await client.connect(new StreamableHTTPClientTransport(new URL(process.env.MCP_REVIEW_URL||'http://localhost:3000/mcp')));
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined),headless:true});
const states=[],metrics=[],panels=[],errors=[],network=[],spacing=[],contrasts=[];

function materialMetrics() {
  const style=selector=>{
    const node=document.querySelector(selector),css=getComputedStyle(node),rect=node.getBoundingClientRect();
    return {font:css.fontFamily,fontSize:css.fontSize,width:rect.width,height:rect.height,radius:css.borderRadius,padding:css.padding,border:css.borderWidth,shadow:css.boxShadow,backdrop:css.backdropFilter,backgroundImage:css.backgroundImage};
  };
  return {title:style('h1'),button:style('button[type="submit"]'),input:style('#workspace-name'),card:style('#workspace-details'),navigation:style('.specimen-nav'),content:style('.specimen-content'),windowOverflow:document.documentElement.scrollWidth>innerWidth};
}
const waitForLayout=(page,width)=>page.waitForFunction(width=>{const nav=document.querySelector('.specimen-nav').getBoundingClientRect(),content=document.querySelector('.specimen-content').getBoundingClientRect();return Math.abs(nav.width-(width<640?width:192))<1&&content.width>=(width<640?width:600);},width);
try {
  await save('rules',await client.callTool({name:'get-review-rules',arguments:{category:'all',detail:'full'}}));
  const capture=await client.callTool({name:'inspect-spacing',arguments:{detail:'full'}});
  assert.ok(capture.structuredContent?.captureScript);
  const script=capture.structuredContent.captureScript;
  const selfcheck=await browser.newPage();
  await selfcheck.setContent('<div style="background:black"><p style="color:white">Clear</p><p style="color:#222">Poor</p><span aria-hidden="true">Hidden</span><h1 style="font-size:24px;color:white">Large</h1></div>');
  const calibration=await selfcheck.evaluate(measureTextContrast);assert.equal(calibration.length,3);assert.equal(calibration[0].ratio,21);assert.ok(calibration[1].ratio<4.5);assert.equal(calibration[2].minimum,3);await selfcheck.close();
  for(const family of families) {
    const entry=manifest.find(item=>item.id===family.representative);
    const files=await Promise.all(Object.keys(entry.hashes).filter(file=>/\.(tsx|css)$/.test(file)).map(async file=>({path:'src/previews/kits/'+family.representative+'/'+file,content:await readFile(path.join(website,'src/previews/kits',family.representative,file),'utf8')})));
    for(const file of ['src/previews/specimen.css','src/main.tsx','src/previews/kits/'+family.representative+'/index.ts'])files.push({path:file,content:await readFile(path.join(website,file),'utf8')});
    const source=await client.callTool({name:'review-ui-code',arguments:{files}});await save('source-'+family.id,source);assert.match(JSON.stringify(source),/No findings|0 critical, 0 serious/);
    const context=await browser.newContext({viewport:{width:390,height:1000},reducedMotion:'reduce'});
    const page=await context.newPage();page.setDefaultTimeout(15000);
    page.on('pageerror',error=>errors.push({family:family.id,message:error.message}));
    page.on('request',request=>{if(/iconify\.design|fonts\.googleapis\.com|fonts\.gstatic\.com/.test(request.url()))network.push(request.url());});
    const record=async name=>{const state=await page.evaluate(script);state.name=family.id+' '+name;states.push(state);const readings=await page.evaluate(measureTextContrast);const failures=readings.filter(item=>item.ratio<item.minimum);contrasts.push({state:state.name,minimum:Math.min(...readings.map(item=>item.ratio)),readings,failures});await save('contrasts',contrasts);assert.deepEqual(failures,[],state.name+': text contrast');};
    assert.equal((await page.goto(origin+'/?specimen='+family.representative,{waitUntil:'networkidle'})).status(),200);
    await page.getByRole('heading',{name:'Workspace settings',exact:true}).waitFor();
    await page.evaluate(()=>document.fonts.ready);
    assert.equal(await page.getByRole('button',{name:'Workspace',exact:true}).count(),1);
    assert.equal(await page.getByRole('button',{name:'Members',exact:true}).count(),1);
    for(const width of [390,1440,1728]) {
      await page.setViewportSize({width,height:1000});await page.mouse.move(0,0);
      await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();});
      await waitForLayout(page,width);
      await page.screenshot({path:path.join(directory,`${family.id}-${width}.png`),fullPage:true,animations:'disabled'});
      const measured=await page.evaluate(materialMetrics);metrics.push({id:family.representative,family:family.id,width,...measured});
      await save('metrics',metrics);assert.equal(measured.windowOverflow,false,`${family.id} ${width}: page overflow`);
      assert.ok(measured.input.width>=200,`${family.id} ${width}: squeezed form field`);
      if(family.id==='industrial') {assert.match(measured.title.font,/Doto/);assert.equal(await page.evaluate(()=>document.fonts.check('500 28px Doto')),true);assert.match(measured.input.font,/Space Mono/);assert.equal(await page.evaluate(()=>document.fonts.check('400 14px "Space Mono"')),true);}
      if(family.id==='editorial')assert.match(measured.title.font,/Georgia|serif/);
      await record(width+'px base');
      await page.getByRole('button',{name:'Save changes',exact:true}).hover();await record(width+'px hover');
      await page.getByRole('button',{name:'Save changes',exact:true}).focus();await record(width+'px focus');
    }
    const name=page.getByRole('textbox',{name:'Workspace name',exact:true});
    await name.fill('');await page.getByRole('button',{name:'Save changes',exact:true}).click();
    assert.equal(await name.evaluate(node=>node.validity.valid),false);assert.equal(await page.getByText('Saved in this sample.',{exact:true}).count(),0);
    await name.fill('   ');assert.equal(await name.evaluate(node=>node.validity.valid),false);
    await name.fill('Acme Research');await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await page.getByText('Saved in this sample.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Members',exact:true}).click();
    assert.ok(await page.locator('#workspace-members').evaluate(node=>node.getBoundingClientRect().top>=0));
    const invite=page.getByRole('button',{name:'Invite a member',exact:true});
    await invite.focus();await page.keyboard.press('Enter');
    const dialog=page.getByRole('dialog',{name:'Invite a member',exact:true});await dialog.waitFor();
    await page.getByRole('textbox',{name:'Email address',exact:true}).fill('not-an-email');
    await page.getByRole('button',{name:'Add sample member',exact:true}).click();
    assert.equal(await dialog.count(),1);assert.equal(await page.locator('#invite-email').evaluate(node=>node.validity.valid),false);
    const copy=await dialog.evaluate(node=>({screen:'Invite member dialog',headline:node.querySelector('h2').textContent,body:[...node.querySelectorAll('p,label')].map(item=>item.textContent),actions:[...node.querySelectorAll('button')].map(item=>item.textContent.trim()).filter(Boolean)}));
    if(family===families[0])panels.push(copy);
    for(const width of [390,1440,1728]) {await page.setViewportSize({width,height:1000});await waitForLayout(page,width);await page.waitForFunction(()=>{const rect=document.querySelector('[role="dialog"]').getBoundingClientRect();return rect.x>=-1&&rect.x+rect.width<=innerWidth+1;});await record(width+'px invite dialog');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
    await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await invite.evaluate(node=>node===document.activeElement),true);
    await invite.click();await page.getByRole('textbox',{name:'Email address',exact:true}).fill('taylor@example.com');await page.getByRole('button',{name:'Add sample member',exact:true}).click();
    await dialog.waitFor({state:'hidden'});assert.equal(await page.getByRole('cell',{name:'taylor@example.com',exact:true}).count(),1);assert.equal(await invite.evaluate(node=>node===document.activeElement),true);
    if(family===families[0])for(const selector of ['.specimen-meta','.specimen-nav','.specimen-content','#workspace-details','#workspace-members'])panels.push(await page.locator(selector).evaluate((node,selector)=>({screen:selector,headline:node.querySelector('h1,h2,h3')?.textContent||'Sample workspace',body:[...node.querySelectorAll(selector==='.specimen-content'?':scope > p':'p,label,th,td')].map(item=>item.textContent),actions:selector==='.specimen-content'?[]:[...node.querySelectorAll('button,a')].map(item=>item.textContent.trim()).filter(Boolean)}),selector));
    await context.close();console.log(`Verified ${family.title}: native material, forms, dialog and three widths.`);
  }
  await save('states',states);await save('metrics',metrics);
  const signatures=metrics.filter(item=>item.width===1440).map(({title,button,input,card})=>JSON.stringify({font:title.font,button,input,card}));
  assert.equal(new Set(signatures).size,families.length,'Native material metrics must differ; this is not aesthetic approval.');
  for(let index=0;index<states.length;index+=6) {
    const result=await client.callTool({name:'inspect-spacing',arguments:{states:states.slice(index,index+6),spacingScale:[4,8,12,16,20,24,28,32,36,40,44,48,56,64,72,80,96,104,128],tolerance:2,detail:'full'}});
    await save('spacing-'+index,result);spacing.push(result.structuredContent?.summary);
  }
  const comprehension=[];
  for(const panel of panels)comprehension.push({panel,result:await client.callTool({name:'check-comprehension',arguments:{...panel,knownTerms:['Acme','workspace']}})});
  await save('comprehension',comprehension);
  const summary={origin,families:families.length,registryCopiesVerified:manifest.length,widths:[390,1440,1728],states:states.length,distinctMaterialSignatures:new Set(signatures).size,spacing,contrastStates:contrasts.length,minimumMeasuredContrast:Math.min(...contrasts.map(item=>item.minimum)),comprehensionFailures:comprehension.filter(item=>item.result.structuredContent?.verdict!=='pass').length,pageErrors:errors,externalFontOrIconRequests:network,reviewScope:'Internal source/DOM/behavior review of settings specimens; no user study or dashboard receipt.'};
  await save('summary',summary);console.log(JSON.stringify(summary,null,2));
  assert.deepEqual(errors,[]);assert.deepEqual(network,[]);assert.equal(summary.comprehensionFailures,0);assert.ok(spacing.every(item=>item&&item.critical===0&&item.serious===0));
} finally {await browser.close();await client.close();}
