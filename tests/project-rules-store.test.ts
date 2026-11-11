import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ProjectRulesStore, type ProjectRuleEntry, type ProjectRuleInput, type ProjectRuleRequest, type ProjectScreenContext } from '../src/project-rules-store.js';
import { createProvider } from '../src/provider.js';
import { LocalFileStore, MAX_DOCUMENT_BYTES, type JsonStore } from '../src/store.js';
// The shipped algorithm is an independent compatibility oracle, used only in tests.
const { selectScreenContext } = await import(new URL('../vendor/upstream/src/project-rules.ts', import.meta.url).href) as {
  selectScreenContext(entries: readonly ProjectRuleEntry[], request: ProjectRuleRequest): ProjectScreenContext;
};

class BoundedMemoryStore implements JsonStore {
  readonly records = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | null> { return structuredClone((this.records.get(key) as T | undefined) ?? null); }
  async set(key: string, value: unknown): Promise<void> {
    assert.ok(Buffer.byteLength(JSON.stringify(value), 'utf8') <= MAX_DOCUMENT_BYTES, 'Storage document cap');
    this.records.set(key, structuredClone(value));
  }
  async update<T>(key: string, update: (current: T | null) => T): Promise<T> {
    const result = update(structuredClone((this.records.get(key) as T | undefined) ?? null));
    await this.set(key, result);
    return result;
  }
}

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'eidova-project-rules-'));
  const store = new LocalFileStore(directory);
  const projectId = randomUUID();
  await store.set(`projects/${projectId}`, { owner: 'alice' });
  return { directory, store, projectId, alice: new ProjectRulesStore(store, 'alice'), cleanup: async () => {
    assert.ok(directory.startsWith(path.join(os.tmpdir(), 'eidova-project-rules-')));
    await rm(directory, { recursive: true, force: true });
  } };
}

test('project rule context matches the shipped screen/part selection and persists across providers', async () => {
  const f = await fixture();
  const entries: ProjectRuleEntry[] = [
    { kind: 'guidelines', screen: '', part: '', markdown: 'Keep the chosen brand.' },
    { kind: 'never', screen: '', part: '', markdown: 'Never use fabricated claims.' },
    { kind: 'use', screen: '', part: 'button', markdown: 'Use semantic button variants.' },
    { kind: 'pairing', screen: '', part: 'input', markdown: 'Pair inputs with visible labels.' },
    { kind: 'never', screen: '', part: 'dialog', markdown: 'Never trap focus without dismissal.' },
    { kind: 'spec', screen: 'sign up', part: '', markdown: 'Ask for email first.' },
    { kind: 'spec', screen: 'sign up', part: 'input', markdown: 'Keep email after errors.' },
    { kind: 'spec', screen: 'billing', part: '', markdown: 'Show billing history.' },
  ];
  try {
    for (const entry of entries) assert.equal(await f.alice.save(f.projectId, entry), 'saved');
    const fresh = createProvider(new LocalFileStore(f.directory), 'alice');
    for (const request of [{}, { screen: ' SIGN   UP ', parts: [' Button '] }, { screen: 'billing', parts: ['dialog'] }]) {
      assert.deepEqual(await fresh.getProjectScreenContext('caller-cannot-change-owner', f.projectId, request), selectScreenContext(entries, request));
    }
    await assert.rejects(createProvider(f.store, 'bob').getProjectScreenContext('alice', f.projectId, {}), /not found/);
    await assert.rejects(createProvider(f.store).getProjectScreenContext('alice', f.projectId, {}), /workspace key/);
    assert.equal(createProvider(f.store).saveProjectRule, undefined);
    await assert.rejects(new ProjectRulesStore(f.store, 'bob').save(f.projectId, { markdown: 'Foreign overwrite' }), /not found/);
  } finally { await f.cleanup(); }
});

test('same normalized slot refuses unapproved replacement and concurrent saves preserve the first rule', async () => {
  const f = await fixture();
  try {
    const first = { kind: 'use', part: 'PRIMARY   Button', markdown: ' First rule. ' } satisfies ProjectRuleInput;
    assert.equal(await f.alice.save(f.projectId, first), 'saved');
    assert.equal(await f.alice.save(f.projectId, { kind: 'use', part: ' primary button ', markdown: 'First rule.' }), 'saved');
    assert.equal(await f.alice.save(f.projectId, { ...first, markdown: 'Second rule.' }), 'refused');
    assert.equal((await f.alice.getContext(f.projectId, { parts: ['primary button'] })).rules[0].markdown, 'First rule.');
    assert.equal(await f.alice.save(f.projectId, { ...first, markdown: 'Second rule.' }, true), 'saved');
    const fresh = new ProjectRulesStore(new LocalFileStore(f.directory), 'alice');
    const results = await Promise.all([
      f.alice.save(f.projectId, { screen: 'new screen', markdown: 'A' }),
      fresh.save(f.projectId, { screen: 'NEW SCREEN', markdown: 'B' }),
    ]);
    assert.deepEqual([...results].sort(), ['refused', 'saved']);
    const concurrent = await Promise.all(Array.from({ length: 20 }, (_, i) => fresh.save(f.projectId, { kind: 'use', part: `part ${i}`, markdown: `Rule ${i}` })));
    assert.ok(concurrent.every(result => result === 'saved'));
    const selected = await fresh.getContext(f.projectId, { parts: Array.from({ length: 20 }, (_, i) => `part ${i}`) });
    assert.equal(selected.rules.length, 20);
  } finally { await f.cleanup(); }
});

