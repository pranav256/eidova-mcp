import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const origin = process.env.WEBSITE_REVIEW_URL || 'https://open-design-website.vercel.app';
const dir = path.resolve(process.argv[2] || '.work/verification/website-themes');
await mkdir(dir, { recursive: true });
const themes = JSON.parse(await readFile(path.resolve(process.env.WEBSITE_SOURCE_DIR || 'website', 'src/catalog-themes.json'), 'utf8'));
const save = (name, value) => writeFile(path.join(dir, name + '.json'), JSON.stringify(value, null, 2));
const client = new Client({ name: 'open-design-whole-site-themes', version: '1' });
await client.connect(process.env.MCP_PRIVATE_ARCHIVE
  ? new StdioClientTransport({ command: process.execPath, args: [path.resolve('scripts/start-private.mjs'), path.resolve(process.env.MCP_PRIVATE_ARCHIVE)] })
  : new StreamableHTTPClientTransport(new URL(process.env.MCP_REVIEW_URL || 'https://open-design-mcp-liard.vercel.app/mcp')));
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), headless: true });
const checks = [], states = [], copyChecks = [], errors = [], behaviors = [];
const representative = ['linear', 'stripe', 'airbnb'];

// Measure actual text over composited ancestor surfaces, including transparent cards.
function measure() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
  const paint = canvas.getContext('2d', { willReadFrequently: true });
  const lum = () => {
    const c = [...paint.getImageData(0, 0, 1, 1).data].slice(0, 3).map(v => {
      v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
    });
    return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
  };
  const color = getComputedStyle(document.body).backgroundColor;
  paint.fillStyle = color; paint.fillRect(0, 0, 1, 1);
  const backgroundLuminance = lum();
  const candidates = [...document.body.querySelectorAll('*')].filter(node =>
    (node.matches('input, textarea') || [...node.childNodes].some(child => child.nodeType === 3 && child.textContent.trim())) &&
    !node.closest('[aria-hidden="true"], button:disabled, .skip-link, script, style') && node.getBoundingClientRect().height > 0);
  const contrast = candidates.flatMap(node => {
    const colors = [{ text: (node.value || node.textContent).trim().slice(0, 80), color: getComputedStyle(node).color }];
    if (node.matches('input[placeholder]') && !node.value) colors.push({ text: node.placeholder, color: getComputedStyle(node, '::placeholder').color });
    return colors.map(({ text, color }) => {
      paint.clearRect(0, 0, 1, 1);
      const ancestors = []; for (let p = node; p; p = p.parentElement) ancestors.unshift(p);
      for (const ancestor of ancestors) { paint.fillStyle = getComputedStyle(ancestor).backgroundColor; paint.fillRect(0, 0, 1, 1); }
      const bg = lum(); paint.fillStyle = color; paint.fillRect(0, 0, 1, 1); const fg = lum();
      return { text, ratio: (Math.max(bg, fg) + .05) / (Math.min(bg, fg) + .05) };
    });
  });
  return { backgroundLuminance, contrast, background: color, radius: getComputedStyle(document.querySelector('.theme-card')).borderTopLeftRadius };
}
async function selection(page, id, mode) {
  assert.equal(await page.locator('html').getAttribute('data-design-system'), id || 'default');
  assert.equal(await page.locator('html').getAttribute('data-theme'), mode);
  assert.equal(await page.locator('.theme-session strong').textContent(), id ? themes[id].title : 'Open Design');
}
async function expand(page) {
  await page.locator('.theme-card').first().waitFor();
  const button = page.getByRole('button', { name: 'Show all 31 themes' });
  if (await button.isVisible()) await button.click();
}
try {
  await save('rules', await client.callTool({ name: 'get-review-rules', arguments: { category: 'all', context: 'Whole-site theme switching, persistent appearance, keyboard access and readable colors' } }));
  const capture = await client.callTool({ name: 'inspect-spacing', arguments: { detail: 'full' } });
  const script = capture.structuredContent.captureScript;
  const context = await browser.newContext({ viewport: { width: 390, height: 1000 }, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', e => errors.push(e.message));
  let catalogRequests = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/catalog') catalogRequests++; });
  await page.goto(origin); await expand(page);
  assert.equal(await page.locator('.theme-card').count(), 31);
  assert.equal(await page.locator('.playground, .specimen, .preview-page, .theme-live-link').count(), 0);
  const requestsAtStart = catalogRequests;
  for (const width of [390, 1440, 1728]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const id of width === 390 ? Object.keys(themes) : representative) {
      for (const mode of ['dark', 'light']) {
        if (await page.locator('html').getAttribute('data-theme') !== mode) await page.getByRole('button', { name: `Switch to ${mode} mode` }).click();
        const button = page.getByRole('button', { name: `Apply ${themes[id].title} theme`, exact: true });
        await button.scrollIntoViewIfNeeded(); await button.focus();
        const before = await page.evaluate(() => scrollY);
        await page.keyboard.press('Enter');
        await selection(page, id, mode);
        assert.equal(await button.getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('.apply-theme[aria-pressed="true"]').count(), 1);
        assert.ok(Math.abs((await page.evaluate(() => scrollY)) - before) <= 1, `${id}: scroll changed`);
        assert.equal(await button.evaluate(node => node === document.activeElement), true);
        assert.equal(new URL(page.url()).searchParams.get('theme'), id);
        assert.equal(new URL(page.url()).searchParams.get('mode'), mode);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.getByRole('tab', { name: 'Server URL', exact: true }).click();
        await page.mouse.move(0, 0);
        const result = await page.evaluate(measure);
        assert.equal(result.backgroundLuminance < .35, mode === 'dark', `${id}: visible surface must be ${mode}`);
        const expected = await page.evaluate(tokens => {
          const node = document.createElement('div'); node.style.backgroundColor = tokens['--background']; node.style.borderRadius = tokens['--radius']; document.body.append(node);
          const result = { background: getComputedStyle(node).backgroundColor, radius: getComputedStyle(node).borderTopLeftRadius }; node.remove(); return result;
        }, themes[id].modes[mode].tokens);
        assert.equal(result.background, expected.background); assert.equal(result.radius, expected.radius);
        const failed = result.contrast.filter(c => c.ratio < 4.5);
        await save('latest-check', { id, mode, width, ...result });
        assert.deepEqual(failed, [], JSON.stringify({ id, mode, width, failed }));
        checks.push({ id, mode, width, minimumContrast: Math.min(...result.contrast.map(c => c.ratio)), measuredLabels: result.contrast.length });
        // Exercise hover colors on the sticky controls, selected card, filter and primary action.
        for (const locator of [button, page.getByRole('button', { name: 'Reset theme' }), page.getByRole('button', { name: 'Light base', exact: true }), page.getByRole('button', { name: 'Copy server URL' })]) {
          await locator.hover();
          assert.deepEqual((await page.evaluate(measure)).contrast.filter(c => c.ratio < 4.5), [], `${id} ${mode}: hover contrast`);
        }
        await page.mouse.move(0, 0); await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
        const state = await page.evaluate(script); state.name = `${id} ${mode} ${width}px`; states.push(state);
        if (representative.includes(id)) {
          await page.screenshot({ path: path.join(dir, `${id}-${mode}-${width}.png`), fullPage: false });
          await page.getByRole('link', { name: 'Themes', exact: true }).click();
          assert.ok(await page.locator('#themes').evaluate(node => node.getBoundingClientRect().top >= document.querySelector('.theme-session').getBoundingClientRect().bottom));
          await page.screenshot({ path: path.join(dir, `${id}-${mode}-${width}-catalog.png`), fullPage: false });
        }
        if (checks.length % 10 === 0) console.log(`Checked ${checks.length} site theme layouts.`);
      }
    }
    console.log(`Verified site themes at ${width}px.`);
  }
  assert.equal(catalogRequests, requestsAtStart, 'Switching must not refetch the catalog');
  behaviors.push('all 31 Apply buttons in dark and light', 'selection label and pressed state', 'scroll and keyboard focus preserved', 'source background and radius applied', 'no page navigation or catalog refetch', 'text, input and hover contrast', 'visible anchor destinations below sticky controls');
  // Preserve catalog and connection state, including clipboard feedback.
  await page.getByRole('tab', { name: 'JSON', exact: true }).click();
  await page.getByRole('button', { name: 'Copy configuration' }).click();
  const search = page.getByRole('searchbox', { name: 'Search themes' });
  await search.fill('linear');
  await page.getByRole('button', { name: 'Dark base', exact: true }).click();
  await page.getByRole('button', { name: 'Apply Linear theme', exact: true }).click();
  assert.equal(await search.inputValue(), 'linear');
  assert.equal(await page.getByRole('button', { name: 'Dark base', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByRole('tab', { name: 'JSON', exact: true }).getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('.copy-feedback').textContent(), 'Copied to clipboard.');
  await page.reload(); await page.locator('.theme-card').first().waitFor(); await selection(page, 'linear', 'light');
  assert.equal(await search.inputValue(), 'linear');
  await page.goto(origin); await page.locator('.theme-card').first().waitFor(); await selection(page, 'linear', 'light');
  await search.fill('linear'); await page.getByRole('button', { name: 'Reset theme' }).click();
  await selection(page, null, 'light'); assert.equal(await search.inputValue(), 'linear');
  assert.equal(await page.locator('html').evaluate(node => node.style.length), 0);
  assert.equal(await page.getByRole('button', { name: 'Reset theme' }).isDisabled(), true);
  assert.equal(new URL(page.url()).searchParams.has('theme'), false);
  await page.goto(origin); await selection(page, null, 'light');
  behaviors.push('search, filter, setup tab and clipboard feedback preserved', 'reload and root revisit persistence', 'reset removes overrides and saves default while retaining mode and search');
  for (const query of ['theme=stripe', 'preview=stripe']) {
    await page.goto(`${origin}/?${query}&mode=dark&q=stripe#themes`); await page.locator('.theme-card').first().waitFor();
    await selection(page, 'stripe', 'dark'); assert.equal(await search.inputValue(), 'stripe');
    assert.equal(new URL(page.url()).searchParams.get('theme'), 'stripe');
    assert.equal(new URL(page.url()).searchParams.has('preview'), false);
  }
  for (const id of ['missing-theme', '__proto__']) {
    await page.goto(`${origin}/?theme=${id}&mode=light`); await page.locator('.theme-card').first().waitFor();
    await selection(page, null, 'light'); assert.equal(await page.locator('html').evaluate(node => node.style.length), 0);
  }
  await page.evaluate(() => { history.pushState(null, '', '?theme=airbnb&mode=dark&q=airbnb'); dispatchEvent(new PopStateEvent('popstate')); });
  await selection(page, 'airbnb', 'dark'); assert.equal(await search.inputValue(), 'airbnb');
  await page.goBack(); await selection(page, null, 'light'); assert.equal(await search.inputValue(), '');
  await page.route('**/api/catalog', route => route.abort());
  await page.goto(`${origin}/?theme=stripe&mode=dark`); await page.getByRole('alert').waitFor(); await selection(page, 'stripe', 'dark');
  await page.getByRole('button', { name: 'Switch to light mode' }).click(); await selection(page, 'stripe', 'light');
  await page.getByRole('button', { name: 'Reset theme' }).click(); await selection(page, null, 'light');
  await page.unroute('**/api/catalog');
  const noStorage = await browser.newContext({ viewport: { width: 390, height: 1000 } });
  await noStorage.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Disabled', 'SecurityError'); } }));
  const isolated = await noStorage.newPage(); isolated.setDefaultTimeout(15000); isolated.on('pageerror', e => errors.push(e.message));
  await isolated.goto(`${origin}/?theme=linear&mode=dark`); await isolated.locator('.theme-card').first().waitFor();
  await isolated.getByRole('button', { name: 'Apply Stripe theme', exact: true }).click();
  await isolated.getByRole('button', { name: 'Switch to light mode' }).click(); await isolated.reload(); await selection(isolated, 'stripe', 'light');
  await isolated.getByRole('button', { name: 'Reset theme' }).click(); await selection(isolated, null, 'light');
  await noStorage.close();
  behaviors.push('theme deep links and legacy preview migration', 'invalid and prototype IDs recover safely', 'browser history restores theme and search', 'mode and reset work during catalog outages', 'storage-disabled selection, URL persistence and reset');
  await page.goto(origin); await page.locator('.theme-card').first().waitFor();
  const panels = await page.evaluate(() => [
    { screen: 'Site theme controls', headline: document.querySelector('.theme-session p').textContent, body: [], actions: [...document.querySelectorAll('.theme-session button')].map(n => n.textContent) },
    { screen: 'Theme catalog introduction', headline: document.querySelector('#themes h2').textContent, body: [document.querySelector('#themes .section-heading p').textContent], actions: [...document.querySelectorAll('#themes .section-heading a')].map(n => n.textContent) },
    { screen: 'Theme attribution', headline: 'Themes', body: [document.querySelector('.catalog-note').textContent], actions: [] },
  ]);
  for (const panel of panels) {
    const result = await client.callTool({ name: 'check-comprehension', arguments: { ...panel, knownTerms: ['MIT', 'React', 'registry', 'token', 'tokens'] } });
    copyChecks.push({ panel, result });
  }
  await save('states', states); await save('checks', checks); await save('comprehension', copyChecks);
  const spacing = [];
  for (let i = 0; i < states.length; i += 6) {
    const result = await client.callTool({ name: 'inspect-spacing', arguments: { states: states.slice(i, i + 6), spacingScale: [4, 8, 12, 16, 20, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96, 104, 128], tolerance: 2, detail: 'full' } });
    await save('spacing-' + i, result); spacing.push(result.structuredContent.summary);
  }
  const summary = { origin, themeCount: Object.keys(themes).length, checkedLayouts: checks.length, modes: ['dark', 'light'], widths: [390, 1440, 1728], minimumContrast: Math.min(...checks.map(c => c.minimumContrast)), spacing, comprehensionChecks: copyChecks.length, comprehensionFailures: copyChecks.filter(c => c.result.structuredContent.verdict !== 'pass').length, pageErrors: errors, behavior: behaviors };
  await save('summary', summary); console.log(JSON.stringify(summary, null, 2));
  assert.deepEqual(errors, []); assert.equal(summary.comprehensionFailures, 0); assert.ok(spacing.every(s => s.critical === 0 && s.serious === 0));
} finally { await browser.close(); await client.close(); }
