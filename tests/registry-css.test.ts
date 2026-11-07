import assert from 'node:assert/strict';
import test from 'node:test';
import { catalog, registryItem, sourceItem, tokensCss, type RegistryItem } from '../src/catalog.js';
import { cssRules, inlineRegistryCss } from '../src/registry-css.js';

test('catalog globals inline full styles and preserve the raw source assets', async () => {
  const before = await sourceItem('minimal-light', 'globals');
  const source = await tokensCss('minimal-light');
  const item = await registryItem('minimal-light', 'globals');
  assert.deepEqual(item.files, []);
  const styles = item.css as ReturnType<typeof cssRules>;
  assert.equal(styles['@theme inline'], undefined);
  assert.equal(item.cssVars!.theme['color-primary'], 'var(--primary)');
  assert.equal(item.cssVars!.theme['radius-xl'], 'calc(var(--radius) + 4px)');
  const base = styles['@layer base'] as ReturnType<typeof cssRules>;
  assert.match((base.html as Record<string,string>)['font-family'], /Geist/);
  assert.ok(base.body);
  assert.ok(base['*']);
  assert.deepEqual(styles['@import "tailwindcss"'], {});
  assert.deepEqual(styles['@import "tw-animate-css"'], {});
  assert.equal(item.cssVars!.dark.primary, item.cssVars!.light.primary, 'single-theme tokens also replace consumer dark defaults');
  assert.deepEqual(await sourceItem('minimal-light', 'globals'), before);
  assert.equal(await tokensCss('minimal-light'), source);
});

test('CSS conversion retains quoted delimiters, nested rules and repeated base layers', () => {
  const source = ':root { --primary: #abc; } .dark { --primary: #def; } @layer base { html { font-family: "A; B", sans-serif; } } @layer base { body::before { content: "a:};b"; transform: translate(1px, 2px); } } @theme inline { --animate-enter: enter 1s ease; @keyframes enter { from { opacity: 0; } to { opacity: 1; } } }';
  const item: RegistryItem = {name:'parser-test',cssVars:{theme:{'--color-primary':'var(--primary)'}}};
  inlineRegistryCss(item, source);
  const styles = item.css as ReturnType<typeof cssRules>;
  const base = styles['@layer base'] as ReturnType<typeof cssRules>;
  assert.equal((base.html as Record<string,string>)['font-family'], '"A; B", sans-serif');
  assert.equal((base['body::before'] as Record<string,string>).content, '"a:};b"');
  assert.equal(item.cssVars!.theme['animate-enter'], 'enter 1s ease');
  assert.equal(item.cssVars!.theme['color-primary'], 'var(--primary)');
  assert.equal(item.cssVars!.light.primary, '#abc');
  assert.equal(item.cssVars!.dark.primary, '#def');
  assert.deepEqual(styles['@keyframes enter'], {from:{opacity:'0'},to:{opacity:'1'}});
  assert.equal(styles['@theme inline'], undefined);
});

test('all catalog globals expose inline CSS with normalized variables and no detached sheets', async () => {
  for (const system of await catalog()) {
    const item = await registryItem(system.id, 'globals');
    assert.equal(item.files?.some(file => file.path.endsWith('.css')), false, system.id);
    assert.ok(item.css, system.id);
    assert.ok(Object.values(item.cssVars!).every(scope => Object.keys(scope).every(key => !key.startsWith('--'))), system.id);
    assert.ok(item.dependencies!.includes('tailwindcss'), system.id);
  }
});
