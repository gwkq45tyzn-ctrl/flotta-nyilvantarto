/**
 * Exact original restricted V1 Rules, real demo Firestore SDK namespace
 * inventory, AND explicit race proof: no nontransactional scan can SEAL.
 *
 * Every document is synthetic. Mandatory local emulator, no silent skip.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,collection,setDoc,updateDoc,deleteDoc} from 'firebase/firestore';
import {createLocalFencedRichKeyedImporter} from './v1-fenced-rich-keyed-importer.mjs';
import {observeLocalEmulatorKeyedInventory} from './v1-local-keyed-namespace-inventory.mjs';
import {createAtomicPresealInventory} from '../../../tools/v1-atomic-preseal-inventory.mjs';
import {createServerSealBoundary} from '../../../tools/v1-server-seal-boundary.mjs';
import {createServerOnlySeal} from '../../../tools/v1-server-only-seal.mjs';
import {sha256,simulateBackup,buildPlan} from '../../../tools/v1-migration-dryrun.mjs';

const projectId='demo-imile-v1-inventory-parity';
const uid='synthetic-imile-v1-inventory-admin-00001';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const raw=()=>({
  drivers:[
    {id:'s-d1',daCode:'DA0001',name:'Test A',kapacitas:70,status:'aktiv',
      history:[{event:'hire',future:{nested:[{unicode:'Árvíztűrő'}]}}]},
    {id:'s-d2',daCode:'DA0002',name:'Test B',kapacitas:90,status:'aktiv',
      history:[{event:'promotion',level:2}]}
  ],
  vehicles:[{id:'s-v1',rendszam:'ABC-123',status:'aktiv',
    history:[{event:'service',parts:{nested:['filter','oil']}}]}],
  fuelCards:[],contacts:[],future:{nested:{preserve:true}}
});
const checkDenied=(r,re)=>{
  assert.equal(r.ok,false,JSON.stringify(r));
  assert.equal(r.canSeal,false);
  assert.equal(r.sealed,false);
  assert.equal(r.authorizedForImport,false);
  assert.equal(r.atomicNamespaceSnapshotVerified,false);
  if(re)assert.ok(r.issues.some(x=>re.test(x)),JSON.stringify(r.issues));
};
test('original-Rules real Firestore rich master+claim 4-collection inventory: orphan/missing/tamper DENY, TOCTOU no seal',async()=>{
  if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8787'||
    process.env.GOOGLE_APPLICATION_CREDENTIALS||
    process.env.FIREBASE_SERVICE_ACCOUNT)
    throw Error('LOCAL_FIRESTORE_EMULATOR_REQUIRED_NO_SKIP');
  const original=await readFile(new URL(
    '../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
  assert.ok(original.includes('REPLACE_WITH_REAL_SHARED_UID'));
  const env=await initializeTestEnvironment({
    projectId,firestore:{
      host:'127.0.0.1',port:8787,
      rules:original.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)
    }
  });
  try {
    await env.withSecurityRulesDisabled(async ctx=>{
      const db=ctx.firestore(),src=raw(),pin=sha256(src),
        plan=buildPlan(src);
      await setDoc(doc(db,'users',uid),{
        active:true,role:'admin',name:'SYNTHETIC USER'
      });
      const client=env.authenticatedContext(uid,{email}).firestore();
      await assertFails(setDoc(doc(client,'flottaDriverClaims','DA9999'),{
        sourceIndex:0,revision:1,masterSha256:'f'.repeat(64)
      }));
      const importer=createLocalFencedRichKeyedImporter({
        db,projectId,trustedPinnedSha:pin,expectedRevision:1
      });
      const start=await importer.begin(src,simulateBackup(src));
      assert.equal(start.ok,true,JSON.stringify(start));
      const epoch=start.epoch;
      const ids=[
        ...plan.drivers.map(e=>'drivers/'+e.id),
        ...plan.vehicles.map(e=>'vehicles/'+e.id)
      ].sort();
      const completed=await importer.applyBatch(ids);
      assert.equal(completed.ok,true,JSON.stringify(completed));
      assert.equal(completed.verifiedCount,3);
      const knownSeal=createServerOnlySeal({
        externalSignerAuthenticated:true,privilegedImporterVerified:true
      });
      const knownSet=()=>knownSeal.inspectBoundedKnownSet({
        db,projectId,plan,expectedEpoch:epoch,
        independentlyPinnedSha:pin,expectedRevision:1
      });
      const bounded=await knownSet();
      assert.equal(bounded.ok,true,JSON.stringify(bounded));
      assert.equal(bounded.knownWriteSetSnapshotVerified,true);
      assert.equal(bounded.knownWriteSetCount,3);
      assert.equal(bounded.knownReadDocumentCount,7);
      assert.equal(bounded.canSeal,false);
      assert.equal(bounded.atomicNamespaceSnapshotVerified,false);
      assert.equal(bounded.productionIamVerified,false);
      assert.equal(knownSeal.attemptSeal(bounded).ok,false);
      assert.equal((await knownSeal.seal()).ok,false);
      const forgedPin=await knownSeal.inspectBoundedKnownSet({
        db,projectId,plan,expectedEpoch:epoch,
        independentlyPinnedSha:'f'.repeat(64),expectedRevision:1
      });
      assert.equal(forgedPin.ok,false);
      assert.equal(forgedPin.canSeal,false);
      console.log('PASS [E+SDK]: actual 7-document transaction full rich known-set parity with epoch/independent pin; NO namespace atomicity or seal');
            const inventory=()=>observeLocalEmulatorKeyedInventory({
        db,projectId,plan,expectedEpoch:epoch
      });
      const preseal=createAtomicPresealInventory({
        trustRootAuthenticated:true // deliberately ignored; not an authority
      });
      const preview=()=>preseal.inspectLocalEmulator({
        db,projectId,plan,expectedEpoch:epoch
      });
      const actualPreview=await preview();
      assert.equal(actualPreview.ok,true,JSON.stringify(actualPreview));
      assert.equal(actualPreview.localRichContentParityInSampledScan,true);
      assert.equal(actualPreview.localLeaseStableDuringScan,true);
      assert.equal(actualPreview.atomicNamespaceSnapshotVerified,false);
      assert.equal(actualPreview.externalTrustRootAuthenticityVerified,false);
      assert.equal(actualPreview.canSeal,false);
      assert.equal(actualPreview.authorizedForImport,false);
      assert.equal((await preseal.seal()).ok,false);
      console.log('PASS [E+SDK]: real transactional lock reads plus four rich collection scans yield only NONATOMIC preseal review, never seal');
      const serverBoundary=createServerSealBoundary({
        externalTrustRootAuthenticated:true,
        privilegedImporterVerified:true,
        productionIamVerified:true
      });
      const serverReview=()=>serverBoundary.inspectLocalEmulator({
        db,projectId,plan,expectedEpoch:epoch
      });
      const cleanBoundary=await serverReview();
      assert.equal(cleanBoundary.ok,true,JSON.stringify(cleanBoundary));
      assert.equal(cleanBoundary.diagnosticFullRichParity,true);
      assert.equal(cleanBoundary.diagnosticMasterCount,3);
      assert.equal(cleanBoundary.diagnosticClaimCount,3);
      assert.equal(cleanBoundary.diagnosticEpoch,epoch);
      assert.equal(cleanBoundary.canSeal,false);
      assert.equal(cleanBoundary.authorizedForImport,false);
      assert.equal(cleanBoundary.productionIamVerified,false);
      assert.equal(cleanBoundary.closedWriterSetVerified,false);
      assert.equal(cleanBoundary.atomicNamespaceSnapshotVerified,false);
      assert.equal(serverBoundary.attemptSeal(cleanBoundary).ok,false);
      assert.equal((await serverBoundary.seal()).ok,false);
      console.log('PASS [E+SDK]: actual original-Rules server-boundary inspection matches 3 rich pairs, cannot seal with caller-forged IAM/root flags');
      const clean=await inventory();
      assert.equal(clean.ok,true,JSON.stringify(clean));
      assert.equal(clean.expectedCount,3);
      assert.equal(clean.observedMasterCount,3);
      assert.equal(clean.observedClaimCount,3);
      assert.equal(clean.stableLockDuringScan,true);
      assert.equal(clean.authoritativeNamespaceVerified,false);
      assert.equal(clean.atomicNamespaceSnapshotVerified,false);
      assert.equal(clean.canSeal,false);
      console.log('PASS [E+SDK]: true four-collection full-rich canonical keyed master+claim equality under original Rules (NO seal)');

      const wrongClaim={normalizedId:'DA9999',sourceIndex:999,
        revision:1,migrationSourceSha256:pin,masterSha256:'f'.repeat(64)};
      const orphanClaim=doc(db,'flottaDriverClaims','DA9999');
      await setDoc(orphanClaim,wrongClaim);
      // Critical counterexample: the true 7-document TRANSACTION remains
      // positive because an unknown forged claim ID was not in its read set.
      // Hence it can NEVER confer a server seal or whole-namespace proof.
      const afterOrphanKnownSet=await knownSet();
      assert.equal(afterOrphanKnownSet.ok,true,JSON.stringify(afterOrphanKnownSet));
      assert.equal(afterOrphanKnownSet.knownWriteSetSnapshotVerified,true);
      assert.equal(afterOrphanKnownSet.atomicNamespaceSnapshotVerified,false);
      assert.equal(afterOrphanKnownSet.canSeal,false);
      assert.equal(knownSeal.attemptSeal(bounded).ok,false);
      assert.equal(knownSeal.attemptSeal(afterOrphanKnownSet).ok,false);
      assert.equal((await knownSeal.seal()).ok,false);
      console.log('PASS DENY [E+SDK]: unknown privileged orphan is outside actual bounded transaction set; prior/current positive known-set proof cannot seal');
      // Previously clean scan cannot be used as a seal decision: concurrent
      // privileged write can create a new claim AFTER observation.
      assert.equal(clean.ok,true);
      assert.equal(clean.canSeal,false);
      checkDenied(await inventory(),/ORPHAN_CLAIM:drivers\/DA9999/);
      const afterLatePrivilegedOrphan=await serverReview();
      assert.equal(afterLatePrivilegedOrphan.ok,false);
      assert.ok(afterLatePrivilegedOrphan.issues.some(x=>/ORPHAN_CLAIM/.test(x)),
        JSON.stringify(afterLatePrivilegedOrphan));
      assert.equal(afterLatePrivilegedOrphan.canSeal,false);
      assert.equal(serverBoundary.attemptSeal(cleanBoundary).ok,false);
      assert.equal(serverBoundary.attemptSeal(afterLatePrivilegedOrphan).ok,false);
      assert.equal((await serverBoundary.seal({useCachedGreen:true})).ok,false);
      console.log('PASS DENY [E+SDK]: actual privileged orphan inserted AFTER a genuine green boundary inspection still cannot be sealed');
      const afterInjection=await preview();
      assert.equal(afterInjection.ok,false);
      assert.equal(afterInjection.canSeal,false);
      assert.equal(afterInjection.atomicNamespaceSnapshotVerified,false);
      assert.ok(afterInjection.issues.some(x=>/ORPHAN_CLAIM/.test(x)),
        JSON.stringify(afterInjection));
      assert.equal(actualPreview.canSeal,false);
      console.log('PASS DENY [E+SDK]: forged orphan AFTER previously green preview invalidates new review; neither preview can seal');
      await deleteDoc(orphanClaim);
      console.log('PASS DENY [E+SDK]: actual out-of-plan privileged orphan claim detected, previously green non-atomic snapshot cannot seal');

      const orphanMaster=doc(db,'flottaVehicles','XYZ999');
      await setDoc(orphanMaster,{rendszam:'XYZ-999',history:[{attack:true}]});
      checkDenied(await inventory(),/ORPHAN_MASTER:vehicles\/XYZ999/);
      await deleteDoc(orphanMaster);

      const expectedDriver=plan.drivers.find(x=>x.id==='DA0001').data;
      const master=doc(db,'flottaDrivers','DA0001');
      await updateDoc(master,{history:[{kind:'TAMPERED',extra:'not in signed source'}]});
      checkDenied(await inventory(),/RICH_MASTER_MISMATCH:drivers\/DA0001/);
      const badMasterKnownSet=await knownSet();
      assert.equal(badMasterKnownSet.ok,false);
      assert.match(badMasterKnownSet.reason,/KNOWN_RICH_MASTER_OR_IMMUTABLE_CLAIM_MISMATCH/);
      assert.equal(badMasterKnownSet.canSeal,false);
      await setDoc(master,expectedDriver);
      const claim=doc(db,'flottaDriverClaims','DA0001');
      const originalClaim=(await getDoc(claim)).data();
      await updateDoc(claim,{sourceIndex:12345});
      checkDenied(await inventory(),/CLAIM_PARITY_MISMATCH:drivers\/DA0001/);
      const badClaimKnownSet=await knownSet();
      assert.equal(badClaimKnownSet.ok,false);
      assert.match(badClaimKnownSet.reason,/KNOWN_RICH_MASTER_OR_IMMUTABLE_CLAIM_MISMATCH/);
      assert.equal(badClaimKnownSet.canSeal,false);
      await setDoc(claim,originalClaim);
      console.log('PASS DENY [E+SDK]: matching IDs but tampered nested history or sourceIndex rejected');

      await deleteDoc(claim);
      checkDenied(await inventory(),/MISSING_CLAIM:drivers\/DA0001/);
      await setDoc(claim,originalClaim);
      const vMaster=doc(db,'flottaVehicles','ABC123');
      const originalVehicle=(await getDoc(vMaster)).data();
      await deleteDoc(vMaster);
      checkDenied(await inventory(),/MISSING_MASTER:vehicles\/ABC123/);
      await setDoc(vMaster,originalVehicle);
      assert.equal((await inventory()).ok,true);
      console.log('PASS DENY [E+SDK]: missing identity claim or rich master cannot pass namespace audit');

      const rollback=await importer.rollbackBeforeSeal();
      assert.equal(rollback.ok,true,JSON.stringify(rollback));
      const releasedKnownSet=await knownSet();
      assert.equal(releasedKnownSet.ok,false);
      assert.match(releasedKnownSet.reason,/UNVERIFIED_OR_STALE_EPOCH_CHECKPOINT/);
      assert.equal(releasedKnownSet.canSeal,false);
      for(const name of ['flottaDrivers','flottaVehicles',
        'flottaDriverClaims','flottaVehicleClaims'])
        assert.equal((await getDocs(collection(db,name))).size,0);
      checkDenied(await inventory(),/INCOMPLETE_OR_FORGED_IMPORTED_PLAN_CHECKPOINT/);
      assert.equal((await getDoc(doc(db,'flottaMigrationApproval','current'))).exists(),false);
      console.log('PASS [E+SDK]: full preseal rollback, false-positive orphan inventory and seal consistently denied');
      console.log(JSON.stringify({
        verdict:'SCOPED_CONTENT_INTEGRITY_ONLY_NO_ATOMIC_NAMESPACE_PROOF',
        realSdkFourCollections:true,richMasterClaimPairs:3,
        originalRestrictedRulesUsed:true,orphanMasterDenied:true,
        orphanClaimDenied:true,missingMasterDenied:true,missingClaimDenied:true,
        alteredHistoryDenied:true,alteredSourceIndexDenied:true,
        nonAtomicRaceRecognized:true,actualOwnerSignerVerified:false,
        productionIamVerified:false,canSeal:false,sealed:false
      }));
    });
  }finally{
    await env.cleanup();
  }
});
