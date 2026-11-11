/**
 * #184 trusted importer attestation – local only.
 * Refuses seal if source is poisoned, has duplicates, pre-existing sourceIndex,
 * hash drift, or partial keyed state. Privileged bypass is test-only.
 */
import {preflight,buildPlan,sha256,detectPartial} from './v1-migration-dryrun.mjs';

export function attestBeforeSeal(snapshot, keyedState, claimedSha) {
  const pre = preflight(snapshot);
  if (!pre.ok) return {ok:false, reason:'PREFLIGHT_FAILED', errors:pre.errors};
  if (pre.sourceSha256 !== claimedSha) return {ok:false, reason:'SHA_MISMATCH'};
  // Reject any pre-existing sourceIndex (already in preflight, re-check)
  for (const key of ['drivers','vehicles']) {
    for (const row of snapshot[key] || []) {
      if (Object.prototype.hasOwnProperty.call(row, 'sourceIndex'))
        return {ok:false, reason:'UNTRUSTED_SOURCEINDEX'};
    }
  }
  const plan = buildPlan(snapshot);
  const partial = detectPartial(plan, keyedState);
  if (!partial.complete)
    return {ok:false, reason:'KEYED_PARITY_OR_PARTIAL', details:partial};
  // Duplicate normalized IDs already rejected by preflight
  // A complete local parity check is NOT a privilege grant, server seal
  // or a trusted signed manifest. Production importer/IAM is still absent.
  return {
    ok:true, sourceSha256:pre.sourceSha256, plan,
    authorizedForImport:false, sealed:false,
    proofScope:'LOCAL_OFFLINE_PARITY_ONLY'
  };
}

export function refusePoisonedSeal(snapshot) {
  // Explicit hard-stop for the known poisoned cases
  const pre = preflight(snapshot);
  if (!pre.ok) return {sealed:false, reason:pre.errors.join('; ')};
  return {sealed:false, reason:'UNATTESTED – requires privileged importer after full parity'};
}
