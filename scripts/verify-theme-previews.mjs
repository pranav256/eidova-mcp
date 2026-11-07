import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const origin=process.env.WEBSITE_REVIEW_URL || 'https://open-design-website.vercel.app';
const dir=path.resolve(process.argv[2] || '.work/verification/theme-previews');
await mkdir(dir,{recursive:true});
const previews=JSON.parse(await readFile(path.resolve(process.env.WEBSITE_SOURCE_DIR || 'website','src/catalog-previews.json'),'utf8'));
const save=(name,value)=>writeFile(path.join(dir,name+'.json'),JSON.stringify(value,null,2));
const client=new Client({name:'open-design-all-theme-previews',version:'1'});
await client.connect(process.env.MCP_PRIVATE_ARCHIVE
  ? new StdioClientTransport({command:process.execPath,args:[path.resolve('scripts/start-private.mjs'),path.resolve(process.env.MCP_PRIVATE_ARCHIVE)]})
  : new StreamableHTTPClientTransport(new URL(process.env.MCP_REVIEW_URL || 'https://open-design-mcp-liard.vercel.app/mcp')));
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL || (process.platform==='win32'?'msedge':undefined),headless:true});
const checks=[],states=[],copyChecks=[],errors=[];
const reviewedCopy=new Set();
try {
  await save('rules',await client.callTool({name:'get-review-rules',arguments:{category:'all',context:'Verify every live theme preview and its inherited website appearance'}}));
  const capture=await client.callTool({name:'inspect-spacing',arguments:{detail:'full'}});
  const script=capture.structuredContent.captureScript;
  const context=await browser.newContext({viewport:{width:390,height:1000}});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  page.setDefaultTimeout(15000);
  // Opening from the catalog must carry the current appearance in the real link.
  await page.goto(origin);await page.getByRole('button',{name:'Show all 31 themes'}).click();
  for(const mode of ['dark','light']){
    if(mode==='light')await page.getByRole('button',{name:'Switch to light mode'}).click();
    const links=await page.locator('.theme-live-link').evaluateAll(nodes=>nodes.map(n=>n.href));
    assert.equal(links.length,31);assert.equal(new Set(links.map(h=>new URL(h).searchParams.get('preview'))).size,31);
    assert.ok(links.every(h=>new URL(h).searchParams.get('mode')===mode));
    assert.equal(await page.locator('.specimen').getAttribute('data-preview-mode'),mode);
  }
  await page.getByRole('link',{name:'Open Linear live preview'}).click();
  await page.locator('.preview-page').waitFor();
  assert.equal(await page.locator('.specimen').getAttribute('data-preview-mode'),'light');
  await page.getByRole('button',{name:'Switch to dark mode'}).click();
  assert.equal(new URL(page.url()).searchParams.get('mode'),'dark');
  await page.reload();await page.locator('.specimen').waitFor();
  assert.equal(await page.locator('.specimen').getAttribute('data-preview-mode'),'dark');
  await page.getByRole('link',{name:'Next theme',exact:true}).click();
  await page.locator('.specimen').waitFor();
  assert.equal(await page.locator('.specimen').getAttribute('data-preview-mode'),'dark');
  await page.getByRole('link',{name:'All themes',exact:true}).click();
  await page.locator('.theme-card').first().waitFor();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  console.log('Verified catalog links, mode inheritance, refresh and navigation.');
  // Live pages work independently of catalog availability.
  await page.route('**/api/catalog',route=>route.abort());
  for(const width of [390,1440,1728]) {
    await page.setViewportSize({width,height:1000});
    const ids=width===390?Object.keys(previews):['minimal-light','linear','tactile-minimal'];
    for(const id of ids)for(const mode of ['dark','light']){
      await page.goto(`${origin}/?preview=${id}&mode=${mode}`,{waitUntil:'load'});
      await page.locator('.specimen').waitFor();await page.evaluate(()=>document.fonts.ready);
      assert.equal(await page.locator('h1').textContent(),previews[id].title);
      assert.equal(await page.locator('html').getAttribute('data-theme'),mode);
      assert.equal(await page.locator('.specimen').getAttribute('data-preview-mode'),mode);
      assert.equal(await page.locator('.specimen').getAttribute('data-preview-theme'),id);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      const result=await page.locator('.specimen').evaluate(e=>{
        const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const paint=canvas.getContext('2d',{willReadFrequently:true});
        const pixel=()=>[...paint.getImageData(0,0,1,1).data].slice(0,3);
        const lum=rgb=>{const c=rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
        const color=getComputedStyle(e).backgroundColor;paint.fillStyle=color;paint.fillRect(0,0,1,1);const backgroundLuminance=lum(pixel());
        const contrast=[...e.querySelectorAll('h2, p, label, input, button, .specimen-status, .specimen-example, .specimen-tokens span, .specimen-tokens code')].map(node=>{
          paint.clearRect(0,0,1,1);const ancestors=[];for(let p=node;p;p=p.parentElement)ancestors.unshift(p);
          for(const p of ancestors){paint.fillStyle=getComputedStyle(p).backgroundColor;paint.fillRect(0,0,1,1);}const bg=lum(pixel());
          paint.fillStyle=getComputedStyle(node).color;paint.fillRect(0,0,1,1);const fg=lum(pixel());
          return {text:node.textContent,ratio:(Math.max(bg,fg)+.05)/(Math.min(bg,fg)+.05)};
        });
        return {backgroundLuminance,contrast};
      });
      assert.equal(result.backgroundLuminance<.35,mode==='dark',`${id} visible surface must be ${mode}`);
      assert.ok(result.contrast.every(c=>c.ratio>=4.5),JSON.stringify({id,mode,failed:result.contrast.filter(c=>c.ratio<4.5)}));
      if(id==='minimal-light'){
        await page.getByLabel('Project name').fill('Preview test');await page.getByRole('button',{name:'Save changes'}).click();
        assert.equal(await page.locator('.specimen-status').textContent(),'Saved in this preview.');
        await page.getByLabel('Project name').fill('Edited preview');assert.equal(await page.locator('.specimen-status').textContent(),'Try the components.');
      }
      await page.mouse.move(0,0);
      const state=await page.evaluate(script);state.name=`${id} ${mode} ${width}px`;states.push(state);
      checks.push({id,mode,width,...result});
      if(checks.length%10===0)console.log(`Checked ${checks.length} live preview layouts.`);
      if(['minimal-light','linear','tactile-minimal'].includes(id))await page.screenshot({path:path.join(dir,`${id}-${mode}-${width}.png`),fullPage:true});
      if(width===390){
        const heading=await page.locator('.preview-page-heading').evaluate(e=>({headline:e.querySelector('h1').textContent,body:[e.querySelector('p').textContent],actions:[...e.querySelectorAll('a')].map(n=>n.textContent)}));
        const result=await client.callTool({name:'check-comprehension',arguments:{screen:`${previews[id].title} ${mode} live preview`,...heading,knownTerms:['UI','React','registry','tokens']}});
        copyChecks.push({id,mode,result});
        const panels=await page.evaluate(()=>[
          {screen:'Live component example',headline:document.querySelector('.specimen h2').textContent,body:[...document.querySelectorAll('.specimen p, .specimen label, .specimen-top, .specimen-status, .specimen-tokens, .playground figcaption')].map(n=>n.textContent),actions:[document.querySelector('.specimen button').textContent]},
          {screen:'Preview appearance note',headline:document.querySelector('.preview-page h1').textContent,body:[document.querySelector('.preview-note').textContent],actions:[]},
        ]);
        for(const panel of panels){
          const key=JSON.stringify({...panel,headline:panel.screen==='Preview appearance note'?'':panel.headline});
          if(reviewedCopy.has(key))continue;reviewedCopy.add(key);
          const result=await client.callTool({name:'check-comprehension',arguments:{...panel,knownTerms:['React','workspace','registry','tokens','palette']}});
          copyChecks.push({id,mode,result});
        }
      }
    }
    console.log(`Verified preview layouts at ${width}px.`);
  }
  for(const id of ['missing-theme','__proto__']){
    await page.goto(`${origin}/?preview=${id}&mode=light`);await page.getByRole('heading',{name:'Theme not found'}).waitFor();
    assert.equal(await page.locator('.specimen').count(),0);
  }
  await save('states',states);await save('checks',checks);await save('comprehension',copyChecks);
  const spacing=[];
  for(let i=0;i<states.length;i+=6){
    const result=await client.callTool({name:'inspect-spacing',arguments:{states:states.slice(i,i+6),spacingScale:[4,8,12,16,20,24,32,40,48,56,64,72,80,88,96,104,128],tolerance:2,detail:'full'}});
    await save('spacing-'+i,result);spacing.push(result.structuredContent.summary);
  }
  const summary={origin,themeCount:Object.keys(previews).length,checkedLayouts:checks.length,modes:['dark','light'],widths:[390,1440,1728],minimumContrast:Math.min(...checks.flatMap(c=>c.contrast.map(v=>v.ratio))),spacing,comprehensionChecks:copyChecks.length,comprehensionFailures:copyChecks.filter(c=>c.result.structuredContent.verdict!=='pass').length,pageErrors:errors};
  await save('summary',summary);console.log(JSON.stringify(summary,null,2));
  assert.deepEqual(errors,[]);assert.equal(summary.comprehensionFailures,0);assert.ok(spacing.every(s=>s.critical===0&&s.serious===0));
}finally{await browser.close();await client.close();}
