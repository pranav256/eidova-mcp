import { posix } from 'node:path';
import { z } from 'zod';
import { catalog, registryItem } from './catalog.js';

const projectPath = z.string().min(1).max(500).transform(path => path.replaceAll('\\', '/').replace(/^\.\//, ''))
  .refine(path => !!path && !/[:\u0000-\u001f]/.test(path) && !path.startsWith('/') && !path.split('/').includes('..'), 'Use a project-relative path.');
const inventorySchema = z.object({
  files: z.array(projectPath).max(50_000),
  paths: z.object({ ui: projectPath, lib: projectPath, css: projectPath, utils: projectPath }),
  registries: z.record(z.string(), z.unknown()).optional(),
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
});

export async function previewInstall(system: string, components: string[], input: unknown) {
  const inventory = inventorySchema.parse(input);
  const theme = (await catalog()).find(item => item.id === system);
  if (!theme) throw new Error('Unknown React theme: ' + system);
  if (!components.length || components.some(name => !theme.components.includes(name))) {
    throw new Error('Select one or more component names from the theme, such as button or globals.');
  }
  const existing = new Set(inventory.files.map(path => posix.normalize(path)));
  const files = new Map<string, Set<string>>();
  const dependencies = new Set<string>();
  const registryDependencies = new Set<string>();
  const visited = new Set<string>();
  const origin = 'https://eidova-mcp.vercel.app';

  function add(path: string, component: string) {
    const target = posix.normalize(path);
    if (!files.has(target)) files.set(target, new Set());
    files.get(target)!.add(component);
  }

  async function visit(component: string) {
    if (visited.has(component)) return;
    visited.add(component);
    const item = await registryItem(system, component, origin);
    for (const file of item.files ?? []) {
      if (file.target) add(projectPath.parse(file.target), component);
      else {
        const directory = file.type === 'registry:lib' ? inventory.paths.lib : inventory.paths.ui;
        add(posix.join(directory, posix.basename(file.path)), component);
      }
    }
    if (item.css || item.cssVars) add(inventory.paths.css, component);
    for (const dependency of item.dependencies ?? []) dependencies.add(dependency);
    for (const dependency of item.registryDependencies ?? []) {
      const prefix = origin + '/registry/' + system + '/';
      if (dependency.startsWith(prefix) && dependency.endsWith('.json')) await visit(dependency.slice(prefix.length, -5));
      else if (dependency === 'utils' && existing.has(posix.normalize(inventory.paths.utils))) continue;
      else registryDependencies.add(dependency);
    }
  }
  for (const component of components) await visit(component);

  const declared = { ...inventory.devDependencies, ...inventory.dependencies };
  return {
    system,
    items: [...visited],
    files: [...files].sort(([a], [b]) => a.localeCompare(b)).map(([path, sources]) => ({
      path,
      status: existing.has(path) ? 'existing' : 'new',
      sources: [...sources],
    })),
    dependencies: [...dependencies].sort().map(requested => {
      const name = requested.replace(/@[^@]+$/, '');
      return { requested, declared: Object.hasOwn(declared, name) ? declared[name] : null };
    }),
    configuredRegistries: Object.keys(inventory.registries ?? {}).sort(),
    unresolvedRegistryDependencies: [...registryDependencies].sort(),
  };
}
