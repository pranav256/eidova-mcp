import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import axe from 'axe-core';
import { chromium } from 'playwright';
import { z } from 'zod';
import { inspectSpacing, SPACING_CAPTURE_SCRIPT } from '../vendor/upstream/runtime.mjs';

export const browserStatesSchema = z.array(z.object({
  name: z.string().regex(/^[a-z0-9-]{1,60}$/),
  steps: z.array(z.discriminatedUnion('action', [
    z.object({ action: z.literal('click'), selector: z.string().min(1).max(500) }),
    z.object({ action: z.literal('hover'), selector: z.string().min(1).max(500) }),
    z.object({ action: z.literal('focus'), selector: z.string().min(1).max(500) }),
    z.object({ action: z.literal('press'), selector: z.string().min(1).max(500), key: z.string().min(1).max(80) }),
  ])).max(12),
})).min(1).max(8).refine(states => new Set(states.map(state => state.name)).size === states.length, 'Use distinct state names.');

export async function reviewBrowser(input: string, output: string, readySelector?: string, requestedStates?: z.infer<typeof browserStatesSchema>) {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password) {
    throw new Error('Use an HTTP(S) loopback preview URL without credentials.');
  }
  const plan = browserStatesSchema.parse(requestedStates ?? [
    {name:'default',steps:[]},
    {name:'keyboard-focus',steps:[{action:'focus',selector:'button:visible, a[href]:visible, input:visible, select:visible, textarea:visible, [tabindex]:visible'}]},
  ]);
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), timeout: 30_000 });
  try {
    const parent = resolve(output);
    await mkdir(parent, { recursive: true });
    const directory = await mkdtemp(join(parent, 'review-'));
    const views: Array<Record<string, unknown>> = [];
    const states: Array<Record<string, unknown>> = [];
    let passed = true;
    for (const width of [390, 1440, 1728]) for (const colorScheme of ['light', 'dark'] as const) for (const planned of plan) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme, reducedMotion: 'reduce', serviceWorkers: 'block', acceptDownloads: false });
      try {
        const page = await context.newPage();
        const pageErrors: string[] = [];
        page.on('pageerror', error => { if (pageErrors.length < 20) pageErrors.push(error.message.slice(0, 1000)); });
        await page.route('**/*', route => {
          const requestUrl = route.request().url();
          if (!requestUrl.startsWith('data:') && !requestUrl.startsWith('blob:') && new URL(requestUrl).origin !== url.origin) return route.abort();
          return route.continue();
        });
        const response = await page.goto(url.href, { waitUntil: 'load', timeout: 15_000 });
        if (!response?.ok() || new URL(page.url()).origin !== url.origin) throw new Error('Preview did not return a successful page on the original origin.');
        if (readySelector) await page.locator(readySelector).first().waitFor({ timeout: 10_000 });
        await page.evaluate(() => document.fonts.ready);
        for (const step of planned.steps) {
          const target = page.locator(step.selector).first();
          if (step.action === 'press') await target.press(step.key, {timeout:5000});
          else if (step.action === 'focus') await target.focus({timeout:5000});
          else if (step.action === 'hover') await target.hover({timeout:5000});
          else await target.click({timeout:5000});
        }
        if (new URL(page.url()).origin !== url.origin) throw new Error('State navigation left the original preview origin.');
        const screenshot = width + '-' + colorScheme + '-' + planned.name + '.png';
        await page.screenshot({ path: join(directory, screenshot), animations: 'disabled', timeout: 10_000 });
        const state = await page.evaluate<Record<string, unknown>>(SPACING_CAPTURE_SCRIPT);
        states.push({ ...state, name: colorScheme + ' ' + planned.name });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        await page.evaluate(axe.source);
        const accessibility = await page.evaluate<axe.AxeResults>("axe.run({runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']}})");
        const violations = accessibility.violations.map(({ id, impact, help, helpUrl, nodes }) => ({
          id, impact, help, helpUrl, targets: nodes.map(node => node.target),
        }));
        if (overflow || violations.length || pageErrors.length) passed = false;
        views.push({ width, colorScheme, state:planned.name, screenshot, overflow, violations, pageErrors });
      } catch (error) {
        passed = false;
        views.push({ width, colorScheme, state:planned.name, error: error instanceof Error ? error.message : String(error) });
      } finally { await context.close(); }
    }
    const requiredWidths = [390, 1440, 1728];
    const capturedWidths = [...new Set(states.map(state => (state.viewport as {width:number}).width))].sort((a, b) => a - b);
    const missingWidths = requiredWidths.filter(width => !capturedWidths.includes(width));
    const missingStates = views.filter(view => view.error).map(view => ({width:view.width,colorScheme:view.colorScheme,name:view.state}));
    const geometry = inspectSpacing({ states });
    const emptyStates = states.filter(state => !Array.isArray(state.elements) || !state.elements.length).map(state => state.name);
    const truncatedStates = states.filter(state => (state.captureCoverage as {truncated?:boolean}|undefined)?.truncated).map(state => state.name);
    const coverage = {
      complete: !missingStates.length && !missingWidths.length && !emptyStates.length && !truncatedStates.length && !geometry.summary.truncated,
      scope:'Declared states at all three widths in light and dark mode',
      requiredWidths, capturedWidths, missingWidths, requiredStates:plan.map(state => state.name), missingStates, emptyStates, truncatedStates,
      expectedCaptures:6 * plan.length, capturedStates:states.length,
    };
    if (geometry.findings.some(finding => finding.severity === 'critical' || finding.severity === 'serious') || !coverage.complete) passed = false;
    const report = join(directory, 'report.json');
    const result = {
      status: coverage.complete ? 'complete' : 'partial',
      passed,
      passedMeaning:'Automated capture, page-error, overflow, accessibility and critical/serious geometry checks only; human review remains unverified.',
      coverage,
      geometry: {
        scope:'DOM geometry findings only',
        ...(coverage.complete ? {score:geometry.score} : {}),
        scoreMeaning:'100 minus 20 per critical, 10 per serious and 5 per moderate geometry finding; not an overall quality rating.',
        summary:geometry.summary, findings:geometry.findings,
      },
      visual: {
        screenshots:views.filter(view => view.screenshot).map(view => ({width:view.width,colorScheme:view.colorScheme,state:view.state,file:view.screenshot})),
        unverified:['Human visual hierarchy and appearance judgment.', 'Keyboard and successful task behavior; focus capture does not verify keyboard activation.', 'Any states omitted from the declared plan.'],
      },
      views,
    };
    await writeFile(report, JSON.stringify(result, null, 2) + '\n', { flag:'wx' });
    const capture = join(directory, 'spacing-input.json');
    await writeFile(capture, JSON.stringify({states,requiredStates:['light','dark'].flatMap(mode => plan.map(state => mode + ' ' + state.name))}, null, 2) + '\n', {flag:'wx'});
    return {passed,status:result.status,coverage,report,capture};
  } finally { await browser.close(); }
}
