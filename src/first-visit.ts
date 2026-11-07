import { createHash } from 'node:crypto';
import { z } from 'zod';

/** Independently implemented from the recorded public MCP interface, not vendor source. */
export const FIRST_VISIT_WALKS = ['hurry', 'doubt', 'small-screen', 'literal', 'breaker'] as const;
const kinds = ['unclear-copy', 'dead-end', 'no-feedback', 'error-message', 'form-input', 'double-action', 'slow', 'layout-breaks', 'tap-target', 'trust-gap', 'other'] as const;
const severities = ['blocks', 'slows', 'minor'] as const;
const label = z.string().trim().min(1).max(2000);
const walkName = z.enum(FIRST_VISIT_WALKS);
const findingSchema = z.object({
  page: label, element: label, kind: z.enum(kinds), severity: z.enum(severities),
  what: z.string().trim().min(1).max(5000), screenshot: z.string().max(2000).optional(),
}).strict();
const walkSchema = z.object({
  walk: walkName, conditionsApplied: z.boolean(), finished: z.boolean(),
  findings: z.array(findingSchema).max(100),
}).strict();
const previousSchema = z.object({
  id: z.string().trim().min(1).max(120), page: label, element: label,
  kind: z.enum(kinds), severity: z.enum(severities), walks: z.array(walkName).min(1).max(5),
}).strict();
const legacyObservationSchema = z.object({
  scenario: label, problem: label, severity: z.enum(['critical', 'serious', 'moderate']), evidence: z.string().trim().min(1).max(5000),
}).strict();

export const firstVisitInputSchema = z.object({
  step: z.enum(['brief', 'rank', 'recheck']).optional(),
  task: label.optional(),
  url: z.string().max(4000).url().refine(value => ['http:', 'https:'].includes(new URL(value).protocol), 'Use an HTTP or HTTPS URL.').optional(),
  walks: z.array(walkSchema).max(10).optional(),
  previous: z.array(previousSchema).max(500).optional(),
  context: z.string().max(280).optional(),
  observations: z.array(legacyObservationSchema).max(100).optional(),
}).strict();

