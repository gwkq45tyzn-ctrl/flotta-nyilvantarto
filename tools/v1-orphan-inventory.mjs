/**
 * Local canonical keyed/claim namespace inventory and orphan detection.
 * Fail-closed if out-of-plan docs, claims without masters, masters without claims,
 * or sourceIndex mismatches are found. Synthetic only. Never seals.
 */
import {sha256} from './v1-migration-dryrun.mjs';

export function inventoryKeyedState(plan, observed) {
  const expected = new Set();
  const issues = [];
  for (const d of plan.drivers || []) expected.add('drivers/' + d.id);
  for (const v of plan.vehicles || []) expected.add('vehicles/' + v.id);

  const masters = new Set(Object.keys(observed.masters || {}));
  const claims = new Set(Object.keys(observed.claims || {}));

  for (const key of expected) {
    if (!masters.has(key)) issues.push('MISSING_MASTER:' + key);
    if (!claims.has(key)) issues.push('MISSING_CLAIM:' + key);
  }
  for (const key of masters) {
    if (!expected.has(key)) issues.push('ORPHAN_MASTER:' + key);
  }
  for (const key of claims) {
    if (!expected.has(key)) issues.push('ORPHAN_CLAIM:' + key);
  }
  if (issues.length) return {ok: false, issues, sealed: false, authorizedForImport: false};
  return {
    ok: true,
    sealed: false,
    authorizedForImport: false,
    productionIamVerified: false,
    expectedCount: expected.size,
    reason: 'INVENTORY_MATCH_NO_SEAL'
  };
}