test('slot defaults, byte limits and invalid slot combinations preserve the published contract', async () => {
  const store = new BoundedMemoryStore();
  const projectId = randomUUID();
  await store.set(`projects/${projectId}`, { owner: 'alice' });
  const rules = new ProjectRulesStore(store, 'alice');
  assert.equal(await rules.save(projectId, { markdown: 'g'.repeat(32 * 1024) }), 'saved');
  assert.equal(await rules.save(projectId, { screen: 'sign-up', markdown: '🧭'.repeat(1024) }), 'saved');
  await assert.rejects(rules.save(projectId, { screen: 'other', markdown: '🧭'.repeat(1025) }), /4096 UTF-8 bytes/);
  await assert.rejects(rules.save(projectId, { markdown: 'g'.repeat(32 * 1024 + 1) }, true), /32768 UTF-8 bytes/);
  await assert.rejects(createProvider(store, 'alice').saveTeamRules!('caller-id', '🧭'.repeat(8193), false), /32768 UTF-8 bytes/);
  for (const input of [
    { kind: 'spec' }, { kind: 'use' }, { kind: 'pairing' }, { part: 'Button' },
    { kind: 'guidelines', part: 'Button' }, { kind: 'never', screen: 'sign-up' },
    { screen: 'x'.repeat(121) }, { kind: 'use', part: 'x'.repeat(121) },
  ] as Omit<ProjectRuleInput, 'markdown'>[]) {
    await assert.rejects(rules.save(projectId, { ...input, markdown: 'Example' }));
  }
  await assert.rejects(rules.save(projectId, { markdown: ' \n ' }));
  await assert.rejects(rules.getContext(projectId, { parts: Array.from({ length: 51 }, () => 'button') }), /50 parts/);
  assert.equal((await rules.getContext(projectId, { screen: 'sign-up' })).specs[0].kind, 'spec');
});

test('all 500 large rule slots fit bounded storage documents and adding slot 501 is refused', async () => {
  const store = new BoundedMemoryStore();
  const projectId = randomUUID();
  await store.set(`projects/${projectId}`, { owner: 'alice' });
  const rules = new ProjectRulesStore(store, 'alice');
  for (let i = 0; i < 500; i++) {
    assert.equal(await rules.save(projectId, { kind: 'use', part: `部${'a'.repeat(110)}${i}`, markdown: 'x'.repeat(4096) }), 'saved');
  }
  await assert.rejects(rules.save(projectId, { kind: 'use', part: 'overflow', markdown: 'Too many' }), /500 rule slots/);
  const context = await rules.getContext(projectId);
  assert.equal(context.otherParts.length, 500);
  assert.equal(await rules.save(projectId, { kind: 'use', part: `部${'a'.repeat(110)}0`, markdown: 'Replacement' }, true), 'saved');
});

test('a failed manifest commit leaves the previous rule readable and does not publish a partial save', async () => {
  const f = await fixture();
  try {
    await f.alice.save(f.projectId, { markdown: 'Saved guidelines' });
    let fail = true;
    const broken: JsonStore = {
      get: f.store.get.bind(f.store), set: f.store.set.bind(f.store),
      update: async (key, update) => {
        if (fail) { fail = false; throw new Error('Storage unavailable'); }
        return f.store.update(key, update);
      },
    };
    const editor = new ProjectRulesStore(broken, 'alice');
    await assert.rejects(editor.save(f.projectId, { markdown: 'Incomplete replacement' }, true), /Storage unavailable/);
    assert.equal((await f.alice.getContext(f.projectId)).guidelines, 'Saved guidelines');
    assert.equal(await editor.save(f.projectId, { markdown: 'Completed replacement' }, true), 'saved');
    assert.equal((await f.alice.getContext(f.projectId)).guidelines, 'Completed replacement');
  } finally { await f.cleanup(); }
});
