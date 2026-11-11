import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { measureTextContrast } from './browser-contrast.mjs';

const origin = process.env.WEBSITE_REVIEW_URL || 'http://127.0.0.1:5173';
const backend = process.env.STUDIO_REVIEW_URL || 'http://127.0.0.1:3210';
const output = resolve('.work/studio-review'); await mkdir(output, { recursive: true });
const save = (name, value) => writeFile(join(output, name + '.json'), JSON.stringify(value, null, 2));
const api = async (path, method = 'GET', body, key) => {
  const response = await fetch(backend + path, { method, headers: { ...(key ? { Authorization: 'Bearer ' + key } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  assert.ok(response.ok, `${method} ${path}: ${response.status}`); return response.status === 204 ? {} : response.json();
};
const client = new Client({ name: 'studio-browser-review', version: '1' });
await client.connect(new StreamableHTTPClientTransport(new URL(process.env.MCP_REVIEW_URL || 'http://127.0.0.1:3000/mcp')));
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), headless: true });
const states = [], panels = [], errors = [], contrasts = [];
try {
  const rules = await client.callTool({ name: 'get-review-rules', arguments: { category: 'all' } }); assert.ok(!rules.isError);
  const files = await Promise.all(['TeamStudio.tsx', 'StudioCollaboration.tsx', 'SharedStudio.tsx', 'App.tsx', 'styles.css', 'theme.css', 'main.tsx', 'components/CopyButton.tsx'].map(async path => ({ path, content: await readFile('../eidova-website/src/' + path, 'utf8') })));
  const source = await client.callTool({ name: 'review-ui-code', arguments: { files } }); await save('source', source);
  const sourceText = source.content.filter(item => item.type === 'text').map(item => item.text).join('\n');
  assert.doesNotMatch(sourceText, /- \*\*(critical|serious)\*\*/, sourceText);
  const capture = await client.callTool({ name: 'inspect-spacing', arguments: { detail: 'full' } });
  assert.ok(capture.structuredContent?.captureScript);
  const record = async (page, name) => {
    await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); }); await page.mouse.move(0, 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, name + ' page overflow');
    const state = await page.evaluate(capture.structuredContent.captureScript); state.name = name; states.push(state);
    contrasts.push({ name, failures: (await page.evaluate(measureTextContrast)).filter(item => item.ratio < item.minimum) });
    await page.screenshot({ path: join(output, name.replaceAll(' ', '-') + '.png'), fullPage: true });
  };
  for (const width of [390, 1440, 1728]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce', colorScheme: 'dark', permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Home navigation overflow');
    await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'Team workspace', exact: true }).click();
    await page.getByRole('heading', { name: 'Connect your workspace' }).waitFor();
    await record(page, width + ' dark connection');
    await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
    await record(page, width + ' light connection');
    await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
    await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
    await page.getByLabel('Workspace name', { exact: true }).fill('Launch team');
    await page.getByLabel('Your name', { exact: true }).fill('Alex Morgan');
    await page.locator('form').getByRole('button', { name: 'Create workspace', exact: true }).click();
    await page.getByRole('heading', { name: 'Launch team', exact: true }).waitFor();
    const key = await page.evaluate(() => sessionStorage.getItem('eidova-studio-key:/api/studio'));
    assert.ok(key);
    await page.getByLabel('Project name', { exact: true }).fill('Autumn launch');
    await page.getByRole('button', { name: 'Create project', exact: true }).click();
    await page.getByRole('heading', { name: 'Autumn launch', exact: true }).waitFor();
    await page.getByLabel('New file path', { exact: true }).fill('index.html');
    await page.getByRole('button', { name: 'New file', exact: true }).click();
    const editor = page.getByRole('textbox', { name: 'File contents', exact: true });
    const content = '<h1>Autumn collection 👋</h1>\n<script>throw new Error("must remain literal")</script>';
    await editor.fill(content);
    await page.getByRole('button', { name: 'Save file', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'File saved.' }).waitFor();
    const workspace = await api('/api/workspace', 'GET', undefined, key), project = workspace.projects[0];
    assert.equal(project.version, 1);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download index.html', exact: true }).click()]);
    assert.equal(await readFile(await download.path(), 'utf8'), content);
    await page.getByLabel('Comment', { exact: true }).fill('Sample feedback: clarify the autumn launch date.');
    await page.getByRole('button', { name: 'Add comment', exact: true }).click();
    await page.getByText('Sample feedback: clarify the autumn launch date.', { exact: true }).waitFor();
    for (const mode of ['dark', 'light']) {
      if (mode === 'light') await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
      await record(page, `${width} ${mode} editor`);
    }
    if (width === 390) {
      panels.push({ screen: 'Team workspace connection form', headline: 'Connect your workspace', body: ['Access stays in this tab. Keep your key to reconnect.'], actions: ['Create workspace', 'Join workspace', 'Connect'] });
      // Review independent forms separately; all visible editor actions are included.
      for (const [selector, headline] of [['.studio-projects form', 'Projects'], ['.studio-new-file', 'New file'], ['.studio-editor form:has(.studio-code)', 'Autumn launch'], ['.studio-comments form', 'Feedback']]) {
        panels.push(await page.locator(selector).evaluate((node, headline) => ({ screen: headline + ' form', headline, body: [...node.querySelectorAll('label')].map(label => label.firstChild?.textContent || ''), actions: [...node.querySelectorAll('button')].map(button => button.textContent) }), headline));
      }
      panels.push(await page.locator('.studio-file-list').evaluate(node => ({ screen: 'Project files', headline: 'Autumn launch', body: [], actions: [...node.querySelectorAll('button')].map(button => button.textContent) })));
      await page.getByRole('button', { name: 'Resolve comment', exact: true }).click();
      await page.getByText('Resolved', { exact: true }).waitFor();
      await editor.fill('Local unsaved draft');
      page.once('dialog', dialog => dialog.dismiss());
      await page.getByRole('button', { name: 'Reload project', exact: true }).click();
      assert.equal(await editor.inputValue(), 'Local unsaved draft');
      assert.equal((await api('/api/projects/' + project.id, 'GET', undefined, key)).version, 1, 'Reload must not submit the save form');
      await api('/api/projects/' + project.id + '/file', 'PUT', { path: 'index.html', content: 'Teammate saved changes', expectedVersion: 1 }, key);
      await page.getByRole('button', { name: 'Save file', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'The project changed.' }).waitFor();
      assert.equal(await editor.inputValue(), 'Local unsaved draft');
      await record(page, '390 light conflict');
      await page.getByRole('button', { name: 'Copy file contents', exact: true }).click();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'Local unsaved draft');
      page.once('dialog', dialog => dialog.accept());
      await page.getByRole('button', { name: 'Reload project', exact: true }).click();
      await page.getByRole('button', { name: 'index.html', exact: true }).click();
      assert.equal(await editor.inputValue(), 'Teammate saved changes');
      await page.route('**/api/studio/api/projects/*/file', async route => {
        if (route.request().method() === 'PUT') { await new Promise(r => setTimeout(r, 250)); await route.abort(); } else await route.continue();
      });
      await editor.fill('Draft survives network failure');
      await page.getByRole('button', { name: 'Save file', exact: true }).click();
      assert.equal(await editor.getAttribute('readonly'), '');
      await page.getByRole('alert').filter({ hasText: 'did not confirm' }).waitFor();
      assert.equal(await editor.inputValue(), 'Draft survives network failure');
      await page.unroute('**/api/studio/api/projects/*/file');
      await page.locator('.studio-access > summary').click();
      await page.getByRole('button', { name: 'Create invitation', exact: true }).click();
      const invitation = page.getByRole('textbox', { name: 'Invitation', exact: true }); await invitation.waitFor();
      await record(page, '390 light invitation');
      panels.push({ screen: 'Invitation', headline: 'Workspace access', body: ['This invitation works once and expires in 24 hours.'], actions: ['Copy invitation'] });
      const second = await context.newPage(); second.on('pageerror', e => errors.push(e.message)); await second.goto(origin + '/studio');
      await second.getByRole('button', { name: 'Join workspace', exact: true }).click();
      await second.getByLabel('Your name', { exact: true }).fill('Sam Rivera');
      await second.getByLabel('Invitation', { exact: true }).fill(await invitation.inputValue());
      await second.locator('form').getByRole('button', { name: 'Join workspace', exact: true }).click();
      await second.getByRole('heading', { name: 'Launch team', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Refresh projects', exact: true }).click();
      await page.getByText('Sam Rivera · member', { exact: true }).waitFor();
      page.once('dialog', dialog => dialog.accept());
      await page.getByRole('button', { name: 'Remove member', exact: true }).click();
      await second.getByRole('button', { name: 'Refresh projects', exact: true }).click();
      await second.getByRole('alert').filter({ hasText: 'valid workspace key' }).waitFor();
      await second.close();
      await page.route('**/api/studio/api/workspace', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ name: 'Broken', projects: [null], members: [null] }) }));
      await page.getByRole('button', { name: 'Refresh projects', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'invalid workspace' }).waitFor();
      assert.equal(await editor.inputValue(), 'Draft survives network failure');
      await page.unroute('**/api/studio/api/workspace');
      await page.locator('.studio-handoff summary').filter({ hasText: 'Use with a coding agent' }).click();
      await record(page, '390 light agent handoff');
      const handoff = page.locator('.studio-handoff').filter({ has: page.getByText('Keep this key private. It grants your workspace access.', { exact: true }) });
      panels.push(await handoff.evaluate(node => ({ screen: 'Coding agent handoff', headline: node.querySelector('summary').textContent, body: [...node.querySelectorAll('p')].map(p => p.textContent), actions: [...node.querySelectorAll('button,a')].map(button => button.textContent) })));
      assert.equal(await handoff.getByRole('textbox').inputValue(), key);
      await page.evaluate(() => Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async () => { throw new Error('Clipboard unavailable'); } }));
      await handoff.getByRole('button', { name: 'Copy workspace key', exact: true }).click();
      await handoff.getByRole('status').filter({ hasText: 'copy it manually' }).waitFor();
      await handoff.getByRole('textbox').focus();
      assert.equal(await handoff.getByRole('textbox').evaluate(node => node.selectionEnd - node.selectionStart), key.length);
    }
    await page.getByText('Revision history', { exact: true }).click();
    await page.getByRole('button', { name: 'Refresh history', exact: true }).click();
    await page.getByRole('button', { name: 'Review revision 1', exact: true }).click();
    await page.getByRole('button', { name: 'Read index.html', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Revision file preview', exact: true }).inputValue(), content);
    await record(page, `${width} light revision review`);
    if (width === 390) {
      const accept = dialog => dialog.accept(); page.on('dialog', accept);
      await page.getByRole('button', { name: 'Restore revision 1', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Revision restored.' }).waitFor(); page.off('dialog', accept);
      assert.equal((await api('/api/projects/' + project.id, 'GET', undefined, key)).version, 3);
      await page.locator('.studio-file-list').getByRole('button', { name: 'index.html', exact: true }).click();
      assert.equal(await editor.inputValue(), content);
    }
    await page.getByText('Revision history', { exact: true }).click();
    await page.getByText('Share a revision', { exact: true }).click();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Create share link', exact: true }).click();
    const shareLink = page.getByRole('textbox', { name: 'Share link', exact: true }); await shareLink.waitFor();
    await record(page, `${width} light share controls`);
    const shared = await context.newPage(); shared.on('pageerror', e => errors.push(e.message));
    await shared.goto(await shareLink.inputValue());
    await shared.getByRole('button', { name: 'Read index.html', exact: true }).click();
    assert.equal(await shared.getByRole('textbox', { name: 'Shared file preview', exact: true }).inputValue(), content);
    await record(shared, `${width} light shared revision`);
    await shared.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
    await record(shared, `${width} dark shared revision`);
    await page.getByRole('button', { name: 'Revoke share', exact: true }).click();
    await shared.reload(); await shared.getByRole('alert').filter({ hasText: 'expired or unavailable' }).waitFor();
    await shared.close();
    if (width === 390) {
      await page.getByText('Recovery and key rotation', { exact: true }).click();
      await page.getByRole('button', { name: 'Create recovery key', exact: true }).click();
      const recovery = page.getByRole('textbox', { name: 'Recovery key', exact: true }); await recovery.waitFor(); const recoveryKey = await recovery.inputValue();
      await record(page, '390 light key recovery');
      page.once('dialog', dialog => dialog.accept());
      await page.getByRole('button', { name: 'Replace workspace key', exact: true }).click();
      await page.getByRole('button', { name: 'Refresh projects', exact: true }).click();
      const rotatedKey = await page.evaluate(() => sessionStorage.getItem('eidova-studio-key:/api/studio')); assert.notEqual(rotatedKey, key);
      assert.equal((await fetch(backend + '/api/workspace', { headers: { Authorization: 'Bearer ' + key } })).status, 401);
      await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
      await page.getByText('Recover workspace access', { exact: true }).click();
      await page.getByLabel('Saved recovery key', { exact: true }).fill(recoveryKey);
      await page.getByRole('button', { name: 'Recover access', exact: true }).click();
      await page.getByRole('heading', { name: 'Launch team', exact: true }).waitFor();
      assert.notEqual(await page.evaluate(() => sessionStorage.getItem('eidova-studio-key:/api/studio')), rotatedKey);
      panels.push({ screen: 'Revision history', headline: 'Revision history', body: ['Current revision: 3. Restoring keeps previous revisions.'], actions: ['Refresh history'] });
      panels.push({ screen: 'Create share', headline: 'Share a revision', body: ['Anyone with the link can download its files and project details for 24 hours.'], actions: ['Create share link'] });
      panels.push({ screen: 'Recovery setup', headline: 'Recovery and key rotation', body: ['Save a recovery key privately before replacing your workspace key.'], actions: ['Create recovery key'] });
      panels.push({ screen: 'Recover access', headline: 'Recover workspace access', body: ['A saved recovery key replaces your lost workspace key.'], actions: ['Recover access'] });
      panels.push({ screen: 'Shared revision', headline: 'Shared revision 3', body: ['A fixed copy shared by its owner. Files are displayed as text.', 'Preview limited to 200,000 characters.'], actions: ['Read index.html', 'Download revision'] });
    }
    await context.close();
  }
  const nativeWorkspace = await api('/api/workspaces', 'POST', { name: 'Native design review', displayName: 'Administrator' });
  const creatorInvite = await api('/api/invites', 'POST', {}, nativeWorkspace.token);
  const creator = await api('/api/join', 'POST', { invite: creatorInvite.invite, displayName: 'Designer' });
  const viewerInvite = await api('/api/invites', 'POST', {}, nativeWorkspace.token);
  const viewer = await api('/api/join', 'POST', { invite: viewerInvite.invite, displayName: 'Reviewer' });
  const nativeProject = await api('/api/native/projects', 'POST', { projectId: 'native-review', name: 'Native landing page' }, creator.token);
  await api('/api/projects/' + nativeProject.resourceId + '/file', 'PUT', { path: 'index.html', content: '<h1>Product launch</h1>', expectedVersion: 0 }, creator.token);
  await api('/api/native/projects/native-review/visibility', 'PUT', { visibility: 'team', expectedPolicyVersion: 0 }, creator.token);
  for (const width of [390, 1440, 1728]) {
    const open = async credential => {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce', colorScheme: 'dark' });
      await context.addInitScript(key => sessionStorage.setItem('eidova-studio-key:/api/studio', key), credential);
      const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
      await page.goto(origin + '/studio');
      await page.getByText('Design Studio', { exact: true }).click();
      assert.equal(await page.getByRole('link', { name: 'Open design Studio', exact: true }).getAttribute('href'), 'http://127.0.0.1:7457/');
      await page.getByRole('button', { name: 'Native landing page', exact: true }).click();
      await page.getByRole('heading', { name: 'Native landing page', exact: true }).waitFor();
      await page.getByRole('button', { name: 'index.html', exact: true }).click();
      await page.getByRole('textbox', { name: 'File contents', exact: true }).waitFor();
      return { page, context };
    };
    const author = await open(creator.token), reader = await open(viewer.token);
    try {
      assert.equal(await reader.page.getByRole('textbox', { name: 'File contents', exact: true }).getAttribute('readonly'), '');
      assert.equal(await reader.page.getByRole('button', { name: 'Save file', exact: true }).count(), 0);
      assert.equal(await reader.page.getByRole('button', { name: 'New file', exact: true }).count(), 0);
      await reader.page.getByText('Revision history', { exact: true }).click();
      await reader.page.getByRole('button', { name: 'Refresh history', exact: true }).click();
      await reader.page.getByRole('button', { name: 'Review revision 0', exact: true }).click();
      assert.equal(await reader.page.getByRole('button', { name: 'Restore revision 0', exact: true }).count(), 0);
      await record(reader.page, width + ' dark native read only');
      await reader.page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
      await record(reader.page, width + ' light native read only');
      await reader.page.getByLabel('Comment', { exact: true }).fill('Clarify the launch headline.');
      await reader.page.getByRole('button', { name: 'Add comment', exact: true }).click();
      await reader.page.getByText('Clarify the launch headline.', { exact: true }).last().waitFor();
      await author.page.getByRole('button', { name: 'Reload project', exact: true }).click();
      assert.equal(await author.page.getByRole('button', { name: 'Resolve comment', exact: true }).count() > 0, true);
      await author.page.getByText('Revision history', { exact: true }).click();
      await author.page.getByRole('button', { name: 'Refresh history', exact: true }).click();
      await author.page.getByRole('button', { name: 'Review revision 0', exact: true }).click();
      assert.equal(await author.page.getByRole('button', { name: 'Restore revision 0', exact: true }).isEnabled(), true);
      await author.page.getByText('Share a revision', { exact: true }).click();
      assert.equal(await author.page.getByRole('button', { name: 'Create share link', exact: true }).count(), 1);
      await record(author.page, width + ' dark native creator');
      await author.page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
      await record(author.page, width + ' light native creator');
      if (width === 390) {
        author.page.once('dialog', dialog => dialog.accept());
        await author.page.getByRole('button', { name: 'Make private', exact: true }).click();
        await author.page.getByRole('status').filter({ hasText: 'Project visibility updated.' }).waitFor();
        await reader.page.getByRole('button', { name: 'Reload project', exact: true }).click();
        await reader.page.getByRole('alert').filter({ hasText: 'Project not found' }).waitFor();
        await record(reader.page, '390 light native access removed');
        author.page.once('dialog', dialog => dialog.accept());
        await author.page.getByRole('button', { name: 'Share with workspace', exact: true }).click();
        await author.page.getByRole('status').filter({ hasText: 'Project visibility updated.' }).waitFor();
        panels.push({ screen: 'Native reader', headline: 'Native landing page', body: ['Read-only native project. You can review files and leave feedback.'], actions: ['Reload project', 'Copy file contents'] });
        panels.push({ screen: 'Studio launcher', headline: 'Design Studio', body: ['Start Studio on your computer, then open its design editor to create projects using your own model keys.'], actions: ['Open design Studio', 'Studio setup guide'] });
        panels.push({ screen: 'Native creator sharing', headline: 'Team visibility', body: ['Workspace members can read this project and leave feedback.', 'Moving it to private revokes existing revision links.'], actions: ['Make private'] });
      }
    } finally { await author.context.close(); await reader.context.close(); }
  }
  const spacing = [];
  for (let index = 0; index < states.length; index += 2) {
    const result = await client.callTool({ name: 'inspect-spacing', arguments: { states: states.slice(index, index + 2), spacingScale: [4,8,12,16,20,24,28,32,40,48,56,64,80,96,128], detail: 'full' } });
    assert.equal(result.structuredContent?.status, 'completed'); spacing.push(result);
  }
  await save('states', states); await save('spacing', spacing);
  const comprehension = [];
  for (const panel of panels) comprehension.push(await client.callTool({ name: 'check-comprehension', arguments: { ...panel, knownTerms: ['backend', 'workspace', 'Eidova', 'MCP', 'UTF-8', 'coding agent'] } }));
  await save('comprehension', comprehension);
  const summary = { scope: 'Local Team workspace and real SQLite backend; not upstream Studio runtime or deployed hosting.', states: states.length, sourceSha256: Object.fromEntries(files.map(file => [file.path, createHash('sha256').update(file.content).digest('hex')])), errors, contrasts, comprehension: comprehension.map(r => r.structuredContent), spacing: spacing.map(r => r.structuredContent?.summary) };
  await save('summary', summary); console.log(JSON.stringify(summary));
  assert.deepEqual(errors, []); assert.deepEqual(contrasts.flatMap(item => item.failures), []);
  assert.ok(spacing.every(result => result.structuredContent.summary.critical === 0 && result.structuredContent.summary.serious === 0));
  assert.ok(comprehension.every(result => result.structuredContent?.verdict === 'pass'));
} finally { await browser.close(); await client.close(); }
