/**
 * Actual read-only Firestore transaction for a BOUNDED known source write-set.
 *
 * This is deliberately a staging-only demo-emulator helper. It does NOT
 * establish an atomic namespace inventory; unknown document IDs in the
 * collection are NOT included, and privileged writers may act immediately
 * after transaction completion. It cannot perform a seal or any writes.
 */
import {doc,runTransaction} from 'firebase/firestore';
import {sha256} from '../../../tools/v1-migration-dryrun.mjs';

const LOCK='v1MigrationSyntheticLocks/primary';
const LIMIT=24;
const denied=reason=>({ok:false,reason,knownWriteSetSnapshotVerified:false});
const entriesFor=plan=>[
  ...plan.drivers.map(d=>({kind:'drivers',id:d.id,data:d.data})),
  ...plan.vehicles.map(v=>({kind:'vehicles',id:v.id,data:v.data}))
].sort((a,b)=>(a.kind+'/'+a.id).localeCompare(b.kind+'/'+b.id));
const shape=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export async function inspectLocalDemoKnownWriteSet({
  db,projectId,plan,expectedEpoch,independentlyPinnedSha,expectedRevision=1
}={}){
  if(typeof projectId!=='string'||!/^demo-[a-z0-9-]+$/.test(projectId)||
    process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8787'||
    process.env.GOOGLE_APPLICATION_CREDENTIALS||
    process.env.FIREBASE_SERVICE_ACCOUNT||
    db?.app?.options?.projectId!==projectId)
    return denied('LOCAL_DEMO_FIRESTORE_EMULATOR_REQUIRED');
  if(!shape(plan)||!Array.isArray(plan.drivers)||
    !Array.isArray(plan.vehicles)||
    typeof plan.sourceSha256!=='string'||
    !/^[a-f0-9]{64}$/.test(plan.sourceSha256)||
    independentlyPinnedSha!==plan.sourceSha256||
    !Number.isSafeInteger(expectedRevision)||expectedRevision<1||
    !Number.isSafeInteger(expectedEpoch)||expectedEpoch<1)
    return denied('EXTERNAL_PIN_PLAN_AND_EPOCH_REQUIRED');
  const entries=entriesFor(plan);
  if(entries.length===0||entries.length>LIMIT)
    return denied('TRANSACTION_KNOWN_WRITESET_BOUNDED_MAX_24');
  const keys=entries.map(x=>x.kind+'/'+x.id);
  if(new Set(keys).size!==keys.length||
    entries.some(x=>!x.id||!shape(x.data)||
      !Number.isSafeInteger(x.data.sourceIndex)||x.data.sourceIndex<0||
      x.data.revision!==expectedRevision))
    return denied('MALFORMED_CANONICAL_KNOWN_WRITESET');
  try{
    const proof=await runTransaction(db,async tx=>{
      const lSnapshot=await tx.get(doc(db,LOCK));
      if(!lSnapshot.exists())throw Error('MISSING_PERSISTED_MIGRATION_LOCK');
      const l=lSnapshot.data();
      if(l.phase!=='writing'||l.sealed!==false||
        l.authorizedForImport!==false||l.epoch!==expectedEpoch||
        l.sourceSha256!==independentlyPinnedSha||
        l.revision!==expectedRevision||l.expectedCount!==keys.length||
        l.planDigest!==sha256(keys)||
        !Array.isArray(l.verifiedIds)||l.verifiedIds.length!==keys.length||
        l.verifiedIds.some((v,i)=>v!==keys[i])||
        l.verifiedDigest!==sha256(keys)||
        !Number.isSafeInteger(l.batchCount)||l.batchCount<1)
        throw Error('UNVERIFIED_OR_STALE_EPOCH_CHECKPOINT');

      // EXACT bounded document set is read within a genuine SDK
      // transaction. It is NOT a collection-wide absence proof.
      for(const e of entries){
        const master=(e.kind==='drivers'?'flottaDrivers/':'flottaVehicles/')+e.id;
        const claim=(e.kind==='drivers'?'flottaDriverClaims/':'flottaVehicleClaims/')+e.id;
        const expectedClaim={
          normalizedId:e.id,sourceIndex:e.data.sourceIndex,
          revision:e.data.revision,
          migrationSourceSha256:independentlyPinnedSha,
          masterSha256:sha256(e.data)
        };
        const [m,c]=await Promise.all([
          tx.get(doc(db,master)),tx.get(doc(db,claim))
        ]);
        if(!m.exists()||!c.exists())
          throw Error('MISSING_SOURCE_KEYED_MASTER_OR_CLAIM');
        if(sha256(m.data())!==sha256(e.data)||
          sha256(c.data())!==sha256(expectedClaim))
          throw Error('KNOWN_RICH_MASTER_OR_IMMUTABLE_CLAIM_MISMATCH');
      }
      return {knownWriteSetCount:entries.length,verifiedEpoch:expectedEpoch,
        knownReadDocumentCount:2*entries.length+1};
    },{maxAttempts:3});
    return {ok:true,reason:'BOUNDED_TRANSACTION_KNOWN_WRITESET_ONLY',
      ...proof,knownWriteSetSnapshotVerified:true};
  }catch(e){
    return denied('KNOWN_WRITESET_TRANSACTION_DENIED: '+String(e.message||e));
  }
}
