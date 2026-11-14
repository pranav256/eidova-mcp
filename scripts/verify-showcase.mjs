import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { chromium } from 'playwright';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { measureTextContrast } from './browser-contrast.mjs';

const origin = process.env.WEBSITE_REVIEW_URL || 'http://127.0.0.1:5511';
const website = path.resolve(process.env.WEBSITE_SOURCE_DIR || '../eidova-website');
const output = path.resolve(process.argv[2] || '.work/showcase/review');
await mkdir(output, { recursive: true });
const save = (name, data) => writeFile(path.join(output, name + '.json'), JSON.stringify(data, null, 2));
const client = new Client({ name: 'eidova-showcase-review', version: '1' });
await client.connect(new StreamableHTTPClientTransport(new URL(process.env.MCP_REVIEW_URL || 'http://127.0.0.1:3411/mcp')));
const calls = [];
async function call(name, args) {
  const result = await client.callTool({ name, arguments: args });
  calls.push({ name, args, result });
  assert.ok(!result.isError, JSON.stringify(result));
  return result;
}
const data = JSON.parse(await readFile(path.join(website, 'src/showcase-data.json'), 'utf8'));
const palettes = JSON.parse(await readFile(path.join(website, 'src/catalog-themes.json'), 'utf8'));
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), headless: true });
const states = [], panels = [], errors = [], contrast = [];
try {
  const capabilities = JSON.parse((await call('get-capabilities', {})).content[0].text);
  assert.equal(capabilities.library.total, data.library.total);
  assert.equal((await client.listTools()).tools.length, data.publicTools);
  await call('get-review-rules', { category: 'all' });
  const files = await Promise.all(['Showcase.tsx','showcase.css','styles.css','clean.css','App.tsx','main.tsx','components/ui/button.tsx','components/ui/input.tsx','components/ui/textarea.tsx','components/CopyButton.tsx'].map(async file => ({ path: file, content: await readFile(path.join(website, 'src', file), 'utf8') })));
  const source = await call('review-ui-code', { files });
  const inventory = await readdir(path.join(website, 'src/components/ui'));
  const findings = source.content.filter(block => block.type === 'text').map(block => block.text).join('\n').split('\n').filter(line => /^- \*\*(critical|serious)\*\*/.test(line));
  const exceptions = findings.filter(line => line.includes('`element/select`') && !inventory.some(file => /^select\./i.test(file)));
  assert.deepEqual(findings.filter(line => !exceptions.includes(line)), []);
  await save('source', { source, inventory, exceptions, reason: 'No house Select exists. The labeled native selects use the existing product tokens and platform keyboard/mobile behavior.' });
  const capture = (await call('inspect-spacing', { detail: 'full' })).structuredContent.captureScript;

  for (const width of [390,1440,1728]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce', permissions: ['clipboard-read','clipboard-write'] });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    for (const mode of ['light','dark']) {
      await page.goto(origin + '/showcase?mode=' + mode, { waitUntil: 'networkidle' });
      await page.getByRole('heading', { name: 'The toolkit. In your hands.', exact: true }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      assert.ok(await page.evaluate(() => document.fonts.check('500 16px Inter')));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.ok(await page.evaluate(() => document.documentElement.scrollHeight > 8000));
      assert.equal(await page.locator('.showcase-family-card').count(), 8);
      if (width === 390) await page.locator('.mobile-menu summary').click();
      assert.equal(await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Showcase', exact: true }).getAttribute('aria-current'), 'page');
      if (width === 390) await page.locator('.mobile-menu summary').press('Escape');
      await page.getByRole('link', { name: 'Skip to showcase', exact: true }).focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#showcase-main').evaluate(node => node === document.activeElement), true);
      await page.evaluate(() => window.scrollTo(0, 0));
      for (const href of await page.locator('.showcase-chapter-nav a').evaluateAll(links => links.map(link => link.getAttribute('href')))) assert.equal(await page.locator(href).count(), 1);
      assert.equal(await page.locator('.showcase-capabilities li').count(), 6);
      for (const href of await page.locator('.showcase-capabilities a').evaluateAll(links => links.map(link => link.getAttribute('href')))) {
        if (href.startsWith('#')) assert.equal(await page.locator(href).count(), 1);
        else assert.equal(href, '/studio');
      }
      await page.screenshot({ path: path.join(output, `${width}-${mode}-hero.png`) });
      for (const id of ['components','foundations','icons','interactions','copy-lab','tool-directory']) await page.locator('#' + id).screenshot({ path: path.join(output, `${width}-${mode}-${id}.png`) });
      let state = await page.evaluate(capture); state.name = `${width} ${mode} showcase base`; states.push(state);
      contrast.push({ width, mode, state: 'base', failures: (await page.evaluate(measureTextContrast)).filter(item => item.ratio < item.minimum) });
      if (width === 390 && mode === 'light') {
        panels.push(await page.locator('.showcase-hero > div').evaluate(node => ({ screen: 'Showcase introduction', headline: node.querySelector('h1').textContent, body: [node.querySelector('h1 + p').textContent], actions: ['Enter the playground','Explore the tools'] })));
        for (const node of await page.locator('.showcase-capabilities a').all()) panels.push(await node.evaluate(node => ({ screen: node.querySelector('h3').textContent, headline: node.querySelector('h3').textContent, body: [node.querySelector('p').textContent], actions: [node.querySelector('.showcase-capability-link').textContent] })));
        for (const id of ['components','foundations','icons','interactions','copy-lab','guidance','workflows','tool-directory']) panels.push(await page.locator('#' + id + ' .showcase-chapter').evaluate(node => ({ screen: node.querySelector('h2').textContent, headline: node.querySelector('h2').textContent, body: [node.querySelector('p:last-child').textContent], actions: [] })));
        for (const selector of ['.showcase-explain-grid article','.showcase-path']) for (const node of await page.locator(selector).all()) panels.push(await node.evaluate(node => ({ screen: node.querySelector('h3').textContent, headline: node.querySelector('h3').textContent, body: [...node.querySelectorAll('p')].map(node => node.textContent), actions: [], surface: 'reference' })));
      }
      const family = page.getByRole('combobox', { name: 'Design family', exact: true });
      assert.equal(await family.inputValue(), 'minimal-light');
      assert.equal(await page.getByRole('combobox', { name: 'Palette appearance', exact: true }).inputValue(), 'light');
      await family.selectOption('linear');
      assert.equal(new URL(page.url()).searchParams.get('family'), 'linear');
      await page.locator('iframe[title="Precision interactive components"]').scrollIntoViewIfNeeded();
      const frame = page.frameLocator('iframe[title="Precision interactive components"]');
      await frame.getByRole('heading', { name: 'Workspace settings', exact: true }).waitFor();
      await frame.getByLabel('Workspace name').fill('Showcase sample');
      await frame.getByRole('button', { name: 'Save changes', exact: true }).click();
      await frame.getByRole('status').filter({ hasText: 'Saved in this sample.' }).waitFor();
      await page.getByRole('combobox', { name: 'Token', exact: true }).selectOption('--background');
      await page.getByRole('combobox', { name: 'Palette appearance', exact: true }).selectOption('light');
      assert.equal(await page.locator('.showcase-token-value > code').textContent(), palettes.linear.modes.light.tokens['--background']);
      await page.getByRole('button', { name: 'Copy token', exact: true }).click();
      await page.locator('.showcase-token-value .copy-feedback').filter({ hasText: 'Copied to clipboard.' }).waitFor();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), `--background: ${palettes.linear.modes.light.tokens['--background']};`);
      await page.getByRole('combobox', { name: 'Palette appearance', exact: true }).selectOption('dark');
      assert.equal(await page.locator('.showcase-token-value > code').textContent(), palettes.linear.modes.dark.tokens['--background']);
      await page.getByRole('button', { name: 'Copy palette CSS', exact: true }).click();
      await page.locator('.showcase-token-source .copy-feedback').filter({ hasText: 'Copied to clipboard.' }).waitFor();
      assert.match(await page.evaluate(() => navigator.clipboard.readText()), /:root \{/);
      state = await page.evaluate(capture); state.name = `${width} ${mode} selected family and tokens`; states.push(state);

      await page.getByLabel('Find an icon').fill('palette');
      assert.equal(await page.locator('.showcase-icon-grid > button').count(), 1);
      await page.getByRole('button', { name: 'Select palette icon', exact: true }).click();
      await page.getByRole('combobox', { name: 'Preview size', exact: true }).selectOption('48');
      assert.equal(await page.locator('.showcase-icon-specimen > span').evaluate(node => node.getBoundingClientRect().width), 48);
      await page.getByRole('button', { name: 'Copy SVG source', exact: true }).click();
      await page.locator('.showcase-icon-detail .copy-feedback').filter({ hasText: 'Copied to clipboard.' }).waitFor();
      const svg = await page.evaluate(() => navigator.clipboard.readText()); assert.match(svg, /<svg /); assert.match(svg, /ISC License/); assert.match(svg, /Cole Bemis/);
      await page.getByLabel('Find an icon').fill('no-icon-matches');
      await page.getByRole('heading', { name: 'No matching icons', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Clear icon search' }).click();
      assert.equal(await page.locator('.showcase-icon-grid > button').count(), data.icons.length);

      const form = page.locator('.form-demo');
      await form.getByRole('button', { name: 'Prepare invitation', exact: true }).click();
      assert.equal(await form.getByLabel('Email address').evaluate(node => node.validity.valueMissing), true);
      await form.getByLabel('Email address').fill('invalid-email');
      await form.getByRole('button', { name: 'Prepare invitation', exact: true }).click();
      assert.equal(await form.getByLabel('Email address').evaluate(node => node.validity.typeMismatch), true);
      await form.getByLabel('Email address').fill('maya@example.com');
      await form.getByRole('switch', { name: 'Make the next attempt fail', exact: true }).click();
      await form.getByRole('button', { name: 'Prepare invitation', exact: true }).click();
      await form.getByRole('alert').filter({ hasText: 'Your details are kept.' }).waitFor();
      assert.equal(await form.getByLabel('Email address').inputValue(), 'maya@example.com');
      assert.equal(await form.getByLabel('Teammate’s name').inputValue(), 'Maya Chen');
      await form.getByRole('button', { name: 'Try again', exact: true }).click();
      await form.getByRole('status').filter({ hasText: 'Demo invitation prepared.' }).waitFor();
      await page.getByRole('combobox', { name: 'Duration', exact: true }).selectOption('450');
      await page.getByRole('button', { name: 'Move to finish', exact: true }).click();
      assert.equal(await page.locator('.showcase-motion-object').evaluate(node => getComputedStyle(node).transitionDuration), '0s');
      await page.getByRole('button', { name: 'Move to start', exact: true }).click();
      state = await page.evaluate(capture); state.name = `${width} ${mode} form recovery and selected icon`; states.push(state);

      const lab = page.locator('#copy-lab');
      await lab.getByRole('button', { name: 'Review copy', exact: true }).click();
      await lab.getByRole('heading', { name: 'Copy check passed', exact: true }).waitFor();
      await lab.screenshot({ path: path.join(output, `${width}-${mode}-copy-reviewed.png`) });
      await lab.getByLabel('Supporting copy').fill('This screen describes many different things in unnecessarily long detail. '.repeat(20));
      await lab.getByRole('button', { name: 'Review copy', exact: true }).click();
      await lab.getByRole('heading', { name: 'Refine this draft', exact: true }).waitFor();
      await lab.getByLabel('Supporting copy').fill('Choose a family and try its components.');
      await page.route('**/api/showcase/mcp', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { structuredContent: { verdict: 'pass', words: 'invalid' } } }) }));
      await lab.getByRole('button', { name: 'Review copy', exact: true }).click();
      await lab.getByRole('alert').filter({ hasText: 'Your text is kept.' }).waitFor();
      assert.equal(await lab.getByLabel('Supporting copy').inputValue(), 'Choose a family and try its components.');
      await page.unroute('**/api/showcase/mcp');
      await lab.getByRole('button', { name: 'Review copy', exact: true }).click();
      await lab.getByRole('heading', { name: 'Copy check passed', exact: true }).waitFor();
      state = await page.evaluate(capture); state.name = `${width} ${mode} live copy review`; states.push(state);
      contrast.push({ width, mode, state: 'interactions', failures: (await page.evaluate(measureTextContrast)).filter(item => item.ratio < item.minimum) });
      await page.getByRole('combobox', { name: 'Explore a guide', exact: true }).selectOption('3');
      await page.getByLabel('React Native guidance').waitFor();

      await page.getByLabel('Search the tools').fill('get-ui-principle');
      assert.equal(await page.locator('.showcase-tool-grid > details').count(), 1);
      await page.locator('.showcase-tool-grid summary').first().focus(); await page.keyboard.press('Enter');
      assert.equal(await page.locator('.showcase-tool-grid > details').getAttribute('open'), '');
      await page.getByLabel('Search the tools').fill('');
      await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption('Review');
      assert.equal(await page.locator('.showcase-tool-grid > details').count(), data.tools.filter(tool => tool.category === 'Review').length);
      await page.getByLabel('Search the tools').fill('no-such-tool');
      await page.getByRole('button', { name: 'Clear tool filters' }).click();
      assert.equal(await page.getByLabel('Search the tools').evaluate(node => node === document.activeElement), true);
      while (await page.getByRole('button', { name: 'Show more tools', exact: true }).count()) await page.getByRole('button', { name: 'Show more tools', exact: true }).click();
      assert.equal(await page.locator('.showcase-tool-grid > details').count(), data.publicTools);
      state = await page.evaluate(capture); state.name = `${width} ${mode} complete tool directory`; states.push(state);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.equal(await page.locator('#resources .resource-list > li').count(), 16);
      assert.match(await page.locator('#resources .result-count').textContent(), /of 784 resources/);
    }
    await context.close(); console.log(`Verified ${width}px in both appearances.`);
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  await page.goto(origin + '/showcase?mode=light', { waitUntil: 'networkidle' });
  await page.getByRole('combobox', { name: 'Duration', exact: true }).selectOption('450');
  await page.getByRole('button', { name: 'Move to finish', exact: true }).click();
  await page.getByRole('button', { name: 'Move to start', exact: true }).click();
  assert.equal(await page.locator('.showcase-motion-object.is-moved').count(), 0);
  assert.equal(await page.locator('.showcase-motion-object').evaluate(node => getComputedStyle(node).transitionDuration), '0.45s');
  let delayed;
  await page.route('**/api/showcase/mcp', route => { delayed = route; });
  await page.getByRole('button', { name: 'Review copy', exact: true }).click();
  for (let attempt = 0; !delayed && attempt < 500; attempt++) await page.waitForTimeout(10);
  assert.ok(delayed);
  await page.getByLabel('Headline', { exact: true }).fill('A changed draft');
  await delayed.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { structuredContent: { verdict: 'pass', words: 1, estimatedExplainSeconds: 1, findings: [] } } }) }).catch(() => {});
  assert.equal(await page.getByRole('heading', { name: 'Copy check passed', exact: true }).count(), 0);
  await page.unroute('**/api/showcase/mcp');
  for (const width of [320,560,600,768,1024,1280]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Showcase overflows at ${width}px`);
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  for (const width of [390,768,1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Enlarged text overflows at ${width}px`);
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + '/', { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Good design. Built in.', exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Try the toolkit', exact: true }).getAttribute('href'), '/showcase');
  assert.equal(await page.getByRole('navigation', { name: 'Footer navigation' }).getByRole('link', { name: 'Showcase', exact: true }).getAttribute('href'), '/showcase');
  assert.equal(await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Themes', exact: true }).getAttribute('href'), '#themes');
  assert.equal(await page.locator('.showcase-main').count(), 0);
  assert.equal(await page.getByRole('navigation', { name: 'Footer navigation' }).getByRole('link', { name: 'Connect', exact: true }).getAttribute('href'), '#connect');
  await context.close();

  const comprehension = [];
  for (const panel of panels) comprehension.push(await call('check-comprehension', { ...panel, knownTerms: ['Eidova','MCP','CSS','SVG','Lucide','React','React Native','SwiftUI','Shopify','Three.js','token','tokens','design system','palette','specimen'] }));
  const spacing = [];
  for (let index = 0; index < states.length; index += 2) spacing.push(await call('inspect-spacing', { states: states.slice(index, index + 2), detail: 'full' }));
  const spacingFindings = spacing.flatMap(result => result.structuredContent.findings);
  const blockers = spacingFindings.filter(finding => ['critical','serious'].includes(finding.severity));
  await save('calls', calls); await save('states', states); await save('comprehension', comprehension); await save('spacing', spacing); await save('contrast', contrast);
  const summary = { date: '2026-11-13', origin, widths: [390,1440,1728], appearances: ['light','dark'], states: states.length, panels: panels.length, sourceExceptions: exceptions, comprehension: comprehension.map(result => result.structuredContent), spacingSummary: spacing.map(result => result.structuredContent.summary), spacingBlockers: blockers, pageErrors: errors, contrastFailures: contrast.flatMap(item => item.failures), sourceSha256: Object.fromEntries(files.map(file => [file.path, createHash('sha256').update(file.content).digest('hex')])) };
  await save('summary', summary);
  console.log(JSON.stringify({ states: states.length, panels: panels.length, copyFindings: summary.comprehension.filter(result => result.verdict !== 'pass'), spacingBlockers: blockers, contrastFailures: summary.contrastFailures, pageErrors: errors }));
  assert.deepEqual(errors, []); assert.deepEqual(summary.contrastFailures, []); assert.deepEqual(blockers, []); assert.ok(summary.comprehension.every(result => result.verdict === 'pass'));
} finally { await browser.close(); await client.close(); }
