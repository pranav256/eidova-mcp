import { resourcePath } from './resources.js';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { VIDEO_COMPONENT_CATALOG, VIDEO_COMPONENT_FILES } from '../vendor/upstream/runtime.mjs';
import { inlineRegistryCss } from './registry-css.js';
import { z } from 'zod';

export type RegistryItem = {
  name: string; type?: string; description?: string;
  dependencies?: string[]; registryDependencies?: string[];
  files?: { path: string; content: string; type?: string; target?: string }[];
  cssVars?: Record<string, Record<string, string>>;
  [key: string]: unknown;
};
export type CatalogSystem = {
  id: string; title: string; description: string; personality: string[]; industry: string[];
  componentCount: number; primaryColor: string; font: string; borderRadius: string;
  iconLibraryId: string; iconVariant: string; components: string[];
  family: {id:string;title:string;representative:string;description:string;axes:string[];useCases:string[];tradeoff:string};
  variant: boolean;
};

const assetsDirectory = process.env.EIDOVA_ASSETS_DIR ?? process.env.OPEN_DESIGN_ASSETS_DIR;
const REGISTRY_ROOT = assetsDirectory ? path.resolve(assetsDirectory) : resourcePath('assets/registry');
const slug = /^[a-z0-9][a-z0-9_-]{0,80}$/;
const cache = new Map<string, RegistryItem>();
let catalogPromise: Promise<CatalogSystem[]> | undefined;
const familySchema=z.object({version:z.literal(1),families:z.array(z.object({id:z.string(),title:z.string(),representative:z.string(),description:z.string(),axes:z.array(z.string()).min(3),useCases:z.array(z.string().min(1)).min(1),tradeoff:z.string().min(1),members:z.array(z.string())})).min(6).max(8)});
const familyLibrary=familySchema.parse(JSON.parse(await readFile(resourcePath('content/design-families.json'),'utf8')));
const familyBySystem=new Map(familyLibrary.families.flatMap(family=>family.members.map(id=>[id,family] as const)));
if(familyBySystem.size!==familyLibrary.families.reduce((count,family)=>count+family.members.length,0)) throw new Error('A theme belongs to more than one family.');
export const designFamilies=familyLibrary.families.map(({members,...family})=>({...family,variants:members.filter(id=>id!==family.representative)}));
const tags: Record<string, string> = {
  linear: 'minimal precise developer productivity', stripe: 'professional fintech payments clear',
  notion: 'minimal documents collaboration neutral', airbnb: 'warm travel marketplace friendly',
  apple: 'minimal consumer polished', supabase: 'developer technical database dark',
  'minimal-light': 'minimal neutral light professional', 'corporate-fintech': 'professional finance corporate',
  'editorial-dark': 'editorial expressive dark', 'light-marketplace': 'commerce warm light marketplace',
};

