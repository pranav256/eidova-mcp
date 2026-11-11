import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { StudioStore } from '../../src/studio-store.js';
import { StudioNativeStore } from '../../src/studio-native-store.js';
import { createStudioBackend } from '../../src/studio-backend.js';
const { createEidovaWorkspaceAuthority, verifyEidovaRequestScope } = await import(new URL('../../../eidova-studio/apps/daemon/src/collab/eidova-workspace-context.ts', import.meta.url).href);
const { createEidovaProjectCatalog } = await import(new URL('../../../eidova-studio/apps/daemon/src/collab/eidova-project-catalog.ts', import.meta.url).href);
const { createAuthorizeProjectRequest, createVerifiedProjectRequestAuthority } = await import(new URL('../../../eidova-studio/apps/daemon/src/collab/project-request-authority.ts', import.meta.url).href);
const { workspaceResourceContextFromRequest } = await import(new URL('../../../eidova-studio/apps/daemon/src/collab/workspace-resource-mutation.ts', import.meta.url).href);

test('native project routes admit exact teammate mirrors for reading and comments while retaining creator-only writes and fresh revocation', async () => {
  const db = new DatabaseSync(':memory:'), store = new StudioStore(db), created = store.createWorkspace('Team', 'Owner');
  const owner = store.identity(created.token), joined = store.join(store.invite(owner).invite, 'Reviewer'), viewer = store.identity(joined.token);
  const native = new StudioNativeStore(store), project = native.ensure(owner, 'launch', 'Launch');
  store.writeFile(owner, project.resourceId, 'index.html', Buffer.from('<h1>Launch</h1>'), 0);
  native.policy(owner, project.projectId, 'team', 0);
  const backend = createStudioBackend(store).listen(0, '127.0.0.1'); await once(backend, 'listening');
  const backendUrl = 'http://127.0.0.1:' + (backend.address() as { port: number }).port;
  // The upstream reconciler deliberately leaves teammate mirrors without a local writer.
  const binding = { workspaceId: owner.workspaceId, visibility: 'team', resourceState: 'active', createdByWorkspaceMemberId: null as string | null, resourceHubResourceId: project.resourceId as string | null };
  const authority = createEidovaWorkspaceAuthority({ url: backendUrl, key: joined.token }), catalog = createEidovaProjectCatalog(authority);
  const app = express();
  const sendApiError = (res: express.Response, status: number, code: string, message: string) => res.status(status).json({ code, message });
  const authorize = createVerifiedProjectRequestAuthority({
    localAuthority: createAuthorizeProjectRequest({ db: {}, getWorkspaceProject: () => binding, getWorkspaceProjectByProjectId: () => binding, sendApiError }),
    getBinding: () => binding,
    verifyWorkspaceRequestAuthority: (req: express.Request) => verifyEidovaRequestScope(authority, workspaceResourceContextFromRequest(req)),
    verifyProjectPolicy: (projectId: string, context: Awaited<ReturnType<typeof authority.provider.current>>, row: typeof binding) => catalog.verifyLocalPolicy(projectId, { teamId: context.workspaceId, memberId: context.workspaceMemberId, role: context.role, lifecycleState: context.lifecycleState }, row),
    isPersonalWorkspaceForAccount: async () => false,
    reconcileMemberRemovalProjects: async () => 0,
    sendApiError,
  });
  for (const [route, mode, capability] of [['read', 'read', undefined], ['write', 'write', 'writeFiles'], ['comment', 'write', 'comment']] as const) {
    app.post('/' + route, async (req, res) => {
      if (await authorize(req, res, project.projectId, mode === 'read' ? { mode } : { mode, capability: capability! })) res.json({ allowed: true });
    });
  }
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const request = (route: string, identity = viewer) => fetch(url + '/' + route, { method: 'POST', headers: { 'x-od-workspace-id': identity.workspaceId, 'x-od-workspace-member-id': identity.memberId, 'x-od-workspace-type': 'team' } });
  try {
    assert.equal((await request('read')).status, 200);
    assert.equal((await request('comment')).status, 200);
    assert.equal((await request('write')).status, 403);
    assert.equal((await request('read', owner)).status, 403);
    binding.resourceHubResourceId = null; assert.equal((await request('read')).status, 403);
    binding.resourceHubResourceId = owner.workspaceId; assert.equal((await request('read')).status, 403);
    binding.resourceHubResourceId = project.resourceId;
    binding.visibility = 'personal'; assert.equal((await request('read')).status, 403); binding.visibility = 'team';
    native.policy(owner, project.projectId, 'private', 1); assert.equal((await request('read')).status, 403);
    native.policy(owner, project.projectId, 'team', 2); assert.equal((await request('read')).status, 200);
    authority.configure({ url: backendUrl, key: created.token }); binding.createdByWorkspaceMemberId = owner.memberId;
    assert.equal((await request('write', owner)).status, 200);
    authority.configure({ url: backendUrl, key: joined.token }); binding.createdByWorkspaceMemberId = null;
    store.revoke(owner, viewer.memberId); assert.equal((await request('read')).status, 401);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await new Promise<void>(resolve => backend.close(() => resolve())); db.close();
  }
});
