/**
 * LOCAL SYNTHETIC FIRESTORE ONLY. A single real read/write transaction
 * binds the root-signed registry highwater, signer-signed full-rich Fleet
 * source, canonical keyed master+immutable claim set, and fencing epoch.
 *
 * This is a <=24 pair KNOWN-WRITESET receipt, NOT an atomic inventory of
 * the four collections, authenticated business owner, production IAM,
 * external durable antirollback, or an authorized seal. A privileged writer
 * can overwrite any of the docs outside this gate: test that explicitly.
 */
import {doc,runTransaction} from 'firebase/firestore';
import {createTrustedSignerContract} from '../../../tools/v1-trusted-signer-contract.mjs';
import {buildPlan,sha256} from '../../../tools/v1-migration-dryrun.mjs';
import {canonicalStringify} from '../../../features/migration-manifest.mjs';
import {createHash} from 'node:crypto';

const HW='v1SyntheticOwnerRegistryHighwater/current';
const LOCK='v1MigrationSyntheticLocks/primary';
const RECEIPT='v1SyntheticSignedSourceEpochBindings/current';
const SCOPE='LOCAL_SIGNED_RICH_SOURCE_KNOWNSET_EPOCH_TRANSACTION_NO_AUTHORITY';
const HASH=/^[a-f0-9]{64}$/;
const DEMO=/^demo-[a-z0-9-]+$/;
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const equal=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&
  a.length===b.length&&a.every((v,i)=>v===b[i]);
const digest=o=>createHash('sha256').update(canonicalStringify(o),'utf8').digest('hex');
const fail=reason=>({ok:false,reason,canSeal:false,sealed:false,
  authorizedForImport:false,productionIamVerified:false,
  externalTrustRootAuthenticityVerified:false,
  privilegedWriterIsolationVerified:false,
  externallyAuthenticatedDurableHighWaterVerified:false,
  atomicNamespaceSnapshotVerified:false,ownerApprovalAuthenticated:false,
  proofScope:SCOPE});
const pass=(data)=>({...fail('LOCAL_SIGNED_SOURCE_EPOCH_RECEIPT_ONLY'),...data,
  ok:true,reason:'LOCAL_SIGNED_SOURCE_EPOCH_RECEIPT_ONLY'});
function demo(db,projectId){
  return DEMO.test(projectId||'')&&
    process.env.FIRESTORE_EMULATOR_HOST==='127.0.0.1:8787'&&
    !process.env.GOOGLE_APPLICATION_CREDENTIALS&&
    !process.env.FIREBASE_SERVICE_ACCOUNT&&
    db?.app?.options?.projectId===projectId;
}
export class LocalSignedSourceEpochBinding {
  #db;#project;#root;#rootSha;#signer;#audience;#revision;
  constructor({
    db,projectId,rootPublicKeySpkiBase64,independentlyPinnedRootSha256,
    expectedSignerId='local-test-owner',
    expectedRegistryAudience='demo-imile-v1-owner-registry',
    expectedRevision=1
  }={}){
    if(!demo(db,projectId))throw Error('LOCAL_DEMO_FIRESTORE_REQUIRED');
    if(typeof rootPublicKeySpkiBase64!=='string'||
       !HASH.test(independentlyPinnedRootSha256||'')||
       !DEMO.test(expectedRegistryAudience)||
       !/^[A-Za-z0-9._-]{3,80}$/.test(expectedSignerId)||
       !Number.isSafeInteger(expectedRevision)||expectedRevision<1)
      throw Error('PINNED_ROOT_AND_SOURCE_CONTEXT_REQUIRED');
    this.#db=db;this.#project=projectId;this.#root=rootPublicKeySpkiBase64;
    this.#rootSha=independentlyPinnedRootSha256;
    this.#signer=expectedSignerId;this.#audience=expectedRegistryAudience;
    this.#revision=expectedRevision;
  }

