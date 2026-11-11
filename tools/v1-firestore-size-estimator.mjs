/**
 * #185 Compatibility façade around the ONE strict fail-closed Firestore
 * storage-size estimate and shape preflight.
 * Previously Grok's independent approximate formula silently disagreed with
 * the documented 147-byte sample, double-counted some nested values, and
 * allowed malformed map/document paths, nonfinite numbers and invalid types.
 *
 * A storage estimate is NOT actual wire size and NEVER import permission.
 */
import {
  checkSizeGate,estimateFirestoreDocumentStorageBytes
} from './v1-firestore-size-gate.mjs';

export function estimateStorageSize(docPath,data){
  try{
    return estimateFirestoreDocumentStorageBytes(data,docPath);
  }catch{
    return null;
  }
}

/**
 * Deliberately always `ok:false`: callers must not confuse advisory
 * feasibility with permission to import. Use `advisoryOk` for the separate
 * untrusted local-storage estimate.
 */
export function sizeGate(source,keyedDocs){
  const result=checkSizeGate(source,keyedDocs);
  return {
    ok:false,
    advisoryOk:result.advisoryOk,
    sourceSize:result.sourceStorageEstimateBytes,
    maxKeyedStorageEstimateBytes:result.maxKeyedStorageEstimateBytes,
    firestoreEncodedSizeVerified:false,
    authorizedForImport:false,
    reason:result.advisoryOk
      ?'LOCAL_ADVISORY_ONLY_NOT_IMPORT_AUTHORIZED'
      :result.reason
  };
}
