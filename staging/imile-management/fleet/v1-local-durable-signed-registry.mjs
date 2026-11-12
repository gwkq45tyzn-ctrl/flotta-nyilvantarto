/**
 * DEMO ONLY: one real Firestore transaction advances/checks a ROOT-SIGNED
 * offline registry high-water shared across independent Node OS processes.
 *
 * This validates Ed25519 SIGNATURE INTEGRITY relative to a locally supplied
 * root fingerprint; it does NOT authenticate the real business owner's root,
 * trusted time, IAM, revocation freshness or an isolated privileged writer.
 * Test-only withSecurityRulesDisabled lets an arbitrary privileged actor
 * reset the high-water: the adversarial test explicitly demonstrates this.
 *
 * No production authorization, import, booking, signature creation or seal.
 */
import {createPublicKey,createHash,verify as verifyEd25519,timingSafeEqual} from 'node:crypto';
import {doc,runTransaction} from 'firebase/firestore';
import {canonicalStringify} from '../../../features/migration-manifest.mjs';

const PATH='v1SyntheticOwnerRegistryHighwater/current';
const SCOPE='DEMO_ROOT_SIGNED_FIRESTORE_HIGHWATER_NOT_OWNER_IAM';
const HEX=/^[a-f0-9]{64}$/;
const DEMO=/^demo-[a-z0-9-]+$/;
const KEYS=['schema','purpose','registryAudience','sourceProjectId','sequence','notBeforeMs','expiresAtMs','signers','revokedSignerFingerprints'];
const SIGNER_KEYS=['signerId','keyVersion','publicKeySpkiBase64','status','notBeforeMs','expiresAtMs'];
const isObj=o=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&
  (Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null);
const exact=(o,keys)=>isObj(o)&&Object.keys(o).length===keys.length&&
  Object.keys(o).every(k=>keys.includes(k));
const sha=o=>createHash('sha256').update(canonicalStringify(o),'utf8').digest('hex');
const denied=reason=>({
  ok:false,reason,sealed:false,canSeal:false,authorizedForImport:false,
  ownerApprovalAuthenticated:false,productionIamVerified:false,
  externalTrustRootAuthenticityVerified:false,registryFreshnessVerified:false,
  trustedClockVerified:false,privilegedWriterIsolationVerified:false,
  externallyAuthenticatedDurableHighWaterVerified:false,proofScope:SCOPE
});
const allowed=(reason,fields)=>({
  ...denied(reason),...fields,ok:true,reason
});
const keyOf=b64=>{
  if(typeof b64!=='string'||b64.length<40||b64.length>1024||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)||
      Buffer.from(b64,'base64').toString('base64')!==b64)
    throw Error('INVALID_ED25519_ROOT_BASE64');
  const bytes=Buffer.from(b64,'base64');
  const key=createPublicKey({key:bytes,type:'spki',format:'der'});
  if(key.asymmetricKeyType!=='ed25519'||
    !key.export({format:'der',type:'spki'}).equals(bytes))
    throw Error('INVALID_ED25519_ROOT_DER');
  return {key,fingerprint:createHash('sha256').update(bytes).digest('hex')};
};
const safeEnv=(db,projectId)=>
  DEMO.test(projectId||'') &&
  process.env.FIRESTORE_EMULATOR_HOST==='127.0.0.1:8787' &&
  !process.env.GOOGLE_APPLICATION_CREDENTIALS &&
  !process.env.FIREBASE_SERVICE_ACCOUNT &&
  db?.app?.options?.projectId===projectId;

export class LocalSignedRegistryHighwater {
  #db;#project;#root;#rootFingerprint;#audience;#minimum;
  constructor({db,projectId,rootPublicKeySpkiBase64,
    independentlyPinnedRootSha256,expectedRegistryAudience='demo-imile-v1-owner-registry',
    minimumRegistrySequence=1}={}){
    if(!safeEnv(db,projectId))throw Error('LOCAL_DEMO_EMULATOR_REQUIRED');
    if(!DEMO.test(expectedRegistryAudience)||
       !Number.isSafeInteger(minimumRegistrySequence)||minimumRegistrySequence<1||
       typeof independentlyPinnedRootSha256!=='string'||
       !HEX.test(independentlyPinnedRootSha256))
      throw Error('EXPECTED_ROOT_CONTEXT_AND_SEQUENCE_REQUIRED');
    const root=keyOf(rootPublicKeySpkiBase64);
    if(!timingSafeEqual(
      Buffer.from(root.fingerprint,'hex'),
      Buffer.from(independentlyPinnedRootSha256,'hex')
    ))throw Error('ROOT_FINGERPRINT_MISMATCH');
    this.#db=db;this.#project=projectId;
    this.#root=root.key;this.#rootFingerprint=root.fingerprint;
    this.#audience=expectedRegistryAudience;this.#minimum=minimumRegistrySequence;
  }

