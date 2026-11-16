import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessAtomicMigrationBudget as audit,ATOMIC_OWNED_READ_BOUND}
  from './v1-atomic-migration-budget.mjs';
import {PAIR_CHUNK} from './v1-variable-block-migration.mjs';

test('pure formula uses real 8-pair chunks and same 120-doc local CAS limit as migration emulator',()=>{
  assert.equal(PAIR_CHUNK,8);
  assert.equal(ATOMIC_OWNED_READ_BOUND,120);
  const code=readFileSync(
    new URL('../staging/imile-management/fleet/v1-variable-block-migration-drill.mjs',import.meta.url),
    'utf8'
  );
  assert.match(code,/const OWNED_READ_BOUND=120;/);
  assert.match(code,/if\(ownedDocs>OWNED_READ_BOUND\)/);
});
test('56 keyed pairs = 112 master+claim and 7 receipts = 119 owned docs ALLOW local budget only',()=>{
  const r=audit({drivers:30,vehicles:26});
  assert.equal(r.valid,true);
  assert.equal(r.keyedPairs,56);
  assert.equal(r.receiptDocuments,7);
  assert.equal(r.ownedReadDocuments,119);
  assert.equal(r.withinProvenReadBound,true);
  assert.equal(r.authorizedForImport,false);
  assert.equal(r.productionTrustRootVerified,false);
});
test('57 pairs = 114+8=122 owned docs hardstop even with 30 unique valid DAs',()=>{
  const r=audit({drivers:30,vehicles:27});
  assert.equal(r.valid,true);
  assert.equal(r.keyedPairs,57);
  assert.equal(r.receiptDocuments,8);
  assert.equal(r.ownedReadDocuments,122);
  assert.equal(r.withinProvenReadBound,false);
  assert.equal(r.reason,'PHASE1_ATOMIC_MIGRATION_READ_BOUND_EXCEEDED');
  assert.equal(r.authorizedForImport,false);
});
test('large 290/440 pairs never silently look import-ready despite local size proof',()=>{
  for(const [drivers,vehicles,pairs,receipts,owned] of [
    [200,90,290,37,617],[220,220,440,55,935]
  ]){
    const r=audit({drivers,vehicles});
    assert.equal(r.keyedPairs,pairs);
    assert.equal(r.receiptDocuments,receipts);
    assert.equal(r.ownedReadDocuments,owned);
    assert.equal(r.withinProvenReadBound,false);
  }
});
test('invalid negative, fractional, overflow and missing counts cannot become permission',()=>{
  for(const counts of [null,{},[],{drivers:-1,vehicles:2},
    {drivers:1.5,vehicles:0},{drivers:'56',vehicles:0},
    {drivers:Number.MAX_SAFE_INTEGER,vehicles:1}]){
    const r=audit(counts);
    assert.equal(r.valid,false);
    assert.equal(r.withinProvenReadBound,false);
    assert.equal(r.authorizedForImport,false);
    assert.equal(r.keyedPairs,null);
  }
});
