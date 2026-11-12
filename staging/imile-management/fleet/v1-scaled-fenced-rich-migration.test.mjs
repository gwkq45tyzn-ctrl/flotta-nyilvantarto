/**
 * #216 independent, genuinely executed large fenced migration and manual
 * abandoned-import rollback on Firestore DEMO emulator.
 *
 * This test is NOT run without an emulator, never uses live credentials,
 * never deploys Rules, and never seals an imported source. The local
 * manualApproval test flag is NOT proof of a human/production IAM approval.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {collection,doc,getDoc,getDocs,setDoc,updateDoc} from 'firebase/firestore';
import {sha256,simulateBackup,buildPlan} from '../../../tools/v1-migration-dryrun.mjs';
import {createLocalFencedRichKeyedImporter} from './v1-fenced-rich-keyed-importer.mjs';
import {createDemoManualPresealRecovery} from './v1-demo-manual-preseal-recovery.mjs';

const projectId='demo-imile-v1-scaled-rich';
const LOCK='v1MigrationSyntheticLocks/primary';
const DRIVER_COUNT=120,VEHICLE_COUNT=60,CHUNK=24;
const uid='synthetic-imile-v1-scaled-admin-000001';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const source=()=>({
  drivers:Array.from({length:DRIVER_COUNT},(_,i)=>({
    id:'synthetic-driver-'+i,
    daCode:'DA'+String(i).padStart(4,'0'),
    name:'SYNTH-'+i,
    kapacitas:30+(i%75),status:'aktiv',
    history:[{kind:'start',details:{who:'no-real-employee',i,
      nested:[{language:'árvíztűrő',token:'S'+i}]}},
      {kind:'capacity',value:i%75}],
    unknownRich:{preserve:{nested:{tags:['β','árvíz',String(i)]}},
      extraArray:[i,{intValue:i*7}]}
  })),
  vehicles:Array.from({length:VEHICLE_COUNT},(_,i)=>({
    id:'synthetic-vehicle-'+i,
    rendszam:'PL'+String(i).padStart(4,'0'),
    status:'aktiv',
    history:[{kind:'maintenance',future:{date:'2099-02-02',memo:'Ó'}},
      {kind:'insurance',renewalYear:2099}],
    unknownCarMetadata:{nested:[{platePosition:i,options:[true,false]}]}
  })),
  fuelCards:[{id:'synthetic-fuel',history:[{amount:0}]}],
  contacts:[{id:'synthetic-contact',extra:{notLost:true}}],
  originalRootMetadata:{rev:'synthetic',nested:{foo:'bar'}}
});
const paths=raw=>{
  const plan=buildPlan(raw);
  return [...plan.drivers.map(d=>'drivers/'+d.id),
    ...plan.vehicles.map(v=>'vehicles/'+v.id)].sort();
};
const accepted=r=>{
  assert.equal(r.ok,true,JSON.stringify(r));
  assert.equal(r.sealed,false);
  assert.equal(r.authorizedForImport,false);
  assert.equal(r.productionIamVerified,false);
};
const denied=(r,regex)=>{
  assert.equal(r.ok,false,JSON.stringify(r));
  assert.equal(r.sealed,false);
  assert.equal(r.authorizedForImport,false);
  if(regex)assert.match(r.reason,regex);
};
test('180 ACTUAL rich keyed masters + 180 immutable claims under epoch fencing, interrupted fail-closed and bounded manual rollback',async()=>{
  if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8787'||
    process.env.GOOGLE_APPLICATION_CREDENTIALS||
    process.env.FIREBASE_SERVICE_ACCOUNT)
    throw Error('LOCAL_EMULATOR_REQUIRED_NOT_OPTIONAL');
  const rulesText=await readFile(
    new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
  assert.ok(rulesText.includes('REPLACE_WITH_REAL_SHARED_UID'));
  const env=await initializeTestEnvironment({
    projectId,firestore:{host:'127.0.0.1',port:8787,
      rules:rulesText.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)}
  });
  try{
    await env.withSecurityRulesDisabled(async contextA=>{
      await env.withSecurityRulesDisabled(async contextB=>{
        const dbA=contextA.firestore(),dbB=contextB.firestore();
        const client=env.authenticatedContext(uid,{email}).firestore();
        const raw=source(),backup=simulateBackup(raw),pin=sha256(raw);
        const ids=paths(raw);
        assert.equal(ids.length,DRIVER_COUNT+VEHICLE_COUNT);
        assert.equal(new Set(ids).size,ids.length);
        const mk=db=>createLocalFencedRichKeyedImporter({
          db,projectId,trustedPinnedSha:pin,expectedRevision:1
        });
        const recover=db=>createDemoManualPresealRecovery({
          db,projectId,trustedPinnedSha:pin,expectedRevision:1
        });
        await setDoc(doc(dbA,'users',uid),{
          role:'admin',active:true,name:'SYNTHETIC TEST MEMBER'
        });
        await assertFails(setDoc(doc(client,LOCK),{owner:'FORGED',epoch:1}));
        await assertFails(setDoc(doc(client,'flottaDriverClaims','DA0000'),{
          sourceIndex:0,revision:1,migrationSourceSha256:pin
        }));
        console.log('PASS [E+SDK]: original signed-in Rules DENY client lock/claim forgery');

        const poison=source();poison.drivers[1].daCode='da0000';
        const bad=createLocalFencedRichKeyedImporter({
          db:dbA,projectId,trustedPinnedSha:sha256(poison)
        });
        const forgedBackup={
          type:'v1-full-rich-backup',version:2,imported:false,
          sourceSha256:sha256(poison),snapshot:poison,
          counts:{drivers:DRIVER_COUNT,vehicles:VEHICLE_COUNT,fuelCards:1,contacts:1}
        };
        denied(await bad.begin(poison,forgedBackup),
          /PRESEAL_SOURCE_ATTESTATION_DENIED/);
        assert.equal((await getDoc(doc(dbA,LOCK))).exists(),false);
        console.log('PASS DENY [E]: normalized duplicate source cannot open persisted lease or write keyed docs');

        // ACTUAL 48 rich keyed/claim pairs before the simulated interruption.
        const first=mk(dbA),competitor=mk(dbB);
        accepted(await first.begin(raw,backup));
        denied(await competitor.begin(raw,backup),/ACTIVE_EPOCH_HELD/);
        const epoch1=(await getDoc(doc(dbA,LOCK))).data().epoch;
        assert.equal(epoch1,1);
        accepted(await first.applyBatch(ids.slice(0,CHUNK)));
        accepted(await first.applyBatch(ids.slice(CHUNK,2*CHUNK)));
        const beforeCrash=(await getDoc(doc(dbA,LOCK))).data();
        assert.equal(beforeCrash.verifiedIds.length,48);
        assert.equal((await getDocs(collection(dbA,'flottaDrivers'))).size,48);
        assert.equal((await getDocs(collection(dbA,'flottaDriverClaims'))).size,48);
        console.log('PASS [E+SDK]: first 48 FULL rich keyed + 48 claims committed and read back before interruption');

        // Simulated crash: no further action from the old writer until
        // AFTER manual epoch transition. New writer cannot steal/auto-resume.
        const crashAttempt=mk(dbB);
        denied(await crashAttempt.begin(raw,backup),/ACTIVE_EPOCH_HELD/);
        denied(await crashAttempt.resume(),/UNAUTHENTICATED_DURABLE_RESUME/);
        const withoutApproval=recover(dbB);
        denied(await withoutApproval.claimAbandoned(raw,backup,{
          expectedAbandonedEpoch:epoch1
        }),/EXPLICIT_LOCAL_MANUAL_APPROVAL/);
        const drifted=source();drifted.drivers[0].history[0].details.i=9999;
        denied(await withoutApproval.claimAbandoned(drifted,backup,{
          manualApproval:true,expectedAbandonedEpoch:epoch1
        }),/SOURCE_SHA_DRIFT/);
        assert.equal((await getDoc(doc(dbA,LOCK))).data().epoch,1);
        console.log('PASS DENY [E]: no automatic crashed-owner lease steal or unverified resume');

        // In TEST ONLY, an explicitly authorized synthetic recovery actor
        // can atomically fence the old writer by incrementing the epoch,
        // then roll back only after per-batch full source SHA parity.
        const operator=recover(dbB);
        const claim=await operator.claimAbandoned(raw,backup,{
          manualApproval:true,expectedAbandonedEpoch:epoch1
        });
        accepted(claim);
        assert.equal(claim.epoch,2);
        denied(await first.applyBatch(ids.slice(48,72)),/BATCH_DENIED/);
        let removed=0,rounds=0;
        while(true){
          const result=await operator.rollbackBatch(CHUNK);
          accepted(result);
          removed+=result.removed;rounds++;
          if(result.complete)break;
          assert.ok(rounds<16);
        }
        assert.equal(removed,48);
        assert.equal(rounds,2);
        assert.equal((await getDoc(doc(dbA,LOCK))).data().phase,'released');
        assert.equal((await getDocs(collection(dbA,'flottaDrivers'))).size,0);
        assert.equal((await getDocs(collection(dbA,'flottaDriverClaims'))).size,0);
        console.log('PASS [E+SDK]: manual test-only epoch-2 fencing + 48 rich records/claims verified and rolled back in two bounded transactions');

        // A fresh owner can start at a NEW epoch. All 180 original source
        // records are written in 8 real Firestore transactions, 2 document
        // types each, plus checkpoint updates. No metadata/history is lost.
        const second=mk(dbB);
        const secondStart=await second.begin(raw,backup);
        accepted(secondStart);
        assert.equal(secondStart.epoch,3);
        let batches=0;
        for(let i=0;i<ids.length;i+=CHUNK){
          const slice=ids.slice(i,i+CHUNK);
          const result=await second.applyBatch(slice);
          accepted(result);
          assert.equal(result.persistedKeyedRecordsVerified,true);
          assert.equal(result.verifiedClaimDocuments,true);
          batches++;
        }
        assert.equal(batches,Math.ceil(ids.length/CHUNK));
        const current=(await getDoc(doc(dbB,LOCK))).data();
        assert.deepEqual(current.verifiedIds,ids);
        assert.equal(current.verifiedDigest,sha256(ids));
        assert.equal(current.sealed,false);
        assert.equal(current.authorizedForImport,false);
        const plan=buildPlan(raw);
        for(const kind of ['drivers','vehicles']){
          const entries=plan[kind],coll=kind==='drivers'?'flottaDrivers':'flottaVehicles';
          const claimColl=kind==='drivers'?'flottaDriverClaims':'flottaVehicleClaims';
          assert.equal((await getDocs(collection(dbB,coll))).size,entries.length);
          assert.equal((await getDocs(collection(dbB,claimColl))).size,entries.length);
          for(const entry of entries){
            const [m,c]=await Promise.all([
              getDoc(doc(dbB,coll,entry.id)),getDoc(doc(dbB,claimColl,entry.id))
            ]);
            assert.ok(m.exists()&&c.exists());
            assert.equal(sha256(m.data()),sha256(entry.data));
            assert.equal(c.data().masterSha256,sha256(entry.data));
            assert.equal(c.data().migrationSourceSha256,pin);
            assert.equal(c.data().sourceIndex,entry.data.sourceIndex);
          }
        }
        denied(await second.seal(),/SEAL_REFUSED/);
        console.log('PASS [E+SDK]: 180 real FULL rich keyed masters + 180 immutable claims, 100% SHA readback, no seal');

        // A second manual test-only recovery uses bounded 24-pair
        // transactions to roll back 360 real emulator documents. The
        // stale writer is fenced by epoch-4, and after cleanup new
        // privileged claims/master docs are absent.
        const recoveryAll=recover(dbA);
        const r=await recoveryAll.claimAbandoned(raw,backup,{
          manualApproval:true,expectedAbandonedEpoch:3
        });
        accepted(r);
        assert.equal(r.epoch,4);
        denied(await second.applyBatch(ids.slice(-1)),/BATCH_DENIED/);
        let complete=false,total=0,deleteBatches=0;
        while(!complete){
          const res=await recoveryAll.rollbackBatch(CHUNK);
          accepted(res);
          complete=res.complete;total+=res.removed;deleteBatches++;
          assert.ok(deleteBatches<20);
        }
        assert.equal(total,180);
        assert.equal(deleteBatches,Math.ceil(ids.length/CHUNK));
        for(const c of ['flottaDrivers','flottaVehicles',
          'flottaDriverClaims','flottaVehicleClaims'])
          assert.equal((await getDocs(collection(dbA,c))).size,0);
        assert.equal((await getDoc(doc(dbA,LOCK))).data().phase,'released');
        assert.equal((await getDoc(doc(dbA,'flottaSharedState','current'))).exists(),false);
        assert.equal((await getDoc(doc(dbA,'flottaMigrationApproval','current'))).exists(),false);
        console.log('PASS [E+SDK]: 360 actual documents removed with full rich per-batch parity; expired writer cannot continue');

        // Final negative: record tamper under the next epoch must BLOCK
        // recovery. There is no unaudited cleanup on failure.
        const third=mk(dbA);
        const start3=await third.begin(raw,backup);
        accepted(start3);
        assert.equal(start3.epoch,5);
        accepted(await third.applyBatch(ids.slice(0,CHUNK)));
        await updateDoc(doc(dbA,'flottaDrivers','DA0000'),{
          history:[{kind:'TAMPERED',nested:{lost:true}}]
        });
        const operator2=recover(dbB);
        accepted(await operator2.claimAbandoned(raw,backup,{
          manualApproval:true,expectedAbandonedEpoch:5
        }));
        denied(await operator2.rollbackBatch(CHUNK),/RICH_MASTER_OR_IMMUTABLE_CLAIM_DRIFT/);
        const blocked=(await getDoc(doc(dbA,LOCK))).data();
        assert.equal(blocked.phase,'recovering');
        assert.equal(blocked.verifiedIds.length,CHUNK);
        denied(await third.applyBatch(ids.slice(CHUNK,2*CHUNK)),/BATCH_DENIED/);
        console.log('PASS DENY [E+SDK]: tampered rich record freezes recovery and stale writer without deleting evidence');

        console.log(JSON.stringify({
          verdict:'SCOPED_SYNTHETIC_EMULATOR_ONLY',fullRichMasterCount:180,
          identityClaimCount:180,originalRestrictedRulesUsed:true,
          persistedEpochs:[1,2,3,4,5,6],batchSize:CHUNK,
          committedBatches:batches,verifiedReadback:180,
          afterCrashAutoResumeAllowed:false,
          manualSyntheticRollbackVerified:180,
          poisonDeniedBeforeWrite:true,
          tamperedRecoveryFailClosed:true,
          sealed:false,authorizedForImport:false,
          productionIamVerified:false
        }));
      });
    });
  }finally{await env.cleanup()}
});
