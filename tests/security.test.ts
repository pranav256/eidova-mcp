import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicAddress,safeFetchPublic } from '../src/safe-fetch.js';
import { workspaceId } from '../src/provider.js';
test('private/reserved IPv4 and IPv6 destinations are rejected',async()=> {
  for (const address of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.1','100.64.0.1','0.0.0.0','::1','fc00::1','::ffff:127.0.0.1','2002:7f00:1::','2001:db8::1']) assert.equal(publicAddress(address),false,address);
  assert.equal(publicAddress('8.8.8.8'),true);
  assert.equal(publicAddress('2606:4700:4700::1111'),true);
  await assert.rejects(safeFetchPublic('http://127.0.0.1/secret'));
  await assert.rejects(safeFetchPublic('https://user:password@example.com/'));
  await assert.rejects(safeFetchPublic('file:///etc/passwd'));
});
test('anonymous users have no private namespace and keys never appear in namespace',()=> {
  assert.equal(workspaceId(),undefined);
  assert.equal(workspaceId(undefined,true),'local');
  assert.throws(()=>workspaceId('guessable'));
  const key='a'.repeat(43);const id=workspaceId(key);
  assert.equal(id!.length,64);assert.notEqual(id,key);assert.notEqual(id,workspaceId('b'.repeat(43)));
});