  #validate(signed){
    if(!exact(signed,['algorithm','payload','signatureBase64'])||
       signed.algorithm!=='Ed25519')return denied('INVALID_SIGNED_REGISTRY_ENVELOPE');
    const p=signed.payload;
    if(!exact(p,KEYS)||p.schema!=='imile-v1-offline-owner-signer-registry-v1'||
       p.purpose!=='synthetic-root-signed-fleet-manifest-registry'||
       p.registryAudience!==this.#audience||p.sourceProjectId!==this.#project||
       !Number.isSafeInteger(p.sequence)||p.sequence<this.#minimum||
       !Number.isSafeInteger(p.notBeforeMs)||!Number.isSafeInteger(p.expiresAtMs)||
       p.notBeforeMs<0||p.expiresAtMs<=p.notBeforeMs||
       !Array.isArray(p.signers)||p.signers.length<1||p.signers.length>64||
       p.signers.some(s=>!exact(s,SIGNER_KEYS)||
         typeof s.signerId!=='string'||s.signerId.length<3||
         !Number.isSafeInteger(s.keyVersion)||s.keyVersion<1||
         !['active','disabled'].includes(s.status)||
         !Number.isSafeInteger(s.notBeforeMs)||
         !Number.isSafeInteger(s.expiresAtMs)||
         s.notBeforeMs<p.notBeforeMs||s.expiresAtMs>p.expiresAtMs)||
       !Array.isArray(p.revokedSignerFingerprints)||
       p.revokedSignerFingerprints.length>128||
       p.revokedSignerFingerprints.some(f=>typeof f!=='string'||!HEX.test(f))||
       new Set(p.revokedSignerFingerprints).size!==p.revokedSignerFingerprints.length)
      return denied('SIGNED_REGISTRY_CONTEXT_INVALID');
    try{
      const sig=Buffer.from(signed.signatureBase64,'base64');
      if(typeof signed.signatureBase64!=='string'||
        sig.length!==64||sig.toString('base64')!==signed.signatureBase64||
        !verifyEd25519(null,Buffer.from(canonicalStringify(p),'utf8'),this.#root,sig))
        return denied('REGISTRY_ED25519_SIGNATURE_INVALID');
      // Host OS clock is not an independently trusted production clock.
      const now=Date.now();
      if(now<p.notBeforeMs||now>=p.expiresAtMs)
        return denied('SIGNED_REGISTRY_EXPIRED_OR_NOT_YET_VALID');
      return {ok:true,payload:p,digest:sha(p)};
    }catch(e){return denied('REGISTRY_CANONICALIZATION_ERROR: '+String(e.message||e))}
  }
  async #transaction(signed,mutate){
    const proof=this.#validate(signed);
    if(!proof.ok)return proof;
    try{
      const p=proof.payload,docRef=doc(this.#db,PATH);
      const result=await runTransaction(this.#db,async tx=>{
        const observed=await tx.get(docRef);
        const prev=observed.exists()?observed.data():null;
        if(prev!==null){
          if(!exact(prev,['sequence','registryDigest','rootFingerprint',
            'sourceProjectId','registryAudience','revokedSignerFingerprints',
            'revision','syntheticOnly'])||
            prev.rootFingerprint!==this.#rootFingerprint||
            prev.sourceProjectId!==this.#project||
            prev.registryAudience!==this.#audience||
            !Number.isSafeInteger(prev.sequence)||prev.sequence<1||
            !Number.isSafeInteger(prev.revision)||prev.revision<1||
            prev.syntheticOnly!==true||
            !HEX.test(prev.registryDigest||'')||
            !Array.isArray(prev.revokedSignerFingerprints)||
            prev.revokedSignerFingerprints.some(f=>!HEX.test(f)))
            throw Error('PERSISTED_HIGHWATER_TAMPERED_OR_UNTRUSTED');
          if(p.sequence<prev.sequence)throw Error('STALE_SIGNED_REGISTRY_AFTER_DURABLE_ADVANCE');
          if(p.sequence===prev.sequence&&proof.digest!==prev.registryDigest)
            throw Error('SAME_SEQUENCE_SIGNED_REGISTRY_EQUIVOCATION');
          if(prev.revokedSignerFingerprints.some(f=>
            !p.revokedSignerFingerprints.includes(f)))
            throw Error('SIGNED_REVOCATION_SET_ROLLBACK_DENIED');
        }else if(!mutate){
          throw Error('NO_DURABLE_HIGHWATER');
        }
        if(!mutate&&p.sequence!==prev.sequence)
          throw Error('CANDIDATE_NOT_CURRENT_DURABLE_REGISTRY');
        if(mutate&&(!prev||p.sequence>prev.sequence)){
          tx.set(docRef,{
            sequence:p.sequence,registryDigest:proof.digest,
            rootFingerprint:this.#rootFingerprint,
            sourceProjectId:this.#project,
            registryAudience:this.#audience,
            revokedSignerFingerprints:[...p.revokedSignerFingerprints].sort(),
            revision:(prev?.revision||0)+1,
            syntheticOnly:true
          });
        }
        return {
          sequence:p.sequence,registryDigest:proof.digest,
          changed:mutate&&(!prev||p.sequence>prev.sequence),
          persistedRevision:(prev?.revision||0)+
            (mutate&&(!prev||p.sequence>prev.sequence)?1:0),
          signedRevokedCount:p.revokedSignerFingerprints.length
        };
      },{maxAttempts:5});
      return allowed(mutate?
        'DEMO_SIGNED_REGISTRY_PERSISTED_TRANSACTIONALLY_ONLY':
        'DEMO_SIGNED_REGISTRY_MATCHES_PERSISTED_HIGHWATER_ONLY',result);
    }catch(e){
      return denied('SIGNED_REGISTRY_HIGHWATER_TRANSACTION_DENIED: '+String(e.message||e));
    }
  }
  async adoptRootSignedRegistry(bundle){return this.#transaction(bundle,true)}
  async verifyCurrentRootSignedRegistry(bundle){return this.#transaction(bundle,false)}
  async seal(){return denied('REAL_SIGNER_IAM_AND_ATOMIC_SEAL_UNAVAILABLE')}
}
export function createLocalSignedRegistryHighwater(options){
  return new LocalSignedRegistryHighwater(options);
}
