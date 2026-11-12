/**
 * V1 bounded known write-set transaction proof — DEMO ONLY, NO SEAL.
 *
 * A Firestore read transaction can check a bounded, specifically listed
 * source-derived master/immutable-claim write-set and migration lease in
 * one consistent document snapshot. It CANNOT atomically prove absence
 * of OUT-OF-PLAN documents across four entire collections. More importantly,
 * an independently privileged writer can mutate ANY documents after this
 * read-only transaction, bypassing client Firestore Rules.
 *
 * Thus a successful preview is CONTENT INTEGRITY ONLY, never external
 * signer provenance, production IAM, trusted cutover isolation, or seal
 * authorization. The original poisoned-privileged-source booking P0 remains.
 */
import {doc,runTransaction} from 'firebase/firestore';
import {sha256} from './v1-migration-dryrun.mjs';
import {createServerSealBoundary} from './v1-server-seal-boundary.mjs';

const LIMIT=24;
const LOCK='v1MigrationSyntheticLocks/primary';
const SCOPE='LOCAL_DEMO_BOUNDED_KNOWN_DOCUMENT_READ_TRANSACTION_ONLY';
const verdict=(ok,reason,extra={})=>({
  ...extra,ok,reason,
  sealed:false,canSeal:false,authorizedForImport:false,
  externalSignerAuthenticated:false,ownerApprovalAuthenticated:false,
  externalTrustRootAuthenticityVerified:false,privilegedImporterVerified:false,
  productionIamVerified:false,closedWriterSetVerified:false,
  atomicNamespaceSnapshotVerified:false,proofScope:SCOPE
});
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const goodEnv=(db,projectId)=>
  typeof projectId==='string'&&/^demo-[a-z0-9-]+$/.test(projectId)&&
  process.env.FIRESTORE_EMULATOR_HOST==='127.0.0.1:8787'&&
  !process.env.GOOGLE_APPLICATION_CREDENTIALS&&
  !process.env.FIREBASE_SERVICE_ACCOUNT&&
  db?.app?.options?.projectId===projectId;
const entriesFor=plan=>{
  const out=[
    ...plan.drivers.map(d=>({kind:'drivers',id:d.id,data:d.data})),
    ...plan.vehicles.map(v=>({kind:'vehicles',id:v.id,data:v.data}))
  ];
  return out.sort((a,b)=>(a.kind+'/'+a.id).localeCompare(b.kind+'/'+b.id));
};
const shapesFor=(item,pin)=>({
  masterPath:(item.kind==='drivers'?'flottaDrivers/':'flottaVehicles/')+item.id,
  claimPath:(item.kind==='drivers'?'flottaDriverClaims/':'flottaVehicleClaims/')+item.id,
  expectedMaster:item.data,
  expectedClaim:{
    normalizedId:item.id,
    sourceIndex:item.data.sourceIndex,
    revision:item.data.revision,
    migrationSourceSha256:pin,
    masterSha256:sha256(item.data)
  }
});

export class ServerOnlySeal {
  #nonAtomicInspector=createServerSealBoundary();
  constructor(_callerFlags={}){
    // No caller boolean, invented signer, key, approval or IAM property
    // may become a trusted authority. These are intentionally ignored.
  }
  attemptSeal(_evidence){
    return verdict(false,'SERVER_ONLY_RELEASE_AUTHORITY_MISSING');
  }
  async seal(_params){
    return verdict(false,'SERVER_ONLY_RELEASE_AUTHORITY_MISSING');
  }
  async inspectLocalEmulator(args){
    const result=await this.#nonAtomicInspector.inspectLocalEmulator(args);
    return verdict(result.ok===true,result.ok?
      'NONATOMIC_NAMESPACE_DIAGNOSTIC_ONLY':'NONATOMIC_NAMESPACE_DIAGNOSTIC_DENIED',{
      issues:result.issues,diagnosticMasterCount:result.diagnosticMasterCount,
      diagnosticClaimCount:result.diagnosticClaimCount
    });
  }

