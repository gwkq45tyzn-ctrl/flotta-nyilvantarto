import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthenticatedSourceContract} from './v1-authenticated-source-contract.mjs';
import {sha256,simulateBackup} from './v1-migration-dryrun.mjs';

const clean=()=>({
  drivers:[
    {id:'synthetic-d1',daCode:'DA0001',name:'A',kapacitas:80,status:'aktiv',
      history:[{nested:{memo:'árvíztűrő',future:[true,{keep:1}]}}]},
    {id:'synthetic-d2',daCode:'DA0002',name:'B',kapacitas:45,status:'aktiv',history:[]}
  ],
  vehicles:[{id:'synthetic-v1',rendszam:'ABC-123',status:'aktiv',
    history:[{parts:[{cost:0,currency:'HUF'}]}]}],
  fuelCards:[{id:'synthetic-fuel',extra:{preserve:true}}],
  contacts:[{id:'synthetic-contact',phone:'NO_REAL_PHONE'}],
  originalMetadata:{future:{extra:true}}
});
const create=raw=>createAuthenticatedSourceContract({
  externalPin:sha256(raw),externalRevision:1
});
function denied(r,match){
  assert.equal(r.ok,false);
  assert.equal(r.sealed,false);
  assert.equal(r.authorizedForImport,false);
  assert.equal(r.provenanceSignerVerified,false);
  assert.equal(r.productionIamVerified,false);
  assert.equal(r.ownerApprovalAuthenticated,false);
  assert.equal(r.externalPinAuthenticityVerified,false);
  if(match)assert.match(r.reason,match);
}
test('real clean full-rich backup and SHA pin ALLOW only local content integrity, never actual provenance',()=>{
  const raw=clean(),c=create(raw);
  const v=c.verify(raw,{backup:simulateBackup(raw)});
  assert.equal(v.ok,true,JSON.stringify(v));
  assert.equal(v.projectedDocumentCount,3);
  assert.equal(v.sourceSha256,sha256(raw));
  assert.equal(v.sealed,false);
  assert.equal(v.authorizedForImport,false);
  assert.equal(v.provenanceSignerVerified,false);
  assert.equal(v.externalPinAuthenticityVerified,false);
  assert.equal(v.productionIamVerified,false);
});
test('missing backup or options not an object DENY even for valid SHA',()=>{
  const raw=clean(),c=create(raw);
  denied(c.verify(raw),/BACKUP_REQUIRED/);
  denied(c.verify(raw,null),/INVALID_OPTIONS/);
  denied(c.verify(raw,[]),/INVALID_OPTIONS/);
});
test('caller may not supply claimed source SHA, revision, IAM principal or approval',()=>{
  const raw=clean(),c=create(raw),backup=simulateBackup(raw);
  for(const extra of [
    {claimedPin:sha256(raw)},{claimedRevision:1},{claimedApproval:true},
    {serviceAccount:'fake'},{iam:true},{authorizedForImport:true},
    {externalPin:sha256(raw)},{externalRevision:1},
    {trustedPinnedSha:sha256(raw)},{ownerApproved:true},
    {backup,claims:{}}
  ])denied(c.verify(raw,{backup,...extra}),/UNTRUSTED_CALLER_SUPPLIED_AUTHORITY/);
});
test('real nested history/contact tampering causes source mismatch even if top-level IDs stay',()=>{
  const raw=clean(),c=create(raw),backup=simulateBackup(raw);
  for(const modify of [
    v=>v.drivers[0].history[0].nested.future[1].keep=999,
    v=>v.contacts[0].phone='CHANGED',
    v=>v.vehicles[0].history[0].parts[0].currency='USD',
    v=>v.originalMetadata.future.extra=false
  ]){
    const forged=structuredClone(raw);modify(forged);
    denied(c.verify(forged,{backup}),/SOURCE_SHA_MISMATCH/);
  }
});
test('self-consistent changed backup cannot override independent trusted pin',()=>{
  const raw=clean(),c=create(raw),backup=simulateBackup(raw);
  backup.snapshot.contacts[0].phone='FORGED';
  backup.sourceSha256=sha256(backup.snapshot);
  denied(c.verify(raw,{backup}),/FULL_RICH_SOURCE_PREFLIGHT_DENIED/);
});
test('poisoned duplicated normalized DA/plate and sourceIndex 0 DENY without claimed authority',()=>{
  for(const kind of ['duplicateDa','duplicatePlate','sourceIndex']){
    const raw=clean();
    if(kind==='duplicateDa')raw.drivers[1].daCode='da0001';
    if(kind==='duplicatePlate')raw.vehicles.push({
      id:'synthetic-v2',rendszam:'abc 123',status:'aktiv',history:[]
    });
    if(kind==='sourceIndex')raw.drivers[0].sourceIndex=0;
    const backup={
      type:'v1-full-rich-backup',version:2,sourceSha256:sha256(raw),
      snapshot:structuredClone(raw),imported:false,
      counts:{drivers:raw.drivers.length,vehicles:raw.vehicles.length,
        fuelCards:raw.fuelCards.length,contacts:raw.contacts.length}
    };
    const c=create(raw);
    denied(c.verify(raw,{backup}),/FULL_RICH_SOURCE_PREFLIGHT_DENIED/);
  }
});
test('malformed source never escapes as a thrown authorization exception',()=>{
  const raw=clean(),c=create(raw);
  const malformed=structuredClone(raw);
  malformed.drivers[0].history[0].nested.future[1].keep=undefined;
  denied(c.verify(malformed,{backup:simulateBackup(raw)}),/INVALID_SOURCE_OR_BACKUP|SOURCE_SHA_MISMATCH/);
  denied(c.verify(null,{backup:simulateBackup(raw)}),/INVALID_SOURCE_OR_BACKUP|SOURCE_SHA_MISMATCH/);
});
test('caller cannot mutate original private source pin/revision through public properties',()=>{
  const raw=clean(),c=create(raw),changed=structuredClone(raw);
  changed.drivers[0].kapacitas=999;
  c.externalPin=sha256(changed);c.externalRevision=888;
  denied(c.verify(changed,{backup:simulateBackup(changed)}),/SOURCE_SHA_MISMATCH/);
  assert.equal(c.verify(raw,{backup:simulateBackup(raw)}).ok,true);
});
test('constructor rejects absent, malformed pin and non-integer or negative revision',()=>{
  assert.throws(()=>createAuthenticatedSourceContract({}),/INDEPENDENT_SOURCE_PIN_REQUIRED/);
  assert.throws(()=>createAuthenticatedSourceContract({externalPin:'f'.repeat(64),externalRevision:0}),/VALID_PINNED_REVISION_REQUIRED/);
  assert.throws(()=>createAuthenticatedSourceContract({externalPin:'f'.repeat(64),externalRevision:'1'}),/VALID_PINNED_REVISION_REQUIRED/);
});
