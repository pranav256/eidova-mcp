import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffTokens } from '../src/token-diff.js';
import { previewInstall } from '../src/install-preview.js';

test('token diff reports mode-scoped additions, removals and changes', () => {
  const before = ':root { --primary: #111111; } .dark { --primary: #eeeeee; --radius: 8px; }';
  const after = ':root { --primary: #222222; --background: #fff; } .dark { --primary: #eeeeee; }';
  assert.deepEqual(diffTokens(before, after, 'css').changes, [
    { scope: 'light', path: ['--background'], kind: 'added', before: undefined, after: { type: undefined, value: '#fff' } },
    { scope: 'light', path: ['--primary'], kind: 'changed', before: { type: undefined, value: '#111111' }, after: { type: undefined, value: '#222222' } },
    { scope: 'dark', path: ['--radius'], kind: 'removed', before: { type: undefined, value: '8px' }, after: undefined },
  ]);
});

test('install preview resolves local dependencies and flags conflicts', async () => {
  const result = await previewInstall('minimal-light', ['button'], {
    files: ['src/components/ui/button.tsx', 'src/lib/utils.ts'],
    paths: { ui: 'src/components/ui', lib: 'src/lib', css: 'src/index.css', utils: 'src/lib/utils.ts' },
    dependencies: { react: '19.2.0' },
    devDependencies: {},
  });
  assert.ok(result.items.includes('button'));
  assert.equal(result.files.find(file => file.path.endsWith('/button.tsx'))?.status, 'existing');
  assert.ok(result.dependencies.some(dependency => dependency.requested === '@radix-ui/react-slot'));
  assert.deepEqual(result.unresolvedRegistryDependencies, []);
});

test('token diff reports changed DTCG aliases in the dark group', () => {
  const doc = (alias: string) => JSON.stringify({ dark: {
    $extensions: { 'com.better-design.mode': 'dark' },
    accent: { $type: 'color', $value: alias },
  } });
  const { changes } = diffTokens(doc('{primary}'), doc('{secondary}'), 'dtcg');
  assert.equal(changes.length, 1);
  assert.equal(changes[0].scope, 'dark');
  assert.equal(changes[0].after?.value, '{secondary}');
});
