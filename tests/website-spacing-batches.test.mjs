import test from 'node:test';
import assert from 'node:assert/strict';
import { websiteSpacingBatches } from '../scripts/website-spacing-batches.mjs';

const widths = [390, 1440, 1728];
const state = (width, name) => ({name: `${width}px ${name}`, viewport: {width}, elements: []});

test('groups all three widths of one logical capture without changing evidence', () => {
  const captured = widths.map(width => state(width, 'light handoff summary'));
  const batches = websiteSpacingBatches(captured);
  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0].states, captured);
  assert.equal(batches[0].detail, 'full');
  assert.equal(batches[0].tolerance, 2);
});

test('separates interleaved light, dark and distinct capture families', () => {
  const names = ['light handoff summary', 'dark handoff summary', 'light handoff prompt'];
  const captured = widths.flatMap(width => names.map(name => state(width, name)));
  const batches = websiteSpacingBatches(captured);
  assert.equal(batches.length, names.length);
  for (const [index, name] of names.entries()) {
    assert.deepEqual(batches[index].states, widths.map(width => state(width, name)));
  }
});

test('rejects empty, incomplete and duplicate-width families', () => {
  for (const captured of [[], [state(390, 'light')], [state(390, 'light'), state(1440, 'light')],
    [state(390, 'light'), state(1440, 'light'), state(1440, 'light')]]) {
    assert.throws(() => websiteSpacingBatches(captured), /all three viewport widths/);
  }
});

test('rejects an oversized family instead of splitting its coverage', () => {
  const captured = widths.map(width => ({...state(width, 'light'), evidence: 'x'.repeat(1400000)}));
  assert.throws(() => websiteSpacingBatches(captured), /HTTP limit/);
});
