import test from 'node:test';
import assert from 'node:assert/strict';
const { createEidovaWorkspaceAuthority, verifyEidovaRequestScope } = await import(new URL('../../../eidova-studio/apps/daemon/src/collab/eidova-workspace-context.ts', import.meta.url).href);
const { createEidovaRunAuthorityMonitor } = await import(new URL('../../../eidova-studio/apps/daemon/src/collab/eidova-run-authority.ts', import.meta.url).href);

test('native authority cancels pinned revoked runs and keeps unrelated runs and transient backend outages', async () => {
  const membership = { schemaVersion: 1, workspaceId: '11111111-1111-4111-8111-111111111111', workspaceName: 'Team', memberId: '22222222-2222-4222-8222-222222222222', displayName: 'Owner', role: 'owner', memberCount: 1, memberLimit: 100 };
  let mode = 'active';
  const authority = createEidovaWorkspaceAuthority({ url: 'https://own.example', key: 'a'.repeat(43) }, { fetch: async (url: string) => {
    if (mode === 'outage') throw new Error('Network unavailable');
    if (mode === 'revoked') return Response.json({}, { status: 401 });
    if (url.endsWith('/api/identity')) return Response.json(membership);
    return Response.json({}, { status: 404 });
  } });
  const scoped = { projectId: 'local', workspaceScope: { workspaceId: membership.workspaceId, workspaceMemberId: membership.memberId } }, unbound = { projectId: 'unbound' }, canceled: unknown[] = [];
  const monitor = createEidovaRunAuthorityMonitor({ authority, listRuns: () => [scoped, unbound], cancel: async (run: unknown) => { canceled.push(run); } });
  try {
    const exact = await verifyEidovaRequestScope(authority, { workspaceId: membership.workspaceId, workspaceMemberId: membership.memberId }); assert.ok(exact.ok); assert.equal(exact.context.providerMode, 'personal_byok');
    assert.equal((await verifyEidovaRequestScope(authority, 'missing')).status, 400);
    assert.equal((await verifyEidovaRequestScope(authority, { workspaceId: membership.workspaceId, workspaceMemberId: membership.workspaceId })).status, 403);
    await monitor.check(); assert.deepEqual([...canceled], []);
    mode = 'outage'; await monitor.check(); assert.deepEqual([...canceled], []);
    mode = 'revoked'; await monitor.check(); assert.deepEqual([...canceled], [scoped]);
    canceled.length = 0; mode = 'active';
    const deleted = createEidovaRunAuthorityMonitor({ authority, listRuns: () => [scoped], resourceId: () => 'registered-resource', cancel: async (run: unknown) => { canceled.push(run); } });
    try { await deleted.check(); assert.deepEqual([...canceled], [scoped]); } finally { deleted.dispose(); }
  } finally { monitor.dispose(); }
});
