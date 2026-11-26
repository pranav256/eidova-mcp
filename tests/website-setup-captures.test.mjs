import test from 'node:test';
import assert from 'node:assert/strict';
import { websiteSpacingBatches } from '../scripts/website-spacing-batches.mjs';
import * as setupCapture from '../scripts/website-spacing-batches.mjs';

const clients = ['Codex', 'Claude Code', 'Claude Desktop', 'Cursor', 'VS Code', 'Server URL'];

test('captures every setup family at each review width for complete spacing batches', async () => {
  assert.equal(typeof setupCapture.WEBSITE_REVIEW_WIDTHS?.[Symbol.iterator], 'function');
  assert.equal(typeof setupCapture.captureWebsiteSetupStates, 'function');

  const captured = [];
  const artifacts = [];
  for (const width of setupCapture.WEBSITE_REVIEW_WIDTHS) {
    let selected;
    const page = {
      viewportSize: () => ({ width, height: 1000 }),
      getByRole: (role, options) => ({ click: async () => { selected = options.name; } }),
      evaluate: async () => ({ viewport: { width }, selected }),
    };
    const states = await setupCapture.captureWebsiteSetupStates({
      page,
      script: () => {},
      clients,
      save: async (name, state) => { artifacts.push([name, state]); },
    });
    captured.push(...states);
  }

  assert.equal(captured.length, clients.length * setupCapture.WEBSITE_REVIEW_WIDTHS.length);
  assert.deepEqual(artifacts.map(([name]) => name), setupCapture.WEBSITE_REVIEW_WIDTHS.flatMap(width => clients.map((_, index) => `setup-state-${width}-${index}`)));
  for (const width of setupCapture.WEBSITE_REVIEW_WIDTHS) {
    for (const client of clients) {
      const state = captured.find(item => item.name === `${width}px ${client} setup`);
      assert.equal(state?.viewport.width, width);
      assert.equal(state?.selected, client);
    }
  }

  const batches = websiteSpacingBatches(captured);
  assert.equal(batches.length, clients.length);
  for (const [index, client] of clients.entries()) {
    assert.deepEqual(batches[index].states.map(state => state.viewport.width), setupCapture.WEBSITE_REVIEW_WIDTHS);
    assert.deepEqual(batches[index].states.map(state => state.name), setupCapture.WEBSITE_REVIEW_WIDTHS.map(width => `${width}px ${client} setup`));
  }
});
