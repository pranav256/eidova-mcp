import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { registryItem, sourceItem, tokensCss, baseUrl } from './catalog.js';
import type { JsonStore } from './store.js';
import { cssRules, tokenScopes, inlineRegistryCss, type TokenScopes } from './registry-css.js';
import { extractFromSources, formatExtraction } from '../vendor/upstream/runtime.mjs';

const color = z.string().max(100).regex(/^(?:#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|(?:oklch|oklab|rgb|rgba|hsl|hsla)\([\d\s.%+,/\-]+\)|[a-zA-Z]+)$/);
export const configSchema = z.object({
  colors: z.partialRecord(z.enum(['primary','primaryForeground','secondary','secondaryForeground','accent','accentForeground','muted','mutedForeground','destructive','destructiveForeground','background','foreground','card','cardForeground','popover','popoverForeground','border','input','ring']), color).optional(),
  radius: z.string().max(30).regex(/^\d+(?:\.\d+)?(?:px|rem|em)$/).optional(),
  font: z.object({sans: z.string().regex(/^[A-Za-z0-9 _,-]{1,100}$/).optional(), mono: z.string().regex(/^[A-Za-z0-9 _,-]{1,100}$/).optional()}).optional(),
  icons: z.object({libraryId: z.literal('lucide').optional(), variant: z.enum(['outline']).nullable().optional()}).optional(),
  density: z.enum(['compact','comfortable','spacious']).optional(),
}).strict();
export type DesignConfig = z.infer<typeof configSchema>;
export type ThemeProject = {id: string; owner: string; name: string; baseDesignSystemId: string; brandCss?: string; config: DesignConfig; createdAt: string};

function declarations(selector: string, values: Record<string, string>): string {
  const lines = Object.entries(values).map(([name, value]) => `  ${name}: ${value};`);
  return lines.length ? `${selector} {\n${lines.join('\n')}\n}` : '';
}

/** Only extracted declarations are retained; caller CSS never contributes rules or imports. */
function brandTokens(css: string): TokenScopes {
  const scopes = tokenScopes(css);
  for (const scope of [scopes.light, scopes.dark]) {
    for (const [name, value] of Object.entries(scope)) {
      if (!/^--[a-z][a-z0-9-]{0,80}$/.test(name) || /[{}<>;]|url\s*\(|expression\s*\(|@import/i.test(value)) delete scope[name];
    }
  }
  return scopes;
}

function fontStack(value: string, fallback: string): string {
  const families = value.split(',').map(family => family.trim()).filter(Boolean).map(family => /\s/.test(family) ? JSON.stringify(family) : family);
  if (!families.some(family => /^(?:sans-serif|serif|monospace|system-ui|ui-sans-serif|ui-serif|ui-monospace)$/i.test(family))) families.push(fallback);
  return families.join(', ');
}

export class Projects {
  constructor(private store: JsonStore, readonly identity?: string) {}
  async create(input: {value: string; designSystemId?: string; brandCss?: string}) {
    if (!this.identity) throw new Error('Creating a persistent theme needs a workspace key. Anonymous catalog, guidance and review tools remain available.');
    const base = input.designSystemId ?? 'minimal-light';
    await sourceItem(base, 'globals');
    const id = randomUUID();
    let brandCss: string | undefined;
    if (input.brandCss) {
      const extracted = formatExtraction(extractFromSources([{name:'supplied brand',kind:'css',content:input.brandCss}], 'Supplied brand'));
      const sheet = extracted.match(/```css\s*\n([\s\S]*?)```/)?.[1]?.trim();
      const scopes = brandTokens(sheet ?? '');
      brandCss = [declarations(':root', scopes.light), declarations('.dark', scopes.dark)].filter(Boolean).join('\n\n');
      if (!brandCss) throw new Error('No usable semantic tokens were found in brandCss.');
    }
    const project: ThemeProject = {id, owner: this.identity, name: input.value.split('\n')[0].slice(0,80), baseDesignSystemId:base, brandCss, config:{}, createdAt:new Date().toISOString()};
    await this.store.set(`projects/${id}`, project);
    return project;
  }
  async get(id: string) {
    if (!/^[a-f0-9-]{36}$/.test(id)) return null;
    return this.store.get<ThemeProject>(`projects/${id}`);
  }
  async setConfig(id: string, config: unknown) {
    if (!this.identity) throw new Error('A workspace key is required for editing.');
    const parsed = configSchema.parse(config);
    return this.store.update<ThemeProject>(`projects/${id}`, project => {
      if (!project || project.owner !== this.identity) throw new Error('Project not found in this workspace.');
      return {...project, config:{...project.config,...parsed, colors:{...project.config.colors,...parsed.colors}, font:{...project.config.font,...parsed.font}, icons:{...project.config.icons,...parsed.icons}}};
    });
  }
  async css(project: ThemeProject) {
    const baseline = await tokensCss(project.baseDesignSystemId);
    const {colors, radius, font, density} = project.config;
    const brand = brandTokens(project.brandCss ?? '');
    const baseTokens = tokenScopes(baseline);
    const baselineRules = cssRules(baseline);
    const baseLayer = baselineRules['@layer base'];
    const html = typeof baseLayer === 'object' ? baseLayer.html : undefined;
    const inheritedFont = typeof html === 'object' && typeof html['font-family'] === 'string' ? html['font-family'] : 'system-ui, sans-serif';
    const defaults: Record<string, string> = {};
    const overrides: Record<string, string> = Object.fromEntries(Object.entries(colors ?? {}).map(([name,value]) => [`--${name.replace(/[A-Z]/g,s=>'-'+s.toLowerCase())}`, value]));
    if (radius) overrides['--radius'] = radius;
    if (font?.sans) overrides['--font-sans'] = fontStack(font.sans, 'system-ui, sans-serif');
    else if (!brand.light['--font-sans'] && !baseTokens.light['--font-sans']) {
      defaults['--font-sans'] = inheritedFont.includes('var(--font-sans') ? 'system-ui, sans-serif' : inheritedFont;
    }
    if (font?.mono) overrides['--font-mono'] = fontStack(font.mono, 'ui-monospace, monospace');
    else if (!brand.light['--font-mono'] && !baseTokens.light['--font-mono']) defaults['--font-mono'] = 'ui-monospace, monospace';
    if (density) {
      const unit = {compact:16,comfortable:24,spacious:32}[density];
      Object.assign(overrides, {'--layout-page-inset':`${unit}px`,'--layout-section-gap':`${unit}px`,'--layout-card-padding':`${unit}px`});
    }
    return [
      baseline,
      declarations(':root', defaults),
      declarations(':root', brand.light),
      declarations('.dark', brand.dark),
      declarations(':root', overrides),
      // Explicit configuration is shared across modes; a more specific dark
      // selector must not restore the catalog color or font after that choice.
      declarations('.dark', overrides),
      '@layer base {\n  html { font-family: var(--font-sans, system-ui, sans-serif); }\n  code, kbd, pre, samp { font-family: var(--font-mono, ui-monospace, monospace); }\n}',
    ].filter(Boolean).join('\n\n');
  }
  async item(project: ThemeProject, component: string) {
    const css = await this.css(project);
    const item = await registryItem(project.baseDesignSystemId, component);
    inlineRegistryCss(item, css, component === 'globals');
    const prefix = `${baseUrl()}/api/projects/${project.id}/registry/`;
    item.registryDependencies = item.registryDependencies?.map(dep=>dep.replace(`${baseUrl()}/registry/${project.baseDesignSystemId}/`,prefix));
    if (component === 'all') item.meta = {globalsCss:css,iconLibrary:{id:'lucide',name:'Lucide',prefix:'lucide',variant:'outline'}};
    return item;
  }
}
