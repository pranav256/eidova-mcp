import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { measureTextContrast } from './browser-contrast.mjs';

const origin = process.env.WEBSITE_REVIEW_URL || 'https://open-design-website.vercel.app';
const dir = path.resolve(process.argv[2] || '.work/verification/website');
const website = path.resolve(process.env.WEBSITE_SOURCE_DIR || 'website');
const endpoint = process.env.WEBSITE_EXPECTED_MCP_URL || 'https://open-design-mcp-liard.vercel.app/mcp';
const coreEndpoint=endpoint.replace(/\/core\/?$/,'').replace(/\/$/,'')+'/core';
// Review the matching local service when supplied; keep hosted link assertions intact.
const reviewServiceUrl = url => process.env.MCP_REVIEW_URL ? new URL(new URL(url).pathname, process.env.MCP_REVIEW_URL).href : url;
const families=JSON.parse(await readFile(path.join(website,'src/design-families.json'),'utf8'));
const gallery=JSON.parse(await readFile(path.join(website,'src/family-preview-manifest.json'),'utf8'));
assert.equal(gallery.sourceManifestSha256,createHash('sha256').update(await readFile(path.join(website,'src/previews/manifest.json'))).digest('hex'));
assert.equal(gallery.specimenSha256,createHash('sha256').update(await readFile(path.join(website,'src/previews/Specimen.tsx'))).digest('hex'));
assert.equal(gallery.specimenCssSha256,createHash('sha256').update(await readFile(path.join(website,'src/previews/specimen.css'))).digest('hex'));
assert.equal(gallery.captures.length,families.length);
for(const image of gallery.captures){const bytes=await readFile(path.join(website,'public',image.file));assert.equal(bytes.length,image.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),image.sha256,image.id+': gallery capture differs');}
const websiteVersion=JSON.parse(await readFile(path.join(website,'package.json'),'utf8')).version;
const clients=['Codex','Claude Code','Claude Desktop','Cursor','VS Code','Server URL'];
await mkdir(dir, { recursive: true });
const save = (name, value) => writeFile(path.join(dir,name+'.json'),JSON.stringify(value,null,2));
const client = new Client({ name: 'eidova-website-review', version: '1' });
await client.connect(process.env.MCP_PRIVATE_ARCHIVE
  ? new StdioClientTransport({command:process.execPath,args:[path.resolve('scripts/start-private.mjs'),path.resolve(process.env.MCP_PRIVATE_ARCHIVE)]})
  : new StreamableHTTPClientTransport(new URL(process.env.MCP_REVIEW_URL || endpoint)));
