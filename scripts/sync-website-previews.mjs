import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Public MIT registry only. Never read the private capture archive.
const root = fileURLToPath(new URL('../', import.meta.url));
const website = path.resolve(process.argv[2] || path.join(root, 'website'));
const registry = path.join(root, 'assets/registry');
const entries = (await readdir(registry, { withFileTypes: true })).filter(e => e.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name));
const previews = {};
const usedTokens = new Set(['--background','--foreground','--card','--card-foreground','--primary','--primary-foreground','--secondary','--secondary-foreground','--muted','--muted-foreground','--accent','--accent-foreground','--border','--input','--ring','--radius']);
for (const entry of entries) {
  const globals = JSON.parse(await readFile(path.join(registry, entry.name, 'globals.json'), 'utf8'));
  const values = globals.cssVars?.light || globals.cssVars?.dark;
  assert.ok(values, `No palette for ${entry.name}`);
  const tokens = Object.fromEntries(Object.entries(values).map(([name,value])=>[name.startsWith('--')?name:'--'+name,value]).filter(([name])=>usedTokens.has(name)));
  previews[entry.name] = { tokens };
}
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), headless:true });
try {
  const page = await browser.newPage();
  const metadata = await page.evaluate(previews => {
    const canvas = document.createElement('canvas'); canvas.width=canvas.height=1;
    const paint=canvas.getContext('2d',{willReadFrequently:true});
    const rgb = (...colors) => {paint.clearRect(0,0,1,1);for(const color of colors){if(!CSS.supports('color',color))throw new Error('Unsupported color: '+color);paint.fillStyle=color;paint.fillRect(0,0,1,1);}return [...paint.getImageData(0,0,1,1).data].slice(0,3);};
    const lum = color => {const c=color.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
    const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
    return Object.fromEntries(Object.entries(previews).map(([id,{tokens}])=>{
      const background=rgb(tokens['--background']);
      let actionBackgroundToken='--primary';
      const choose = (backgroundToken,textToken) => {
        const surface=rgb(tokens['--background'],tokens[backgroundToken]);
        const candidates=[textToken,'--foreground','--background','--card-foreground'].map(token=>({token,contrast:ratio(rgb(tokens[token]),surface)}));
        return candidates[0].contrast>=4.5?candidates[0]:candidates.sort((a,b)=>b.contrast-a.contrast)[0];
      };
      let selected=choose('--primary','--primary-foreground');
      if(selected.contrast<4.5){actionBackgroundToken='--secondary';selected=choose('--secondary','--secondary-foreground');}
      if(selected.contrast<4.5)throw new Error(id+' has no readable action token pair');
      return [id,{scheme:lum(background)<.35?'dark':'light',actionBackgroundToken,actionTextToken:selected.token}];
    }));
  },previews);
  const result = Object.fromEntries(Object.entries(previews).map(([id,preview])=>[id,{...metadata[id],...preview}]));
  await writeFile(path.join(website,'src/catalog-previews.json'),JSON.stringify(result,null,2)+'\n');
  console.log(`Synced ${entries.length} public palettes with readable action labels.`);
} finally {await browser.close();}
