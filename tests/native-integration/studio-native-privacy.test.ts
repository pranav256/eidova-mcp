import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { StudioStore } from '../../src/studio-store.js';
import { createStudioBackend } from '../../src/studio-backend.js';
const { registerEidovaCloudBoundary } = await import(new URL('../../../eidova-studio/apps/daemon/src/routes/eidova-cloud-boundary.ts', import.meta.url).href);

test('own-backend routes block legacy cloud operations and keep Local BYOK reachable', async () => {
  const app = express(); let upstreamRequests = 0;
  registerEidovaCloudBoundary(app);
  app.use(['/api/integrations/vela', '/api/amr', '/api/touchpoints'], (_req, res) => { upstreamRequests++; res.json({ upstream: true }); });
  app.post('/api/byok/test', (_req, res) => res.json({ local: true }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  try {
    const status = await fetch(origin + '/api/integrations/vela/status');
    assert.equal(status.status, 200); assert.deepEqual(await status.json(), { loggedIn: false, loginInFlight: false, profile: 'eidova', user: null, configPath: '' });
    for (const [path, method] of [['/api/integrations/vela/login', 'POST'], ['/api/integrations/vela/api-proxy/account', 'GET'], ['/api/amr/models', 'GET'], ['/api/amr/web-intent', 'POST'], ['/api/touchpoints/test-runtime/context', 'POST']]) {
      const response = await fetch(origin + path, { method }); assert.equal(response.status, 409);
      assert.equal((await response.json()).error, 'EIDOVA_LOCAL_PROVIDER_REQUIRED');
    }
    assert.equal(upstreamRequests, 0);
    assert.deepEqual(await (await fetch(origin + '/api/byok/test', { method: 'POST' })).json(), { local: true });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('the actual Node 24 launcher verifies backend authority without a native installation or leaking keys', async () => {
  const db = new DatabaseSync(':memory:'), store = new StudioStore(db), workspace = store.createWorkspace('Launcher check', 'Owner');
  const server = createStudioBackend(store).listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  let result: { stdout: string; stderr: string; code?: number };
  try {
    try { result = await promisify(execFile)(process.execPath, [fileURLToPath(new URL('../../scripts/studio.mjs', import.meta.url)), 'check', '--backend'], { env: { ...process.env, EIDOVA_STUDIO_URL: url, EIDOVA_STUDIO_KEY: workspace.token }, windowsHide: true }); }
    catch (error) { result = error as typeof result; assert.equal(result.code, 1); }
    const check = JSON.parse(result.stdout);
    assert.deepEqual(check.backend, { configured: true, verified: true, workspaceId: workspace.workspaceId, memberId: workspace.memberId, providerMode: 'personal_byok' });
    assert.equal(check.runtimeVerified, false); assert.ok(!result.stdout.includes(workspace.token)); assert.ok(!result.stderr.includes(workspace.token));
    await assert.rejects(promisify(execFile)(process.execPath, [fileURLToPath(new URL('../../scripts/studio.mjs', import.meta.url)), 'start'], { env: { ...process.env, EIDOVA_STUDIO_URL: url, EIDOVA_STUDIO_KEY: workspace.token, OD_DATA_DIR: 'relative-data-root' }, windowsHide: true }), /OD_DATA_DIR/);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); db.close(); }
});
