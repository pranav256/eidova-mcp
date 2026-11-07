import assert from 'node:assert/strict';
import test from 'node:test';
import { Projects, type ThemeProject } from '../src/projects.js';
import { registryItem } from '../src/catalog.js';
import type { JsonStore } from '../src/store.js';

class MemoryStore implements JsonStore {
  private documents = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | null> { return structuredClone(this.documents.get(key) ?? null) as T | null; }
  async set(key: string, value: unknown): Promise<void> { this.documents.set(key, structuredClone(value)); }
  async update<T>(key: string, update: (value: T | null) => T): Promise<T> {
    const value = update(await this.get<T>(key));
    await this.set(key, value);
    return structuredClone(value);
  }
}

test('custom colors survive child registry installs rather than restoring base colors', async () => {
  const projects = new Projects(new MemoryStore(), 'test-owner');
  const project = await projects.create({value:'Custom registry', designSystemId:'minimal-light'});
  const configured = await projects.setConfig(project.id, {
    colors: {primary:'#123456', primaryForeground:'#ffffff', background:'#e8eef5', input:'#d7e0eb', cardForeground:'#223344'},
    radius:'10px', font:{sans:'Arial, Helvetica, sans-serif', mono:'Courier New'}, density:'compact',
  });
  const base = await registryItem('minimal-light', 'button');
  assert.notEqual(base.cssVars!.light.primary, '#123456');
  for (const name of ['globals', 'button', 'input', 'alert-dialog', 'all']) {
    const item = await projects.item(configured, name);
    assert.equal(item.cssVars!.light.primary, '#123456', name);
    assert.equal(item.cssVars!.dark.primary, '#123456', name);
    assert.equal(item.cssVars!.light['primary-foreground'], '#ffffff');
    assert.equal(item.cssVars!.light['card-foreground'], '#223344');
    assert.equal(item.cssVars!.light.input, '#d7e0eb');
    assert.equal(item.cssVars!.light.radius, '10px');
    assert.equal(item.cssVars!.light['font-sans'], 'Arial, Helvetica, sans-serif');
    assert.equal(item.cssVars!.light['font-mono'], '"Courier New", ui-monospace, monospace');
    assert.equal(item.cssVars!.light['layout-page-inset'], '16px');
    assert.ok(Object.values(item.cssVars!).every(scope => Object.keys(scope).every(key => !key.startsWith('--'))));
    assert.ok(item.registryDependencies?.every(dependency => !dependency.includes('/registry/minimal-light/')) ?? true);
  }
  assert.equal((await registryItem('minimal-light', 'button')).cssVars!.light.primary, base.cssVars!.light.primary, 'project overrides must not mutate the shared catalog');
});

test('brand light and dark tokens remain separate, and explicit config overrides both', async () => {
  const projects = new Projects(new MemoryStore(), 'test-owner');
  const created = await projects.create({value:'Two modes', designSystemId:'minimal-light'});
  const project: ThemeProject = {
    ...created,
    brandCss: ':root { --primary: #112233; --background: #fafafa; --font-sans: Arial, sans-serif; }\n.dark { --primary: #ddeeff; --background: #101010; --font-sans: Georgia, serif; }',
  };
  const before = await projects.item(project, 'button');
  assert.equal(before.cssVars!.light.primary, '#112233');
  assert.equal(before.cssVars!.dark.primary, '#ddeeff');
  assert.equal(before.cssVars!.light.background, '#fafafa');
  assert.equal(before.cssVars!.dark.background, '#101010');
  assert.equal(before.cssVars!.light['font-sans'], 'Arial, sans-serif');
  assert.equal(before.cssVars!.dark['font-sans'], 'Georgia, serif');
  const configured = {...project, config:{colors:{primary:'#654321'},font:{sans:'Verdana'}}};
  const after = await projects.item(configured, 'input');
  assert.equal(after.cssVars!.light.primary, '#654321');
  assert.equal(after.cssVars!.dark.primary, '#654321');
  assert.equal(after.cssVars!.dark.background, '#101010');
  assert.equal(after.cssVars!.light['font-sans'], 'Verdana, system-ui, sans-serif');
  assert.equal(after.cssVars!.dark['font-sans'], 'Verdana, system-ui, sans-serif');
});

test('globals inline the full base stylesheet and real font rules into the consumer CSS pipeline', async () => {
  const projects = new Projects(new MemoryStore(), 'test-owner');
  const project = await projects.create({value:'Inline globals', designSystemId:'minimal-light'});
  const globals = await projects.item(project, 'globals');
  assert.deepEqual(globals.files, [], 'detached CSS is not assumed to be imported');
  const css = globals.css as Record<string, Record<string, string | Record<string,string>>>;
  assert.equal(css['@theme inline'], undefined, 'theme declarations must use the supported cssVars.theme path');
  assert.equal(globals.cssVars!.theme['color-primary'], 'var(--primary)');
  assert.equal(globals.cssVars!.theme['radius-xl'], 'calc(var(--radius) + 4px)');
  assert.ok(css['@layer base']['*']);
  assert.equal((css['@layer base'].html as Record<string,string>)['font-family'], 'var(--font-sans, system-ui, sans-serif)');
  assert.ok(css['@layer base'].body);
  assert.equal((css['@layer base']['code, kbd, pre, samp'] as Record<string,string>)['font-family'], 'var(--font-mono, ui-monospace, monospace)');
  assert.ok(globals.dependencies!.includes('tailwindcss'));
  assert.ok(globals.dependencies!.includes('tw-animate-css'));
});

test('brand extraction retains scoped tokens without accepting caller rules or imports', async () => {
  const projects = new Projects(new MemoryStore(), 'test-owner');
  const project = await projects.create({
    value:'Extracted scopes', designSystemId:'minimal-light',
    brandCss: ':root { --primary: #123456; --font-sans: Arial, sans-serif; } .dark { --primary: #abcdef; } body { display:none; } @import "https://example.com/private.css";',
  });
  assert.match(project.brandCss!, /:root/);
  assert.match(project.brandCss!, /\.dark/);
  assert.doesNotMatch(project.brandCss!, /display\s*:\s*none|@import|example\.com/);
  const item = await projects.item(project, 'input');
  assert.notEqual(item.cssVars!.light.primary, item.cssVars!.dark.primary);
  assert.equal(item.cssVars!.light['font-sans'], 'Arial, sans-serif');
});

test('custom color validation rejects unsupported hexadecimal lengths', async () => {
  const projects = new Projects(new MemoryStore(), 'test-owner');
  const project = await projects.create({value:'Color formats', designSystemId:'minimal-light'});
  for (const primary of ['#12345', '#1234567']) await assert.rejects(projects.setConfig(project.id, {colors:{primary}}));
  for (const primary of ['#123', '#1234', '#123456', '#12345678']) {
    assert.equal((await projects.setConfig(project.id, {colors:{primary}})).config.colors!.primary, primary);
  }
});
