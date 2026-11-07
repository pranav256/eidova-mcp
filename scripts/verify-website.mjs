import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const origin = process.env.WEBSITE_REVIEW_URL || 'https://open-design-website.vercel.app';
const dir = path.resolve(process.argv[2] || '.work/verification/website');
const website = path.resolve(process.env.WEBSITE_SOURCE_DIR || 'website');
const endpoint = process.env.WEBSITE_EXPECTED_MCP_URL || 'https://open-design-mcp-liard.vercel.app/mcp';
await mkdir(dir, { recursive: true });
const save = (name, value) => writeFile(path.join(dir,name+'.json'),JSON.stringify(value,null,2));
const client = new Client({ name: 'open-design-website-review', version: '1' });
await client.connect(process.env.MCP_PRIVATE_ARCHIVE
  ? new StdioClientTransport({command:process.execPath,args:[path.resolve('scripts/start-private.mjs'),path.resolve(process.env.MCP_PRIVATE_ARCHIVE)]})
  : new StreamableHTTPClientTransport(new URL(process.env.MCP_REVIEW_URL || endpoint)));
const browser = await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL || (process.platform==='win32'?'msedge':undefined),headless:true});
const states = [], expandedStates = [], panels = [], contrasts = [], specimenContrasts = [], errors = [];
const knownTerms = ['MCP','UI','HTTP','JSON','MIT','React','Geist','mcpServers','registry','token','tokens','API','CSS','IBM','SF','FX','Sans','Mono','DM','workspace','session'];
const count = async page => { await page.waitForFunction(() => document.querySelectorAll('.theme-card').length===6); };
async function renderedContrast(page,selector) {
  return page.locator(selector).evaluateAll(elements=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d',{willReadFrequently:true});
    const lum=rgb=>{const c=rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
    const pixel=()=>[...ctx.getImageData(0,0,1,1).data].slice(0,3);
    return elements.map(element=>{
      const ancestors=[];for(let e=element;e;e=e.parentElement)ancestors.unshift(e);
      ctx.clearRect(0,0,1,1);
      for(const ancestor of ancestors){ctx.fillStyle=getComputedStyle(ancestor).backgroundColor;ctx.fillRect(0,0,1,1);}
      const background=lum(pixel());ctx.fillStyle=getComputedStyle(element).color;ctx.fillRect(0,0,1,1);const foreground=lum(pixel());
      return {label:element.textContent.trim(),ratio:(Math.max(background,foreground)+.05)/(Math.min(background,foreground)+.05)};
    });
  });
}
async function verifyBehavior(page) {
  const previewColors=[];
  for(const [id,name] of [['minimal-light','Minimal Light'],['linear','Linear'],['stripe','Stripe']]){
    await page.getByRole('button',{name,exact:true}).click();
    assert.equal(await page.locator('.specimen').getAttribute('data-preview-theme'),id);
    previewColors.push(await page.locator('.specimen').evaluate(e=>getComputedStyle(e).backgroundColor));
    await page.mouse.move(0,0);await page.waitForTimeout(250);
    specimenContrasts.push({theme:id,kind:'live preview',pairs:await renderedContrast(page,'.specimen h2, .specimen button')});
    await page.getByLabel('Project name').fill(name+' project');
    await page.locator('.specimen').getByRole('button',{name:'Save changes'}).click();
    assert.equal(await page.locator('.specimen-status').textContent(),'Saved in this preview.');
    await page.getByLabel('Project name').fill('Changed project');
    assert.equal(await page.locator('.specimen-status').textContent(),'Try the components.');
  }
  assert.equal(new Set(previewColors).size,3);
  await page.getByRole('button',{name:'Minimal Light',exact:true}).click();
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
  assert.equal(await page.locator('.theme-card h3').textContent(),'Minimal Light');
  await search.fill('no-match-9348');
  await page.getByRole('button',{name:'Clear search and filters'}).click();await count(page);
  for(const scheme of ['Dark','Light']){
    await page.getByRole('button',{name:scheme,exact:true}).click();
    assert.equal(new URL(page.url()).searchParams.get('appearance'),scheme.toLowerCase());
    const labels=await page.locator('.theme-card .scheme-label').allTextContents();
    assert.ok(labels.length>0&&labels.every(label=>label===scheme));
    await page.reload({waitUntil:'networkidle'});
    assert.equal(await page.getByRole('button',{name:scheme,exact:true}).getAttribute('aria-pressed'),'true');
  }
  await page.getByRole('button',{name:'All themes',exact:true}).click();await count(page);
  await page.getByRole('button',{name:'Show all 31 themes'}).click();
  assert.equal(await page.locator('.theme-card').count(),31);
  await page.getByRole('button',{name:'Show fewer themes'}).click();await count(page);
  await page.getByRole('tab',{name:'Codex',exact:true}).focus();
  await page.keyboard.press('ArrowRight');assert.equal(await page.getByRole('tab',{name:'JSON',exact:true}).getAttribute('aria-selected'),'true');
  await page.keyboard.press('End');assert.equal(await page.getByRole('tab',{name:'Server URL',exact:true}).getAttribute('aria-selected'),'true');
  await page.keyboard.press('Home');assert.equal(await page.getByRole('tab',{name:'Codex',exact:true}).getAttribute('aria-selected'),'true');
  for(const [name,label] of [['Codex','Copy Codex command'],['JSON','Copy configuration'],['Server URL','Copy server URL']]){
    await page.getByRole('tab',{name,exact:true}).click();
    await page.getByRole('button',{name:label}).click();
    await page.locator('.copy-feedback').filter({hasText:'Copied to clipboard.'}).waitFor();
    const text=await page.evaluate(()=>navigator.clipboard.readText());
    if(name==='Codex')assert.equal(text,'codex mcp add open-design --url '+endpoint);
    else if(name==='JSON')assert.equal(JSON.parse(text).mcpServers['open-design'].url,endpoint);
    else assert.equal(text,endpoint);
  }
  await page.evaluate(()=>{window.__copy=Object.getOwnPropertyDescriptor(navigator.clipboard,'writeText');Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:()=>Promise.reject(new Error('denied'))});});
  await page.getByRole('button',{name:'Copied',exact:true}).click();
  await page.locator('.copy-feedback').filter({hasText:'Select the text and copy it manually.'}).waitFor();
  await page.evaluate(()=>{if(window.__copy)Object.defineProperty(navigator.clipboard,'writeText',window.__copy);else delete navigator.clipboard.writeText;});
  const tokensUrl=await page.locator('.theme-token-link').first().getAttribute('href');
  const tokenResponse=await page.request.get(tokensUrl);assert.equal(tokenResponse.status(),200);
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
  const rules = await client.callTool({name:'get-review-rules',arguments:{category:'all',context:'Review Open Design website redesign using its own MCP'}});
  await save('rules',rules);
  const paths = ['App.tsx','main.tsx','styles.css','catalog-previews.json','components/ui/button.tsx','components/ui/input.tsx','components/ui/textarea.tsx'];
  const files = await Promise.all(paths.map(async p => ({path:p,content:await readFile(path.join(website,'src',p),'utf8')})));
  const source = await client.callTool({name:'review-ui-code',arguments:{files}}); await save('source',source);
  assert.ok(!source.isError);
  const sourceText=source.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
  assert.ok(/No findings|0 critical, 0 serious/.test(sourceText),sourceText);
  console.log('Source review passed.');
  const capture = await client.callTool({name:'inspect-spacing',arguments:{detail:'full'}});
  const script = capture.structuredContent?.captureScript; assert.ok(script);
  for (const width of [390,1440,1728]) {
    const context = await browser.newContext({viewport:{width,height:1000},permissions:['clipboard-read','clipboard-write']});
    const page = await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
    assert.equal((await page.goto(origin,{waitUntil:'networkidle'})).status(),200);
    await count(page); await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.evaluate(()=>document.fonts.check('600 16px Geist')));
    assert.match(await page.locator('h1').evaluate(e=>getComputedStyle(e).fontFamily),/Geist/);
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    for (const mode of ['dark','light']) {
      if(mode==='light') { await page.getByRole('button',{name:'Switch to light mode'}).click(); await page.reload({waitUntil:'networkidle'}); await count(page); }
      assert.equal(await page.locator('html').getAttribute('data-theme'),mode);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.mouse.move(0,0); await page.waitForTimeout(250);
      await page.screenshot({path:path.join(dir,`${width}-${mode}.png`),fullPage:true});
      await page.screenshot({path:path.join(dir,`${width}-${mode}-first.png`)});
      const state = await page.evaluate(script); state.name = `${width}px ${mode}`; states.push(state);
      contrasts.push(await page.evaluate(() => {
        const canvas = document.createElement('canvas');canvas.width=canvas.height=1;
        const ctx = canvas.getContext('2d',{willReadFrequently:true});
        const lum = color => {ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1); const rgb=Array.from(ctx.getImageData(0,0,1,1).data).slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
        const ratio = (a,b) => (Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
        const root = getComputedStyle(document.documentElement);
        return {width:innerWidth,mode:document.documentElement.dataset.theme,pairs:Object.fromEntries([['foreground','background'],['muted-foreground','card'],['primary-foreground','primary']].map(([a,b])=>[a,ratio(root.getPropertyValue('--'+a),root.getPropertyValue('--'+b))]))};
      }));
      await page.getByRole('button',{name:'Show all 31 themes'}).click();
      assert.equal(await page.locator('.theme-card').count(),31);
      specimenContrasts.push({width,mode,kind:'all catalog palettes',pairs:await renderedContrast(page,'.mini-type, .mini-button')});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      const expanded=await page.evaluate(script);expanded.name=`${width}px ${mode} all themes`;expandedStates.push(expanded);
      await page.getByRole('button',{name:'Show fewer themes'}).click();
    }
    if(width===390) {
      const read = async (selector,heading) => page.locator(selector).evaluate((e,h)=>{
        const text = n => n.textContent.replace(/[↗↓↑→↳✓✳·]/g,'').replace(/\s+/g,' ').trim();
        return {headline:text(e.querySelector(h)),body:[...e.querySelectorAll('p,label,code,strong,.scheme-label')].map(text).filter(Boolean),actions:[...e.querySelectorAll('a,button')].filter(x=>!x.hasAttribute('aria-pressed')&&!x.hasAttribute('role')).map(text).filter(Boolean)};
      },heading);
      for(const [sel,h] of [['.hero-copy','h1'],['.specimen','h2'],['.themes .section-heading','h2'],['.workflow .section-heading','h2'],['.connect-copy','h2'],['.ownership','h2']]) panels.push({screen:sel,...await read(sel,h)});
      await page.getByRole('button',{name:'Show all 31 themes'}).click();
      for (const sel of ['.workflow-item','.theme-card-info']) for(let i=0;i<await page.locator(sel).count();i++){
        const e=page.locator(sel).nth(i); panels.push({screen:sel+' '+i,...await e.evaluate(e=>({headline:e.querySelector('h3').textContent,body:[...e.querySelectorAll('p,code,.scheme-label')].map(n=>n.textContent),actions:[...e.querySelectorAll('a')].map(n=>n.textContent.replace(/[↗]/g,'').trim())}))});
      }
      await page.getByRole('button',{name:'Show fewer themes'}).click();
      for(let i=0;i<3;i++){
        await page.getByRole('tab',{name:['Codex','JSON','Server URL'][i],exact:true}).click();
        panels.push({screen:['Codex','JSON','Server URL'][i]+' setup',headline:['Codex','JSON','Server URL'][i],body:await page.locator('.client-panel p').allTextContents(),actions:await page.locator('.copy-action button').allTextContents()});
        const input = i===2 ? {value:await page.locator('#mcp-endpoint').inputValue()} : {code:await page.locator('.client-panel pre').textContent()};
        await save('setup-'+i,input);
        const state=await page.evaluate(script);state.name='390px '+['Codex','JSON','Server URL'][i];await save('setup-state-'+i,state);
      }
      await verifyBehavior(page);
    }
    await context.close();
  }
  await save('states',states);await save('contrasts',contrasts);await save('panels',panels);
  await save('expanded-states',expandedStates);
  await save('specimen-contrasts',specimenContrasts);
  const expandedSpacing=await client.callTool({name:'inspect-spacing',arguments:{states:expandedStates,spacingScale:[4,8,12,16,20,24,32,40,48,56,64,72,80,88,96,104,128],tolerance:2,detail:'full'}});await save('expanded-spacing',expandedSpacing);console.log('EXPANDED',JSON.stringify(expandedSpacing.structuredContent?.summary));
  const spacing=await client.callTool({name:'inspect-spacing',arguments:{states,spacingScale:[4,8,12,16,20,24,32,40,48,56,64,72,80,88,96,104,128],tolerance:2,detail:'full'}});
  await save('spacing',spacing);console.log('SPACING',JSON.stringify(spacing.structuredContent?.summary));
  const setupStates=await Promise.all([0,1,2].map(i=>readFile(path.join(dir,'setup-state-'+i+'.json'),'utf8').then(JSON.parse)));
  const setupSpacing=await client.callTool({name:'inspect-spacing',arguments:{states:setupStates,spacingScale:[4,8,12,16,20,24,32,40,48,56,64,72,80,88,96,104,128],tolerance:2,detail:'full'}});await save('setup-spacing',setupSpacing);console.log('SETUP SPACING',JSON.stringify(setupSpacing.structuredContent?.summary));
  const reviews=[];
  for(const panel of panels){const result=await client.callTool({name:'check-comprehension',arguments:{...panel,knownTerms}});reviews.push({panel,result});}
  await save('comprehension',reviews);
  const failures=reviews.filter(r=>r.result.structuredContent?.verdict!=='pass');
  console.log('COPY',JSON.stringify(failures.map(r=>({screen:r.panel.screen,result:r.result.structuredContent}))));
  assert.deepEqual(errors,[]);
  const minimumSpecimenContrast=Math.min(...specimenContrasts.flatMap(c=>c.pairs.map(p=>p.ratio)));
  const summary={origin,widths:[390,1440,1728],schemes:['dark','light'],sourcePassed:true,spacing:spacing.structuredContent?.summary,expandedSpacing:expandedSpacing.structuredContent?.summary,setupSpacing:setupSpacing.structuredContent?.summary,comprehensionPanels:panels.length,comprehensionFailures:failures.length,contrasts,minimumSpecimenContrast,pageErrors:errors,behavior:['palette changes','preview save/edit','search and URL persistence','multiword search','no-match recovery','appearance filters and persistence','expand/collapse 31 themes','keyboard tabs','clipboard success and denial','registry link','catalog failure, invalid response, retry and timeout','reduced motion','keyboard skip link']};await save('summary',summary);
  for(const review of [spacing,expandedSpacing,setupSpacing]){assert.ok(!review.isError);assert.equal(review.structuredContent?.summary.critical,0);assert.equal(review.structuredContent?.summary.serious,0);}
  assert.equal(failures.length,0);
  assert.ok(contrasts.every(c=>Object.values(c.pairs).every(r=>r>=4.5)));
  assert.ok(minimumSpecimenContrast>=4.5,JSON.stringify(specimenContrasts.filter(c=>c.pairs.some(p=>p.ratio<4.5))));
} finally {await browser.close();await client.close();}
