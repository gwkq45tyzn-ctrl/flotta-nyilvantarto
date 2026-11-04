import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditOriginalFleetRestore,FLEET_ARRAY_KEYS} from './fleet-backup-parity.mjs';

const copy=x=>JSON.parse(JSON.stringify(x));
const original=()=>({
  vehicles:[{id:'synthetic-vehicle',rendszam:'ABC-123',history:[
    {type:'service',time:'2026-01-01',note:{mechanic:'synthetic',details:'nested'}}
  ],insurance:{policy:'SYNTHETIC-TEST-ONLY'}}],
  fuelCards:[{id:'synthetic-card',history:[{type:'refuel',amount:1}]}],
  drivers:[{id:'synthetic-driver',daCode:'DA0001',
    history:[{event:'status',details:{old:'inactive',new:'active'}}]}],
  contacts:[{id:'synthetic-contact',phone:'000-000-0000'}]
});
const restored=(f=original())=>({revision:1,...copy(f),
  updatedAt:'SYNTHETIC',updatedBy:'SYNTHETIC'});
const reason=(x,r)=>assert.ok(x.reasons.includes(r),JSON.stringify(x.reasons));

test('the original index.html uses exactly the four arrays this parity tool audits',()=>{
  const src=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(src,/function snapshot\(\) \{ return JSON\.parse\(JSON\.stringify\(\{vehicles,fuelCards,drivers,contacts\}\)\); \}/);
  assert.deepEqual([...FLEET_ARRAY_KEYS].sort(),['contacts','drivers','fuelCards','vehicles']);
});

test('full nested backup equals Firestore four-array restored snapshot, without live claim',()=>{
  const source=original(),target=restored(source);
  const prev=copy(source),out=auditOriginalFleetRestore(source,target);
  assert.equal(out.status,'PARITY_MATCHED_OFFLINE');
  assert.equal(out.reasons.length,0);
  assert.match(out.payloadSha256,/^[0-9a-f]{64}$/);
  assert.equal(out.restoredPayloadSha256,out.payloadSha256);
  assert.deepEqual(out.counts,{vehicles:1,fuelCards:1,drivers:1,contacts:1});
  assert.ok(out.estimatedFirestoreDocumentBytes>0);
  assert.equal(out.ownerAuthorized,false);
  assert.equal(out.serverApprovalVerified,false);
  assert.equal(out.deployAuthorized,false);
  assert.deepEqual(source,prev,'Never mutate or drop original source sidecars');
  assert.equal(JSON.stringify(out).includes('000-000-0000'),false,
    'No raw private contact content in audit result');
  assert.equal(JSON.stringify(out).includes('mechanic'),false);
});

test('nested object KEY order does not affect hashes but array order does',()=>{
  const a=original();
  const b=restored(a);
  b.vehicles[0].history[0].note={
    details:'nested',mechanic:'synthetic'
  };
  assert.equal(auditOriginalFleetRestore(a,b).status,'PARITY_MATCHED_OFFLINE');
  const c=original();
  c.fuelCards.push({id:'second-card'});
  const d=restored(c);
  d.fuelCards.reverse();
  const mismatch=auditOriginalFleetRestore(c,d);
  assert.equal(mismatch.status,'BLOCKED');
  reason(mismatch,'backup_restore_payload_mismatch');
});

test('a changed nested service note, history event or missing fuel card is a hard STOP',()=>{
  const source=original();
  for(const mutation of [
    d=>{d.vehicles[0].history[0].note.details='tampered';},
    d=>{d.drivers[0].history[0].details.old='modified';},
    d=>{d.fuelCards[0].history[0].amount=999;},
    d=>{d.fuelCards=[];},
    d=>{d.contacts[0].phone='altered';}
  ]){
    const dest=restored(source);
    mutation(dest);
    const out=auditOriginalFleetRestore(source,dest);
    assert.equal(out.status,'BLOCKED');
    reason(out,'backup_restore_payload_mismatch');
  }
});

test('missing arrays and silent unknown source fields cannot be accepted',()=>{
  const src=original(),dst=restored(src);
  for(const k of FLEET_ARRAY_KEYS){
    const broken=copy(src);delete broken[k];
    reason(auditOriginalFleetRestore(broken,dst),'missing_or_invalid_'+k);
    const brokenRestore=copy(dst);delete brokenRestore[k];
    reason(auditOriginalFleetRestore(src,brokenRestore),'missing_or_invalid_'+k);
  }
  reason(auditOriginalFleetRestore({...src,legacyExtra:{data:[]}},dst),
    'unexpected_original_field');
  reason(auditOriginalFleetRestore(src,{...dst,unexpected:null}),
    'unexpected_restored_field');
  reason(auditOriginalFleetRestore(src,{...dst,revision:0}),
    'missing_or_invalid_import_revision');
});

test('server approval must match exact canonical source four-array SHA',()=>{
  const src=original(),dest=restored(src);
  const match=auditOriginalFleetRestore(src,dest);
  const approved=auditOriginalFleetRestore(src,dest,{
    approvedSourceSha256:match.payloadSha256
  });
  assert.equal(approved.status,'PARITY_MATCHED_OFFLINE');
  const bad=auditOriginalFleetRestore(src,dest,{
    approvedSourceSha256:'e'.repeat(64)
  });
  assert.equal(bad.status,'BLOCKED');
  reason(bad,'approval_source_hash_mismatch');
  const invalid=auditOriginalFleetRestore(src,dest,{
    approvedSourceSha256:'invalid'
  });
  reason(invalid,'approval_source_hash_mismatch');
});

test('too-large Firestore original historical snapshot is blocked before import',()=>{
  const src=original();
  src.vehicles[0].history[0].note.details='a'.repeat(1_100_000);
  const out=auditOriginalFleetRestore(src,restored(src));
  assert.equal(out.status,'BLOCKED');
  reason(out,'native_document_size_or_schema_stop');
});

test('test suite/tool never logs or uploads raw customer data',()=>{
  const s=readFileSync(new URL('./fleet-backup-parity.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(s,/fetch\s*\(|firebase|setDoc\s*\(|updateDoc\s*\(|console\.log\s*\(|fs\./i);
});
