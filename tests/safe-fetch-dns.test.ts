import {test} from 'node:test';
import assert from 'node:assert/strict';
import dns from 'node:dns/promises';
import {getEventListeners} from 'node:events';
import {syncBuiltinESMExports} from 'node:module';
import {setImmediate} from 'node:timers/promises';
import {safeFetchPublic} from '../src/safe-fetch.ts';

test('public fetch cancels pending DNS lookup and removes its abort listener',async()=>{
  const original=dns.lookup;
  let finishLookup: ((addresses: [])=>void)|undefined;
  dns.lookup=(()=>new Promise<[]>((resolve)=>{finishLookup=resolve;})) as unknown as typeof dns.lookup;
  syncBuiltinESMExports();
  const controller=new AbortController();
  const reason=new Error('Extraction cancelled');
  let settled=false;
  const pending=safeFetchPublic('http://pending.example/',0,controller.signal);
  const outcome=pending.then(()=>{settled=true;return undefined;},error=>{settled=true;return error;});
  try {
    assert.ok(finishLookup,'DNS lookup must be pending before cancellation');
    controller.abort(reason);
    await setImmediate();
    assert.equal(settled,true,'Cancellation must reject before DNS completes');
    assert.equal(await outcome,reason);
    assert.equal(getEventListeners(controller.signal,'abort').length,0);
  } finally {
    finishLookup?.([]);
    await outcome;
    dns.lookup=original;syncBuiltinESMExports();
  }
});

test('public fetch removes its DNS abort listener when lookup settles first',async()=>{
  const original=dns.lookup;
  const controller=new AbortController();
  const reason=new Error('DNS lookup failed');
  try {
    for (const lookup of [async()=>{throw reason;},async()=>[]]) {
      dns.lookup=lookup as unknown as typeof dns.lookup;
      syncBuiltinESMExports();
      await assert.rejects(safeFetchPublic('http://pending.example/',0,controller.signal));
      assert.equal(getEventListeners(controller.signal,'abort').length,0);
    }
  } finally {dns.lookup=original;syncBuiltinESMExports();}
});
