import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const origin = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/,'');
const keyA = randomBytes(32).toString('base64url');
const keyB = randomBytes(32).toString('base64url');
const clients = [];
async function clientFor(key) {
  const client = new Client({name:'private-state-verification',version:'1'});
  await client.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp`),{requestInit:{headers:{Authorization:`Bearer ${key}`}}}));
  clients.push(client); return client;
}
const asText = result => JSON.stringify(result);
try {
  const alice = await clientFor(keyA);
  const bob = await clientFor(keyB);
  const marker = `Verification workspace ${randomBytes(8).toString('hex')}: show visible focus.`;
  const saved = await alice.callTool({name:'set-team-rules',arguments:{markdown:marker,personApproved:true}});
  assert.ok(!saved.isError);
  assert.doesNotMatch(asText(saved),/not saved|nothing was replaced/);
  const fresh = await clientFor(keyA);
  assert.ok(asText(await fresh.callTool({name:'get-team-rules',arguments:{}})).includes(marker),'Rules persist across client instances');
  assert.ok(!asText(await bob.callTool({name:'get-team-rules',arguments:{}})).includes(marker),'Rules stay owner-isolated');
  const created = await alice.callTool({name:'create-design-system',arguments:{prompt:'Release verification theme',baseDesignSystemId:'minimal-light'}});
  assert.ok(!created.isError);
  const projectId = created.structuredContent?.projectId;
  assert.ok(projectId,'Creation returns a persistent project ID');
  const configured = await alice.callTool({name:'set-design-config',arguments:{projectId,config:{colors:{primary:'#2457a6'},radius:'0.625rem'}}});
  assert.ok(!configured.isError);
  const denied = await bob.callTool({name:'set-design-config',arguments:{projectId,config:{colors:{primary:'#ffffff'}}}});
  assert.match(asText(denied),/not found|failed|error|could not write/i,'Another workspace cannot overwrite the project');
  const deniedPatch = await fetch(`${origin}/api/fragments/${projectId}/config`, {
    method:'PATCH', headers:{Authorization:`Bearer ${keyB}`,'Content-Type':'application/json'},
    body:JSON.stringify({config:{colors:{primary:'#ffffff'}}}),
  });
  assert.equal(deniedPatch.status,422,'An unauthorized HTTP write is rejected');
  assert.match(JSON.stringify(await deniedPatch.json()),/not found/i);
  const read = await fresh.callTool({name:'get-design-config',arguments:{projectId}});
  assert.ok(!read.isError);
  assert.match(asText(read),/#2457a6/,'Owner config is durable');
  const configResponse = await fetch(`${origin}/api/fragments/${projectId}/config`);
  assert.equal(configResponse.status,200);
  assert.equal((await configResponse.json()).colors.primary,'#2457a6','Denied writes leave the owner value unchanged');
  const response = await fetch(`${origin}/api/projects/${projectId}/registry/button.json`);
  assert.equal(response.status,200);
  const item = await response.json();
  assert.equal(item.cssVars.light.primary,'#2457a6');
  assert.equal(item.cssVars.dark.primary,'#2457a6');
  console.log(JSON.stringify({origin,privateRules:'durable and isolated',projectConfig:'durable and owner-isolated',customRegistry:'correct',credentials:'not recorded'}));
} finally {
  await Promise.allSettled(clients.map(client => client.close()));
}
