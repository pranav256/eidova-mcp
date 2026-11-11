import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { StudioStore } from '../src/studio-store.js';
import { createStudioBackend } from '../src/studio-backend.js';

test('native identity endpoint returns only verified membership and follows rotation and revocation', async () => {
  const db = new DatabaseSync(':memory:'), store = new StudioStore(db);
  const owner = store.createWorkspace('Own backend', 'Owner'), other = store.createWorkspace('Other workspace', 'Other');
  const ownerIdentity = store.identity(owner.token);
  const member = store.join(store.invite(ownerIdentity).invite, 'Member');
  store.createProject(ownerIdentity, 'Private project title');
  const http = createStudioBackend(store).listen(0, '127.0.0.1'); await once(http, 'listening');
  const url = 'http://127.0.0.1:' + (http.address() as { port: number }).port;
  const get = (key: string) => fetch(url + '/api/identity?workspaceId=' + other.workspaceId, { headers: {
    Authorization: 'Bearer ' + key, 'x-od-workspace-id': other.workspaceId, 'x-od-workspace-member-id': other.memberId, 'x-od-workspace-role': 'owner',
  } });
  try {
    assert.equal((await fetch(url + '/api/identity')).status, 401);
    const result = await get(member.token); assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await result.json(), { schemaVersion: 1, workspaceId: owner.workspaceId, workspaceName: 'Own backend',
      memberId: member.memberId, displayName: 'Member', role: 'member', memberCount: 2, memberLimit: 100 });
    const oldIdentity = store.identity(member.token);
    store.revoke(ownerIdentity, member.memberId);
    assert.equal((await get(member.token)).status, 401);
    assert.throws(() => store.membership(oldIdentity), /valid workspace key/);
    const rotated = store.rotateKey(ownerIdentity);
    assert.equal((await get(owner.token)).status, 401);
    const updated = await get(rotated.token); assert.equal(updated.status, 200);
    assert.equal((await updated.json()).memberCount, 1);
    assert.equal((await (await get(other.token)).json()).workspaceId, other.workspaceId);
  } finally { await new Promise<void>(resolve => http.close(() => resolve())); db.close(); }
});
