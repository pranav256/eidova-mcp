import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { measureTextContrast } from './browser-contrast.mjs';

const origin = process.env.WEBSITE_REVIEW_URL || 'https://open-design-website.vercel.app';
const dir = path.resolve(process.argv[2] || '.work/verification/website-themes');
const website = path.resolve(process.env.WEBSITE_SOURCE_DIR || 'website');
const themes = JSON.parse(await readFile(path.join(website, 'src/catalog-themes.json'), 'utf8'));
const families = JSON.parse(await readFile(path.join(website, 'src/design-families.json'), 'utf8'));
const representative = ['linear', 'editorial-dark', 'tactile-minimal'];
const familyFor = id => families.find(family => family.representative === id || family.variants.includes(id));
const save = (name, value) => writeFile(path.join(dir, name + '.json'), JSON.stringify(value, null, 2));
await mkdir(dir, { recursive: true });
const client = new Client({ name: 'open-design-theme-viewer-review', version: '0.2.0' });
await client.connect(process.env.MCP_PRIVATE_ARCHIVE
  ? new StdioClientTransport({ command: process.execPath, args: [path.resolve('scripts/start-private.mjs'), path.resolve(process.env.MCP_PRIVATE_ARCHIVE)] })
  : new StreamableHTTPClientTransport(new URL(process.env.MCP_REVIEW_URL || 'https://open-design-mcp-liard.vercel.app/mcp')));
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), headless: true });
const states = [], checks = [], errors = [], panels = [], spacing = [];
let catalogRequests = 0;
function siteSurface() {
  const root = document.documentElement, css = getComputedStyle(root);
  return { theme: root.dataset.theme, system: root.dataset.designSystem, inlineStyles: root.style.length,
    background: css.getPropertyValue('--background'), primary: css.getPropertyValue('--primary'),
    radius: css.getPropertyValue('--radius'), font: getComputedStyle(document.querySelector('h1')).fontFamily };
}
async function contrast(page, label) {
  const readings = await page.evaluate(measureTextContrast);
  assert.ok(readings.length > 0); assert.deepEqual(readings.filter(item => item.ratio < item.minimum), [], label);
  return Math.min(...readings.map(item => item.ratio));
}
try {
  await save('rules', await client.callTool({ name: 'get-review-rules', arguments: { category: 'all' } }));
  const capture = await client.callTool({ name: 'inspect-spacing', arguments: { detail: 'full' } });
  const script = capture.structuredContent?.captureScript; assert.ok(script);
  for (const width of [390, 1440, 1728]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'], reducedMotion: 'reduce' });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (new URL(request.url()).pathname === '/api/catalog') catalogRequests++; });
    for (const mode of ['dark', 'light']) {
      await page.goto(origin + '/?mode=' + mode, { waitUntil: 'networkidle' });
      await page.locator('.theme-card').nth(7).waitFor(); await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator('.hero iframe, .apply-theme, .theme-session').count(), 0);
      await page.getByRole('button', { name: 'Show all 31 themes', exact: true }).click();
      await page.getByRole('tab', { name: 'Cursor', exact: true }).click();
      const surface = await page.evaluate(siteSurface); assert.equal(surface.system, 'default'); assert.equal(surface.inlineStyles, 0); assert.match(surface.font, /Geist/);
      for (const id of width === 390 ? Object.keys(themes) : representative) {
        const family = familyFor(id); assert.ok(family);
        const display = family.representative === id ? family.title : themes[id].title;
        const trigger = page.getByRole('button', { name: 'Preview ' + display + ' theme', exact: true });
        await trigger.scrollIntoViewIfNeeded(); await trigger.focus();
        const beforeScroll = await page.evaluate(() => scrollY), beforeRequests = catalogRequests;
        await page.keyboard.press('Enter');
        const dialog = page.getByRole('dialog', { name: family.title + ' components', exact: true }); await dialog.waitFor();
        assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'component-preview-title');
        assert.equal(new URL(page.url()).searchParams.get('preview'), id);
        assert.deepEqual(await page.evaluate(siteSurface), surface, id + ': preview must not recolor the website');
        const iframe = page.frameLocator('.specimen-frame'); await iframe.getByRole('textbox', { name: 'Workspace name', exact: true }).waitFor();
        const frame = await (await page.locator('.specimen-frame').elementHandle()).contentFrame();
        await frame.evaluate(() => document.fonts.ready);
        assert.equal(await page.locator('.specimen-frame').getAttribute('src'), '/?specimen=' + family.representative);
        assert.equal(await page.getByRole('link', { name: 'Open full preview', exact: true }).getAttribute('href'), '/?specimen=' + family.representative);
        assert.equal(await iframe.getByRole('textbox', { name: 'Workspace name', exact: true }).inputValue(), 'Acme Studio');
        assert.equal(await frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, id + ': frame overflow');
        assert.ok(await frame.locator('#workspace-name').evaluate(node => node.getBoundingClientRect().width >= 200), id + ': squeezed field');
        const siteContrast = await contrast(page, id + ': viewer chrome contrast'), nativeContrast = await contrast(frame, id + ': native contrast');
        checks.push({ id, family: family.id, mode, width, siteContrast, nativeContrast });
        const state = await page.evaluate(script); state.name = id + ' ' + mode + ' ' + width + 'px viewer'; states.push(state);
        const native = await frame.evaluate(script); native.name = id + ' ' + mode + ' ' + width + 'px embedded components'; states.push(native);
        if (width === 390 && mode === 'dark') panels.push(await dialog.evaluate(node => ({ screen: node.querySelector('h2').textContent, headline: node.querySelector('h2').textContent, body: [node.querySelector('.section-heading p').textContent], actions: [...node.querySelectorAll('a,button')].map(item => item.textContent.trim()) })));
        if (representative.includes(id)) await page.screenshot({ path: path.join(dir, id + '-' + mode + '-' + width + '-viewer.png') });
        await page.getByRole('button', { name: 'Close preview', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
        assert.equal(await trigger.evaluate(node => node === document.activeElement), true);
        assert.ok(Math.abs(await page.evaluate(() => scrollY) - beforeScroll) < 2, id + ': close must preserve scroll');
        assert.deepEqual(await page.evaluate(siteSurface), surface);
        assert.equal(await page.getByRole('tab', { name: 'Cursor', exact: true }).getAttribute('aria-selected'), 'true');
        assert.equal(catalogRequests, beforeRequests, 'Opening previews must not refetch the catalog');
        assert.equal(new URL(page.url()).searchParams.has('preview'), false);
      }
    }
    await context.close(); console.log('Verified fixed-site theme viewers at ' + width + 'px.');
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 1000 } });
  await context.addInitScript(() => { localStorage.setItem('open-design-system', 'stripe'); localStorage.setItem('open-design-theme', 'light'); });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin, { waitUntil: 'networkidle' }); await page.locator('.theme-card').first().waitFor();
  assert.equal((await page.evaluate(siteSurface)).system, 'default'); assert.equal((await page.evaluate(siteSurface)).theme, 'light');
  for (const query of ['theme=stripe', 'preview=stripe']) {
    await page.goto(origin + '/?' + query + '&mode=dark&q=stripe', { waitUntil: 'networkidle' });
    await page.getByRole('dialog', { name: familyFor('stripe').title + ' components', exact: true }).waitFor();
    assert.equal(await page.getByRole('searchbox', { name: 'Search themes' }).inputValue(), 'stripe');
    assert.equal((await page.evaluate(siteSurface)).inlineStyles, 0);
    assert.equal(new URL(page.url()).searchParams.has('theme'), false); assert.equal(new URL(page.url()).searchParams.get('preview'), 'stripe');
    await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' });
  }
  for (const id of ['missing-theme', '__proto__']) {
    await page.goto(origin + '/?preview=' + id + '&mode=light', { waitUntil: 'networkidle' });
    assert.equal(await page.locator('dialog[open]').count(), 0); assert.equal((await page.evaluate(siteSurface)).inlineStyles, 0);
  }
  await page.evaluate(() => { history.pushState(null, '', '?preview=tactile-minimal&mode=light&q=tactile'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByRole('dialog', { name: 'Tactile components', exact: true }).waitFor();
  await page.goBack(); await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('searchbox', { name: 'Search themes' }).inputValue(), '');
  await context.close();
  const noStorage = await browser.newContext({ viewport: { width: 390, height: 1000 } });
  await noStorage.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Disabled', 'SecurityError'); } }));
  const isolated = await noStorage.newPage(); isolated.on('pageerror', error => errors.push(error.message));
  await isolated.goto(origin, { waitUntil: 'networkidle' }); await isolated.getByRole('button', { name: 'Preview Precision theme', exact: true }).click();
  await isolated.getByRole('dialog', { name: 'Precision components', exact: true }).waitFor();
  await isolated.getByRole('button', { name: 'Close preview', exact: true }).click(); await isolated.getByRole('dialog').waitFor({ state: 'hidden' });
  await isolated.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
  assert.equal((await isolated.evaluate(siteSurface)).theme, 'light'); assert.equal((await isolated.evaluate(siteSurface)).inlineStyles, 0);
  await noStorage.close();
  await save('states', states); await save('checks', checks);
  for (let index = 0; index < states.length; index += 2) {
    const args = { states: states.slice(index, index + 2), spacingScale: [4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 72, 80, 88, 96, 104, 128], tolerance: 2, detail: 'full' };
    assert.ok(Buffer.byteLength(JSON.stringify(args)) < 4 * 1024 * 1024 - 1024);
    const result = await client.callTool({ name: 'inspect-spacing', arguments: args });
    assert.ok(!result.isError); assert.equal(result.structuredContent?.status, 'completed');
    await save('spacing-' + index, result); spacing.push(result.structuredContent.summary);
  }
  const comprehension = [];
  for (const panel of panels) comprehension.push({ panel, result: await client.callTool({ name: 'check-comprehension', arguments: { ...panel, knownTerms: ['MCP', 'workspace', 'FX', 'TV', 'IBM'] } }) });
  await save('comprehension', comprehension);
  const summary = { origin, themeCount: Object.keys(themes).length, nativeFamilies: families.length, checkedLayouts: checks.length, capturedStates: states.length, modes: ['dark', 'light'], widths: [390, 1440, 1728],
    minimumSiteContrast: Math.min(...checks.map(item => item.siteContrast)), minimumNativeContrast: Math.min(...checks.map(item => item.nativeContrast)), spacing,
    comprehensionChecks: comprehension.length, comprehensionFailures: comprehension.filter(item => item.result.structuredContent?.verdict !== 'pass').length, pageErrors: errors,
    behavior: ['all 31 IDs open isolated family viewers', 'site colors, radius and Geist remain fixed', 'no initial hero iframe', 'keyboard opening and focus return', 'scroll and setup tab retained', 'no catalog refetch', 'preview URL and legacy theme migration', 'old saved palette ignored without deleting it', 'invalid and prototype IDs recover safely', 'browser history restores viewer and search', 'storage-disabled previews and light/dark mode'] };
  await save('summary', summary); console.log(JSON.stringify({ checkedLayouts: checks.length, capturedStates: states.length, comprehensionFailures: summary.comprehensionFailures, pageErrors: errors, blockingSpacing: spacing.reduce((sum, item) => sum + item.critical + item.serious, 0) }));
  assert.equal(checks.length, 74); assert.deepEqual(errors, []); assert.equal(summary.comprehensionFailures, 0); assert.ok(spacing.every(item => item.critical === 0 && item.serious === 0));
} finally { await browser.close(); await client.close(); }
