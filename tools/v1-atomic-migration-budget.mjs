/**
 * Strict, pure pre-write admission budget for the current V1 local migration.
 * This is NOT a Firestore readset service guarantee or production authorization.
 *
 * The existing synthetic source planner splits original driver+vehicle keyed
 * pairs into chunks of PAIR_CHUNK. Every pair creates one master and one claim;
 * each committed chunk has one signed receipt. The final close journal CAS
 * reads ALL owned master/claim/receipt documents, protected only up to a
 * deliberately conservative 120-document local proof bound.
 *
 * If this helper denies, never start unattended import; it would leave an
 * intentionally uncloseable partial workspace. A trusted privileged server
 * importer with new independent audit/owner IAM would be needed for high-N.
 */
import {PAIR_CHUNK} from './v1-variable-block-migration.mjs';

export const ATOMIC_OWNED_READ_BOUND=120;
const denied=(reason)=>({
  valid:false,withinProvenReadBound:false,reason,
  keyedPairs:null,receiptDocuments:null,ownedReadDocuments:null,
  maxAtomicOwnedReadDocuments:ATOMIC_OWNED_READ_BOUND,
  authorizedForImport:false,productionTrustRootVerified:false
});
export function assessAtomicMigrationBudget(counts){
  if(!counts||typeof counts!=='object'||Array.isArray(counts)||
     !Number.isSafeInteger(counts.drivers)||counts.drivers<0||
     !Number.isSafeInteger(counts.vehicles)||counts.vehicles<0)
    return denied('INVALID_FOUR_ARRAY_COUNTS');
  const keyedPairs=counts.drivers+counts.vehicles;
  if(!Number.isSafeInteger(keyedPairs))
    return denied('SOURCE_COUNT_OVERFLOW');
  const receiptDocuments=Math.ceil(keyedPairs/PAIR_CHUNK);
  const ownedReadDocuments=2*keyedPairs+receiptDocuments;
  if(!Number.isSafeInteger(ownedReadDocuments))
    return denied('OWNED_DOCUMENT_COUNT_OVERFLOW');
  const withinProvenReadBound=ownedReadDocuments<=ATOMIC_OWNED_READ_BOUND;
  return {
    valid:true,withinProvenReadBound,
    reason:withinProvenReadBound?'LOCAL_ATOMIC_READ_BUDGET_ONLY':
      'PHASE1_ATOMIC_MIGRATION_READ_BOUND_EXCEEDED',
    keyedPairs,receiptDocuments,ownedReadDocuments,
    maxAtomicOwnedReadDocuments:ATOMIC_OWNED_READ_BOUND,
    authorizedForImport:false,productionTrustRootVerified:false
  };
}
