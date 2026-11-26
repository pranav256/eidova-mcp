import test from 'node:test';
import assert from 'node:assert/strict';
import { assertWebsiteSourceReview } from '../scripts/website-source-review-gate.mjs';

const clean = () => ({
  structuredContent: {
    status: 'no-deterministic-findings', evidence: 'supplied-source', findings: [],
    summary: { critical: 0, serious: 0, moderate: 0, total: 0 }, skipped: [],
  },
});

test('website source review gate accepts complete clean supported-source evidence', () => {
  assert.doesNotThrow(() => assertWebsiteSourceReview(clean()));
});

test('website source review gate rejects critical and serious findings', () => {
  for (const severity of ['critical', 'serious']) {
    const result = clean();
    result.structuredContent.findings.push({ severity });
    result.structuredContent.summary[severity] = 1;
    assert.throws(() => assertWebsiteSourceReview(result), new RegExp(`found ${severity} issues`));
  }
});

test('website source review gate rejects partial coverage and tool errors', () => {
  const partial = clean();
  partial.structuredContent.status = 'partial';
  partial.structuredContent.skipped = ['unsupported.json'];
  assert.throws(() => assertWebsiteSourceReview(partial), /coverage is incomplete/);
  assert.throws(() => assertWebsiteSourceReview({ isError: true }), /tool failed/);
  assert.throws(() => assertWebsiteSourceReview({}), /coverage is incomplete/);
});
