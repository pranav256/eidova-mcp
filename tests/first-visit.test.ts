import assert from 'node:assert/strict';
import test from 'node:test';
import { FIRST_VISIT_WALKS, firstVisitInputSchema, handleFirstVisit } from '../src/first-visit.js';

const report = (walk: typeof FIRST_VISIT_WALKS[number], findings: unknown[] = [], options: Record<string, unknown> = {}) => ({ walk, findings, conditionsApplied: true, finished: true, ...options });
const issue = (options: Record<string, unknown> = {}) => ({ page: '/checkout', element: 'Pay button', kind: 'no-feedback', severity: 'blocks', what: 'Clicking Pay has no result.', ...options });
const emptyWalks = () => FIRST_VISIT_WALKS.map(walk => report(walk));
const output = async (input: unknown) => {
  const reply = await handleFirstVisit(input);
  assert.ok(!reply.isError, JSON.stringify(reply));
  return reply.structuredContent as Record<string, any>;
};

test('brief returns the five metadata scenarios and never claims browser execution', async () => {
  const reply = await output({ step: 'brief', task: 'Buy a ticket', url: 'http://localhost:3000' });
  assert.deepEqual(reply.walks.map((walk: any) => walk.walk), [...FIRST_VISIT_WALKS]);
  assert.equal(reply.tested, false);
  assert.equal(reply.browserOpened, false);
  assert.equal(reply.realVisitorResearch, false);
  assert.equal((await handleFirstVisit({ step: 'brief', task: 'Buy a ticket' })).isError, true);
  assert.equal(firstVisitInputSchema.safeParse({ step: 'brief', task: 'Read', url: 'file:///secret' }).success, false);
});

test('ranking deduplicates issues, counts distinct walks, ranks blockers before frequency and keeps stable IDs', async () => {
  const common = issue({ element: 'Price explanation', severity: 'slows', kind: 'unclear-copy', what: 'The price does not explain its units.' });
  const walks = FIRST_VISIT_WALKS.map((walk, i) => report(walk, i === 0 ? [issue(), common, common] : i < 4 ? [common] : []));
  const reply = await output({ step: 'rank', walks });
  assert.equal(reply.findings.length, 2);
  assert.equal(reply.findings[0].severity, 'blocks');
  assert.equal(reply.findings[0].walks.length, 1);
  assert.equal(reply.findings[1].walks.length, 4);
  assert.equal(reply.findings[1].principle.topic, 'microcopy');
  const reversed = await output({ step: 'rank', walks: [...walks].reverse() });
  assert.deepEqual(reversed.findings.map((item: any) => item.id), reply.findings.map((item: any) => item.id));
});

test('missing, duplicated, unfinished or unapplied walks cannot produce a pass', async () => {
  for (const walks of [
    [], emptyWalks().slice(0, 4), [...emptyWalks(), report('hurry')],
    emptyWalks().map(walk => walk.walk === 'hurry' ? { ...walk, finished: false } : walk),
    emptyWalks().map(walk => walk.walk === 'doubt' ? { ...walk, conditionsApplied: false } : walk),
  ]) {
    const reply = await output({ step: 'rank', walks });
    assert.equal(reply.verdict, 'incomplete');
    assert.equal(reply.receipt.complete, false);
  }
});

test('a fix is confirmed only when every reporting walk reran with conditions and completed', async () => {
  const ranked = await output({ step: 'rank', walks: emptyWalks().map(walk => ['hurry', 'doubt'].includes(walk.walk) ? { ...walk, findings: [issue()] } : walk) });
  const previous = ranked.findings.map(({ id, page, element, kind, severity, walks }: any) => ({ id, page, element, kind, severity, walks }));
  const partial = await output({ step: 'recheck', previous, walks: emptyWalks().filter(walk => walk.walk !== 'doubt') });
  assert.equal(partial.items[0].status, 'not-rechecked');
  assert.deepEqual(partial.items[0].missingRechecks, ['doubt']);
  assert.equal(partial.verdict, 'incomplete');
  const failedConditions = await output({ step: 'recheck', previous, walks: emptyWalks().map(walk => walk.walk === 'doubt' ? { ...walk, conditionsApplied: false } : walk) });
  assert.equal(failedConditions.items[0].status, 'not-rechecked');
  const fixed = await output({ step: 'recheck', previous, walks: emptyWalks() });
  assert.equal(fixed.items[0].status, 'fixed');
  assert.equal(fixed.verdict, 'pass');
  assert.equal(fixed.receipt.complete, true);
});

