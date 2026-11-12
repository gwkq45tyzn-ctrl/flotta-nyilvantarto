/**
 * DEMO-ONLY source-signed 440 FULL-RICH master+claim attestation.
 * 19 bounded Firestore read+write transactions, one per known chunk,
 * plus an aggregation transaction that checks 19 exact chunk receipts.
 *
 * These proofs have NOT frozen other Admin SDK writers, DO NOT prove an
 * atomic full-namespace snapshot (or unknown orphan absence), and cannot
 * grant any business-owner, production IAM, import or seal authority.
 *
 * Every chunk checks the two real Ed25519 signatures, independently pinned
 * original full-rich backup, persisted root-signed registry highwater,
 * active epoch+complete journal, and exact SHA of each master+claim pair.
 * A privileged writer can still reset the stored highwater/receipts or
 * modify master/claim AFTER the read; never treat a green receipt as seal.
 */
import {doc,runTransaction} from 'firebase/firestore';
import {createHash} from 'node:crypto';
import {buildPlan,sha256} from '../../../tools/v1-migration-dryrun.mjs';
import {canonicalStringify} from '../../../features/migration-manifest.mjs';
import {createTrustedSignerContract} from '../../../tools/v1-trusted-signer-contract.mjs';

const ROOT='v1Synthetic440SignedChunks';
const AGG='v1Synthetic440SignedAggregates/current';
const LOCK='v1MigrationSyntheticLocks/primary';
const HW='v1SyntheticOwnerRegistryHighwater/current';
const LIMIT=24;
const MAX_PAIRS=440;
const SCOPE='LOCAL_440_KNOWN_SOURCE_PAIRS_19_TRANSACTIONS_NO_SEAL';
const HASH=/^[a-f0-9]{64}$/;
const demo=(db,id)=>/^demo-[a-z0-9-]+$/.test(id||'')&&
  ['127.0.0.1:8787','localhost:8787'].includes(process.env.FIRESTORE_EMULATOR_HOST)&&
  !process.env.GOOGLE_APPLICATION_CREDENTIALS&&
  !process.env.FIREBASE_SERVICE_ACCOUNT&&
  db?.app?.options?.projectId===id;
const hash=o=>createHash('sha256').update(canonicalStringify(o),'utf8').digest('hex');
const equal=(x,y)=>Array.isArray(x)&&Array.isArray(y)&&x.length===y.length&&
  x.every((v,i)=>v===y[i]);
const deny=(reason,rest={})=>({
  ...rest,ok:false,reason,sealed:false,canSeal:false,
  authorizedForImport:false,productionIamVerified:false,
  ownerApprovalAuthenticated:false,
  externalTrustRootAuthenticityVerified:false,
  externallyAuthenticatedDurableHighWaterVerified:false,
  privilegedWriterIsolationVerified:false,
  atomicNamespaceSnapshotVerified:false,proofScope:SCOPE
});
const allow=(reason,rest={})=>({...deny(reason,rest),ok:true});
const entryPath=e=>({
  master:(e.kind==='drivers'?'flottaDrivers/':'flottaVehicles/')+e.id,
  claim:(e.kind==='drivers'?'flottaDriverClaims/':'flottaVehicleClaims/')+e.id
});
const expectedClaim=(e,pin)=>({
  normalizedId:e.id,sourceIndex:e.data.sourceIndex,revision:e.data.revision,
  migrationSourceSha256:pin,masterSha256:sha256(e.data)
});
const readOnlySchema=(expected,actual)=>sha256(expected)===sha256(actual);

