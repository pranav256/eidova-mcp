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
  const alternate = globals.cssVars?.dark;
  const darkTokens = alternate ? {...tokens,...Object.fromEntries(Object.entries(alternate).map(([name,value])=>[name.startsWith('--')?name:'--'+name,value]).filter(([name])=>usedTokens.has(name)))} : undefined;
  previews[entry.name] = { title: entry.name.split('-').map(word=>word[0].toUpperCase()+word.slice(1)).join(' '), tokens, darkTokens };
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
    const recipe = (id,tokens) => {
      let actionBackgroundToken='--primary';
      const choose = (backgroundToken,textToken) => {
        const surface=rgb(tokens['--background'],tokens[backgroundToken]);
        const candidates=[textToken,'--foreground','--background','--card-foreground'].map(token=>({token,contrast:ratio(rgb(tokens[token]),surface)}));
        return candidates[0].contrast>=4.5?candidates[0]:candidates.sort((a,b)=>b.contrast-a.contrast)[0];
      };
      let selected=choose('--primary','--primary-foreground');
      if(selected.contrast<4.5){actionBackgroundToken='--secondary';selected=choose('--secondary','--secondary-foreground');}
      if(selected.contrast<4.5)throw new Error(id+' has no readable action token pair');
      return {actionBackgroundToken,actionTextToken:selected.token,tokens};
    };
    const oklch = color => {
      const channels=rgb(color).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
      const [r,g,b]=channels;
      const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b);
      const m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b);
      const s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
      const a=1.9779984951*l-2.428592205*m+.4505937099*s;
      const d=.0259040371*l+.7827717662*m-.808675766*s;
      return {chroma:Math.hypot(a,d),hue:(Math.atan2(d,a)*180/Math.PI+360)%360};
    };
    const adapt = (tokens,mode) => {
      const brand=oklch(tokens['--primary']);
      const neutral=oklch(tokens['--background']);
      const chroma=Math.min(neutral.chroma, .012);
      const hue=neutral.chroma>.002?neutral.hue:brand.hue;
      const shade=(l,c=chroma)=>`oklch(${l} ${c.toFixed(4)} ${hue.toFixed(2)})`;
      const dark=mode==='dark';
      const result={...tokens,
        '--background':shade(dark?.17:.975), '--foreground':shade(dark?.96:.23),
        '--card':shade(dark?.22:1), '--card-foreground':shade(dark?.96:.23),
        '--secondary':shade(dark?.28:.93), '--secondary-foreground':shade(dark?.93:.28),
        '--muted':shade(dark?.24:.94), '--muted-foreground':shade(dark?.74:.50),
        '--accent':shade(dark?.31:.90), '--accent-foreground':shade(dark?.96:.23),
        '--border':shade(dark?.43:.80), '--input':shade(dark?.20:.99),
      };
      // Monochrome themes need their action polarity reversed as well.
      if(brand.chroma<.025){result['--primary']=result['--foreground'];result['--primary-foreground']=result['--background'];}
      result['--ring']=result['--foreground'];
      return result;
    };
    return Object.fromEntries(Object.entries(previews).map(([id,{title,tokens,darkTokens}])=>{
      const scheme=lum(rgb(tokens['--background']))<.35?'dark':'light';
      const modes={};
      for(const mode of ['light','dark']){
        const native=mode===scheme?tokens:mode==='dark'&&darkTokens&&lum(rgb(darkTokens['--background']))<.35?darkTokens:null;
        modes[mode]={adapted:!native,...recipe(id,native||adapt(tokens,mode))};
      }
      return [id,{title,scheme,modes}];
    }));
  },previews);
  await writeFile(path.join(website,'src/catalog-previews.json'),JSON.stringify(metadata,null,2)+'\n');
  console.log(`Synced ${entries.length} themes in both appearances with readable action labels.`);
} finally {await browser.close();}
