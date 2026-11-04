import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { analyze, canonical, firestoreDocumentBytes } from './migration-size-probe.mjs';

test('safe default synthetic run is offline and redacts snapshot contents', () => {
  const res = spawnSync(process.execPath,['features/migration-size-probe.mjs'],{encoding:'utf8'});
  assert.equal(res.status,0,res.stderr);
  const output=JSON.parse(res.stdout);
  assert.equal(output.stop,false);
  assert.equal(output.liveVerified,false);
  assert.ok(output.firestoreDocumentBytes > 0);
  assert.match(output.hash,/^[a-f0-9]{64}$/);
  assert.doesNotMatch(res.stdout,/atadas|test-only-secret/);
});

test('nested vehicle, history, driver fields all affect stable canonical hash', () => {
  const first={vehicles:[{id:'vehicle1',history:[{date:'2026-11-04',km:1234,notes:'αé'}]}],
    drivers:[{name:'Courier'}],revision:1};
  const second={revision:1,drivers:[{name:'Courier'}],
    vehicles:[{history:[{notes:'αé',km:1234,date:'2026-11-04'}],id:'vehicle1'}]};
  assert.equal(canonical(first),canonical(second),'Insertion order must not change hash');
  assert.equal(analyze(first).hash,analyze(second).hash);
  const changed=structuredClone(first);
  changed.vehicles[0].history[0].km=4321;
  assert.notEqual(analyze(first).hash,analyze(changed).hash,
    'History changes MUST affect migration integrity hash');
});

test('large deeply nested history gets STOP even though root JSON may look small',()=>{
  const result=analyze({vehicles:[{id:'large',history:[{proof:'a'.repeat(1_100_000)}]}],drivers:[]});
  assert.equal(result.stop,true,'Huge history must never pass');
  assert.equal(result.history,1);
  assert.ok(result.jsonBytes > 1_048_576);
  assert.match(result.reason,/field value exceeds/i);
});

test('Firestore field-size calculation includes map overhead, UTF-8 and field names',()=>{
  const x={flag:true, n:5, items:[{text:'á'},null,false]};
  const expected=(
    // flottaSharedState/current document-name bytes + 32 document overhead
    (Buffer.byteLength('flottaSharedState')+1) + (Buffer.byteLength('current')+1) + 16+32
    + (Buffer.byteLength('flag')+1)+1
    + (Buffer.byteLength('n')+1)+8
    + (Buffer.byteLength('items')+1)
    + (Buffer.byteLength('text')+1) + (Buffer.byteLength('á')+1) + 32 +1+1
  );
  assert.equal(firestoreDocumentBytes(x),expected);
  assert.ok(analyze(x).firestoreDocumentBytes > 0);
});

test('900KiB warning uses Firestore bytes, not dropped nested JSON keys',()=>{
  const x=analyze({vehicles:[{history:[{note:'a'.repeat(925_000)}]}],drivers:[]});
  assert.equal(x.warn,true);
  assert.equal(x.stop,false);
  assert.ok(x.firestoreDocumentBytes > 900*1024);
});

test('1 MiB guard catches aggregate values even without one oversize string',()=>{
  const x=analyze({vehicles:[{history:[{a:'z'.repeat(550_000),b:'z'.repeat(550_000)}]}],drivers:[]});
  assert.equal(x.stop,true);
  assert.ok(x.firestoreDocumentBytes >= 1_048_572);
});

test('invalid Firestore names and excessive nesting fail closed',()=>{
  assert.match(analyze({vehicles:[],['__forbidden__']:42}).reason,/field name/i);
  let nested={item:'test'};
  for(let n=0;n<22;n++) nested={array:[nested]};
  const r=analyze({vehicles:[],history:nested});
  assert.equal(r.stop,true);
  assert.match(r.reason,/depth/i);
});

test('no accidentally mutable CLI status for oversized data',()=>{
  const r=analyze({vehicles:[{history:[{item:'x'.repeat(1_047_000)}]}]});
  assert.equal(r.stop,true);
  assert.match(r.hash,/^[a-f0-9]{64}$/);
});