  async inspectBoundedKnownSet({
    db,projectId,plan,expectedEpoch,independentlyPinnedSha,expectedRevision=1
  }={}){
    if(!goodEnv(db,projectId))
      return verdict(false,'LOCAL_DEMO_FIRESTORE_EMULATOR_REQUIRED');
    if(!isObj(plan)||!Array.isArray(plan.drivers)||
       !Array.isArray(plan.vehicles)||
       typeof plan.sourceSha256!=='string'||
       !/^[a-f0-9]{64}$/.test(plan.sourceSha256)||
       independentlyPinnedSha!==plan.sourceSha256||
       !Number.isSafeInteger(expectedRevision)||expectedRevision<1||
       !Number.isSafeInteger(expectedEpoch)||expectedEpoch<1)
      return verdict(false,'EXTERNAL_PIN_PLAN_AND_EPOCH_REQUIRED');
    const entries=entriesFor(plan);
    if(entries.length===0||entries.length>LIMIT)
      return verdict(false,'TRANSACTION_KNOWN_WRITESET_BOUNDED_MAX_24',{
        totalExpected:entries.length
      });
    try{
      const keys=entries.map(x=>x.kind+'/'+x.id);
      if(new Set(keys).size!==keys.length||
        entries.some(x=>!x.id||!isObj(x.data)||
          !Number.isSafeInteger(x.data.sourceIndex)||x.data.sourceIndex<0||
          x.data.revision!==expectedRevision))
        return verdict(false,'MALFORMED_CANONICAL_KNOWN_WRITESET');

      const inspected=await runTransaction(db,async tx=>{
        const lock=await tx.get(doc(db,LOCK));
        if(!lock.exists())throw Error('MISSING_PERSISTED_MIGRATION_LOCK');
        const l=lock.data();
        if(l.phase!=='writing'||l.sealed!==false||
          l.authorizedForImport!==false||l.epoch!==expectedEpoch||
          l.sourceSha256!==independentlyPinnedSha||
          l.revision!==expectedRevision||
          l.expectedCount!==keys.length||l.planDigest!==sha256(keys)||
          !Array.isArray(l.verifiedIds)||l.verifiedIds.length!==keys.length||
          l.verifiedIds.some((v,i)=>v!==keys[i])||
          l.verifiedDigest!==sha256(keys)||
          !Number.isSafeInteger(l.batchCount)||l.batchCount<1)
          throw Error('UNVERIFIED_OR_STALE_EPOCH_CHECKPOINT');

        // Every read in the single transaction belongs to the EXPLICIT
        // known write-set. This does not query unknown/extra collection IDs.
        for(const item of entries){
          const sh=shapesFor(item,independentlyPinnedSha);
          const [m,c]=await Promise.all([
            tx.get(doc(db,sh.masterPath)),tx.get(doc(db,sh.claimPath))
          ]);
          if(!m.exists()||!c.exists())
            throw Error('MISSING_SOURCE_KEYED_MASTER_OR_CLAIM');
          if(sha256(m.data())!==sha256(sh.expectedMaster)||
            sha256(c.data())!==sha256(sh.expectedClaim))
            throw Error('KNOWN_RICH_MASTER_OR_IMMUTABLE_CLAIM_MISMATCH');
        }
        return {knownWriteSetCount:entries.length,verifiedEpoch:expectedEpoch,
          knownReadDocumentCount:entries.length*2+1};
      },{maxAttempts:3});
      return verdict(true,'TRANSACTION_CONSISTENT_KNOWN_WRITESET_CONTENT_ONLY',{
        ...inspected,knownWriteSetSnapshotVerified:true,
        globallyAuthoritativeNamespace:false
      });
    }catch(error){
      return verdict(false,'KNOWN_WRITESET_TRANSACTION_DENIED: '+String(error.message||error),{
        knownWriteSetSnapshotVerified:false
      });
    }
  }
}
export function createServerOnlySeal(options){
  return new ServerOnlySeal(options);
}
