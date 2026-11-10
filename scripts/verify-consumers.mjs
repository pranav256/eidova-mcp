import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {measureTextContrast} from './browser-contrast.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const origin=process.env.CONSUMER_REGISTRY_ORIGIN||'http://localhost:3000';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname),'Run against the local candidate registry.');
const npm=process.env.npm_execpath;assert.ok(npm,'Run through npm run verify:consumers.');
const directory=path.join(root,'.work','consumers',String(Date.now()));await mkdir(directory,{recursive:true});
const components=['button','input','card','dialog','table','sidebar'];
const results=[],states=[],contrasts=[];
const template=await readFile(new URL('./fixtures/Consumer.tsx',import.meta.url),'utf8');
const css=await readFile(new URL('./fixtures/consumer.css',import.meta.url),'utf8');
const json=(file,data)=>writeFile(file,JSON.stringify(data,null,2)+'\n');
async function write(file,content){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,content);}
async function run(cwd,name,args) {
  console.log(`${path.basename(cwd)}: ${name}`);
  const child=spawn(process.execPath,[npm,...args],{cwd,env:{...process.env,CI:'1',NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{output+=chunk;});
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
  await write(path.join(cwd,name+'.log'),output);assert.equal(code,0,output.slice(-7000));
}
async function clean(target){const relative=path.relative(directory,path.resolve(target));assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));await rm(target,{recursive:true,force:true});}
const catalog=await (await fetch(origin+'/api/catalog')).json();assert.equal(catalog.length,31);
const client=new Client({name:'clean-consumer-review',version:'0.2.0'});await client.connect(new StreamableHTTPClientTransport(new URL(origin+'/mcp')));
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined),headless:true});
try {
  await json(path.join(directory,'rules.json'),await client.callTool({name:'get-review-rules',arguments:{category:'all',detail:'full'}}));
  const capture=await client.callTool({name:'inspect-spacing',arguments:{detail:'full'}});assert.ok(capture.structuredContent?.captureScript);
  for(const framework of ['vite','next'])for(const id of ['linear','tactile-minimal','monochrome-industrial']) {
    const cwd=path.join(directory,framework+'-'+id);await mkdir(cwd,{recursive:true});
    const next=framework==='next',cssPath=next?'src/app/globals.css':'src/index.css';
    const fonts=id==='monochrome-industrial'?['geist','space-grotesk','space-mono','doto']:['geist'];
    const fontImports=fonts.flatMap(font=>[400,500].filter(weight=>font!=='space-mono'||weight===400).map(weight=>`import '@fontsource/${font}/latin-${weight}.css';`)).join('\n');
    const dependencies={react:'19.2.0','react-dom':'19.2.0',tailwindcss:'4.3.5','tw-animate-css':'1.4.0',...Object.fromEntries(fonts.map(font=>['@fontsource/'+font,'5.3.0']))};
    if(next)dependencies.next='16.4.6';
    const devDependencies={typescript:'5.9.3','@types/node':'22.19.0','@types/react':'19.2.2','@types/react-dom':'19.2.2',...(next?{'@tailwindcss/postcss':'4.3.5',postcss:'8.5.32'}:{vite:'7.3.7','@tailwindcss/vite':'4.3.5'})};
    await json(path.join(cwd,'package.json'),{name:'open-design-consumer',version:'0.0.0',private:true,type:'module',scripts:{build:next?'next build':'tsc --noEmit && vite build'},dependencies,devDependencies});
    await json(path.join(cwd,'tsconfig.json'),{compilerOptions:{target:'ES2022',lib:['ES2022','DOM','DOM.Iterable'],module:'ESNext',moduleResolution:'Bundler',jsx:'react-jsx',strict:true,skipLibCheck:true,esModuleInterop:true,resolveJsonModule:true,noEmit:true,paths:{'@/*':['./src/*']}},include:['src','vite.config.ts']});
    await json(path.join(cwd,'components.json'),{$schema:'https://ui.shadcn.com/schema.json',style:'new-york',rsc:next,tsx:true,tailwind:{config:'',css:cssPath,baseColor:'neutral',cssVariables:true,prefix:''},aliases:{components:'@/components',utils:'@/lib/utils',ui:'@/components/ui',lib:'@/lib',hooks:'@/hooks'}});
    await write(path.join(cwd,cssPath),'@import "tailwindcss";\n@import "tw-animate-css";\n');
    if(next) {
      await write(path.join(cwd,'postcss.config.mjs'),'export default {plugins:{"@tailwindcss/postcss":{}}};\n');
      await write(path.join(cwd,'next.config.mjs'),'export default {devIndicators:false};\n');
    } else {
      await write(path.join(cwd,'vite.config.ts'),'import {defineConfig} from "vite";import tailwind from "@tailwindcss/vite";import {fileURLToPath} from "node:url";export default defineConfig({plugins:[tailwind()],resolve:{alias:{"@":fileURLToPath(new URL("./src",import.meta.url))}}});\n');
      await write(path.join(cwd,'index.html'),'<html><head><title>Workspace settings</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>');
    }
    await run(cwd,'install',['install','--no-audit','--no-fund']);
    await run(cwd,'shadcn',['exec','--yes','--package=shadcn@4.23.0','--','shadcn','add',...['globals',...components].map(name=>`${origin}/registry/${id}/${name}.json`),'--yes','--overwrite']);
    for(const name of components)assert.ok((await readFile(path.join(cwd,'src/components/ui',name+'.tsx'),'utf8')).length>100);
    const installedCss=await readFile(path.join(cwd,cssPath),'utf8');assert.match(installedCss,/--primary\s*:/);assert.doesNotMatch(installedCss,/var\(----/);
    const sidebar=await readFile(path.join(cwd,'src/components/ui/sidebar.tsx'),'utf8');
    const usesLabel=/label:\s*string/.test(sidebar);
    const app=template.replace('__WORKSPACE_LABEL__',usesLabel?'label="Workspace"':'').replace('__MEMBERS_LABEL__',usesLabel?'label="Members"':'').replace('__HEADING_FONT__',JSON.stringify(id==='monochrome-industrial'?'var(--font-display)':'inherit'));
    assert.doesNotMatch(app,/__WORKSPACE_LABEL__|__MEMBERS_LABEL__|__HEADING_FONT__/);
    await write(path.join(cwd,'src/components/Consumer.tsx'),app);
    await write(path.join(cwd,'src/components/kit.ts'),components.map(name=>`export * from './ui/${name}';`).join('\n'));
    await write(path.join(cwd,'src/consumer.css'),css);
    const mode=id==='tactile-minimal'?'light':'dark';
    if(next) {
      await write(path.join(cwd,'src/app/layout.tsx'),`import type {ReactNode} from 'react';\nimport './globals.css';\nimport '../consumer.css';\n${fontImports}\nexport default function Layout({children}:{children:ReactNode}){return <html lang="en" data-consumer="" className=${JSON.stringify(mode==='dark'?'dark':'')}><body>{children}</body></html>;}\n`);
      await write(path.join(cwd,'src/app/page.tsx'),"export {default} from '../components/Consumer';\n");
    } else await write(path.join(cwd,'src/main.tsx'),`import {createRoot} from 'react-dom/client';\nimport Consumer from './components/Consumer';\nimport './index.css';\nimport './consumer.css';\n${fontImports}\ndocument.documentElement.dataset.consumer='';\ndocument.documentElement.classList.toggle('dark',${mode==='dark'});\ncreateRoot(document.getElementById('root')!).render(<Consumer/>);\n`);
    const source=await client.callTool({name:'review-ui-code',arguments:{files:[{path:'Consumer.tsx',content:app},{path:'consumer.css',content:css}]}});await json(path.join(cwd,'source-review.json'),source);assert.match(JSON.stringify(source),/No findings|0 critical, 0 serious/);
    await run(cwd,'build',['run','build']);
    const entry=path.join(cwd,next?'node_modules/next/dist/bin/next':'node_modules/vite/bin/vite.js');
    const child=spawn(process.execPath,[entry,...(next?['start','-H','127.0.0.1','-p','5183']:['preview','--host','127.0.0.1','--port','5183'])],{cwd,env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'},stdio:'ignore'});
    const page=await browser.newPage({viewport:{width:390,height:1000},reducedMotion:'reduce'}),errors=[];page.on('pageerror',error=>errors.push(error.message));
    const record=async name=>{
      const state=await page.evaluate(capture.structuredContent.captureScript);state.name=framework+' '+id+' '+name;states.push(state);
      const readings=await page.evaluate(measureTextContrast),failures=readings.filter(item=>item.ratio<item.minimum);
      contrasts.push({state:state.name,minimum:Math.min(...readings.map(item=>item.ratio)),readings,failures});
      await json(path.join(directory,'contrast.json'),contrasts);assert.deepEqual(failures,[],state.name+': text contrast');
    };
    try {
      for(let attempt=0;attempt<60;attempt++){try{await page.goto('http://127.0.0.1:5183');break;}catch{if(attempt===59)throw new Error('Consumer did not start');await new Promise(resolve=>setTimeout(resolve,250));}}
      await page.getByRole('heading',{name:'Workspace settings',exact:true}).waitFor();await page.evaluate(()=>document.fonts.ready);
      const panels=[];
      for(const selector of ['.consumer-nav','.consumer-content','#workspace-details','#workspace-members'])panels.push(await page.locator(selector).evaluate((node,selector)=>({screen:selector,headline:node.querySelector('h1,h2,h3')?.textContent||'Workspace navigation',body:[...node.querySelectorAll(selector==='.consumer-content'?':scope > p':'p,label,th,td')].map(item=>item.textContent),actions:selector==='.consumer-content'?[]:[...node.querySelectorAll('button')].map(item=>item.textContent.trim()).filter(Boolean)}),selector));
      for(const width of [390,1440,1728]) {
        await page.mouse.move(0,0);await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();});
        await page.setViewportSize({width,height:1000});await page.waitForFunction(width=>{const nav=document.querySelector('.consumer-nav').getBoundingClientRect(),content=document.querySelector('.consumer-content').getBoundingClientRect();return Math.abs(nav.width-(width<640?width:192))<1&&content.width>=(width<640?width:600);},width);await page.screenshot({path:path.join(cwd,width+'.png'),fullPage:true,animations:'disabled'});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,framework+' '+id+' overflow');
        await record(width+'px base');
        await page.getByRole('button',{name:'Save changes',exact:true}).hover();await record(width+'px hover');
        await page.getByRole('button',{name:'Save changes',exact:true}).focus();await record(width+'px focus');
      }
      const input=page.getByRole('textbox',{name:'Workspace name',exact:true});await input.fill('');await page.getByRole('button',{name:'Save changes'}).click();assert.equal(await input.evaluate(node=>node.validity.valid),false);
      await input.fill('Consumer workspace');await page.getByRole('button',{name:'Save changes'}).click();await page.getByText('Saved in this sample.',{exact:true}).waitFor();
      const invite=page.getByRole('button',{name:'Invite a member',exact:true});await invite.focus();await page.keyboard.press('Enter');const dialog=page.getByRole('dialog',{name:'Invite a member',exact:true});await dialog.waitFor();
      panels.push(await dialog.evaluate(node=>({screen:'Invite member dialog',headline:node.querySelector('h2').textContent,body:[...node.querySelectorAll('p,label')].map(item=>item.textContent),actions:[...node.querySelectorAll('button')].map(item=>item.textContent.trim()).filter(Boolean)})));
      for(const width of [390,1440,1728]){await page.setViewportSize({width,height:1000});await page.waitForFunction(width=>{const nav=document.querySelector('.consumer-nav').getBoundingClientRect(),content=document.querySelector('.consumer-content').getBoundingClientRect(),dialog=document.querySelector('[role="dialog"]').getBoundingClientRect();return Math.abs(nav.width-(width<640?width:192))<1&&content.width>=(width<640?width:600)&&dialog.x>=-1&&dialog.x+dialog.width<=innerWidth+1;},width);await dialog.screenshot({animations:'disabled'});await record(width+'px dialog');}
      await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await invite.evaluate(node=>node===document.activeElement),true);
      await invite.click();await page.getByRole('textbox',{name:'Email address'}).fill('consumer@example.com');await page.getByRole('button',{name:'Add sample member'}).click();await page.getByRole('cell',{name:'consumer@example.com',exact:true}).waitFor();
      assert.equal(await invite.evaluate(node=>node===document.activeElement),true);assert.deepEqual(errors,[]);
      const comprehension=[];
      for(const panel of panels){const result=await client.callTool({name:'check-comprehension',arguments:{...panel,knownTerms:['workspace','Acme']}});comprehension.push({panel,result});assert.equal(result.structuredContent?.verdict,'pass',JSON.stringify(result));}
      await json(path.join(cwd,'comprehension.json'),comprehension);
      const metrics=await page.locator('button[type="submit"]').first().evaluate(node=>({background:getComputedStyle(node).backgroundColor,font:getComputedStyle(node).fontFamily,titleFont:getComputedStyle(document.querySelector('h1')).fontFamily,inputFont:getComputedStyle(document.querySelector('#workspace-name')).fontFamily}));assert.ok(!['transparent','rgba(0, 0, 0, 0)'].includes(metrics.background));
      if(id==='monochrome-industrial'){assert.match(metrics.titleFont,/Doto/);assert.match(metrics.inputFont,/Space Mono/);assert.equal(await page.evaluate(()=>document.fonts.check('500 28px Doto')&&document.fonts.check('400 14px "Space Mono"')),true);}
      const packageJson=JSON.parse(await readFile(path.join(cwd,'package.json'),'utf8'));results.push({framework,id,dependencies:packageJson.dependencies,build:'passed',widths:[390,1440,1728],interactions:'input validation, save, dialog focus, add member',metrics,pageErrors:errors});
      await json(path.join(directory,'results.json'),results);console.log(`${framework} ${id}: clean CLI install, build and interactions passed.`);
    } finally {await page.close();if(child.exitCode===null){child.kill();await new Promise(resolve=>child.once('close',resolve));}}
    await clean(path.join(cwd,'node_modules'));
  }
  const spacing=[];
  for(let index=0;index<states.length;index+=6){const result=await client.callTool({name:'inspect-spacing',arguments:{states:states.slice(index,index+6),spacingScale:[4,8,12,16,20,24,28,32,36,40,44,48,56,64,72,80,96,104,128],tolerance:2,detail:'full'}});await json(path.join(directory,'spacing-'+index+'.json'),result);spacing.push(result.structuredContent?.summary);}
  assert.ok(spacing.every(summary=>summary&&summary.critical===0&&summary.serious===0));
  await json(path.join(directory,'summary.json'),{node:process.version,registry:origin,shadcn:'4.23.0',consumers:results.length,results,spacing,contrastStates:contrasts.length,minimumMeasuredContrast:Math.min(...contrasts.map(item=>item.minimum)),scope:'Six clean React 19/Tailwind 4 consumers; actual shadcn CLI and Vite/Next production builds. Solid-background text contrast, internal browser checks; not client-host or accessibility certification.'});
  assert.equal(results.length,6);console.log('Consumer evidence: '+directory);
} finally {await browser.close();await client.close();}