export const baseUrl = () => ((process.env.EIDOVA_BASE_URL ?? process.env.OPEN_DESIGN_BASE_URL) ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000')).replace(/\/$/, '');

export async function sourceItem(system: string, component: string): Promise<RegistryItem> {
  if (!slug.test(system) || (!slug.test(component) && component !== '_shared')) throw new Error('Invalid registry identifier');
  const key = `${system}/${component}`;
  const cached = cache.get(key);
  if (cached) return structuredClone(cached);
  const item = JSON.parse(await readFile(path.join(REGISTRY_ROOT, system, `${component}.json`), 'utf8')) as RegistryItem;
  cache.set(key, item);
  return structuredClone(item);
}

export async function catalog(): Promise<CatalogSystem[]> {
  catalogPromise ??= (async () => {
    const dirs = (await readdir(REGISTRY_ROOT, { withFileTypes: true })).filter(e => e.isDirectory());
    return Promise.all(dirs.map(async dir => {
      const entries = (await readdir(path.join(REGISTRY_ROOT, dir.name)))
        .filter(f => f.endsWith('.json') && !['index.json', 'all.json'].includes(f))
        .map(f => f.slice(0, -5)).sort();
      const globals = await sourceItem(dir.name, 'globals');
      const vars = globals.cssVars?.light ?? globals.cssVars?.dark ?? {};
      const css = globals.files?.find(f => f.path.endsWith('.css'))?.content ?? '';
      const title = dir.name.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join(' ');
      const style = tags[dir.name] ?? dir.name.replaceAll('-', ' ');
      const family=familyBySystem.get(dir.name);
      if(!family) throw new Error(`Theme ${dir.name} has no design family.`);
      return {
        id: dir.name, title, description: `${title}: reusable React components and CSS tokens from the MIT licensed upstream registry.`,
        personality: style.split(' '), industry: style.split(' ').filter(t => ['developer', 'finance', 'commerce', 'travel', 'consumer'].includes(t)),
        componentCount: entries.filter(e => !/^(globals|_shared|use-|.*-utils)/.test(e)).length,
        primaryColor: vars.primary ?? vars['--primary'] ?? css.match(/--primary\s*:\s*([^;]+)/)?.[1] ?? '#171717',
        borderRadius: vars.radius ?? vars['--radius'] ?? css.match(/--radius\s*:\s*([^;]+)/)?.[1] ?? '0.75rem',
        font: css.match(/--font-sans\s*:\s*([^;]+)/)?.[1] ?? css.match(/font-family\s*:\s*([^;]+)/)?.[1] ?? 'system-ui',
        iconLibraryId: 'lucide', iconVariant: 'outline', components: entries,
        family:{id:family.id,title:family.title,representative:family.representative,description:family.description,axes:[...family.axes],useCases:[...family.useCases],tradeoff:family.tradeoff},variant:dir.name!==family.representative,
      };
    }));
  })();
  return structuredClone(await catalogPromise);
}

const queryStopWords = new Set('a an and are as at be build create design for from give i in is it make me my of on or our please system that the this to use want with'.split(' '));
export async function searchCatalog(query: string, limit = 5, requiredComponents: string[] = []) {
  const words = [...new Set(query.toLowerCase().match(/[a-z0-9]+/g) ?? [])].filter(word => !queryStopWords.has(word));
  const ranked=(await catalog()).filter(system => requiredComponents.every(name => system.components.includes(name))).map(system => {
    const text = `${system.id} ${system.title} ${system.font} ${system.family.title} ${system.family.description} ${system.family.useCases.join(' ')} ${system.personality.join(' ')} ${system.industry.join(' ')}`.toLowerCase();
    const terms = new Set(text.match(/[a-z0-9]+/g));
    const matchedTerms = words.filter(word => terms.has(word));
    const matchScore = matchedTerms.length / Math.max(words.length, 1);
    return { ...system, matchScore, matchedTerms };
  }).sort((a,b)=>Number(b.id===query.trim().toLowerCase())-Number(a.id===query.trim().toLowerCase()) || b.matchScore-a.matchScore || Number(a.variant)-Number(b.variant) || a.id.localeCompare(b.id));
  const seen=new Set<string>();
  const diverse=ranked.filter(system=>{if(seen.has(system.family.id))return false;seen.add(system.family.id);return true;});
  return [...diverse,...ranked.filter(system=>!diverse.includes(system))].slice(0,Number.isFinite(limit)?Math.max(0,Math.min(Math.floor(limit),20)):5);
}

export async function registryItem(system: string, component: string, origin = baseUrl()): Promise<RegistryItem> {
  if (system === 'video') {
    const item = VIDEO_COMPONENT_CATALOG.find(item=>item.name===component);
    if (!item) throw new Error('Video component not found');
    return {
      $schema:'https://ui.shadcn.com/schema/registry-item.json',name:item.name,type:item.type,
      description:item.description,dependencies:item.dependencies,
      registryDependencies:[...item.registryDependencies.map(dep=>`${origin}/registry/video/${dep}.json`),...item.externalRegistryDependencies],
      files:item.files.map(file=>({path:file.path,target:file.target,type:file.type,content:VIDEO_COMPONENT_FILES[file.path]})),
    };
  }
  const info = (await catalog()).find(s => s.id === system);
  if (!info) throw new Error('Design system not found');
  if (component === 'all' || component === 'all-base') {
    if (component === 'all-base') throw new Error('This registry ships Radix components. Use library radix.');
    return {
      $schema: 'https://ui.shadcn.com/schema/registry-item.json', name: `${system}-all`, type: 'registry:block',
      description: `Complete ${info.title} theme and component install.`, files: [],
      registryDependencies: info.components.map(c => `${origin}/registry/${system}/${c}.json`),
    };
  }
  if (component === 'index') return { name: system, type: 'registry:index', components: info.components };
  const item = await sourceItem(system, component);
  const localImports=(item.files??[]).flatMap(file=>[...file.content.matchAll(/from\s+["']\.\/([a-z0-9_-]+)(?:\.[tj]sx?)?["']/gi)].map(match=>match[1])).filter(name=>info.components.includes(name)&&name!==component);
  item.registryDependencies=[...new Set([...(item.registryDependencies??[]),...localImports])];
  item.registryDependencies = item.registryDependencies?.map(dep => {
    const match = dep.match(/\/registry\/([^/]+)\/([^/]+)\.json$/);
    if (match) return `${origin}/registry/${match[1]}/${match[2]}.json`;
    return info.components.includes(dep) ? `${origin}/registry/${system}/${dep}.json` : dep;
  });
  if (item.cssVars) item.cssVars = Object.fromEntries(Object.entries(item.cssVars).map(([scope,vars])=>[
    scope,Object.fromEntries(Object.entries(vars).map(([name,value])=>[name.replace(/^--/,''),value])),
  ]));
  if (component === 'globals') {
    const css = item.files?.filter(file => file.path.endsWith('.css')).map(file => file.content).join('\n') ?? '';
    inlineRegistryCss(item, css, true);
  }
  return item;
}

export async function tokensCss(system: string) {
  const item = await sourceItem(system, 'globals');
  return item.files?.find(f => f.path.endsWith('.css'))?.content ?? '';
}

export async function systemWithComponents(id: string, options: {includeComponents?: boolean; componentNames?: string[]; includeComponentCode?: boolean} = {}) {
  const metadata = (await catalog()).find(s => s.id === id);
  if (!metadata) return null;
  const names = options.componentNames ?? metadata.components;
  const components = options.includeComponents === false ? [] : await Promise.all(names.filter(n => metadata.components.includes(n)).map(async name => {
    const item = await sourceItem(id, name);
    return { id: `${id}/${name}`, name, description: item.description ?? `${metadata.title} ${name}`, code: options.includeComponentCode === false ? '' : (item.files ?? []).map(f => f.content).join('\n') };
  }));
  return { metadata, components };
}
