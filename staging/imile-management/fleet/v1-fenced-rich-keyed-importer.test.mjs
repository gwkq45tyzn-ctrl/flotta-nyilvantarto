/**
 * ORIGINAL full restricted Firestore Rules, two distinct SDK instances.
 * The privileged bypass here is test-only; all records are synthetic.
 * Actual rich master and immutable claim writes are transactionally fenced.
 *
 * Mandatory emulators:exec; fail closed if no emulator (NO silent SKIP).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,deleteDoc,updateDoc,collection,getDocs} from 'firebase/firestore';
import {createLocalFencedRichKeyedImporter} from './v1-fenced-rich-keyed-importer.mjs';
import {createLocalEmulatorFencing} from './v1-local-emulator-persistent-fencing.mjs';
import {sha256,simulateBackup,buildPlan} from '../../../tools/v1-migration-dryrun.mjs';

const projectId='demo-imile-v1-rich-keyed',host='127.0.0.1',port=8787;
const uid='synthetic-imile-v1-rich-admin-000001';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const LOCK='v1MigrationSyntheticLocks/primary';
const source=()=>({
  drivers:[
    {id:'source-d-1',daCode:'DA0001',name:'Driver synthetic A',
      kapacitas:80,status:'aktiv',
      history:[{event:'onboard',nested:{time:'2099-01-01',tags:['á','β']}}],
      future:{attributes:{nested:[{keep:true}]}}},
    {id:'source-d-2',daCode:'DA0002',name:'Driver synthetic B',
      kapacitas:55,status:'aktiv',history:[{event:'route',memo:'Éles adat nincs'}]}
  ],
  vehicles:[
    {id:'source-v-1',rendszam:'ABC-123',gyartmany:'Synthetic',status:'aktiv',
      history:[{event:'service',parts:[{item:'fake',count:2}]}],
      fleetExtra:{nested:{retain:'YES'}}}
  ],
  fuelCards:[{id:'fake-fuel',history:[{amount:0}]}],
  contacts:[{id:'fake-contact',history:[{type:'synthetic'}]}],
  originalRootExtra:{retained:true}
});
const assertNoSeal=r=>{
  assert.equal(r.sealed,false);
  assert.equal(r.authorizedForImport,false);
  assert.equal(r.productionIamVerified,false);
};
const pass=r=>{assert.equal(r.ok,true,JSON.stringify(r));assertNoSeal(r)};
const deny=(r,why)=>{
  assert.equal(r.ok,false,JSON.stringify(r));assertNoSeal(r);
  if(why)assert.match(r.reason,why);
};
test('actual ORIGINAL Rules, rich keyed/claims and fenced epochs: clean ALLOW, poison/forgery/stale/tamper DENY',async()=>{
  if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8787'||
     process.env.GOOGLE_APPLICATION_CREDENTIALS||
     process.env.FIREBASE_SERVICE_ACCOUNT)
    throw Error('LOCAL_EMULATOR_MISSING_FAIL_CLOSED');
  const rawRules=await readFile(
    new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
  assert.ok(rawRules.includes('REPLACE_WITH_REAL_SHARED_UID'));
  const env=await initializeTestEnvironment({projectId,
    firestore:{host,port,rules:rawRules.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)}});
  try{
    await env.withSecurityRulesDisabled(async serverA=>{
      await env.withSecurityRulesDisabled(async serverB=>{
        const aDb=serverA.firestore(),bDb=serverB.firestore();
        const client=env.authenticatedContext(uid,{email}).firestore();
        const raw=source(),pin=sha256(raw),backup=simulateBackup(raw);
        const mk=db=>createLocalFencedRichKeyedImporter({
          db,projectId,trustedPinnedSha:pin,expectedRevision:1
        });
        await setDoc(doc(aDb,'users',uid),{role:'admin',active:true,
          name:'TEST ONLY AUTHORIZED MEMBER'});
        // Genuine signed-in SDK under unchanged restrictive Rules must never
        // be able to mint the source import, keyed identity, or persistent lock.
        await assertFails(setDoc(doc(client,LOCK),{phase:'writing',epoch:500}));
        await assertFails(setDoc(doc(client,'flottaDrivers','DA0001'),{
          daCode:'DA0001',sourceIndex:0,kapacitas:500,status:'aktiv'}));
        await assertFails(setDoc(doc(client,'flottaDriverClaims','DA0001'),{
          sourceIndex:0,revision:1,migrationSourceSha256:pin}));
        console.log('PASS DENY [E+SDK]: original signed-in restricted Rules block lock/master/claim forgery');

        // A valid-looking digest of a poisoned source is not enough to pass
        // full source preflight. Nothing should be written, even to the lock.
        const poisonous=source();poisonous.drivers[1].daCode='da0001';
        const poisonBackup={type:'v1-full-rich-backup',version:2,
          imported:false,snapshot:poisonous,sourceSha256:sha256(poisonous),
          counts:{drivers:2,vehicles:1,fuelCards:1,contacts:1}};
        const poisonedImporter=createLocalFencedRichKeyedImporter({
          db:aDb,projectId,trustedPinnedSha:sha256(poisonous)
        });
        deny(await poisonedImporter.begin(poisonous,poisonBackup),
          /PRESEAL_SOURCE_ATTESTATION_DENIED/);
        assert.equal((await getDoc(doc(aDb,LOCK))).exists(),false);
        assert.equal((await getDocs(collection(aDb,'flottaDrivers'))).size,0);
        console.log('PASS DENY [E]: privileged test adapter refuses poisoned source BEFORE any lock/keyed write');

        const a=mk(aDb),b=mk(bDb);
        const [ar,br]=await Promise.all([a.begin(raw,backup),b.begin(raw,backup)]);
        assert.equal([ar,br].filter(x=>x.ok).length,1);
        const first=ar.ok?a:b,loser=ar.ok?b:a;
        const winnerDb=ar.ok?aDb:bDb;
        pass(ar.ok?ar:br);
        deny(ar.ok?br:ar,/ACQUIRE_DENIED/);
        const firstEpoch=(await getDoc(doc(winnerDb,LOCK))).data().epoch;
        assert.equal(firstEpoch,1);
        // Both APIs must exclude the other #212 lease implementation.
        const otherLease=createLocalEmulatorFencing({
          db:bDb,projectId,trustedPinnedSha:pin
        });
        deny(await otherLease.begin(raw,backup),/ACQUIRE_DENIED/);
        console.log('PASS [E+SDK]: independent writers and #212 planner share ONE persisted lock');

        // Before any successful write, reject unknown, nonordered and
        // duplicate batches and prove journal/documents stay unchanged.
        deny(await first.applyBatch(['drivers/NOT_IN_SOURCE']),/BATCH_DENIED/);
        // A transactional rejection freezes this holder, by design. Since
        // no writes happened, verified recovery is rollbackBeforeSeal.
        // This path is intentionally NOT auto-recovered after an error.
        const rejectedState=(await getDoc(doc(winnerDb,LOCK))).data();
        assert.equal(rejectedState.verifiedIds.length,0);
        assert.equal((await getDocs(collection(winnerDb,'flottaDrivers'))).size,0);
        deny(await first.applyBatch(['drivers/DA0001']),/NO_ACTIVE_VERIFIED_IMPORTER/);
        // Owner-only manual test recovery of a frozen dry-run via explicit
        // test privileged bypass; not part of the deployable importer API.
        await updateDoc(doc(winnerDb,LOCK),{phase:'released',owner:null});
        const next=mk(bDb);
        const begin2=await next.begin(raw,backup);
        pass(begin2);
        assert.equal(begin2.epoch,2);

        const old=await first.applyBatch(['drivers/DA0001']);
        deny(old,/NO_ACTIVE_VERIFIED_IMPORTER/);

        // Actual transaction writes complete original FULL rich master and
        // immutable canonical identity claim, and re-reads both.
        const batch1=await next.applyBatch(['drivers/DA0001']);
        pass(batch1);
        assert.equal(batch1.persistedKeyedRecordsVerified,true);
        assert.equal(batch1.verifiedClaimDocuments,true);
        const plan=buildPlan(raw);
        const expectedDriver=plan.drivers.find(x=>x.id==='DA0001').data;
        const firstMaster=(await getDoc(doc(bDb,'flottaDrivers','DA0001'))).data();
        assert.equal(sha256(firstMaster),sha256(expectedDriver));
        assert.deepEqual(firstMaster.history,raw.drivers[0].history);
        assert.deepEqual(firstMaster.future,raw.drivers[0].future);
        const claim=(await getDoc(doc(bDb,'flottaDriverClaims','DA0001'))).data();
        assert.equal(claim.masterSha256,sha256(expectedDriver));
        assert.equal(claim.sourceIndex,0);
        assert.equal(claim.migrationSourceSha256,pin);
        console.log('PASS [E+SDK]: actual first rich keyed master+immutable claim atomic transaction and full SHA readback');

        // Misleading count/hash could conceal rich history loss. Tamper and
        // ensure NEXT batch fails rather than trusting old checkpoint hash.
        await updateDoc(doc(bDb,'flottaDrivers','DA0001'),{history:[]});
        const altered=await next.applyBatch(['drivers/DA0002']);
        deny(altered,/PREVIOUS_VERIFIED_RICH_DOCUMENT_TAMPERED/);
        const journal=(await getDoc(doc(bDb,LOCK))).data();
        assert.deepEqual(journal.verifiedIds,['drivers/DA0001']);
        assert.equal((await getDoc(doc(bDb,'flottaDrivers','DA0002'))).exists(),false);
        deny(await next.rollbackBeforeSeal(),/ROLLBACK_NOT_VERIFIABLY_SAFE/);
        console.log('PASS DENY [E+SDK]: tampered rich history blocks next batch and ordinary rollback');

        // Restore synthetic history, and manually rehydrate a clean test
        // journal (using test bypass only). No production recovery path exists.
        await setDoc(doc(bDb,'flottaDrivers','DA0001'),expectedDriver);
        await updateDoc(doc(bDb,LOCK),{phase:'released',owner:null,
          verifiedIds:[],verifiedDigest:sha256([])});
        await deleteDoc(doc(bDb,'flottaDrivers','DA0001'));
        await deleteDoc(doc(bDb,'flottaDriverClaims','DA0001'));

        // Fresh owner with epoch-3: verify successful 3-record migration.
        const cleanImporter=mk(aDb);
        pass(await cleanImporter.begin(raw,backup));
        assert.equal((await getDoc(doc(aDb,LOCK))).data().epoch,3);
        deny(await next.applyBatch(['drivers/DA0002']),/NO_ACTIVE_VERIFIED_IMPORTER/);
        pass(await cleanImporter.applyBatch(['drivers/DA0001','drivers/DA0002']));
        const last=await cleanImporter.applyBatch(['vehicles/ABC123']);
        pass(last);
        assert.equal(last.verifiedCount,3);
        const originalPlate=plan.vehicles[0].data;
        const vehicle=(await getDoc(doc(aDb,'flottaVehicles','ABC123'))).data();
        assert.equal(sha256(vehicle),sha256(originalPlate));
        assert.deepEqual(vehicle.fleetExtra,raw.vehicles[0].fleetExtra);
        const vClaim=(await getDoc(doc(aDb,'flottaVehicleClaims','ABC123'))).data();
        assert.equal(vClaim.masterSha256,sha256(originalPlate));
        const lock=(await getDoc(doc(aDb,LOCK))).data();
        assert.deepEqual(lock.verifiedIds,[
          'drivers/DA0001','drivers/DA0002','vehicles/ABC123']);
        assert.equal(lock.verifiedDigest,sha256(lock.verifiedIds));
        assert.equal(lock.sealed,false);
        deny(await cleanImporter.seal(),/NO_PRODUCTION_IAM/);
        deny(await cleanImporter.resume(),/UNAUTHENTICATED_DURABLE_RESUME/);
        console.log('PASS [E+SDK]: full-rich 3 keyed masters + 3 immutable claims, verified checkpoint, no seal');

        // Rollback is bounded and verifies all source histories FIRST, then
        // atomically removes all demo keyed docs/claims and releases lease.
        const rb=await cleanImporter.rollbackBeforeSeal();
        pass(rb);
        assert.equal(rb.rolledBackRichMasters,3);
        assert.equal(rb.rolledBackClaims,3);
        assert.equal((await getDocs(collection(aDb,'flottaDrivers'))).size,0);
        assert.equal((await getDocs(collection(aDb,'flottaVehicles'))).size,0);
        assert.equal((await getDocs(collection(aDb,'flottaDriverClaims'))).size,0);
        assert.equal((await getDocs(collection(aDb,'flottaVehicleClaims'))).size,0);
        assert.equal((await getDoc(doc(aDb,LOCK))).data().phase,'released');
        deny(await cleanImporter.applyBatch(['drivers/DA0001']),/NO_ACTIVE_VERIFIED_IMPORTER/);
        console.log('PASS [E+SDK]: all rich master/claims rolled back before seal, stale holder refused');

        // The original S1-S12 P0 privileged poisoned-seal test remains RED;
        // no approval/seal or source master has been created in this workflow.
        assert.equal((await getDoc(doc(aDb,'flottaMigrationApproval','current'))).exists(),false);
        assert.equal((await getDoc(doc(aDb,'flottaSharedState','current'))).exists(),false);
        console.log(JSON.stringify({
          verdict:'SCOPED_GO_LOCAL_SYNTHETIC_ONLY',projectId,
          effectiveEpochs:[1,2,3],testedActualKeyedMasters:3,
          testedActualIdentityClaims:3,poisonedImportDenied:true,
          staleEpochDenied:true,verifiedRichHistory:true,
          fullRollbackVerified:true,originalRestrictedRulesUsed:true,
          productionIamVerified:false,sealed:false,
          authorizedForImport:false
        }));
      });
    });
  }finally{await env.cleanup();}
});