test('a remaining issue and a new issue both prevent recheck approval', async () => {
  const ranked = await output({ step: 'rank', walks: emptyWalks().map(walk => walk.walk === 'hurry' ? { ...walk, findings: [issue()] } : walk) });
  const previous = ranked.findings.map(({ id, page, element, kind, severity, walks }: any) => ({ id, page, element, kind, severity, walks }));
  const remaining = await output({ step: 'recheck', previous, walks: emptyWalks().map(walk => walk.walk === 'breaker' ? { ...walk, findings: [issue()] } : walk) });
  assert.equal(remaining.items[0].status, 'still-there');
  assert.equal(remaining.verdict, 'fail');
  const introduced = await output({ step: 'recheck', previous, walks: emptyWalks().map(walk => walk.walk === 'literal' ? { ...walk, findings: [issue({ element: 'Address field', kind: 'form-input', severity: 'minor', what: 'The format is unclear.' })] } : walk) });
  assert.equal(introduced.items[0].status, 'fixed');
  assert.equal(introduced.newFindings.length, 1);
  assert.equal(introduced.verdict, 'fail');
});

test('receipts bind exact supplied evidence and explicitly exclude browser and real visitor validation', async () => {
  const input = { step: 'recheck', previous: [], walks: emptyWalks() };
  const first = await output(input);
  const repeated = await output(input);
  const changed = await output({ ...input, walks: emptyWalks().map(walk => walk.walk === 'hurry' ? { ...walk, findings: [issue()] } : walk) });
  assert.match(first.receipt.inputSha256, /^[a-f0-9]{64}$/);
  assert.equal(first.receipt.inputSha256, repeated.receipt.inputSha256);
  assert.notEqual(first.receipt.inputSha256, changed.receipt.inputSha256);
  assert.equal(first.receipt.browserOpened, false);
  assert.equal(first.receipt.serviceTested, false);
  assert.equal(first.receipt.realVisitorResearch, false);
  assert.match(first.receipt.evidenceSource, /not independently verified/);
});

test('duplicate previous issues and incomplete recheck inputs are rejected without a pass', async () => {
  const previous = { id: 'vendor-compatible-id', page: '/checkout', element: 'Pay button', kind: 'no-feedback', severity: 'blocks', walks: ['hurry'] };
  assert.equal((await handleFirstVisit({ step: 'recheck', walks: emptyWalks() })).isError, true);
  assert.equal((await handleFirstVisit({ step: 'recheck', previous: [previous, previous], walks: emptyWalks() })).isError, true);
  const partial = await output({ step: 'recheck', previous: [], walks: [] });
  assert.equal(partial.verdict, 'incomplete');
});

test('legacy task and observations still rank evidence without asserting complete testing', async () => {
  const brief = await output({ task: 'Create a workspace' });
  assert.equal(brief.status, 'needs-observations');
  const ranked = await output({ task: 'Create a workspace', observations: [
    { scenario: 'keyboard', problem: 'Missing label', severity: 'moderate', evidence: 'Observed the form.' },
    { scenario: 'error', problem: 'Cannot retry', severity: 'critical', evidence: 'Retry does not exist.' },
  ] });
  assert.equal(ranked.findings[0].severity, 'critical');
  assert.equal(ranked.tested, false);
  assert.equal(ranked.verdict, 'incomplete');
});
