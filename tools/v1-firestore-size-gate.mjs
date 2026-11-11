/**
 * #185 Firestore size and scale gate – local only.
 * Explicitly does NOT claim UTF-8 JSON bytes equal Firestore encoded size.
 * Fail closed when authoritative encoded size cannot be proven.
 */
export const FIRESTORE_DOC_LIMIT = 1_048_576; // 1 MiB
export const CONSERVATIVE_JSON_BUDGET = 800 * 1024;

export function advisoryJsonSize(obj) {
  const json = JSON.stringify(obj);
  return Buffer.byteLength(json, 'utf8');
}

export function checkSizeGate(source, keyedDocs) {
  const sourceJson = advisoryJsonSize(source);
  const keyedSizes = {};
  let maxKeyed = 0;
  for (const [id, doc] of Object.entries(keyedDocs || {})) {
    const n = advisoryJsonSize(doc);
    keyedSizes[id] = n;
    if (n > maxKeyed) maxKeyed = n;
  }
  const advisoryOk = sourceJson <= CONSERVATIVE_JSON_BUDGET && maxKeyed <= CONSERVATIVE_JSON_BUDGET;
  return {
    advisoryOk,
    sourceJsonBytes: sourceJson,
    maxKeyedJsonBytes: maxKeyed,
    firestoreEncodedSizeVerified: false, // cannot be proven from JSON alone
    authorizedForImport: false,
    reason: advisoryOk
      ? 'ADVISORY_ONLY – Firestore encoded size remains unverified'
      : 'CONSERVATIVE_JSON_BUDGET_EXCEEDED'
  };
}

export function generateLargeFixture(nDrivers, nVehicles) {
  const drivers = Array.from({length:nDrivers}, (_,i)=> ({
    id:'d'+i, daCode:'DA'+String(i).padStart(4,'0'),
    name:'Driver '+i, kapacitas:50, status:'aktiv',
    history:[{e:'hire', note:'synthetic '+i}]
  }));
  const vehicles = Array.from({length:nVehicles}, (_,i)=> ({
    id:'v'+i, rendszam:'PLATE'+String(i).padStart(4,'0'),
    status:'aktiv', history:[{e:'service'}]
  }));
  return {drivers, vehicles, fuelCards:[], contacts:[]};
}