type Walk = z.infer<typeof walkSchema>;
type Finding = z.infer<typeof findingSchema>;
type Previous = z.infer<typeof previousSchema>;
type WalkName = typeof FIRST_VISIT_WALKS[number];
type Ranked = { id: string; page: string; element: string; kind: Finding['kind']; severity: Finding['severity']; walks: WalkName[]; observations: (Finding & { walk: WalkName })[]; principle: { tool: string; topic: string } };
type Verdict = 'pass' | 'fail' | 'incomplete';
type ToolResult = { content: { type: 'text'; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };
const result = (value: Record<string, unknown>, message?: string): ToolResult => ({ content: [{ type: 'text', text: message ?? JSON.stringify(value, null, 2) }], structuredContent: value });
const error = (message: string): ToolResult => ({ content: [{ type: 'text', text: message }], isError: true });
const clean = (value: string) => value.trim().replace(/\s+/g, ' ');
const identity = (issue: Pick<Finding, 'page' | 'element' | 'kind'>) => JSON.stringify([clean(issue.page), clean(issue.element), issue.kind]);
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const order = (severity: Finding['severity']) => severities.indexOf(severity);

const principles: Record<Finding['kind'], Ranked['principle']> = {
  'unclear-copy': { tool: 'get-ux-principle', topic: 'microcopy' },
  'dead-end': { tool: 'get-ux-principle', topic: 'navigation' },
  'no-feedback': { tool: 'get-ux-principle', topic: 'notifications' },
  'error-message': { tool: 'get-ux-principle', topic: 'errors' },
  'form-input': { tool: 'get-ux-principle', topic: 'forms' },
  'double-action': { tool: 'get-ux-principle', topic: 'forms' },
  slow: { tool: 'get-ux-principle', topic: 'notifications' },
  'layout-breaks': { tool: 'get-ux-principle', topic: 'responsive' },
  'tap-target': { tool: 'get-ui-principle', topic: 'accessibility' },
  'trust-gap': { tool: 'get-ux-principle', topic: 'microcopy' },
  other: { tool: 'get-ux-principle', topic: 'design-process' },
};

function coverage(walks: Walk[]) {
  const missing: WalkName[] = [], duplicate: WalkName[] = [], conditionsMissing: WalkName[] = [], unfinished: WalkName[] = [];
  for (const name of FIRST_VISIT_WALKS) {
    const reports = walks.filter(walk => walk.walk === name);
    if (!reports.length) missing.push(name);
    if (reports.length > 1) duplicate.push(name);
    if (reports.some(walk => !walk.conditionsApplied)) conditionsMissing.push(name);
    if (reports.some(walk => !walk.finished)) unfinished.push(name);
  }
  return { complete: !missing.length && !duplicate.length && !conditionsMissing.length && !unfinished.length, missing, duplicate, conditionsMissing, unfinished };
}

function rank(walks: Walk[]): Ranked[] {
  const groups = new Map<string, Ranked>();
  for (const walk of walks) {
    for (const finding of walk.findings) {
      const key = identity(finding);
      const issue = groups.get(key) ?? {
        id: `fv-${sha256(key).slice(0, 20)}`, page: clean(finding.page), element: clean(finding.element), kind: finding.kind,
        severity: finding.severity, walks: [], observations: [], principle: principles[finding.kind],
      };
      if (order(finding.severity) < order(issue.severity)) issue.severity = finding.severity;
      if (!issue.walks.includes(walk.walk)) issue.walks.push(walk.walk);
      issue.observations.push({ ...finding, walk: walk.walk });
      groups.set(key, issue);
    }
  }
  for (const issue of groups.values()) issue.walks.sort((a, b) => FIRST_VISIT_WALKS.indexOf(a) - FIRST_VISIT_WALKS.indexOf(b));
  return [...groups.values()].sort((a, b) => order(a.severity) - order(b.severity) || b.walks.length - a.walks.length || a.id.localeCompare(b.id));
}

function receipt(input: unknown, verdict: Verdict, complete: boolean) {
  return {
    issuer: 'open-design-mcp', kind: 'supplied-first-visit-evidence', algorithm: 'first-visit-v1',
    inputSha256: sha256(JSON.stringify(input)), verdict, complete,
    evidenceSource: 'Caller-supplied walk reports; their execution was not independently verified.',
    browserOpened: false, serviceTested: false, realVisitorResearch: false,
  };
}

const scenarios = [
  { walk: 'hurry', prompt: 'Complete the stated task quickly. Look for the main action, try it, and record any point where you must stop to work out the next step.' },
  { walk: 'doubt', prompt: 'Check pricing, commitments, terms and privacy while completing the task. Record claims you cannot verify and missing information before a commitment.' },
  { walk: 'small-screen', prompt: 'Use a 390px-wide viewport and a slow network. Complete the task and check loading, reflow, tap targets and recovery from failed requests.' },
  { walk: 'literal', prompt: 'Follow only the visible words and control labels. Record labels whose expected outcome differs from the next state or requires product knowledge.' },
  { walk: 'breaker', prompt: 'Try invalid or empty input, repeated submissions and a failed request. Record lost input, missing feedback, task dead ends and broken recovery.' },
] as const;

/** This handler analyzes reports only. It does not navigate, click, fetch URLs or inspect screenshot files. */
export async function handleFirstVisit(input: unknown): Promise<ToolResult> {
  const parsed = firstVisitInputSchema.safeParse(input);
  if (!parsed.success) return error(`Invalid first-visit input: ${parsed.error.issues.map(issue => `${issue.path.join('.') || 'input'}: ${issue.message}`).join('; ')}`);
  const args = parsed.data;
  if (!args.step) {
    if (!args.task) return error('Supply step with its inputs, or task for the legacy observations mode.');
    if (!args.observations?.length) return result({ status: 'needs-observations', task: args.task, url: args.url, walks: scenarios, tested: false, nextStep: 'Run the five walks yourself and provide their observations. This service has not opened the page.' });
    const findings = [...args.observations].sort((a, b) => ['critical', 'serious', 'moderate'].indexOf(a.severity) - ['critical', 'serious', 'moderate'].indexOf(b.severity));
    return result({ status: 'reviewed-observations', tested: false, findings, verdict: 'incomplete', note: 'Legacy observations do not establish that all five conditions were applied or tasks finished.' });
  }
  if (args.observations) return error('Use walks with step, or omit step for legacy observations.');
  if (args.step === 'brief') {
    if (!args.task || !args.url) return error('The brief step needs task and url.');
    return result({
      status: 'brief', task: args.task, url: args.url, walks: scenarios,
      reportFormat: { walk: 'One of the five named walks', conditionsApplied: true, finished: true, findings: [{ page: 'Page or route', element: 'Control or region', kind: kinds, severity: severities, what: 'Observed problem and its effect', screenshot: 'Optional local screenshot path' }] },
      rankingRule: 'Rank task blockers first, then problems that slow the task, then minor issues. Within each severity, rank by the number of distinct walks reporting the same page, element and kind.',
      nextStep: 'Run each scenario separately, record actual evidence, then call step rank with the five reports.',
      tested: false, browserOpened: false, realVisitorResearch: false,
    });
  }
  if (!args.walks) return error(`The ${args.step} step needs walks, including empty findings arrays for completed walks.`);
  const reviewedCoverage = coverage(args.walks);
  const findings = rank(args.walks);
  if (args.step === 'rank') {
    const verdict: Verdict = findings.length ? 'fail' : reviewedCoverage.complete ? 'pass' : 'incomplete';
    return result({ status: reviewedCoverage.complete ? 'ranked' : 'incomplete', verdict, findings, coverage: reviewedCoverage, tested: false, receipt: receipt(args, verdict, reviewedCoverage.complete) });
  }
  if (!args.previous) return error('The recheck step needs previous, even when its findings list is empty.');
  const seenIds = new Set<string>(), seenIssues = new Set<string>();
  for (const prior of args.previous) {
    if (seenIds.has(prior.id) || seenIssues.has(identity(prior))) return error('previous contains duplicate issue IDs or page/element/kind combinations.');
    if (new Set(prior.walks).size !== prior.walks.length) return error('Each previous issue must list each reporting walk once.');
    seenIds.add(prior.id); seenIssues.add(identity(prior));
  }
  const byIssue = new Map(findings.map(finding => [identity(finding), finding]));
  const items = args.previous.map((prior: Previous) => {
    const remaining = byIssue.get(identity(prior));
    const required = prior.walks.filter(name => {
      const reports = args.walks!.filter(walk => walk.walk === name);
      return reports.length !== 1 || !reports[0].conditionsApplied || !reports[0].finished;
    });
    return { ...prior, status: remaining ? 'still-there' : required.length ? 'not-rechecked' : 'fixed', missingRechecks: required, ...(remaining ? { current: remaining } : {}) };
  });
  const newFindings = findings.filter(finding => !seenIssues.has(identity(finding)));
  const unresolved = items.some(item => item.status !== 'fixed');
  const knownFailure = items.some(item => item.status === 'still-there') || newFindings.length > 0;
  const verdict: Verdict = knownFailure ? 'fail' : unresolved || !reviewedCoverage.complete ? 'incomplete' : 'pass';
  return result({ status: verdict === 'incomplete' ? 'incomplete' : 'reviewed', verdict, items, newFindings, coverage: reviewedCoverage, tested: false, receipt: receipt(args, verdict, reviewedCoverage.complete && !unresolved) });
}
