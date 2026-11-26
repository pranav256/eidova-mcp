import assert from 'node:assert/strict';

export function assertWebsiteSourceReview(result) {
  assert.ok(!result?.isError, 'Source review tool failed');
  const report = result?.structuredContent;
  assert.ok(['findings', 'no-deterministic-findings'].includes(report?.status),
    'Source review coverage is incomplete or unavailable');
  assert.equal(report?.evidence, 'supplied-source');
  assert.deepEqual(report?.skipped, []);
  assert.ok(Array.isArray(report?.findings), 'Source review findings are missing');
  assert.equal(report?.summary?.critical, 0, 'Source review found critical issues');
  assert.equal(report?.summary?.serious, 0, 'Source review found serious issues');
  assert.equal(report.findings.some(finding => ['critical', 'serious'].includes(finding.severity)), false,
    'Source review contains critical or serious findings');
}