  async inspectAndBind({
    registryBundle,manifest,snapshot,backup,expectedEpoch,
    independentlyPinnedSourceSha256
  }={}){
    if(!Number.isSafeInteger(expectedEpoch)||expectedEpoch<1||
       !HASH.test(independentlyPinnedSourceSha256||''))
      return fail('EXPECTED_EPOCH_AND_INDEPENDENT_SOURCE_PIN_REQUIRED');
    let chain,plan,entries,ids;
    try{
      chain=createTrustedSignerContract({
        rootPublicKeySpkiBase64:this.#root,
        independentlyPinnedRootSha256:this.#rootSha,
        expectedRegistryAudience:this.#audience,
        expectedProjectId:this.#project,
        expectedSignerId:this.#signer,
        independentlyPinnedSourceSha256,
        expectedSourceRevision:this.#revision
      }).verify({registryBundle,manifest,snapshot,backup});
      if(!chain.ok)return fail('TWO_ED25519_FULL_RICH_CHAIN_DENIED: '+chain.reason);
      plan=buildPlan(snapshot);
      if(plan.sourceSha256!==independentlyPinnedSourceSha256||
        plan.sourceSha256!==chain.fullRichSourceSha256)
        return fail('SOURCE_PIN_OR_PLAN_DRIFT');
      entries=[
        ...plan.drivers.map(e=>({...e,kind:'drivers'})),
        ...plan.vehicles.map(e=>({...e,kind:'vehicles'}))
      ].sort((a,b)=>
        (a.kind+'/'+a.id).localeCompare(b.kind+'/'+b.id)
      );
      ids=entries.map(e=>e.kind+'/'+e.id);
      if(entries.length<1||entries.length>24||new Set(ids).size!==ids.length)
        return fail('SOURCE_KNOWN_WRITESET_LIMIT_OR_DUPLICATE');
    }catch(e){return fail('SIGNED_CHAIN_SOURCE_PREFLIGHT_DENIED: '+String(e.message||e))}
    const registry=registryBundle.payload;
    const registryDigest=digest(registry);
    const manifestDigest=digest(manifest);
    const receipt={
      sourceSha256:independentlyPinnedSourceSha256,
      sourceRevision:this.#revision,manifestDigest,
      registrySequence:registry.sequence,registryDigest,
      rootFingerprint:this.#rootSha,
      selectedSignerFingerprint:chain.localSignerFingerprint,
      selectedSignerKeyVersion:chain.localSignerKeyVersion,
      fencedEpoch:expectedEpoch,planDigest:sha256(ids),
      knownRichPairCount:entries.length,syntheticOnly:true
    };
    try{
      const result=await runTransaction(this.#db,async tx=>{
        // Read all 3 control docs first, then all canonical known pairs.
        const regRef=doc(this.#db,HW),
          lockRef=doc(this.#db,LOCK),receiptRef=doc(this.#db,RECEIPT);
        const [h,l,r]=await Promise.all([
          tx.get(regRef),tx.get(lockRef),tx.get(receiptRef)
        ]);
        if(!h.exists()||!l.exists())
          throw Error('PERSISTED_REGISTRY_OR_EPOCH_MISSING');
        const hw=h.data(),lock=l.data();
        if(hw.sequence!==registry.sequence||
          hw.registryDigest!==registryDigest||
          hw.rootFingerprint!==this.#rootSha||
          hw.sourceProjectId!==this.#project||
          hw.registryAudience!==this.#audience||
          hw.syntheticOnly!==true||
          !Array.isArray(hw.revokedSignerFingerprints)||
          !equal([...hw.revokedSignerFingerprints].sort(),
            [...registry.revokedSignerFingerprints].sort())||
          hw.revokedSignerFingerprints.includes(chain.localSignerFingerprint))
          throw Error('ROOT_SIGNED_REGISTRY_NOT_CURRENT_OR_SIGNER_REVOKED');
        if(lock.phase!=='writing'||lock.sealed!==false||
          lock.authorizedForImport!==false||
          lock.epoch!==expectedEpoch||
          lock.sourceSha256!==independentlyPinnedSourceSha256||
          lock.revision!==this.#revision||
          lock.expectedCount!==entries.length||
          lock.planDigest!==sha256(ids)||
          !equal(lock.verifiedIds,ids)||
          lock.verifiedDigest!==sha256(ids)||
          !Number.isSafeInteger(lock.batchCount)||lock.batchCount<1)
          throw Error('FENCED_SOURCE_EPOCH_OR_COMPLETE_JOURNAL_DENIED');
        const pairs=[];
        for(const e of entries){
          const prefix=e.kind==='drivers'?'flottaDrivers/':'flottaVehicles/';
          const claimPrefix=e.kind==='drivers'?
            'flottaDriverClaims/':'flottaVehicleClaims/';
          const expectedClaim={
            normalizedId:e.id,sourceIndex:e.data.sourceIndex,
            revision:e.data.revision,
            migrationSourceSha256:independentlyPinnedSourceSha256,
            masterSha256:sha256(e.data)
          };
          const [m,c]=await Promise.all([
            tx.get(doc(this.#db,prefix+e.id)),
            tx.get(doc(this.#db,claimPrefix+e.id))
          ]);
          pairs.push({m,c,expectedMaster:e.data,expectedClaim});
        }
        for(const p of pairs){
          if(!p.m.exists()||!p.c.exists()||
            sha256(p.m.data())!==sha256(p.expectedMaster)||
            sha256(p.c.data())!==sha256(p.expectedClaim))
            throw Error('SIGNED_FULL_RICH_MASTER_OR_CLAIM_TAMPERED');
        }
        if(r.exists()&&sha256(r.data())!==sha256(receipt))
          throw Error('EXISTING_SIGNED_SOURCE_RECEIPT_CONFLICT');
        if(!r.exists())tx.set(receiptRef,receipt);
        return {knownRichPairCount:entries.length,
          fencedEpoch:expectedEpoch,registrySequence:registry.sequence,
          receiptCreated:!r.exists(),readDocumentCount:3+2*entries.length};
      },{maxAttempts:5});
      return pass({...result,fullRichSourceSha256:independentlyPinnedSourceSha256,
        localSignatureChainIntegrityVerified:true,
        signedSourceAndHighwaterKnownSetTransactionVerified:true});
    }catch(e){
      return fail('SIGNED_SOURCE_EPOCH_TRANSACTION_DENIED: '+String(e.message||e));
    }
  }
  async seal(){return fail('REAL_PRIVILEGED_SOURCE_IAM_AND_ATOMIC_SEAL_MISSING')}
}
export function createLocalSignedSourceEpochBinding(config){
  return new LocalSignedSourceEpochBinding(config);
}
