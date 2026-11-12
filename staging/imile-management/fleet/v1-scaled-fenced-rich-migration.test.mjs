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
import {collection,doc,getDoc,getDocs,setDoc,updateDoc,deleteDoc} from 'firebase/firestore';
import {sha256,simulateBackup,buildPlan} from '../../../tools/v1-migration-dryrun.mjs';
import {createLocalFencedRichKeyedImporter} from './v1-fenced-rich-keyed-importer.mjs';
import {createDemoManualPresealRecovery} from './v1-demo-manual-preseal-recovery.mjs';
import {createServerSealBoundary} from '../../../tools/v1-server-seal-boundary.mjs';
import {createServerOnlySeal} from '../../../tools/v1-server-only-seal.mjs';
import {createLocal440SignedChunkReceipts} from './v1-local-440-signed-chunk-receipts.mjs';
import {createLocalSignedRegistryHighwater} from './v1-local-durable-signed-registry.mjs';
import {generateKeyPairSync,createHash,sign as cryptoSign} from 'node:crypto';
import {canonicalStringify} from '../../../features/migration-manifest.mjs';

const projectId='demo-imile-v1-scaled-rich';
const LOCK='v1MigrationSyntheticLocks/primary';
const DRIVER_COUNT=220,VEHICLE_COUNT=220,CHUNK=24;
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
test('440 ACTUAL rich keyed masters + 440 immutable claims under epoch fencing, interrupted fail-closed and bounded manual rollback',async()=>{
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

        // A fresh owner can start at a NEW epoch. All 440 original source
        // records are written in 19 real Firestore transactions, 2 document
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
        // EXACT original source signing, 19 bounded full-rich SDK receipts,
        // and a separately checked 19-receipt aggregate: no production seal.
        const root=generateKeyPairSync('ed25519');
        const signer=generateKeyPairSync('ed25519');
        const spki=k=>k.publicKey.export({format:'der',type:'spki'});
        const fingerprint=k=>createHash('sha256').update(spki(k)).digest('hex');
        const signed=(payload,key)=>({
          algorithm:'Ed25519',payload,
          signatureBase64:cryptoSign(null,
            Buffer.from(canonicalStringify(payload),'utf8'),
            key.privateKey).toString('base64')
        });
        const now=Date.now();
        const valid={notBeforeMs:now-120000,expiresAtMs:now+3600000};
        const registryPayload={
          schema:'imile-v1-offline-owner-signer-registry-v1',
          purpose:'synthetic-root-signed-fleet-manifest-registry',
          registryAudience:'demo-imile-v1-owner-registry',
          sourceProjectId:projectId,sequence:1,...valid,
          signers:[{
            signerId:'local-test-owner',keyVersion:1,
            publicKeySpkiBase64:spki(signer).toString('base64'),
            status:'active',...valid
          }],
          revokedSignerFingerprints:[]
        };
        const bundle=signed(registryPayload,root);
        const manifest=signed({
          schema:'imile-v1-offline-fleet-manifest-v1',
          purpose:'synthetic-preseal-dry-run',
          signerId:'local-test-owner',projectId,
          sourceSha256:pin,sourceRevision:1,
          canonicalPlanDigest:sha256(ids)
        },signer);
        const rootSha=fingerprint(root);
        const rootSpki=spki(root).toString('base64');
        const registryGate=createLocalSignedRegistryHighwater({
          db:dbA,projectId,rootPublicKeySpkiBase64:rootSpki,
          independentlyPinnedRootSha256:rootSha
        });
        const regResult=await registryGate.adoptRootSignedRegistry(bundle);
        accepted(regResult);
        assert.equal(regResult.sequence,1);
        const attestor=createLocal440SignedChunkReceipts({
          db:dbB,projectId,rootPublicKeySpkiBase64:rootSpki,
          independentlyPinnedRootSha256:rootSha
        });
        const evidence={
          registryBundle:bundle,manifest,snapshot:raw,backup,
          independentlyPinnedSourceSha256:pin,expectedEpoch:3
        };
        const signedChunkCount=Math.ceil(ids.length/CHUNK);
        let chunkWrites=0;
        for(let i=0;i<signedChunkCount;i++){
          const result=await attestor.recordChunk(evidence,i);
          accepted(result);
          assert.equal(result.chunkIndex,i);
          assert.equal(result.receiptCreated,true);
          assert.equal(result.fencedEpoch,3);
          chunkWrites++;
        }
        assert.equal(chunkWrites,19);
        const signedAggregate=await attestor.aggregate(evidence);
        accepted(signedAggregate);
        assert.equal(signedAggregate.verifiedReceiptCount,19);
        assert.equal(signedAggregate.knownPairs,440);
        assert.equal(signedAggregate.aggregateCreated,true);
        assert.equal((await attestor.aggregate(evidence)).aggregateCreated,false);
        const firstChunk=await attestor.recordChunk(evidence,0);
        accepted(firstChunk);
        assert.equal(firstChunk.receiptCreated,false);
        console.log('PASS [E+SDK 440]: two real Ed25519 signed original rich source, root-signed registry highwater, 19 actual 24-pair/last-8-pair transactional full-rich claim receipts and aggregate; never seal');

        const forgedManifest=structuredClone(manifest);
        forgedManifest.payload.sourceSha256='f'.repeat(64);
        denied(await attestor.recordChunk({...evidence,manifest:forgedManifest},0),
          /SIGNED_440_SOURCE_PREFLIGHT_DENIED/);
        denied(await attestor.aggregate({...evidence,expectedEpoch:4}),
          /SOURCE_EPOCH_OR_COMPLETE_440_JOURNAL_INVALID/);
        const claimRef=doc(dbB,'flottaDriverClaims','DA0000');
        const originalClaim=(await getDoc(claimRef)).data();
        await updateDoc(claimRef,{masterSha256:'f'.repeat(64)});
        denied(await attestor.recordChunk(evidence,0),
          /SIGNED_440_RICH_MASTER_OR_CLAIM_MISMATCH/);
        await setDoc(claimRef,originalClaim);
        const receiptRef=doc(dbB,'v1Synthetic440SignedChunks','00');
        const receiptOriginal=(await getDoc(receiptRef)).data();
        await updateDoc(receiptRef,{count:0});
        denied(await attestor.aggregate(evidence),
          /MISSING_OR_FORGED_SIGNED_440_CHUNK_RECEIPT/);
        await setDoc(receiptRef,receiptOriginal);
        accepted(await attestor.aggregate(evidence));
        console.log('PASS DENY [E+SDK 440]: wrong signature/source, stale epoch, forged rich claim and forged persisted signed chunk receipt');

        const olderHighwater=(await getDoc(doc(
          dbB,'v1SyntheticOwnerRegistryHighwater','current'
        ))).data();
        const revokedSignedRegistry=signed({
          ...registryPayload,sequence:2,
          revokedSignerFingerprints:[fingerprint(signer)]
        },root);
        const revocationResult=await registryGate.adoptRootSignedRegistry(
          revokedSignedRegistry
        );
        accepted(revocationResult);
        denied(await attestor.recordChunk(evidence,0),
          /REGISTRY_REVOKED_DRIFT_OR_PRIVILEGED_RESET/);
        denied(await attestor.aggregate(evidence),
          /REGISTRY_REVOKED_DRIFT_OR_PRIVILEGED_RESET/);
        console.log('PASS DENY [E+SDK 440]: root-signed signer revocation at registry seq2 invalidates previous signed chunk/aggregate attempt');

        // Genuine PRIVILEGED counterexample. Other test-only actor can
        // setDoc() old registry seq1 after the newer revocation: broken
        // production antirollback if Admin SDK writer isolation unknown.
        await setDoc(
          doc(dbA,'v1SyntheticOwnerRegistryHighwater','current'),
          olderHighwater
        );
        const afterPrivilegedReset=await attestor.recordChunk(evidence,0);
        accepted(afterPrivilegedReset);
        assert.equal(afterPrivilegedReset.canSeal,false);
        accepted(await attestor.aggregate(evidence));
        denied(await attestor.seal(),
          /NO_PRODUCTION_OWNER_IAM_CLOSED_WRITERS_OR_ATOMIC_SEAL/);
        console.log('PASS VULNERABILITY [E+SDK 440]: separate privileged writer reset revoked highwater seq2 to seq1, old signed receipts accepted again; no production GO');

        // A single full 440-pair transaction is NOT the solution:
        // the bounded known-document proof must refuse the oversized
        // source, not mislabel a partial subset as a whole namespace.
        const knownSeal=createServerOnlySeal({
          externalSignerAuthenticated:true,
          privilegedImporterVerified:true
        });
        const tooWide=await knownSeal.inspectBoundedKnownSet({
          db:dbB,projectId,plan,expectedEpoch:3,
          independentlyPinnedSha:pin,expectedRevision:1
        });
        assert.equal(tooWide.ok,false);
        assert.match(tooWide.reason,/BOUNDED_MAX_24/);
        assert.equal(tooWide.canSeal,false);
        assert.equal(tooWide.atomicNamespaceSnapshotVerified,false);
        assert.equal((await knownSeal.seal()).ok,false);
        console.log('PASS DENY [E+SDK 440]: bounded known-write-set transaction cannot falsely certify 440 pairs or seal');
                // Cutover-negative on the FULL 440-record rich source:
        // 4 independent collection queries under a stable epoch are not
        // a privileged-write freeze; inject orphan AFTER prior clean scan.
        const sealBoundary=createServerSealBoundary({
          externalTrustRootAuthenticated:true,
          privilegedImporterVerified:true,
          productionIamVerified:true
        });
        const richPreview=()=>sealBoundary.inspectLocalEmulator({
          db:dbB,projectId,plan,expectedEpoch:3
        });
        const green=await richPreview();
        assert.equal(green.ok,true,JSON.stringify(green));
        assert.equal(green.diagnosticMasterCount,440);
        assert.equal(green.diagnosticClaimCount,440);
        assert.equal(green.canSeal,false);
        assert.equal(sealBoundary.attemptSeal(green).ok,false);
        const privilegedOrphan=doc(dbA,'flottaDriverClaims','DA9999');
        await setDoc(privilegedOrphan,{
          normalizedId:'DA9999',sourceIndex:0,revision:1,
          migrationSourceSha256:pin,
          masterSha256:'f'.repeat(64),
          history:[{kind:'FORGED_TEST_ONLY'}]
        });
        const raced=await richPreview();
        assert.equal(raced.ok,false);
        assert.ok(raced.issues.some(x=>/ORPHAN_CLAIM/.test(x)),
          JSON.stringify(raced));
        assert.equal(sealBoundary.attemptSeal(green).ok,false);
        assert.equal(sealBoundary.attemptSeal(raced).ok,false);
        assert.equal((await sealBoundary.seal()).ok,false);
        await deleteDoc(privilegedOrphan); // authorized synthetic test cleanup
        console.log('PASS DENY [E+SDK 440]: actual privileged orphan after clean 440 rich masters/claims preview, no cached or current seal permitted');
        denied(await second.seal(),/SEAL_REFUSED/);
        console.log('PASS [E+SDK]: 440 real FULL rich keyed masters + 440 immutable claims, 100% SHA readback, no seal');

        // A second manual test-only recovery uses bounded 24-pair
        // transactions to roll back 880 real emulator documents. The
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
        assert.equal(total,440);
        assert.equal(deleteBatches,Math.ceil(ids.length/CHUNK));
        for(const c of ['flottaDrivers','flottaVehicles',
          'flottaDriverClaims','flottaVehicleClaims'])
          assert.equal((await getDocs(collection(dbA,c))).size,0);
        assert.equal((await getDoc(doc(dbA,LOCK))).data().phase,'released');
        assert.equal((await getDoc(doc(dbA,'flottaSharedState','current'))).exists(),false);
        assert.equal((await getDoc(doc(dbA,'flottaMigrationApproval','current'))).exists(),false);
        console.log('PASS [E+SDK]: 880 actual documents removed with full rich per-batch parity; expired writer cannot continue');

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
          verdict:'SCOPED_SYNTHETIC_EMULATOR_ONLY',fullRichMasterCount:440,
          identityClaimCount:440,originalRestrictedRulesUsed:true,
          persistedEpochs:[1,2,3,4,5,6],batchSize:CHUNK,
          committedBatches:batches,verifiedReadback:440,
          afterCrashAutoResumeAllowed:false,
          manualSyntheticRollbackVerified:440,
          poisonDeniedBeforeWrite:true,
          tamperedRecoveryFailClosed:true,
          sealed:false,authorizedForImport:false,
          productionIamVerified:false
        }));
      });
    });
  }finally{await env.cleanup()}
});
