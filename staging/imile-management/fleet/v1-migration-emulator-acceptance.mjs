/**
 * V1 P0 — privileged migration acceptance DRILL in an isolated local emulator.
 * SECURITY BOUNDARY: test-only synthetic "withSecurityRulesDisabled" is a
 * substitute for a separate privileged importer, NOT production authorization.
 * Refuses non-demo project or non-local emulator. No live reads/writes.
 *
 * npx firebase-tools@15.34.2 emulators:exec --only firestore \
 *   --config firebase.staging-emulator.json --project demo-imile-migration \
 *   "node staging/imile-management/fleet/v1-migration-emulator-acceptance.mjs"
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {collection,doc,getDocs,getDoc,setDoc,updateDoc,deleteDoc,
  writeBatch,runTransaction,Timestamp} from 'firebase/firestore';
import {preflight,buildPlan,simulateBackup,restoreDrill,detectPartial,sha256}
  from '../../../tools/v1-migration-dryrun.mjs';

const projectId='demo-imile-migration';
const host='127.0.0.1',port=8787;
const uid='synthetic-imile-v1-admin-migration-0001';
const email='imilemanagement@imile-management-staging.firebaseapp.com';
const before=()=>JSON.parse(JSON.stringify({
  vehicles:[
    {id:'vehicle-1',rendszam:'ABC-123',status:'aktiv',gyartmany:'Ford',
      km:12340,history:[{kind:'szerviz',note:'synthetic ááá'}],
      extra:{future:'car metadata'}},
    {id:'vehicle-2',rendszam:'XYZ-999',status:'szerviz',history:[{e:'service'}],
      extra:{nested:{fuel:'preserve'}}}
  ],
  drivers:[
    {id:'driver-1',daCode:'DA0001',status:'aktiv',kapacitas:80,
      name:'Synthetic One',history:[{e:'hire'}],unexpected:{keep:true}},
    {id:'driver-2',daCode:'DA0002',status:'inaktiv',kapacitas:0,
      name:'Synthetic Two',history:[],futureField:'do-not-strip'}
  ],
  fuelCards:[{id:'FC1',history:[{litres:2}],extra:{name:'synthetic'}}],
  contacts:[{id:'C1',name:'Synthetic',history:[{e:'created'}]}],
  unexpectedRoot:{critical:{nested:'preserve me'}}
}));
const checkpointPath='v1MigrationCheckpoints/current';
const sourcePath='flottaSharedState/current';
const approvalPath='flottaMigrationApproval/current';
const restorePrefix='v1MigrationSyntheticRestores';
const sorted=items=>[...items].sort((a,b)=>a.localeCompare(b));
const idsFor=plan=>[
  ...plan.drivers.map(x=>'drivers/'+x.id),
  ...plan.vehicles.map(x=>'vehicles/'+x.id)
].sort();
const pairFor=(plan,name,id)=>plan[name].find(x=>x.id===id);
const refFor=(db,item)=>doc(db,item.startsWith('drivers/')?'flottaDrivers':'flottaVehicles',item.split('/')[1]);
const completeData=(data,plan)=>{
  const state=detectPartial(plan,data);
  if(state.mismatched.length||state.unexpected.length)
    throw Error('KEYED_TAMPER_OR_EXTRA_RECORDS '+JSON.stringify(state));
  return state;
};
const assertLocal=()=>{
  if(!/^demo-[a-z0-9-]+$/.test(projectId)||
     !['127.0.0.1:8787','localhost:8787'].includes(process.env.FIRESTORE_EMULATOR_HOST))
    throw Error('LOCAL_FIRESTORE_EMULATOR_REQUIRED — refuse external connection');
  if(process.env.FIREBASE_SERVICE_ACCOUNT||process.env.GOOGLE_APPLICATION_CREDENTIALS)
    throw Error('CLOUD_CREDENTIAL_ENV_DENIED_IN_SYNTHETIC_DRILL');
};
async function main(){
  assertLocal();
  const rawRules=await readFile(new URL('../../../depokapacitas/firestore-v1-restricted.rules',import.meta.url),'utf8');
  assert.match(rawRules,/REPLACE_WITH_REAL_SHARED_UID/);
  const env=await initializeTestEnvironment({
    projectId,firestore:{host,port,rules:rawRules.replaceAll('REPLACE_WITH_REAL_SHARED_UID',uid)}
  });
  try {
    const snapshot=before(),health=preflight(snapshot);
    assert.equal(health.ok,true,JSON.stringify(health.errors));
    const plan=buildPlan(snapshot,health);
    assert.equal(plan.authorizedForImport,false);
    assert.equal(plan.firestoreEncodedSizeVerified,false);
    assert.equal(plan.sourceSha256,sha256(snapshot));
    const backup=simulateBackup(snapshot),expectedSha=backup.sourceSha256;
    assert.equal(restoreDrill(backup,expectedSha).ok,true);
    const doctored=structuredClone(backup);
    doctored.snapshot.vehicles[0].history=[];
    assert.equal(restoreDrill(doctored,expectedSha).ok,false,'forged original history must fail');
    console.log('PASS [E]: full rich source canonical SHA, backup and tampered history denial');

    await env.withSecurityRulesDisabled(async admin=>{
      const db=admin.firestore(),master=doc(db,sourcePath),
        cp=doc(db,checkpointPath),approval=doc(db,approvalPath);
      const items=idsFor(plan);
      assert.equal(items.length,4);
      const expected=Object.fromEntries(items.map(item=>{
        const [kind,id]=item.split('/');
        return [item,pairFor(plan,kind,id).data];
      }));
      const readLive=async()=>{
        const drivers={},vehicles={};
        for(const [key,coll] of [['drivers','flottaDrivers'],['vehicles','flottaVehicles']]){
          const docs=await getDocs(collection(db,coll));
          for(const row of docs.docs){
            if(key==='drivers')drivers[row.id]=row.data();
            else vehicles[row.id]=row.data();
          }
        }
        return {drivers,vehicles};
      };
      const checkSource=async()=>{
        const snap=await getDoc(master);
        assert.equal(snap.exists(),true,'trusted source absent');
        const live=snap.data();
        const sourceKeys=Object.keys(snapshot);
        assert.deepEqual(sorted(Object.keys(live)),sorted([...sourceKeys,
          'sealed','revision','migrationSourceSha256']));
        const sourceBody=Object.fromEntries(sourceKeys.map(k=>[k,live[k]]));
        if(sha256(sourceBody)!==expectedSha||live.migrationSourceSha256!==expectedSha||
           live.revision!==1)throw Error('SOURCE_HASH_OR_REVISION_DRIFT');
        return live;
      };
      await setDoc(doc(db,'users',uid),{name:'Synthetic approved tester',active:true,role:'admin'});
      await setDoc(master,{...snapshot,revision:1,sealed:false,migrationSourceSha256:expectedSha});
      const client=env.authenticatedContext(uid,{email}).firestore();
      await assertFails(setDoc(doc(client,'flottaDrivers','DA0001'),
        {...expected['drivers/DA0001']}));
      await assertFails(setDoc(doc(client,'flottaVehicles','ABC123'),
        {...expected['vehicles/ABC123']}));
      await assertFails(setDoc(doc(client,approvalPath),
        {status:'approved',approvedUid:uid,sourceSha256:expectedSha}));
      await assertFails(updateDoc(doc(client,sourcePath),{sealed:true,revision:2}));
      console.log('PASS [E]: actual restricted Rules deny browser keyed create/approval/seal');

      const deriveProgress=async()=>{
        const source=await checkSource();
        if(source.sealed)throw Error('SEALED_NO_WRITES_OR_ROLLBACK');
        const actual=await readLive(),partial=completeData(actual,plan);
        const present=items.filter(item=>{
          const [kind,id]=item.split('/');
          return Object.hasOwn(actual[kind],id);
        });
        const checkpoint=await getDoc(cp);
        if(checkpoint.exists()){
          const c=checkpoint.data();
          if(c.sourceSha256!==expectedSha||c.sourceRevision!==1||
             c.phase!=='importing'||
             JSON.stringify(sorted(c.completed||[]))!==JSON.stringify(sorted(present)))
            throw Error('FORGED_OR_STALE_CHECKPOINT');
        }else if(present.length)throw Error('UNJOURNALED_PARTIAL_IMPORT');
        return {actual,partial,present,checkpoint};
      };
      async function migrateBatches(maxRounds=Infinity){
        let applied=0;
        while(applied<maxRounds){
          const state=await deriveProgress();
          const item=items.find(i=>!state.present.includes(i));
          if(!item)return state;
          const done=sorted([...state.present,item]);
          const batch=writeBatch(db);
          batch.set(refFor(db,item),expected[item]);
          batch.set(cp,{phase:'importing',sourceSha256:expectedSha,
            sourceRevision:1,completed:done,checkpointVersion:1});
          await batch.commit();
          applied++;
        }
        return deriveProgress();
      }
      async function rollbackBeforeSeal(){
        const source=await checkSource();
        if(source.sealed)throw Error('POSTSEAL_ROLLBACK_FORBIDDEN');
        const current=await deriveProgress();
        const b=writeBatch(db);
        for(const id of current.present)b.delete(refFor(db,id));
        if(current.checkpoint.exists())b.delete(cp);
        await b.commit();
        const after=await readLive();
        assert.equal(Object.keys(after.drivers).length,0);
        assert.equal(Object.keys(after.vehicles).length,0);
        assert.equal((await getDoc(master)).data().sealed,false);
        return true;
      }
      async function verifiedSeal(){
        const state=await deriveProgress();
        if(!state.partial.complete)throw Error('SEAL_DENIED_PARTIAL_IMPORT');
        const approvalSnap=await getDoc(approval);
        if(approvalSnap.exists())throw Error('APPROVAL_ALREADY_EXISTS');
        return runTransaction(db,async tx=>{
          // EVERY get precedes ANY transaction write. Final readback matters:
          // a checkpoint alone is not an approval or data-integrity proof.
          const src=await tx.get(master);
          const keys=[];
          for(const id of items)keys.push(await tx.get(refFor(db,id)));
          const priorApproval=await tx.get(approval);
          const c=await tx.get(cp);
          const source=src.data();
          if(!src.exists()||!c.exists()||priorApproval.exists()||
             source.sealed||source.migrationSourceSha256!==expectedSha||
             source.revision!==1||
             c.data().sourceSha256!==expectedSha||
             JSON.stringify(sorted(c.data().completed||[]))!==JSON.stringify(items))
            throw Error('SEAL_DENIED_UNAPPROVED_OR_SOURCE_DRIFT');
          for(let i=0;i<items.length;i++){
            if(!keys[i].exists()||sha256(keys[i].data())!==sha256(expected[items[i]]))
              throw Error('SEAL_DENIED_KEYED_RICH_PARITY_'+items[i]);
          }
          tx.set(approval,{status:'approved',approvedUid:uid,sourceSha256:expectedSha,
            approvedAt:Timestamp.fromDate(new Date('2026-01-01T00:00:00Z'))});
          tx.update(master,{sealed:true});
          tx.update(cp,{phase:'sealed'});
          return true;
        });
      }
      // Deliberately crash after one trusted batch; source remains UNSEALED.
      let current=await migrateBatches(1);
      assert.equal(current.present.length,1);
      assert.equal(current.partial.complete,false);
      assert.equal((await getDoc(master)).data().sealed,false);
      await assert.rejects(verifiedSeal(),/SEAL_DENIED_PARTIAL_IMPORT/);
      console.log('PASS [E]: mid-batch interruption leaves unsealed and seal blocked');

      // Forged checkpoint cannot authorize any subsequent write.
      await updateDoc(cp,{sourceSha256:'0'.repeat(64)});
      await assert.rejects(migrateBatches(1),/FORGED_OR_STALE_CHECKPOINT/);
      await updateDoc(cp,{sourceSha256:expectedSha});
      await rollbackBeforeSeal();
      await rollbackBeforeSeal(); // safe second rollback
      console.log('PASS [E]: corrupted checkpoint rejected; preseal rollback idempotent');

      // Restart and interrupted resume. Never silently overwrite unknown docs.
      await migrateBatches(2);
      current=await deriveProgress();
      assert.equal(current.present.length,2);
      await assert.rejects(verifiedSeal(),/SEAL_DENIED_PARTIAL_IMPORT/);
      const tampered=items.find(x=>current.present.includes(x));
      await updateDoc(refFor(db,tampered),{history:[]});
      await assert.rejects(verifiedSeal(),/KEYED_TAMPER_OR_EXTRA_RECORDS/);
      await setDoc(refFor(db,tampered),expected[tampered]);
      await migrateBatches();
      assert.equal((await deriveProgress()).partial.complete,true);
      const sourceBeforeSeal=await getDoc(master);
      assert.equal(sourceBeforeSeal.data().sealed,false);
      await verifiedSeal();
      assert.equal((await getDoc(master)).data().sealed,true);
      assert.equal((await getDoc(approval)).data().sourceSha256,expectedSha);
      assert.deepEqual(Object.keys((await readLive()).drivers).sort(),
        plan.drivers.map(x=>x.id).sort());
      console.log('PASS [E]: interrupted resume + rich server parity + atomic approval/seal');

      // Postseal browser still cannot manufacture new identities or approvals.
      await assertFails(setDoc(doc(client,'flottaVehicles','NEW123'),
        {...expected['vehicles/ABC123'],rendszam:'NEW-123'}));
      await assertFails(updateDoc(doc(client,sourcePath),{sealed:false,revision:2}));
      await assertFails(deleteDoc(doc(client,approvalPath)));
      await assert.rejects(rollbackBeforeSeal(),/POSTSEAL_ROLLBACK_FORBIDDEN/);

      // Restore rehearsal uses a DISTINCT scratch namespace. The active
      // sealed archive, approval and keyed production-shaped docs are NEVER
      // deleted by a restore test.
      const recovery=simulateBackup(snapshot);
      assert.equal(restoreDrill(recovery,expectedSha).ok,true);
      const scratch=items.map(i=>({id:i,
        ref:doc(db,restorePrefix,i.replace('/','__'))}));
      for(const item of scratch)await setDoc(item.ref,expected[item.id]);
      const casualty=scratch[0];
      await deleteDoc(casualty.ref);
      assert.equal((await getDoc(casualty.ref)).exists(),false);
      await setDoc(casualty.ref,expected[casualty.id]);
      for(const item of scratch){
        const d=await getDoc(item.ref);
        assert.equal(sha256(d.data()),sha256(expected[item.id]),
          'scratch full-rich restore parity '+item.id);
        await deleteDoc(item.ref);
      }
      assert.equal((await getDoc(master)).data().sealed,true);
      assert.equal((await getDoc(master)).data().migrationSourceSha256,expectedSha);
      assert.equal(detectPartial(plan,await readLive()).complete,true);
      console.log('PASS [E]: separate scratch restore drill full rich parity; sealed originals unchanged');
    });
    console.log('PASS [E]: all synthetic privileged emulator migration and real client deny controls');
  }finally{
    await env.cleanup();
  }
}
main().catch(err=>{console.error('P0 MIGRATION DRILL FAILED:',err);process.exitCode=1;});
