/**
 * #184 offline-only source/keyed parity attestation. All caller-visible
 * DENY paths are redacted: raw preflight errors and keyed document identities
 * can contain private courier DA codes, license plates, paths and metadata.
 * This helper cannot approve/seal/import or establish a production trust root.
 */
import {preflight,buildPlan,sha256,detectPartial}
  from './v1-migration-dryrun.mjs';

const no=(reason,extra={})=>({
  ok:false,reason,authorizedForImport:false,sealed:false,...extra
});
const badPreflight=()=>no('PREFLIGHT_FAILED',{
  errors:['PRIVATE_SOURCE_PREFLIGHT_DENIED']
});

export function attestBeforeSeal(snapshot,keyedState,claimedSha){
  let pre;
  try{pre=preflight(snapshot);}
  catch{return badPreflight();}
  if(!pre.ok)return badPreflight();
  if(pre.sourceSha256!==claimedSha)return no('SHA_MISMATCH');

  // Reject pre-existing importer identity, even if equal to original position.
  try{
    for(const key of ['drivers','vehicles']){
      for(const row of snapshot[key]||[]){
        if(Object.prototype.hasOwnProperty.call(row,'sourceIndex'))
          return no('UNTRUSTED_SOURCEINDEX');
      }
    }
    const plan=buildPlan(snapshot);
    const partial=detectPartial(plan,keyedState);
    if(!partial.complete){
      // Preserve independently testable mismatch COUNTS; never return
      // private DA/plate IDs or untrusted object/path/string details.
      return no('KEYED_PARITY_OR_PARTIAL',{
        details:{
          complete:false,
          missingCount:partial.missing.length,
          mismatchedCount:partial.mismatched.length,
          unexpectedCount:partial.unexpected.length
        }
      });
    }
    // A complete local parity check is NOT permission to write remotely.
    return {
      ok:true,sourceSha256:pre.sourceSha256,plan,
      authorizedForImport:false,sealed:false,
      proofScope:'LOCAL_OFFLINE_PARITY_ONLY'
    };
  }catch{
    return no('PRIVATE_PARITY_CHECK_DENIED');
  }
}

export function refusePoisonedSeal(snapshot){
  let pre;
  try{pre=preflight(snapshot);}
  catch{return {sealed:false,reason:'UNATTESTED_PRIVATE_SOURCE_INVALID'};}
  if(!pre.ok)return {sealed:false,reason:'UNATTESTED_PRIVATE_SOURCE_INVALID'};
  return {sealed:false,
    reason:'UNATTESTED – requires privileged importer after full parity'};
}
