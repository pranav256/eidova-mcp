import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import axe from 'axe-core';
import { chromium } from 'playwright';
import { inspectSpacing } from '../vendor/upstream/runtime.mjs';
import { captureScript } from './capture-script.js';

export async function reviewBrowser(input: string, output: string, readySelector?: string) {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password) {
    throw new Error('Use an HTTP(S) loopback preview URL without credentials.');
  }
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), timeout: 30_000 });
  try {
    const parent = resolve(output);
    await mkdir(parent, { recursive: true });
    const directory = await mkdtemp(join(parent, 'review-'));
    const views = [];
    let passed = true;
    for (const width of [390, 1440, 1728]) for (const colorScheme of ['light', 'dark'] as const) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme, reducedMotion: 'reduce', serviceWorkers: 'block', acceptDownloads: false });
      try {
        const page = await context.newPage();
        const pageErrors: string[] = [];
        page.on('pageerror', error => {
          if (pageErrors.length < 20) pageErrors.push(error.message.slice(0, 1000));
        });
        await page.route('**/*', route => {
          const request = route.request();
          const requestUrl = request.url();
          if (!requestUrl.startsWith('data:') && !requestUrl.startsWith('blob:') && new URL(requestUrl).origin !== url.origin) return route.abort();
          return route.continue();
        });
        const response = await page.goto(url.href, { waitUntil: 'load', timeout: 15_000 });
        if (!response?.ok() || new URL(page.url()).origin !== url.origin) throw new Error('Preview did not return a successful page on the original origin.');
        if (readySelector) await page.locator(readySelector).first().waitFor({ timeout: 10_000 });
        const screenshot = width + '-' + colorScheme + '.png';
        await page.screenshot({ path: join(directory, screenshot), animations: 'disabled', timeout: 10_000 });
        const state = await page.evaluate(captureScript) as Parameters<typeof inspectSpacing>[0]['states'][number];
        const spacing = inspectSpacing({ states: [state] });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        await page.evaluate(axe.source);
        const accessibility = await page.evaluate<axe.AxeResults>("axe.run({runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']}})");
        const violations = accessibility.violations.map(({ id, impact, help, helpUrl, nodes }) => ({
          id, impact, help, helpUrl, targets: nodes.map(node => node.target),
        }));
        if (overflow || spacing.findings.some(finding => finding.severity === 'critical' || finding.severity === 'serious') || violations.length || pageErrors.length) passed = false;
        views.push({ width, colorScheme, screenshot, overflow, spacing, violations, pageErrors });
      } catch (error) {
        passed = false;
        views.push({ width, colorScheme, error: error instanceof Error ? error.message : String(error) });
      } finally {
        await context.close();
      }
    }
    const report = join(directory, 'report.json');
    await writeFile(report, JSON.stringify({ passed, views }, null, 2) + '\n', { flag: 'wx' });
    return { passed, report };
  } finally {
    await browser.close();
  }
}
