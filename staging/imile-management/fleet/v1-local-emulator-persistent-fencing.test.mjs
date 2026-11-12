/**
 * Real local Firestore transaction SDK proof: independent authenticated test
 * contexts, durable EMULATOR-only lease epoch and journal; no production IAM.
 *
 * npx firebase-tools@15.34.2 emulators:exec --only firestore
 * --project demo-imile-v1-fencing --config firebase.depo-qa.json
 * "node staging/imile-management/fleet/v1-local-emulator-persistent-fencing.test.mjs"
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc} from 'firebase/firestore';
import {createLocalEmulatorFencing} from './v1-local-emulator-persistent-fencing.mjs';
import {sha256,simulateBackup} from '../../../tools/v1-migration-dryrun.mjs';

const projectId='demo-imile-v1-fencing',host='127.0.0.1',port=8787;
const uid='synthetic-imile-v1-admin-0000001';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const checkpoint='v1MigrationSyntheticLocks/primary';
const source=()=>({
  drivers:[
    {id:'d1',daCode:'DA0001',name:'Synthetic Driver',kapacitas:80,status:'aktiv',
      history:[{kind:'start',future:{nested:true}}]},
    {id:'d2',daCode:'DA0002',name:'Synthetic Driver 2',kapacitas:60,status:'aktiv',history:[]}
  ],
  vehicles:[{id:'v1',rendszam:'ABC-123',status:'aktiv',history:[{e:'service'}]}],
  fuelCards:[],contacts:[{id:'c1',future:{keep:'á'}}]
});
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8787'||
   process.env.GOOGLE_APPLICATION_CREDENTIALS||
   process.env.FIREBASE_SERVICE_ACCOUNT)
  throw Error('FAIL_CLOSED_REQUIRE_LOCAL_EMULATOR_NO_CREDENTIALS');
const rawRules=await readFile(
  new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
assert.match(rawRules,/REPLACE_WITH_REAL_SHARED_UID/);
const env=await initializeTestEnvironment({projectId,
  firestore:{host,port,rules:rawRules.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)}});
const denied=(r,why)=>{
  assert.equal(r.ok,false);
  assert.equal(r.sealed,false);
  assert.equal(r.authorizedForImport,false);
  if(why)assert.match(r.reason,why);
};
const good=r=>{
  assert.equal(r.ok,true,JSON.stringify(r));
  assert.equal(r.sealed,false);
  assert.equal(r.authorizedForImport,false);
  assert.equal(r.productionIamVerified,false);
  assert.equal(r.importedKeyedDocumentsVerified,false);
};
const constructor=(db,raw=source())=>createLocalEmulatorFencing({
  db,projectId,trustedPinnedSha:sha256(raw),expectedRevision:1
});
try{
  const raw=source(),backup=simulateBackup(raw),pin=sha256(raw);
  await env.withSecurityRulesDisabled(async first=>{
    await env.withSecurityRulesDisabled(async second=>{
      const aDb=first.firestore(),bDb=second.firestore();
      const cp=doc(aDb,checkpoint);
      await setDoc(doc(aDb,'users',uid),{active:true,role:'admin',
        name:'Synthetic authorized UI user'});
      const client=env.authenticatedContext(uid,{email}).firestore();
      await assertFails(setDoc(doc(client,checkpoint),{
        phase:'planning',epoch:100000,owner:'FAKE',authorizedForImport:true
      }));
      console.log('PASS DENY [E+SDK]: authenticated original Rules cannot forge migration lease');

      // Privileged poisoned source is refused before any lock creation.
      const poisoned=source();
      poisoned.drivers[1].daCode='da0001';
      const forgedBackup={
        type:'v1-full-rich-backup',version:2,sourceSha256:sha256(poisoned),
        snapshot:poisoned,imported:false,
        counts:{drivers:2,vehicles:1,fuelCards:0,contacts:1}
      };
      const bad=constructor(aDb,poisoned);
      denied(await bad.begin(poisoned,forgedBackup),/PREFLIGHT_DENIED/);
      assert.equal((await getDoc(cp)).exists(),false);
      console.log('PASS DENY [E]: poisoned source never obtains a persisted emulator lease');

      // Two independently instantiated real Firestore SDK instances race.
      const a=constructor(aDb,raw),b=constructor(bDb,raw);
      const [ar,br]=await Promise.all([
        a.begin(raw,backup),b.begin(raw,backup)
      ]);
      assert.equal([ar,br].filter(x=>x.ok).length,1,'exactly one winner');
      const winner=ar.ok?a:b,loser=ar.ok?b:a;
      const winnerDb=ar.ok?aDb:bDb;
      good(ar.ok?ar:br);
      denied(ar.ok?br:ar,/ACQUIRE_DENIED/);
      const firstEpoch=(await getDoc(cp)).data().epoch;
      assert.equal(firstEpoch,1);
      denied(await loser.begin(raw,backup),/PERSISTED_LEASE_ALREADY_HELD/);
      console.log('PASS [E+SDK]: two independent Firestore contexts race; one persisted epoch-1 owner');

      denied(await winner.advance(['drivers/ATTACKER']),/OUT_OF_PLAN/);
      denied(await winner.advance(['drivers/DA0002']),/OUT_OF_PLAN/);
      denied(await winner.advance(['drivers/DA0001','drivers/DA0001']),/INVALID_BATCH/);
      const accepted=await winner.advance(['drivers/DA0001']);
      good(accepted);
      assert.equal(accepted.plannedCount,1);
      const afterProgress=(await getDoc(cp)).data();
      assert.deepEqual(afterProgress.plannedIds,['drivers/DA0001']);

      // A real persisted checkpoint tamper must prevent ANY advancement;
      // neither a privileged poisoned fixture nor a browser may override
      // owner/epoch or digest from an arbitrary source.
      await updateDoc(cp,{plannedDigest:'f'.repeat(64)});
      denied(await winner.advance(['drivers/DA0002']),/CHECKPOINT_PARITY_DENIED/);
      denied(await winner.release(),/CHECKPOINT_PARITY_DENIED/);
      await setDoc(cp,afterProgress);
      good(await winner.release());
      assert.equal((await getDoc(cp)).data().phase,'released');
      console.log('PASS DENY [E+SDK]: forged persisted progress blocks advancement and release');

      // Simulate new process/SDK reader by constructing a fresh importer.
      // Old epoch cannot resume/advance or release the new holder.
      const resumed=await loser.begin(raw,backup);
      good(resumed);
      assert.equal(resumed.epoch,2);
      denied(await winner.advance(['drivers/DA0002']),/FENCING_TOKEN_OR_CHECKPOINT_PARITY_DENIED/);
      denied(await winner.release(),/FENCING_TOKEN_OR_CHECKPOINT_PARITY_DENIED/);
      good(await loser.advance(['drivers/DA0001','drivers/DA0002']));
      good(await loser.advance(['vehicles/ABC123']));
      const stored=(await getDoc(cp)).data();
      assert.equal(stored.epoch,2);
      assert.equal(stored.phase,'planning');
      assert.equal(stored.sealed,false);
      assert.equal(stored.authorizedForImport,false);
      assert.equal(stored.plannedIds.length,3);
      denied(await loser.seal(),/NO_PRODUCTION_IAM_PROOF/);
      denied(await loser.resume(),/UNTRUSTED_DURABLE_RESUME_DENIED/);
      const crashed=constructor(winnerDb,raw);
      denied(await crashed.begin(raw,backup),/PERSISTED_LEASE_ALREADY_HELD/);
      console.log('PASS [E+SDK]: stale epoch-1 cannot advance epoch-2; crash cannot auto-steal active lease');
      // No keyed records actually written by the test journal.
      assert.equal((await getDoc(doc(aDb,'flottaDrivers','DA0001'))).exists(),false);
      assert.equal((await getDoc(doc(aDb,'flottaVehicles','ABC123'))).exists(),false);
      good(await loser.release());
      console.log('PASS [E+SDK]: durable synthetic lease + monotonic epoch and no actual import/seal');
      console.log(JSON.stringify({
        verdict:'SCOPED_LOCAL_EMULATOR_ONLY',projectId,epochs:[1,2],
        contestedOwners:2,poisonedSourceDenied:true,forgedProgressDenied:true,
        originalClientLeaseWriteDenied:true,
        persistedPlanOnly:true,importedKeyedRecords:0,sealed:false,
        productionIamVerified:false
      }));
    });
  });
}finally{
  await env.cleanup();
}