const browser = await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL || (process.platform==='win32'?'msedge':undefined),headless:true});
const states = [], expandedStates = [], handoffStates = [], panels = [], contrasts = [], errors = [];
const knownTerms = ['MCP','UI','HTTP','JSON','MIT','React','Geist','mcpServers','registry','token','tokens','API','CSS','IBM','SF','FX','Sans','Mono','DM','workspace','session','VS'];
const count = async page => { await page.waitForFunction(expected => document.querySelectorAll('.theme-card').length===expected,families.length); };
async function inspectStates(name,captured) {
  const parts=[];const summary={critical:0,serious:0,moderate:0,total:0};
  for(let index=0;index<captured.length;index+=2) {
    const args={states:captured.slice(index,index+2),spacingScale:[4,8,12,16,20,24,32,40,48,56,64,72,80,88,96,104,128],tolerance:2,detail:'full'};
    assert.ok(Buffer.byteLength(JSON.stringify(args))<4*1024*1024-1024,'Spacing evidence must fit the HTTP limit.');
    const result=await client.callTool({name:'inspect-spacing',arguments:args});assert.ok(!result.isError);assert.equal(result.structuredContent?.status,'completed');parts.push(result);
    for(const key of Object.keys(summary))summary[key]+=result.structuredContent.summary[key];
  }
  const findings=parts.flatMap(part=>part.structuredContent.findings);
  const exceptions=findings.filter(finding=>finding.ruleId==='spacing/asymmetric-horizontal-inset'&&finding.elementIds.length===1&&finding.elementIds[0]==='#theme-search');
  const blockers=findings.filter(finding=>['critical','serious'].includes(finding.severity)&&!exceptions.includes(finding));
  const result={summary,parts,blockers,exceptions:exceptions.length?{count:exceptions.length,reason:'Theme search reserves 40px for its leading icon and 64px for the wider trailing Clear button.'}:null};await save(name,result);return result;
}
async function verifyBehavior(page) {
  assert.equal(await page.locator('.connection-section #connect').count(),1);
  assert.equal(await page.locator('.hero iframe, .theme-session, .apply-theme').count(),0);
  assert.equal(await page.locator('.theme-card-preview img').count(),families.length);
  for(const image of await page.locator('.theme-card-preview img').all()){await image.scrollIntoViewIfNeeded();await image.evaluate(node=>node.decode());assert.ok(await image.evaluate(node=>node.naturalWidth>=700));}
  const footer=page.getByRole('navigation',{name:'Footer navigation'});
  assert.match(await footer.getByRole('link',{name:'Docs',exact:true}).getAttribute('href'),/docs\/CLIENTS\.md$/);
  const health=await page.request.get(reviewServiceUrl(await footer.getByRole('link',{name:'Status',exact:true}).getAttribute('href')));
  assert.equal(health.status(),200);assert.equal((await health.json()).version,websiteVersion);
  assert.match(await page.locator('.site-footer > p').textContent(),new RegExp('v'+websiteVersion.replaceAll('.','\\.')));
  const preview=page.getByRole('button',{name:'View components: Precision',exact:true});
  await preview.focus();await page.keyboard.press('Enter');
  await page.getByRole('heading',{name:'Precision components',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.activeElement.id),'component-preview-title');
  const specimen=page.frameLocator('.specimen-frame');await specimen.getByRole('textbox',{name:'Workspace name',exact:true}).waitFor();
  const dialog=page.getByRole('dialog',{name:'Precision components',exact:true});assert.equal(await dialog.evaluate(node=>node.open),true);
  panels.push(await dialog.evaluate(node=>({screen:'Separate component viewer',headline:node.querySelector('h2').textContent,body:[...node.querySelectorAll('.section-heading p')].map(item=>item.textContent),actions:[...node.querySelectorAll('.section-heading a,.section-heading button')].map(item=>item.textContent.trim())})));
  const handoff=page.locator('.theme-handoff');
  await handoff.getByRole('button',{name:'Copy agent prompt',exact:true}).click();
  await handoff.getByRole('status').filter({hasText:'Copied to clipboard.'}).waitFor();
  assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/design:\/\/systems\/linear\/design\.md/);
  await handoff.locator('summary').click();
  assert.match(await handoff.getByRole('textbox',{name:'Agent prompt'}).inputValue(),/designSystemId "linear"/);
  const download=await page.request.get(new URL(await handoff.getByRole('link',{name:'Download DESIGN.md'}).getAttribute('href'),page.url()).href);
  assert.equal(download.status(),200);assert.match(download.headers()['content-disposition'],/DESIGN\.md/);
  assert.match(await download.text(),/Exact catalog ID: \x60linear\x60/);
  panels.push(await handoff.evaluate(node=>({screen:'Theme handoff',headline:node.querySelector('h3').textContent,body:[...node.querySelectorAll('dt,dd')].map(item=>item.textContent),actions:['Copy agent prompt','Project instructions']})));
  await specimen.getByRole('textbox',{name:'Workspace name',exact:true}).fill('Temporary sample');
  await page.getByRole('button',{name:'Close preview',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(await preview.evaluate(node=>node===document.activeElement),true);
  await preview.click();await specimen.getByRole('textbox',{name:'Workspace name',exact:true}).waitFor();
  assert.equal(await specimen.getByRole('textbox',{name:'Workspace name',exact:true}).inputValue(),'Acme Studio');
  assert.equal(await page.getByRole('link',{name:'Open full preview',exact:true}).getAttribute('href'),'/?specimen=linear');
  await specimen.getByRole('button',{name:'Invite a member',exact:true}).click();
  const invitation=specimen.getByRole('dialog',{name:'Invite a member',exact:true});await invitation.waitFor();
  await page.keyboard.press('Escape');await invitation.waitFor({state:'hidden'});assert.equal(await dialog.isVisible(),true);
  await specimen.getByRole('textbox',{name:'Workspace name',exact:true}).focus();await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await preview.evaluate(node=>node===document.activeElement),true);
  assert.equal(new URL(page.url()).searchParams.has('preview'),false);
  const search=page.getByRole('searchbox',{name:'Search themes'});
  await search.fill('linear');
  await page.waitForFunction(()=>document.querySelectorAll('.theme-card').length===2);
  assert.equal(new URL(page.url()).searchParams.get('q'),'linear');
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await search.inputValue(),'linear');
  await page.getByRole('button',{name:'Clear search',exact:true}).click();await count(page);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'theme-search');
  await search.fill('minimal light');
  assert.equal(await page.locator('.theme-card').count(),1);
  assert.equal(await page.locator('.theme-card h3').textContent(),'Neutral');
  await search.fill('no-match-9348');
  await page.getByRole('button',{name:'Clear search and filters'}).click();await count(page);
  for(const scheme of ['Dark','Light']){
    await page.getByRole('button',{name:scheme+' base',exact:true}).click();
    assert.equal(new URL(page.url()).searchParams.get('appearance'),scheme.toLowerCase());
    const labels=await page.locator('.theme-card .scheme-label').allTextContents();
    assert.ok(labels.length>0&&labels.every(label=>label===scheme+' base'));
    await page.reload({waitUntil:'networkidle'});
    assert.equal(await page.getByRole('button',{name:scheme+' base',exact:true}).getAttribute('aria-pressed'),'true');
  }
  await page.getByRole('button',{name:'All themes',exact:true}).click();await count(page);
  await page.getByRole('button',{name:'Show all 31 themes'}).click();
  assert.equal(await page.locator('.theme-card').count(),31);
  await page.getByRole('button',{name:'Show fewer themes'}).click();await count(page);
  await page.getByRole('tab',{name:'Codex',exact:true}).focus();
  await page.keyboard.press('ArrowRight');assert.equal(await page.getByRole('tab',{name:'Claude Code',exact:true}).getAttribute('aria-selected'),'true');
  await page.keyboard.press('End');assert.equal(await page.getByRole('tab',{name:'Server URL',exact:true}).getAttribute('aria-selected'),'true');
  await page.keyboard.press('Home');assert.equal(await page.getByRole('tab',{name:'Codex',exact:true}).getAttribute('aria-selected'),'true');
  for(const [name,label] of [['Codex','Copy Codex command'],['Claude Code','Copy Claude Code command'],['Claude Desktop','Copy server URL'],['Cursor','Copy configuration'],['VS Code','Copy configuration'],['Server URL','Copy server URL']]){
    await page.getByRole('tab',{name,exact:true}).click();
    await page.getByRole('button',{name:label}).click();
    await page.locator('.copy-feedback').filter({hasText:'Copied to clipboard.'}).waitFor();
    const text=await page.evaluate(()=>navigator.clipboard.readText());
    if(name==='Codex')assert.equal(text,'codex mcp add eidova --url '+coreEndpoint);
    else if(name==='Claude Code')assert.equal(text,'claude mcp add --transport http eidova '+coreEndpoint);
    else if(name==='Cursor')assert.equal(JSON.parse(text).mcpServers['eidova'].url,coreEndpoint);
    else if(name==='VS Code')assert.deepEqual(JSON.parse(text).servers['eidova'],{type:'http',url:coreEndpoint});
    else assert.equal(text,coreEndpoint);
  }
  await page.locator('.tool-options > summary').click();
  panels.push({screen:'Tool options',headline:'Tool options',body:await page.locator('.profile-note').allTextContents(),actions:await page.locator('.profile-picker button').allTextContents()});
  await page.getByRole('button',{name:'All tools',exact:true}).click();
  assert.equal(await page.locator('#mcp-endpoint').inputValue(),endpoint.replace(/\/core\/?$/,'').replace(/\/$/,''));
  await page.getByRole('button',{name:'Essentials · 13 tools',exact:true}).click();
  assert.equal(await page.locator('#mcp-endpoint').inputValue(),coreEndpoint);
  await page.getByRole('button',{name:'Copy server URL',exact:true}).click();
  await page.evaluate(()=>{window.__copy=Object.getOwnPropertyDescriptor(navigator.clipboard,'writeText');Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:()=>Promise.reject(new Error('denied'))});});
  await page.getByRole('button',{name:'Copied',exact:true}).click();
  await page.locator('.copy-feedback').filter({hasText:'Select the text and copy it manually.'}).waitFor();
  await page.evaluate(()=>{if(window.__copy)Object.defineProperty(navigator.clipboard,'writeText',window.__copy);else delete navigator.clipboard.writeText;});
  const tokensUrl=await page.locator('.theme-token-link').first().getAttribute('href');
  const tokenResponse=await page.request.get(reviewServiceUrl(tokensUrl));assert.equal(tokenResponse.status(),200);
  assert.ok((await tokenResponse.json()).cssVars);
  await page.route('**/api/catalog',route=>route.fulfill({status:503,body:'{}'}));
  await page.reload();await page.getByRole('alert').waitFor();
  await page.unroute('**/api/catalog');await page.getByRole('button',{name:'Retry loading themes'}).click();await count(page);
  await page.route('**/api/catalog',route=>route.fulfill({status:200,contentType:'application/json',body:'{}'}));
  await page.reload();await page.getByRole('alert').waitFor();await page.unroute('**/api/catalog');
  await page.getByRole('button',{name:'Retry loading themes'}).click();await count(page);
  await page.route('**/api/catalog',()=>{});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.getByRole('alert').filter({hasText:'took too long'}).waitFor({timeout:20000});
  await page.unroute('**/api/catalog');await page.getByRole('button',{name:'Retry loading themes'}).click();await count(page);
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior),'auto');
  await page.goto(origin,{waitUntil:'networkidle'});await count(page);
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('skip-link')),true);
  await page.keyboard.press('Enter');assert.equal(new URL(page.url()).hash,'#main');
}
try {
  const rules = await client.callTool({name:'get-review-rules',arguments:{category:'all',context:'Review Eidova website redesign using its own MCP'}});
  await save('rules',rules);
  const paths = ['App.tsx','main.tsx','theme.ts','theme.css','editorial.css','styles.css','catalog-themes.json','components/CopyButton.tsx','components/ui/button.tsx','components/ui/input.tsx','components/ui/textarea.tsx','previews/Specimen.tsx','previews/specimen.css'];
  const files = await Promise.all(paths.map(async p => ({path:p,content:await readFile(path.join(website,'src',p),'utf8')})));
  const source = await client.callTool({name:'review-ui-code',arguments:{files}}); await save('source',source);
  assert.ok(!source.isError);
  const sourceText=source.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
  assert.ok(/No findings|0 critical, 0 serious/.test(sourceText),sourceText);
  console.log('Source review passed.');
  const capture = await client.callTool({name:'inspect-spacing',arguments:{detail:'full'}});
  const script = capture.structuredContent?.captureScript; assert.ok(script);
  for (const width of [390,1440,1728]) {
    const context = await browser.newContext({viewport:{width,height:1000},colorScheme:'dark',permissions:['clipboard-read','clipboard-write']});
    const page = await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
    assert.equal((await page.goto(origin,{waitUntil:'networkidle'})).status(),200);
    await count(page); await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.evaluate(()=>document.fonts.check('400 16px Inter')));
    assert.match(await page.locator('h1').evaluate(e=>getComputedStyle(e).fontFamily),/Georgia/);
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    for (const mode of ['dark','light']) {
      if(mode==='light') { await page.getByRole('button',{name:'Switch to light mode'}).click(); await page.reload({waitUntil:'networkidle'}); await count(page); }
      assert.equal(await page.locator('html').getAttribute('data-theme'),mode);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      for(const image of await page.locator('.theme-card-preview img').all()){await image.scrollIntoViewIfNeeded();await image.evaluate(node=>node.decode());}
      await page.evaluate(()=>window.scrollTo(0,0));
      await page.mouse.move(0,0); await page.waitForTimeout(250);
      await page.screenshot({path:path.join(dir,`${width}-${mode}.png`),fullPage:true});
      await page.screenshot({path:path.join(dir,`${width}-${mode}-first.png`)});
      const state = await page.evaluate(script); state.name = `${width}px ${mode}`; states.push(state);
      if(mode==='dark'&&process.env.WEBSITE_BASELINE_DIR){const baseline=JSON.parse(await readFile(path.join(process.env.WEBSITE_BASELINE_DIR,width+'-copy.json'),'utf8'));const normalize=text=>text.replaceAll('var(--font-inter)','Inter').replaceAll('Alternate appearances are adapted for this site.','Component previews open in a separate viewer.').replace(/[↗↓↑→↳✓✳·⌕]/g,'').replace(/\s+/g,' ').trim();const removed=new Set(['Current theme: Eidova','Reset theme','Connect your agent','Try the themes','Apply palette','Real components. Sample workspace.','Open this preview']);const copy=normalize(await page.locator('body').innerText()+'\n'+(await page.locator('details').allTextContents()).join('\n'));for(const fragment of baseline.split('\n').map(normalize).filter(fragment=>fragment&&!removed.has(fragment)))assert.ok(copy.includes(fragment),'Missing baseline copy: '+fragment);}
      contrasts.push(await page.evaluate(() => {
        const canvas = document.createElement('canvas');canvas.width=canvas.height=1;
        const ctx = canvas.getContext('2d',{willReadFrequently:true});
        const lum = color => {ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1); const rgb=Array.from(ctx.getImageData(0,0,1,1).data).slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
        const ratio = (a,b) => (Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
        const root = getComputedStyle(document.documentElement);
        return {width:innerWidth,mode:document.documentElement.dataset.theme,pairs:Object.fromEntries([['foreground','background'],['muted-foreground','card'],['primary-foreground','primary']].map(([a,b])=>[a,ratio(root.getPropertyValue('--'+a),root.getPropertyValue('--'+b))]))};
      }));
      await page.getByRole('button',{name:'View components: Precision',exact:true}).click();
      await page.frameLocator('.specimen-frame').getByRole('textbox',{name:'Workspace name',exact:true}).waitFor();
      await page.evaluate(()=>document.fonts.ready);
      for(const expanded of [false,true]) {
        if(expanded) await page.locator('.handoff-prompt summary').click();
        await page.locator('.theme-handoff').scrollIntoViewIfNeeded();
        await page.mouse.move(0,0);await page.waitForTimeout(250);
        const handoff=await page.evaluate(script);handoff.name=width+'px '+mode+' handoff '+(expanded?'prompt':'summary');handoffStates.push(handoff);
        await page.screenshot({path:path.join(dir,width+'-'+mode+'-handoff-'+(expanded?'prompt':'summary')+'.png')});
        const contrast=await page.evaluate(measureTextContrast);
        assert.deepEqual(contrast.filter(item=>item.ratio<item.minimum),[]);
      }
      await page.getByRole('button',{name:'Close preview',exact:true}).click();
      await page.getByRole('button',{name:'Show all 31 themes'}).click();
      assert.equal(await page.locator('.theme-card').count(),31);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      const expanded=await page.evaluate(script);expanded.name=`${width}px ${mode} all themes`;expandedStates.push(expanded);
      await page.getByRole('button',{name:'Show fewer themes'}).click();
    }
    if(width===390) {
      const read = async (selector,heading) => page.locator(selector).evaluate((e,h)=>{
        const text = n => n.textContent.replace(/[↗↓↑→↳✓✳·]/g,'').replace(/\s+/g,' ').trim();
        // Navigation labels are readable context; actions are choices within a task.
        return {headline:text(e.querySelector(h)),body:[...e.querySelectorAll('p,label,code,strong,.scheme-label,nav a')].map(text).filter(Boolean),actions:[...e.querySelectorAll('a,button')].filter(x=>!x.closest('nav')&&!x.classList.contains('wordmark')&&!x.hasAttribute('aria-pressed')&&!x.hasAttribute('role')).map(text).filter(Boolean)};
      },heading);
      for(const [sel,h] of [['.hero-copy','h1'],['.connection-copy','h2'],['.themes > .section-heading','h2'],['.workflow .section-heading','h2'],['.connect-copy','h2'],['.ownership','h2'],['.site-footer','.wordmark']]) panels.push({screen:sel,...await read(sel,h)});
      panels.push({screen:'Installation guide',headline:await page.locator('.installation-heading h2').textContent(),body:await page.locator('.installation-heading p').allTextContents(),actions:[]});
      panels.push({screen:'Getting started steps',headline:await page.locator('.setup-steps strong').first().textContent(),body:await page.locator('.setup-steps p,strong').allTextContents(),actions:[]});
      panels.push({screen:'First-task examples',headline:await page.locator('.first-tasks summary').textContent(),body:await page.locator('.first-tasks li').allTextContents(),actions:[]});
      await page.getByRole('button',{name:'Show all 31 themes'}).click();
      for (const sel of ['.workflow-item','.theme-card-info']) for(let i=0;i<await page.locator(sel).count();i++){
        const e=page.locator(sel).nth(i); panels.push({screen:sel+' '+i,...await e.evaluate(e=>({headline:e.querySelector('h3').textContent,body:[...e.querySelectorAll('p,code,.scheme-label')].map(n=>n.textContent),actions:[...e.querySelectorAll('a,button')].map(n=>n.textContent.replace(/[↗]/g,'').trim())}))});
      }
      await page.getByRole('button',{name:'Show fewer themes'}).click();
      for(let i=0;i<clients.length;i++){
        await page.getByRole('tab',{name:clients[i],exact:true}).click();
        panels.push({screen:clients[i]+' setup',headline:clients[i],body:await page.locator('.client-panel p').allTextContents(),actions:await page.locator('.copy-action button').allTextContents()});
        const input = i===2||i===5 ? {value:await page.locator('#mcp-endpoint').inputValue()} : {code:await page.locator('.client-panel pre').textContent()};
        await save('setup-'+i,input);
        const state=await page.evaluate(script);state.name='390px '+clients[i];await save('setup-state-'+i,state);
      }
      await verifyBehavior(page);
      for(const family of families) {
        await page.goto(origin+'/?preview='+family.representative,{waitUntil:'networkidle'});
        await page.getByRole('heading',{name:'Use '+family.representative.split('-').map(word=>word[0].toUpperCase()+word.slice(1)).join(' '),exact:true}).waitFor();
        panels.push(await page.locator('.theme-handoff').evaluate(node=>({screen:node.querySelector('h3').textContent,headline:node.querySelector('h3').textContent,body:[...node.querySelectorAll('dt,dd')].map(item=>item.textContent),actions:['Copy agent prompt','Project instructions']})));
      }
      await page.goto(origin+'/?preview=metal-fx-silver',{waitUntil:'networkidle'});
      await page.getByRole('heading',{name:'Use Metal Fx Silver',exact:true}).waitFor();
      await page.locator('.handoff-prompt summary').click();
      assert.match(await page.getByRole('textbox',{name:'Agent prompt'}).inputValue(),/designSystemId "metal-fx-silver"/);
      const [download] = await Promise.all([page.waitForEvent('download'),page.getByRole('link',{name:'Download DESIGN.md'}).click()]);
      assert.equal(download.suggestedFilename(),'DESIGN.md');
      const downloadPath=await download.path();assert.ok(downloadPath);
      assert.match(await readFile(downloadPath,'utf8'),/Exact catalog ID: \x60metal-fx-silver\x60/);
      panels.push({screen:'Project instructions',headline:'Project instructions',body:await page.locator('.handoff-download p').allTextContents(),actions:['Download DESIGN.md']});

    }
    await context.close();
  }
  await save('states',states);await save('contrasts',contrasts);await save('panels',panels);
  await save('expanded-states',expandedStates);
  await save('handoff-states',handoffStates);
  const handoffSpacing=await inspectStates('handoff-spacing',handoffStates);console.log('HANDOFF',JSON.stringify(handoffSpacing.summary));
  const expandedSpacing=await inspectStates('expanded-spacing',expandedStates);console.log('EXPANDED',JSON.stringify(expandedSpacing.summary));
  const spacing=await inspectStates('spacing',states);console.log('SPACING',JSON.stringify(spacing.summary));
  const setupStates=await Promise.all(clients.map((_,i)=>readFile(path.join(dir,'setup-state-'+i+'.json'),'utf8').then(JSON.parse)));
  const setupSpacing=await inspectStates('setup-spacing',setupStates);console.log('SETUP SPACING',JSON.stringify(setupSpacing.summary));
  const reviews=[];
  for(const panel of panels){const result=await client.callTool({name:'check-comprehension',arguments:{...panel,knownTerms}});reviews.push({panel,result});}
  await save('comprehension',reviews);
  const failures=reviews.filter(r=>r.result.structuredContent?.verdict!=='pass');
  console.log('COPY',JSON.stringify(failures.map(r=>({screen:r.panel.screen,result:r.result.structuredContent}))));
  assert.deepEqual(errors,[]);
  const summary={origin,widths:[390,1440,1728],schemes:['dark','light'],sourcePassed:true,handoffSpacing:handoffSpacing.summary,spacing:spacing.summary,expandedSpacing:expandedSpacing.summary,setupSpacing:setupSpacing.summary,comprehensionPanels:panels.length,comprehensionFailures:failures.length,contrasts,galleryCaptures:gallery.captures.length,galleryImageBytes:gallery.captures.reduce((sum,item)=>sum+item.bytes,0),baselineCopyCompared:Boolean(process.env.WEBSITE_BASELINE_DIR),pageErrors:errors,behavior:['exact-theme agent prompt and DESIGN.md browser download','all eight family handoff panels','installation with six client formats','separate modal preview, keyboard Escape, focus return and sample reset','source-bound gallery images','search and URL persistence','multiword search','no-match recovery','appearance filters and persistence','expand/collapse 31 themes','keyboard tabs','core/full options','clipboard success and denial','registry link','catalog failure, invalid response, retry and timeout','reduced motion','keyboard skip link']};await save('summary',summary);
  for(const review of [spacing,expandedSpacing,setupSpacing,handoffSpacing])assert.deepEqual(review.blockers,[]);
  assert.equal(failures.length,0);
  assert.ok(contrasts.every(c=>Object.values(c.pairs).every(r=>r>=4.5)));
} finally {await browser.close();await client.close();}