export class Local440SignedChunkReceipts {
  #db;#id;#root;#rootSha;#audience;#signer;#revision;
  constructor({db,projectId,rootPublicKeySpkiBase64,
    independentlyPinnedRootSha256,
    expectedRegistryAudience='demo-imile-v1-owner-registry',
    expectedSignerId='local-test-owner',expectedRevision=1}={}){
    if(!demo(db,projectId))throw Error('DEMO_LOCAL_FIRESTORE_ONLY');
    if(typeof rootPublicKeySpkiBase64!=='string'||
      !HASH.test(independentlyPinnedRootSha256||'')||
      !/^demo-[a-z0-9-]+$/.test(expectedRegistryAudience)||
      !/^[A-Za-z0-9._-]{3,80}$/.test(expectedSignerId)||
      !Number.isSafeInteger(expectedRevision)||expectedRevision<1)
      throw Error('PINNED_SYNTHETIC_SOURCE_ROOT_REQUIRED');
    this.#db=db;this.#id=projectId;this.#root=rootPublicKeySpkiBase64;
    this.#rootSha=independentlyPinnedRootSha256;this.#audience=expectedRegistryAudience;
    this.#signer=expectedSignerId;this.#revision=expectedRevision;
  }
  #preflight({registryBundle,manifest,snapshot,backup,expectedEpoch,
    independentlyPinnedSourceSha256}={}){
    if(!Number.isSafeInteger(expectedEpoch)||expectedEpoch<1||
      !HASH.test(independentlyPinnedSourceSha256||''))
      throw Error('SOURCE_PIN_AND_EPOCH_REQUIRED');
    const chain=createTrustedSignerContract({
      rootPublicKeySpkiBase64:this.#root,
      independentlyPinnedRootSha256:this.#rootSha,
      expectedRegistryAudience:this.#audience,
      expectedProjectId:this.#id,expectedSignerId:this.#signer,
      expectedSourceRevision:this.#revision,
      independentlyPinnedSourceSha256
    }).verify({registryBundle,manifest,snapshot,backup});
    if(!chain.ok)throw Error('TWO_ED25519_SOURCE_ATTESTATION_DENIED: '+chain.reason);
    const plan=buildPlan(snapshot);
    if(plan.sourceSha256!==independentlyPinnedSourceSha256)
      throw Error('INDEPENDENT_PIN_DRIFT');
    const entries=[
      ...plan.drivers.map(x=>({...x,kind:'drivers'})),
      ...plan.vehicles.map(x=>({...x,kind:'vehicles'}))
    ].sort((a,b)=>(a.kind+'/'+a.id).localeCompare(b.kind+'/'+b.id));
    if(entries.length!==MAX_PAIRS||
      new Set(entries.map(e=>e.kind+'/'+e.id)).size!==entries.length)
      throw Error('EXACT_440_CANONICAL_UNIQUE_PAIRS_REQUIRED');
    const ids=entries.map(e=>e.kind+'/'+e.id);
    const chunks=[];
    for(let i=0;i<ids.length;i+=LIMIT){
      const e=entries.slice(i,i+LIMIT),paths=ids.slice(i,i+LIMIT);
      chunks.push({
        index:chunks.length,entries:e,ids:paths,
        key:String(chunks.length).padStart(2,'0'),
        richDigest:sha256(e.map(x=>({
          id:x.kind+'/'+x.id,master:x.data,
          claim:expectedClaim(x,independentlyPinnedSourceSha256)
        })))
      });
    }
    const r=registryBundle.payload;
    return {
      entries,ids,chunks,pin:independentlyPinnedSourceSha256,
      epoch:expectedEpoch,registrySequence:r.sequence,
      registryDigest:hash(r),
      revoked:[...r.revokedSignerFingerprints].sort(),
      rootFingerprint:this.#rootSha,
      signerFingerprint:chain.localSignerFingerprint,
      signerKeyVersion:chain.localSignerKeyVersion,
      manifestDigest:hash(manifest),
      planDigest:sha256(ids)
    };
  }
  #matchingControls(h,l,p){
    if(!h.exists()||!l.exists())throw Error('REGISTRY_OR_FENCING_LOCK_MISSING');
    const hw=h.data(),lock=l.data();
    if(hw.sequence!==p.registrySequence||
      hw.registryDigest!==p.registryDigest||
      hw.rootFingerprint!==p.rootFingerprint||
      hw.sourceProjectId!==this.#id||
      hw.registryAudience!==this.#audience||
      hw.syntheticOnly!==true||
      !equal(hw.revokedSignerFingerprints,p.revoked)||
      hw.revokedSignerFingerprints.includes(p.signerFingerprint))
      throw Error('REGISTRY_REVOKED_DRIFT_OR_PRIVILEGED_RESET');
    if(lock.phase!=='writing'||lock.sealed!==false||
      lock.authorizedForImport!==false||
      lock.epoch!==p.epoch||lock.sourceSha256!==p.pin||
      lock.revision!==this.#revision||
      lock.expectedCount!==MAX_PAIRS||
      lock.planDigest!==p.planDigest||
      !equal(lock.verifiedIds,p.ids)||
      lock.verifiedDigest!==sha256(p.ids)||
      lock.batchCount!==p.chunks.length)
      throw Error('SOURCE_EPOCH_OR_COMPLETE_440_JOURNAL_INVALID');
  }
  #chunkData(p,c){
    return {
      sourceSha256:p.pin,sourceRevision:this.#revision,
      manifestDigest:p.manifestDigest,
      rootFingerprint:p.rootFingerprint,
      signerFingerprint:p.signerFingerprint,
      signerKeyVersion:p.signerKeyVersion,
      registrySequence:p.registrySequence,
      registryDigest:p.registryDigest,
      fencedEpoch:p.epoch,planDigest:p.planDigest,
      chunkIndex:c.index,chunkCount:p.chunks.length,
      count:c.entries.length,chunkIdsDigest:sha256(c.ids),
      fullRichMasterClaimDigest:c.richDigest,syntheticOnly:true
    };
  }
  async recordChunk(evidence,index){
    let p;
    try{p=this.#preflight(evidence)}
    catch(e){return deny('SIGNED_440_SOURCE_PREFLIGHT_DENIED: '+String(e.message||e))}
    if(!Number.isSafeInteger(index)||index<0||index>=p.chunks.length)
      return deny('CHUNK_OUTSIDE_SIGNED_CANONICAL_PLAN');
    const c=p.chunks[index],data=this.#chunkData(p,c);
    try{
      const out=await runTransaction(this.#db,async tx=>{
        const [h,l,r]=await Promise.all([
          tx.get(doc(this.#db,HW)),tx.get(doc(this.#db,LOCK)),
          tx.get(doc(this.#db,ROOT,c.key))
        ]);
        this.#matchingControls(h,l,p);
        const pairs=[];
        for(const e of c.entries){
          const paths=entryPath(e);
          const [m,claim]=await Promise.all([
            tx.get(doc(this.#db,paths.master)),
            tx.get(doc(this.#db,paths.claim))
          ]);
          pairs.push({e,m,claim});
        }
        for(const {e,m,claim} of pairs){
          if(!m.exists()||!claim.exists()||
            !readOnlySchema(e.data,m.data())||
            !readOnlySchema(expectedClaim(e,p.pin),claim.data()))
            throw Error('SIGNED_440_RICH_MASTER_OR_CLAIM_MISMATCH');
        }
        if(r.exists()&&!readOnlySchema(data,r.data()))
          throw Error('EXISTING_CHUNK_RECEIPT_TAMPERED_OR_STALE');
        if(!r.exists())tx.set(doc(this.#db,ROOT,c.key),data);
        return {
          chunkIndex:index,verifiedPairCount:c.entries.length,
          receiptCreated:!r.exists(),fencedEpoch:p.epoch,
          registrySequence:p.registrySequence
        };
      },{maxAttempts:5});
      return allow('LOCAL_SIGNED_440_CHUNK_TRANSACTION_VERIFIED',out);
    }catch(e){
      return deny('SIGNED_440_CHUNK_TRANSACTION_DENIED: '+String(e.message||e))
    }
  }
  async aggregate(evidence){
    let p;
    try{p=this.#preflight(evidence)}
    catch(e){return deny('SIGNED_440_SOURCE_PREFLIGHT_DENIED: '+String(e.message||e))}
    try{
      const out=await runTransaction(this.#db,async tx=>{
        const refs=p.chunks.map(c=>doc(this.#db,ROOT,c.key));
        const [h,l,prior,...snapshots]=await Promise.all([
          tx.get(doc(this.#db,HW)),tx.get(doc(this.#db,LOCK)),
          tx.get(doc(this.#db,AGG)),
          ...refs.map(x=>tx.get(x))
        ]);
        this.#matchingControls(h,l,p);
        const receipts=p.chunks.map((c,i)=>{
          const expect=this.#chunkData(p,c);
          if(!snapshots[i].exists()||
            !readOnlySchema(expect,snapshots[i].data()))
            throw Error('MISSING_OR_FORGED_SIGNED_440_CHUNK_RECEIPT_'+c.key);
          return expect;
        });
        const aggregate={
          sourceSha256:p.pin,sourceRevision:this.#revision,
          registrySequence:p.registrySequence,
          registryDigest:p.registryDigest,
          rootFingerprint:p.rootFingerprint,
          signerFingerprint:p.signerFingerprint,
          manifestDigest:p.manifestDigest,
          fencedEpoch:p.epoch,planDigest:p.planDigest,
          receiptCount:receipts.length,knownPairs:MAX_PAIRS,
          orderedReceiptsSha256:sha256(receipts),syntheticOnly:true
        };
        if(prior.exists()&&!readOnlySchema(aggregate,prior.data()))
          throw Error('SIGNED_440_AGGREGATE_ALREADY_CONFLICTS');
        if(!prior.exists())tx.set(doc(this.#db,AGG),aggregate);
        return {verifiedReceiptCount:receipts.length,knownPairs:MAX_PAIRS,
          aggregateDigest:sha256(aggregate),
          aggregateCreated:!prior.exists(),
          sourceFencedEpoch:p.epoch,
          rootSignedRegistrySequence:p.registrySequence
        };
      },{maxAttempts:5});
      return allow('LOCAL_SIGNED_440_RECEIPT_AGGREGATE_ONLY',out);
    }catch(e){
      return deny('SIGNED_440_AGGREGATE_DENIED: '+String(e.message||e));
    }
  }
  async seal(){return deny('NO_PRODUCTION_OWNER_IAM_CLOSED_WRITERS_OR_ATOMIC_SEAL')}
}
export function createLocal440SignedChunkReceipts(args){
  return new Local440SignedChunkReceipts(args);
}
