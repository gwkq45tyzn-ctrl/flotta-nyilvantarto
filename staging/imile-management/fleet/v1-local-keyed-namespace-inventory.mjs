/**
 * Genuine SDK collection query audit against SAME local DEMO emulator.
 *
 * This code deliberately does not write/seed/repair anything. Even if the
 * persisted lock before and after the query has the same epoch, collection
 * scans are NOT one transactionally consistent snapshot. A privileged
 * out-of-plan writer can inject after the scan. NEVER authorize seal.
 */
import {collection,doc,getDoc,getDocs} from 'firebase/firestore';
import {sha256} from '../../../tools/v1-migration-dryrun.mjs';
import {inventoryKeyedState} from '../../../tools/v1-orphan-inventory.mjs';

const LOCK='v1MigrationSyntheticLocks/primary';
const SCOPE='DEMO_LOCAL_FIRESTORE_NONATOMIC_COLLECTION_SCANS';
const deny=reason=>({
  ok:false,reason,issues:[reason],sealed:false,canSeal:false,
  authorizedForImport:false,productionIamVerified:false,
  authoritativeNamespaceVerified:false,
  atomicNamespaceSnapshotVerified:false,proofScope:SCOPE
});
const list={
  drivers:{master:'flottaDrivers',claim:'flottaDriverClaims'},
  vehicles:{master:'flottaVehicles',claim:'flottaVehicleClaims'}
};
export async function observeLocalEmulatorKeyedInventory({
  db,projectId,plan,expectedEpoch
}={}){
  if(!/^demo-[a-z0-9-]+$/.test(projectId||'')||
    !['127.0.0.1:8787','localhost:8787'].includes(process.env.FIRESTORE_EMULATOR_HOST)||
    process.env.GOOGLE_APPLICATION_CREDENTIALS||
    process.env.FIREBASE_SERVICE_ACCOUNT||
    db?.app?.options?.projectId!==projectId)
    return deny('LOCAL_EMULATOR_ONLY');
  if(!plan||!/^[a-f0-9]{64}$/.test(plan.sourceSha256||'')||
    !Number.isSafeInteger(expectedEpoch)||expectedEpoch<1)
    return deny('PIN_AND_EPOCH_REQUIRED');
  try {
    const lock=doc(db,LOCK);
    const before=await getDoc(lock);
    if(!before.exists())return deny('NO_PERSISTED_IMPORT_EPOCH');
    const l=before.data();
    const ids=[
      ...plan.drivers.map(x=>'drivers/'+x.id),
      ...plan.vehicles.map(x=>'vehicles/'+x.id)
    ].sort();
    if(l.epoch!==expectedEpoch||l.phase!=='writing'||
      l.sourceSha256!==plan.sourceSha256||
      l.expectedCount!==ids.length||l.planDigest!==sha256(ids)||
      l.verifiedDigest!==sha256(ids)||
      l.sealed!==false||l.authorizedForImport!==false||
      !Array.isArray(l.verifiedIds)||
      l.verifiedIds.length!==ids.length||
      l.verifiedIds.some((id,i)=>id!==ids[i]))
      return deny('INCOMPLETE_OR_FORGED_IMPORTED_PLAN_CHECKPOINT');
    const observed={
      masters:Object.create(null),claims:Object.create(null)
    };
    for(const kind of ['drivers','vehicles']){
      for(const field of ['master','claim']){
        const snapshot=await getDocs(collection(db,list[kind][field]));
        for(const row of snapshot.docs){
          observed[field==='master'?'masters':'claims'][kind+'/'+row.id]=row.data();
        }
      }
    }
    const after=await getDoc(lock);
    if(!after.exists()||sha256(after.data())!==sha256(l))
      return deny('LOCK_CHANGED_DURING_NONATOMIC_SCAN');
    const parity=inventoryKeyedState(plan,observed);
    return {
      ...parity,verifiedEpoch:expectedEpoch,
      stableLockDuringScan:true,
      authoritativeNamespaceVerified:false,
      atomicNamespaceSnapshotVerified:false,
      canSeal:false,sealed:false,authorizedForImport:false,
      productionIamVerified:false,proofScope:SCOPE
    };
  }catch(e){
    return deny('EMULATOR_INVENTORY_QUERY_FAILED: '+String(e.message||e));
  }
}
