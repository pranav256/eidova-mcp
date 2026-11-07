import { chromium } from 'playwright';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

const origin = process.env.WEBSITE_REVIEW_URL || 'https://open-design-website.vercel.app';
const endpoint = 'https://open-design-mcp-liard.vercel.app/mcp';
const mcp = process.env.MCP_REVIEW_URL || 'https://open-design-mcp-liard.vercel.app/mcp';
const directory = resolve(process.argv[2] || '.work/verification/website');
await mkdir(directory, { recursive: true });
const client = new Client({ name: 'open-design-public-website-verification', version: '0.1.0' });
await client.connect(new StreamableHTTPClientTransport(new URL(mcp)));
const channel = process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined);
const browser = await chromium.launch({ channel, headless: true });
const states = [];
const panels = [];
const knownTerms = ['MCP', 'UI', 'HTTP', 'JSON', 'MIT', 'React', 'Geist', 'mcpServers', 'registry', 'token', 'tokens', 'API', 'CSS', 'IBM', 'SF', 'FX', 'Sans', 'Mono', 'VF', 'DM'];
try {
  const rules = await client.callTool({ name: 'get-review-rules', arguments: { category: 'all', context: 'Review the deployed standalone Open Design website' } });
  assert.ok(!rules.isError, 'Review rules failed');
  const capture = await client.callTool({ name: 'inspect-spacing', arguments: { detail: 'full', context: 'Capture script for standalone website HTTPS review' } });
  const script = capture.structuredContent?.captureScript;
  assert.ok(script, 'MCP did not supply a rendered evidence capture script');
  await writeFile(`${directory}/rules.json`, JSON.stringify(rules, null, 2));
  for (const width of [390, 1440, 1728]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto(origin, { waitUntil: 'networkidle' });
    assert.equal(response?.status(), 200, 'Website is not publicly accessible');
    await page.waitForFunction(() => document.querySelectorAll('.theme-card').length === 31);
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('h1').count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Horizontal overflow at ${width}`);
    assert.equal(await page.locator('#mcp-endpoint').inputValue(), endpoint);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `${directory}/${width}.png`, fullPage: true });
    await page.screenshot({ path: `${directory}/${width}-first-view.png` });
    const snapshot = await page.evaluate(script);
    snapshot.name = `Website ${width}px default`;
    states.push(snapshot);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('skip-link')), true);
    await page.keyboard.press('Enter');
    if (width === 390) {
      const read = async (selector, heading) => page.locator(selector).evaluate((element, headingSelector) => {
        const title = element.querySelector(headingSelector)?.textContent?.trim() || '';
        const body = [...element.querySelectorAll('p, label')].map(node => node.textContent.trim()).filter(Boolean);
        const actions = [...element.querySelectorAll('button, a')].map(node => node.textContent.replace(/[↗↓]/g, '').trim()).filter(Boolean);
        return { headline: title, body, actions };
      }, heading);
      panels.push({ screen: 'Open Design website hero', ...await read('.hero-copy', 'h1') });
      const preview = await page.locator('.hero-preview').evaluate(element => ({
        headline: element.querySelector('.sample-heading').textContent.trim(),
        body: [...element.querySelectorAll('p, span, code, strong')].map(node => node.textContent.trim()).filter(Boolean),
        actions: [],
      }));
      panels.push({ screen: 'Open Design theme preview', ...preview });
      for (let index = 0; index < await page.locator('.workflow-item').count(); index++) {
        const panel = await page.locator('.workflow-item').nth(index).evaluate(element => ({ headline: element.querySelector('h3').textContent.trim(), body: [...element.querySelectorAll('p, code')].map(node => node.textContent.trim()), actions: [] }));
        panels.push({ screen: `Website workflow ${index + 1}`, ...panel });
      }
      panels.push({ screen: 'Website theme catalog', ...await read('.themes .section-heading', 'h2') });
      for (let index = 0; index < 31; index++) {
        const panel = await page.locator('.theme-card').nth(index).evaluate(element => ({ headline: element.querySelector('h3').textContent.trim(), body: [...element.querySelectorAll('p, code, .theme-card-heading > span')].map(node => node.textContent.trim()), actions: [...element.querySelectorAll('a')].map(node => node.textContent.replace(/[↗↓]/g, '').trim()) }));
        panels.push({ screen: `Website theme ${index + 1}`, ...panel });
      }
      panels.push({ screen: 'Website MCP connection instructions', ...await read('.connect-copy', 'h2') });
      const configuration = await page.locator('.config-panel').evaluate(element => ({
        headline: element.querySelector('.config-heading > span').textContent.trim(),
        body: [element.querySelector('pre').textContent.trim()],
        actions: [...element.querySelectorAll('button')].map(node => node.textContent.trim()),
      }));
      panels.push({ screen: 'Website MCP JSON configuration example', ...configuration });
      panels.push({ screen: 'Website ownership and self-hosting information', ...await read('.ownership', 'h2') });
      await page.getByRole('searchbox', { name: 'Search themes' }).fill('linear');
      assert.ok(await page.locator('.theme-card').count() > 0);
      assert.ok(await page.locator('.theme-card').count() < 31);
      await page.getByRole('searchbox', { name: 'Search themes' }).fill('no-matches-9348');
      await page.getByRole('button', { name: 'Clear search' }).click();
      assert.equal(await page.locator('.theme-card').count(), 31);
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'theme-search');
      await page.getByRole('button', { name: 'Copy server URL' }).click();
      await page.getByRole('status').filter({ hasText: 'Copied to clipboard.' }).waitFor();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), endpoint);
      await page.getByRole('button', { name: 'Copy configuration' }).focus();
      await page.keyboard.press('Space');
      await page.locator('.config-footer').getByRole('status').filter({ hasText: 'Copied to clipboard.' }).waitFor();
      const config = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
      assert.equal(config.mcpServers['open-design'].url, endpoint);
      const tokenUrl = await page.locator('.theme-card-footer a').first().getAttribute('href');
      assert.equal(new URL(tokenUrl).origin, 'https://open-design-mcp-liard.vercel.app');
      assert.match(new URL(tokenUrl).pathname, /^\/registry\/[a-z0-9_-]+\/globals\.json$/);
      const tokenResponse = await page.request.get(tokenUrl);
      assert.equal(tokenResponse.status(), 200);
      const tokens = await tokenResponse.json();
      assert.ok(tokens.cssVars?.light && tokens.css, 'Theme tokens and inline stylesheet are present');
      await page.route('**/api/catalog', route => route.fulfill({ status: 503, body: '{}' }));
      await page.reload();
      await page.getByRole('alert').waitFor();
      await page.unroute('**/api/catalog');
      await page.getByRole('button', { name: 'Retry loading themes' }).click();
      await page.waitForFunction(() => document.querySelectorAll('.theme-card').length === 31);
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'theme-search');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'auto');
    }
    await context.close();
  }
  await writeFile(`${directory}/states.json`, JSON.stringify(states, null, 2));
  const spacing = await client.callTool({ name: 'inspect-spacing', arguments: { states, spacingScale: [4,8,12,16,20,24,32,40,48,56,64,72,80,88,96,104,128], tolerance: 2, detail: 'full', context: 'Rendered geometry from standalone public HTTPS website at three widths' } });
  await writeFile(`${directory}/spacing.json`, JSON.stringify(spacing, null, 2));
  const comprehension = [];
  for (const panel of panels) {
    const result = await client.callTool({ name: 'check-comprehension', arguments: { ...panel, knownTerms } });
    assert.ok(!result.isError, `Comprehension failed: ${panel.screen}`);
    comprehension.push({ input: panel, result });
  }
  await writeFile(`${directory}/comprehension.json`, JSON.stringify(comprehension, null, 2));
  const failed = comprehension.filter(item => item.result.structuredContent?.verdict === 'revise');
  const summary = { origin, mcpReviewEndpoint: mcp, serviceEndpoint: endpoint, publicAccess: true, catalogCount: 31, widths: [390,1440,1728], noPageErrors: true, noPageOverflow: true, behavior: ['keyboard skip link','search','no-match recovery','clipboard URL','keyboard configuration copy','catalog error/retry','focus return','reduced motion'], spacing: spacing.structuredContent?.summary, comprehensionPanels: comprehension.length, comprehensionFailed: failed.map(item => ({ screen: item.input.screen, result: item.result.structuredContent })) };
  await writeFile(`${directory}/summary.json`, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  assert.ok(!spacing.isError, 'Spacing review failed');
  assert.equal(summary.spacing?.critical, 0, 'Critical spacing issues remain');
  assert.equal(summary.spacing?.serious, 0, 'Serious spacing issues remain');
  assert.equal(failed.length, 0, 'Comprehension revisions remain');
} finally { await browser.close(); await client.close(); }
