import { resourcePath } from './resources.js';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { VIDEO_COMPONENT_CATALOG, VIDEO_COMPONENT_FILES } from '../vendor/upstream/runtime.mjs';
import { inlineRegistryCss } from './registry-css.js';

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
};

const REGISTRY_ROOT = process.env.OPEN_DESIGN_ASSETS_DIR ? path.resolve(process.env.OPEN_DESIGN_ASSETS_DIR) : resourcePath('assets/registry');
const slug = /^[a-z0-9][a-z0-9_-]{0,80}$/;
const cache = new Map<string, RegistryItem>();
let catalogPromise: Promise<CatalogSystem[]> | undefined;
const tags: Record<string, string> = {
  linear: 'minimal precise developer productivity', stripe: 'professional fintech payments clear',
  notion: 'minimal documents collaboration neutral', airbnb: 'warm travel marketplace friendly',
  apple: 'minimal consumer polished', supabase: 'developer technical database dark',
  'minimal-light': 'minimal neutral light professional', 'corporate-fintech': 'professional finance corporate',
  'editorial-dark': 'editorial expressive dark', 'light-marketplace': 'commerce warm light marketplace',
};

export const baseUrl = () => (process.env.OPEN_DESIGN_BASE_URL ??
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
      return {
        id: dir.name, title, description: `${title}: reusable React components and CSS tokens from the MIT licensed upstream registry.`,
        personality: style.split(' '), industry: style.split(' ').filter(t => ['developer', 'finance', 'commerce', 'travel', 'consumer'].includes(t)),
        componentCount: entries.filter(e => !/^(globals|_shared|use-|.*-utils)/.test(e)).length,
        primaryColor: vars.primary ?? vars['--primary'] ?? css.match(/--primary\s*:\s*([^;]+)/)?.[1] ?? '#171717',
        borderRadius: vars.radius ?? vars['--radius'] ?? css.match(/--radius\s*:\s*([^;]+)/)?.[1] ?? '0.75rem',
        font: css.match(/--font-sans\s*:\s*([^;]+)/)?.[1] ?? css.match(/font-family\s*:\s*([^;]+)/)?.[1] ?? 'system-ui',
        iconLibraryId: 'lucide', iconVariant: 'outline', components: entries,
      };
    }));
  })();
  return structuredClone(await catalogPromise);
}

export async function searchCatalog(query: string, limit = 5) {
  const words = query.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return (await catalog()).map(system => {
    const text = `${system.id} ${system.title} ${system.description} ${system.personality.join(' ')} ${system.industry.join(' ')}`.toLowerCase();
    const matchScore = words.reduce((score, word) => score + (text.includes(word) ? 1 : 0), 0) / Math.max(words.length, 1);
    return { ...system, matchScore };
  }).sort((a, b) => b.matchScore - a.matchScore || a.id.localeCompare(b.id)).slice(0, Math.min(limit, 20));
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
